const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const KDF_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const BACKUP_VERSION = 1;

function ensureCrypto() {
    if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') {
        throw new Error('Secure browser encryption is not available on this device.');
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

async function deriveEncryptionKey(secret, salt) {
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
            salt,
            iterations: KDF_ITERATIONS
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

export function isEncryptedBackupPayload(payload) {
    return payload?.kind === 'homeinventory-backup' && payload?.encrypted === true;
}

export async function encryptBackupPayload(payload, passphrase) {
    const secret = String(passphrase || '').trim();
    if (secret.length < 12) {
        throw new Error('Use a passphrase with at least 12 characters.');
    }

    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveEncryptionKey(secret, salt);
    const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv
        },
        key,
        plaintext
    );

    return {
        kind: 'homeinventory-backup',
        encrypted: true,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        kdf: {
            algorithm: 'PBKDF2-SHA-256',
            iterations: KDF_ITERATIONS,
            salt: bytesToBase64Url(salt)
        },
        cipher: {
            algorithm: 'AES-GCM',
            iv: bytesToBase64Url(iv),
            ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
        }
    };
}

export async function decryptBackupPayload(payload, passphrase) {
    if (!isEncryptedBackupPayload(payload)) {
        return payload;
    }

    const secret = String(passphrase || '').trim();
    if (!secret) {
        throw new Error('Enter the backup passphrase to continue.');
    }

    const salt = base64UrlToBytes(payload.kdf?.salt);
    const iv = base64UrlToBytes(payload.cipher?.iv);
    const ciphertext = base64UrlToBytes(payload.cipher?.ciphertext);
    const key = await deriveEncryptionKey(secret, salt);
    const plaintext = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv
        },
        key,
        ciphertext
    );

    return JSON.parse(TEXT_DECODER.decode(plaintext));
}
