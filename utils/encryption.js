import crypto from 'crypto';
import { getEnvOrSecret } from './secrets.js';

const STORAGE_PAYLOAD_VERSION = 1;
const STORAGE_ALGORITHM = 'aes-256-gcm';
const STORAGE_IV_BYTES = 12;
const STORAGE_KEY_BYTES = 32;
const DERIVATION_SALT = Buffer.from('home-inventory.field-encryption');
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function failStartup(message) {
    throw new Error(`FATAL: ${message}`);
}

function padBase64(value) {
    const remainder = value.length % 4;
    if (remainder === 0) {
        return value;
    }

    return `${value}${'='.repeat(4 - remainder)}`;
}

function toBase64Url(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padBase64(normalized), 'base64');
}

function decodeMasterKey(rawValue) {
    const value = String(rawValue || '').trim();

    if (!value) {
        failStartup('APP_ENCRYPTION_KEY environment variable or Docker secret is not set. Generate one with "openssl rand -base64 32".');
    }

    if (/^[a-f0-9]{64}$/i.test(value)) {
        return Buffer.from(value, 'hex');
    }

    if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
        try {
            const decoded = fromBase64Url(value);
            if (decoded.length === STORAGE_KEY_BYTES) {
                return decoded;
            }
        } catch {
            // Fall through to the raw-byte length check below.
        }
    }

    const rawBytes = Buffer.from(value, 'utf8');
    if (rawBytes.length === STORAGE_KEY_BYTES) {
        return rawBytes;
    }

    failStartup('APP_ENCRYPTION_KEY must be 32 raw bytes, 64 hex characters, or base64/base64url for 32 bytes.');
}

function readActiveKeyId(rawValue) {
    const value = String(rawValue || '').trim();

    if (!value) {
        failStartup('APP_ENCRYPTION_KEY_ID environment variable or Docker secret is not set. Set a stable identifier such as "2026-03-primary".');
    }

    if (!KEY_ID_PATTERN.test(value)) {
        failStartup('APP_ENCRYPTION_KEY_ID must be 1-64 characters and only use letters, numbers, dot, underscore, or hyphen.');
    }

    return value;
}

function readKeyring(rawValue, activeKeyId, activeMasterKey) {
    const keyring = new Map([
        [activeKeyId, activeMasterKey]
    ]);
    const value = String(rawValue || '').trim();

    if (!value) {
        return keyring;
    }

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        failStartup('APP_ENCRYPTION_KEYRING must be valid JSON mapping key ids to 32-byte keys.');
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        failStartup('APP_ENCRYPTION_KEYRING must be a JSON object mapping key ids to 32-byte keys.');
    }

    for (const [rawKeyId, rawKeyValue] of Object.entries(parsed)) {
        const keyId = readActiveKeyId(rawKeyId);
        const masterKey = decodeMasterKey(rawKeyValue);
        const existingKey = keyring.get(keyId);

        if (existingKey) {
            if (!existingKey.equals(masterKey)) {
                failStartup(`APP_ENCRYPTION_KEYRING defines a conflicting key for "${keyId}".`);
            }
            continue;
        }

        keyring.set(keyId, masterKey);
    }

    return keyring;
}

function buildAdditionalAuthenticatedData(purpose, keyId) {
    return Buffer.from(JSON.stringify({
        v: STORAGE_PAYLOAD_VERSION,
        alg: STORAGE_ALGORITHM,
        kid: keyId,
        purpose: String(purpose || 'default')
    }));
}

function normalizePayloadCandidate(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }

    return null;
}

function parseEncryptedPayload(value) {
    const candidate = normalizePayloadCandidate(value);
    if (candidate === null) {
        return null;
    }

    try {
        const parsed = JSON.parse(candidate);
        if (
            parsed &&
            parsed.v === STORAGE_PAYLOAD_VERSION &&
            parsed.alg === STORAGE_ALGORITHM &&
            typeof parsed.kid === 'string' &&
            typeof parsed.iv === 'string' &&
            typeof parsed.tag === 'string' &&
            typeof parsed.ciphertext === 'string'
        ) {
            return parsed;
        }
    } catch {
        return null;
    }

    return null;
}

const MASTER_KEY = decodeMasterKey(getEnvOrSecret('APP_ENCRYPTION_KEY', 'app_encryption_key'));
const ACTIVE_KEY_ID = readActiveKeyId(getEnvOrSecret('APP_ENCRYPTION_KEY_ID', 'app_encryption_key_id'));
const KEYRING = readKeyring(process.env.APP_ENCRYPTION_KEYRING, ACTIVE_KEY_ID, MASTER_KEY);

function deriveFieldKey(purpose, keyId, masterKey) {
    return crypto.hkdfSync(
        'sha256',
        masterKey,
        DERIVATION_SALT,
        Buffer.from(`purpose:${String(purpose || 'default')}:kid:${keyId}:v:${STORAGE_PAYLOAD_VERSION}`),
        STORAGE_KEY_BYTES
    );
}

export function isEncryptedPayload(value) {
    return parseEncryptedPayload(value) !== null;
}

function encryptBytesToPayload(bytes, purpose, keyId, masterKey) {
    const key = deriveFieldKey(purpose, keyId, masterKey);
    const iv = crypto.randomBytes(STORAGE_IV_BYTES);
    const cipher = crypto.createCipheriv(STORAGE_ALGORITHM, key, iv);

    cipher.setAAD(buildAdditionalAuthenticatedData(purpose, keyId));

    const ciphertext = Buffer.concat([
        cipher.update(bytes),
        cipher.final()
    ]);

    return JSON.stringify({
        v: STORAGE_PAYLOAD_VERSION,
        alg: STORAGE_ALGORITHM,
        kid: keyId,
        iv: toBase64Url(iv),
        tag: toBase64Url(cipher.getAuthTag()),
        ciphertext: toBase64Url(ciphertext)
    });
}

function decryptPayloadToBytes(parsed, purpose) {
    const masterKey = KEYRING.get(parsed.kid);
    if (!masterKey) {
        throw new Error(`Encrypted payload key id "${parsed.kid}" is not available in the configured keyring`);
    }

    const key = deriveFieldKey(purpose, parsed.kid, masterKey);
    const decipher = crypto.createDecipheriv(STORAGE_ALGORITHM, key, fromBase64Url(parsed.iv));

    decipher.setAAD(buildAdditionalAuthenticatedData(purpose, parsed.kid));
    decipher.setAuthTag(fromBase64Url(parsed.tag));

    return Buffer.concat([
        decipher.update(fromBase64Url(parsed.ciphertext)),
        decipher.final()
    ]);
}

export function encryptForStorage(value, options = {}) {
    if (value === null || value === undefined || value === '') {
        return value;
    }

    const purpose = options.purpose || 'default';
    return encryptBytesToPayload(Buffer.from(String(value), 'utf8'), purpose, ACTIVE_KEY_ID, MASTER_KEY);
}

export function decryptFromStorage(value, options = {}) {
    if (value === null || value === undefined || value === '') {
        return value;
    }

    const parsed = parseEncryptedPayload(value);
    if (!parsed) {
        return String(value);
    }

    const purpose = options.purpose || 'default';

    try {
        return decryptPayloadToBytes(parsed, purpose).toString('utf8');
    } catch (error) {
        throw new Error(`Encrypted payload could not be decrypted securely: ${error.message}`);
    }
}

export function encryptBufferForStorage(value, options = {}) {
    if (value === null || value === undefined) {
        return value;
    }

    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const purpose = options.purpose || 'default';
    return encryptBytesToPayload(buffer, purpose, ACTIVE_KEY_ID, MASTER_KEY);
}

export function decryptBufferFromStorage(value, options = {}) {
    if (value === null || value === undefined) {
        return value;
    }

    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const parsed = parseEncryptedPayload(buffer);
    if (!parsed) {
        return buffer;
    }

    const purpose = options.purpose || 'default';

    try {
        return decryptPayloadToBytes(parsed, purpose);
    } catch (error) {
        throw new Error(`Encrypted payload could not be decrypted securely: ${error.message}`);
    }
}

export function hashLookupToken(value) {
    return crypto
        .createHmac('sha256', MASTER_KEY)
        .update(String(value || ''), 'utf8')
        .digest('hex');
}

function hashLookupTokenWithKey(value, masterKey) {
    return crypto
        .createHmac('sha256', masterKey)
        .update(String(value || ''), 'utf8')
        .digest('hex');
}

function hashLookupTokenLegacy(value) {
    return crypto
        .createHash('sha256')
        .update(String(value || ''), 'utf8')
        .digest('hex');
}

export function listLookupTokenHashes(value, options = {}) {
    const includeLegacy = options.includeLegacy === true;
    const hashes = [];
    const seen = new Set();

    for (const [keyId, masterKey] of KEYRING.entries()) {
        const digest = keyId === ACTIVE_KEY_ID
            ? hashLookupToken(value)
            : hashLookupTokenWithKey(value, masterKey);

        if (!seen.has(digest)) {
            hashes.push(digest);
            seen.add(digest);
        }
    }

    if (includeLegacy) {
        const legacyDigest = hashLookupTokenLegacy(value);
        if (!seen.has(legacyDigest)) {
            hashes.push(legacyDigest);
        }
    }

    return hashes;
}

export function generateOpaqueToken(byteLength = 32) {
    return toBase64Url(crypto.randomBytes(byteLength));
}

export const APP_ENCRYPTION_KEY_ID = ACTIVE_KEY_ID;
