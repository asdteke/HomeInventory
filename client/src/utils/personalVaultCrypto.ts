const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const KDF_ALGORITHM = 'PBKDF2-SHA-256';
const WRAP_ALGORITHM = 'A256GCM';
const ITEM_ALGORITHM = 'A256GCM';
const ITEM_VERSION = 1;
const KDF_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RECOVERY_KEY_LENGTH = 30;
const RECOVERY_KEY_GROUP_SIZE = 5;
const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const VAULT_PASSPHRASE_LABEL = 'Vault passphrase';
const RECOVERY_KEY_LABEL = 'Recovery key';

function ensureCrypto(): void {
    if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') {
        throw new Error('This browser does not support secure Web Crypto.');
    }
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string | null | undefined): Uint8Array {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const remainder = normalized.length % 4;
    const padded = remainder === 0 ? normalized : `${normalized}${'='.repeat(4 - remainder)}`;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function normalizeSecret(secret: string | null | undefined, label: string): string {
    const value = String(secret || '');
    if (!value.trim()) {
        throw new Error(`${label} is required.`);
    }

    return value;
}

async function deriveWrappingKey(secret: string, saltBase64Url: string, iterations: number): Promise<CryptoKey> {
    ensureCrypto();
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        TEXT_ENCODER.encode(secret),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return globalThis.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: base64UrlToBytes(saltBase64Url) as any,
            iterations
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
}

async function importVaultKey(rawVaultKeyBytes: Uint8Array): Promise<CryptoKey> {
    ensureCrypto();
    return globalThis.crypto.subtle.importKey(
        'raw',
        rawVaultKeyBytes as any,
        {
            name: 'AES-GCM'
        },
        false,
        ['encrypt', 'decrypt']
    );
}

async function exportVaultKey(key: CryptoKey): Promise<Uint8Array> {
    const rawKey = await globalThis.crypto.subtle.exportKey('raw', key);
    return new Uint8Array(rawKey);
}

async function generateVaultKey(): Promise<CryptoKey> {
    ensureCrypto();
    return globalThis.crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['encrypt', 'decrypt']
    );
}

export interface VaultSetupPayload {
    kdfAlgorithm: string;
    kdfSalt: string;
    kdfIterations: number;
    wrapAlgorithm: string;
    wrapIv: string;
    wrappedVaultKey: string;
    recoveryKdfAlgorithm?: string;
    recoveryKdfSalt?: string;
    recoveryKdfIterations?: number;
    recoveryWrapAlgorithm?: string;
    recoveryWrapIv?: string;
    recoveryWrappedVaultKey?: string;
}

async function wrapVaultKey(rawVaultKeyBytes: Uint8Array, secret: string): Promise<VaultSetupPayload> {
    const salt = bytesToBase64Url(randomBytes(SALT_BYTES));
    const iv = bytesToBase64Url(randomBytes(IV_BYTES));
    const wrappingKey = await deriveWrappingKey(secret, salt, KDF_ITERATIONS);
    const wrapped = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(iv) as any
        },
        wrappingKey,
        rawVaultKeyBytes as any
    );

    return {
        kdfAlgorithm: KDF_ALGORITHM,
        kdfSalt: salt,
        kdfIterations: KDF_ITERATIONS,
        wrapAlgorithm: WRAP_ALGORITHM,
        wrapIv: iv,
        wrappedVaultKey: bytesToBase64Url(new Uint8Array(wrapped))
    };
}

async function unwrapVaultKeyFromConfig(
    { wrappedVaultKey, wrapIv, kdfSalt, kdfIterations }: { wrappedVaultKey: string; wrapIv: string; kdfSalt: string; kdfIterations: number },
    secret: string
): Promise<CryptoKey> {
    const wrappingKey = await deriveWrappingKey(secret, kdfSalt, kdfIterations);
    const rawVaultKey = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(wrapIv) as any
        },
        wrappingKey,
        base64UrlToBytes(wrappedVaultKey) as any
    );

    return importVaultKey(new Uint8Array(rawVaultKey));
}

function generateRecoveryKey(): string {
    let value = '';

    for (let index = 0; index < RECOVERY_KEY_LENGTH; index += 1) {
        const randomIndex = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % RECOVERY_KEY_ALPHABET.length;
        value += RECOVERY_KEY_ALPHABET[randomIndex];
    }

    return (value.match(new RegExp(`.{1,${RECOVERY_KEY_GROUP_SIZE}}`, 'g')) as string[]).join('-');
}

export interface ValidationIssue {
    code: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}

export function validateVaultPassphrase(passphrase: string | null | undefined): ValidationResult {
    const value = String(passphrase || '');
    const issues: ValidationIssue[] = [];

    if (value.length < 12) {
        issues.push({
            code: 'min_length',
            message: 'Vault passphrase must be at least 12 characters.'
        });
    }

    if (!/[a-z]/.test(value)) {
        issues.push({
            code: 'lowercase',
            message: 'Include at least one lowercase letter.'
        });
    }

    if (!/[A-Z]/.test(value)) {
        issues.push({
            code: 'uppercase',
            message: 'Include at least one uppercase letter.'
        });
    }

    if (!/[0-9]/.test(value)) {
        issues.push({
            code: 'number',
            message: 'Include at least one number.'
        });
    }

    return {
        valid: issues.length === 0,
        issues
    };
}

export interface VaultSetupResult {
    vaultKey: CryptoKey;
    recoveryKey: string;
    setupPayload: VaultSetupPayload;
}

export async function createPersonalVaultSetup(passphrase: string | null | undefined): Promise<VaultSetupResult> {
    ensureCrypto();
    const normalizedPassphrase = normalizeSecret(passphrase, VAULT_PASSPHRASE_LABEL);
    const passphraseValidation = validateVaultPassphrase(normalizedPassphrase);

    if (!passphraseValidation.valid) {
        throw new Error(passphraseValidation.issues[0]?.message || 'Vault passphrase is invalid.');
    }

    const vaultKey = await generateVaultKey();
    const rawVaultKey = await exportVaultKey(vaultKey);
    const recoveryKey = generateRecoveryKey();
    const primaryWrap = await wrapVaultKey(rawVaultKey, normalizedPassphrase);
    const recoveryWrap = await wrapVaultKey(rawVaultKey, recoveryKey);

    return {
        vaultKey,
        recoveryKey,
        setupPayload: {
            ...primaryWrap,
            recoveryKdfAlgorithm: recoveryWrap.kdfAlgorithm,
            recoveryKdfSalt: recoveryWrap.kdfSalt,
            recoveryKdfIterations: recoveryWrap.kdfIterations,
            recoveryWrapAlgorithm: recoveryWrap.wrapAlgorithm,
            recoveryWrapIv: recoveryWrap.wrapIv,
            recoveryWrappedVaultKey: recoveryWrap.wrappedVaultKey
        }
    };
}

export async function unlockPersonalVaultWithPassphrase(config: any, passphrase: string | null | undefined): Promise<CryptoKey> {
    return unwrapVaultKeyFromConfig({
        wrappedVaultKey: config.wrappedVaultKey,
        wrapIv: config.wrapIv,
        kdfSalt: config.kdfSalt,
        kdfIterations: config.kdfIterations
    }, normalizeSecret(passphrase, VAULT_PASSPHRASE_LABEL));
}

export async function unlockPersonalVaultWithRecoveryKey(config: any, recoveryKey: string | null | undefined): Promise<CryptoKey> {
    return unwrapVaultKeyFromConfig({
        wrappedVaultKey: config.recoveryWrappedVaultKey,
        wrapIv: config.recoveryWrapIv,
        kdfSalt: config.recoveryKdfSalt,
        kdfIterations: config.recoveryKdfIterations
    }, normalizeSecret(recoveryKey, RECOVERY_KEY_LABEL));
}

export interface EncryptedVaultEnvelope {
    v: number;
    alg: string;
    iv: string;
    ciphertext: string;
}

export async function encryptPersonalVaultBytes(vaultKey: CryptoKey, bytes: Uint8Array | number[]): Promise<EncryptedVaultEnvelope> {
    ensureCrypto();
    const iv = randomBytes(IV_BYTES);
    const plaintext = bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
    const ciphertext = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv as any
        },
        vaultKey,
        plaintext as any
    );

    return {
        v: ITEM_VERSION,
        alg: ITEM_ALGORITHM,
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
    };
}

export async function decryptPersonalVaultBytes(vaultKey: CryptoKey, envelope: EncryptedVaultEnvelope): Promise<Uint8Array> {
    ensureCrypto();
    const plaintext = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(envelope.iv) as any
        },
        vaultKey,
        base64UrlToBytes(envelope.ciphertext) as any
    );

    return new Uint8Array(plaintext);
}

export async function encryptPersonalVaultPayload(vaultKey: CryptoKey, payload: any): Promise<EncryptedVaultEnvelope> {
    return encryptPersonalVaultBytes(vaultKey, TEXT_ENCODER.encode(JSON.stringify(payload)));
}

export async function decryptPersonalVaultPayload(vaultKey: CryptoKey, envelope: EncryptedVaultEnvelope): Promise<any> {
    const plaintext = await decryptPersonalVaultBytes(vaultKey, envelope);
    return JSON.parse(TEXT_DECODER.decode(plaintext));
}
