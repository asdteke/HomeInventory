const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export const PERSONAL_VAULT_KDF_ALGORITHM = 'PBKDF2-SHA-256';
export const PERSONAL_VAULT_WRAP_ALGORITHM = 'A256GCM';
export const PERSONAL_VAULT_ITEM_ALGORITHM = 'A256GCM';
export const PERSONAL_VAULT_ITEM_PAYLOAD_VERSION = 1;
export const PERSONAL_VAULT_KDF_MIN_ITERATIONS = 310000;
export const PERSONAL_VAULT_KDF_MAX_ITERATIONS = 900000;
export const PERSONAL_VAULT_ITEM_MAX_BYTES = 128 * 1024;

function createValidationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function normalizeString(value, fieldName, { minLength = 1, maxLength = 4096 } = {}) {
    if (typeof value !== 'string') {
        throw createValidationError(`${fieldName} metin olmalidir`);
    }

    const trimmed = value.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength) {
        throw createValidationError(`${fieldName} uzunlugu gecersiz`);
    }

    return trimmed;
}

function normalizeBase64Url(value, fieldName, { minLength = 16, maxLength = 4096 } = {}) {
    const normalized = normalizeString(value, fieldName, { minLength, maxLength });

    if (!BASE64URL_PATTERN.test(normalized)) {
        throw createValidationError(`${fieldName} gecersiz formatta`);
    }

    return normalized;
}

function normalizeIterations(value, fieldName) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
        throw createValidationError(`${fieldName} tam sayi olmalidir`);
    }

    if (parsed < PERSONAL_VAULT_KDF_MIN_ITERATIONS || parsed > PERSONAL_VAULT_KDF_MAX_ITERATIONS) {
        throw createValidationError(`${fieldName} desteklenmeyen aralikta`);
    }

    return parsed;
}

function normalizeKnownAlgorithm(value, fieldName, expectedValue) {
    const normalized = normalizeString(value, fieldName, { minLength: expectedValue.length, maxLength: expectedValue.length });
    if (normalized !== expectedValue) {
        throw createValidationError(`${fieldName} desteklenmiyor`);
    }

    return normalized;
}

function normalizeEnvelopeObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw createValidationError(`${fieldName} nesne olmalidir`);
    }

    const version = Number.parseInt(value.v, 10);
    if (version !== PERSONAL_VAULT_ITEM_PAYLOAD_VERSION) {
        throw createValidationError(`${fieldName}.v desteklenmiyor`);
    }

    return {
        v: version,
        alg: normalizeKnownAlgorithm(value.alg, `${fieldName}.alg`, PERSONAL_VAULT_ITEM_ALGORITHM),
        iv: normalizeBase64Url(value.iv, `${fieldName}.iv`),
        ciphertext: normalizeBase64Url(value.ciphertext, `${fieldName}.ciphertext`, {
            minLength: 24,
            maxLength: PERSONAL_VAULT_ITEM_MAX_BYTES * 3
        })
    };
}

export function normalizePersonalVaultSetupPayload(body = {}) {
    return {
        kdfAlgorithm: normalizeKnownAlgorithm(body.kdfAlgorithm, 'kdfAlgorithm', PERSONAL_VAULT_KDF_ALGORITHM),
        kdfSalt: normalizeBase64Url(body.kdfSalt, 'kdfSalt'),
        kdfIterations: normalizeIterations(body.kdfIterations, 'kdfIterations'),
        wrapAlgorithm: normalizeKnownAlgorithm(body.wrapAlgorithm, 'wrapAlgorithm', PERSONAL_VAULT_WRAP_ALGORITHM),
        wrapIv: normalizeBase64Url(body.wrapIv, 'wrapIv'),
        wrappedVaultKey: normalizeBase64Url(body.wrappedVaultKey, 'wrappedVaultKey', { minLength: 32 }),
        recoveryKdfAlgorithm: normalizeKnownAlgorithm(body.recoveryKdfAlgorithm, 'recoveryKdfAlgorithm', PERSONAL_VAULT_KDF_ALGORITHM),
        recoveryKdfSalt: normalizeBase64Url(body.recoveryKdfSalt, 'recoveryKdfSalt'),
        recoveryKdfIterations: normalizeIterations(body.recoveryKdfIterations, 'recoveryKdfIterations'),
        recoveryWrapAlgorithm: normalizeKnownAlgorithm(body.recoveryWrapAlgorithm, 'recoveryWrapAlgorithm', PERSONAL_VAULT_WRAP_ALGORITHM),
        recoveryWrapIv: normalizeBase64Url(body.recoveryWrapIv, 'recoveryWrapIv'),
        recoveryWrappedVaultKey: normalizeBase64Url(body.recoveryWrappedVaultKey, 'recoveryWrappedVaultKey', { minLength: 32 })
    };
}

export function normalizePersonalVaultEnvelope(value, fieldName = 'encrypted_payload') {
    if (typeof value === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(value);
        } catch {
            throw createValidationError(`${fieldName} gecerli JSON degil`);
        }

        return normalizeEnvelopeObject(parsed, fieldName);
    }

    return normalizeEnvelopeObject(value, fieldName);
}

export function serializePersonalVaultEnvelope(value, fieldName = 'encrypted_payload') {
    const normalized = normalizePersonalVaultEnvelope(value, fieldName);
    const serialized = JSON.stringify(normalized);

    if (Buffer.byteLength(serialized, 'utf8') > PERSONAL_VAULT_ITEM_MAX_BYTES) {
        throw createValidationError(`${fieldName} boyutu limiti asti`);
    }

    return serialized;
}

