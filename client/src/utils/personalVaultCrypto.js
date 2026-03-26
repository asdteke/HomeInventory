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

function ensureCrypto() {
    if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') {
        throw new Error('Bu tarayici guvenli Web Crypto destegi sunmuyor.');
    }
}

function randomBytes(length) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
}

function bytesToBase64Url(bytes) {
    const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
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

function normalizeSecret(secret, label) {
    const value = String(secret || '');
    if (!value.trim()) {
        throw new Error(`${label} gerekli.`);
    }

    return value;
}

async function deriveWrappingKey(secret, saltBase64Url, iterations) {
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
            salt: base64UrlToBytes(saltBase64Url),
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

async function importVaultKey(rawVaultKeyBytes) {
    ensureCrypto();
    return globalThis.crypto.subtle.importKey(
        'raw',
        rawVaultKeyBytes,
        {
            name: 'AES-GCM'
        },
        false,
        ['encrypt', 'decrypt']
    );
}

async function exportVaultKey(key) {
    const rawKey = await globalThis.crypto.subtle.exportKey('raw', key);
    return new Uint8Array(rawKey);
}

async function generateVaultKey() {
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

async function wrapVaultKey(rawVaultKeyBytes, secret) {
    const salt = bytesToBase64Url(randomBytes(SALT_BYTES));
    const iv = bytesToBase64Url(randomBytes(IV_BYTES));
    const wrappingKey = await deriveWrappingKey(secret, salt, KDF_ITERATIONS);
    const wrapped = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(iv)
        },
        wrappingKey,
        rawVaultKeyBytes
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

async function unwrapVaultKeyFromConfig({ wrappedVaultKey, wrapIv, kdfSalt, kdfIterations }, secret) {
    const wrappingKey = await deriveWrappingKey(secret, kdfSalt, kdfIterations);
    const rawVaultKey = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(wrapIv)
        },
        wrappingKey,
        base64UrlToBytes(wrappedVaultKey)
    );

    return importVaultKey(new Uint8Array(rawVaultKey));
}

function generateRecoveryKey() {
    let value = '';

    for (let index = 0; index < RECOVERY_KEY_LENGTH; index += 1) {
        const randomIndex = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % RECOVERY_KEY_ALPHABET.length;
        value += RECOVERY_KEY_ALPHABET[randomIndex];
    }

    return value.match(new RegExp(`.{1,${RECOVERY_KEY_GROUP_SIZE}}`, 'g')).join('-');
}

export function validateVaultPassphrase(passphrase) {
    const value = String(passphrase || '');
    const issues = [];

    if (value.length < 12) {
        issues.push('Vault parolasi en az 12 karakter olmali.');
    }

    if (!/[a-z]/.test(value)) {
        issues.push('En az bir kucuk harf kullanin.');
    }

    if (!/[A-Z]/.test(value)) {
        issues.push('En az bir buyuk harf kullanin.');
    }

    if (!/[0-9]/.test(value)) {
        issues.push('En az bir rakam kullanin.');
    }

    return {
        valid: issues.length === 0,
        issues
    };
}

export async function createPersonalVaultSetup(passphrase) {
    ensureCrypto();
    const normalizedPassphrase = normalizeSecret(passphrase, 'Vault parolasi');
    const passphraseValidation = validateVaultPassphrase(normalizedPassphrase);

    if (!passphraseValidation.valid) {
        throw new Error(passphraseValidation.issues[0]);
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

export async function unlockPersonalVaultWithPassphrase(config, passphrase) {
    return unwrapVaultKeyFromConfig({
        wrappedVaultKey: config.wrappedVaultKey,
        wrapIv: config.wrapIv,
        kdfSalt: config.kdfSalt,
        kdfIterations: config.kdfIterations
    }, normalizeSecret(passphrase, 'Vault parolasi'));
}

export async function unlockPersonalVaultWithRecoveryKey(config, recoveryKey) {
    return unwrapVaultKeyFromConfig({
        wrappedVaultKey: config.recoveryWrappedVaultKey,
        wrapIv: config.recoveryWrapIv,
        kdfSalt: config.recoveryKdfSalt,
        kdfIterations: config.recoveryKdfIterations
    }, normalizeSecret(recoveryKey, 'Recovery key'));
}

export async function encryptPersonalVaultPayload(vaultKey, payload) {
    ensureCrypto();
    const iv = randomBytes(IV_BYTES);
    const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv
        },
        vaultKey,
        plaintext
    );

    return {
        v: ITEM_VERSION,
        alg: ITEM_ALGORITHM,
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
    };
}

export async function decryptPersonalVaultPayload(vaultKey, envelope) {
    ensureCrypto();
    const plaintext = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: base64UrlToBytes(envelope.iv)
        },
        vaultKey,
        base64UrlToBytes(envelope.ciphertext)
    );

    return JSON.parse(TEXT_DECODER.decode(plaintext));
}

