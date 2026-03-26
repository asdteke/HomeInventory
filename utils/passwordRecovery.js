import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { CompactEncrypt, compactDecrypt } from 'jose';
import { hashLookupToken } from './encryption.js';
import { getEnvOrSecret } from './secrets.js';

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 15;
export const PASSWORD_RESET_MAX_FAILURES = 5;
export const PASSWORD_RESET_LOCK_WINDOW_MS = 60 * 60 * 1000;
export const RECOVERY_KEY_LENGTH = 30;
export const RECOVERY_KEY_GROUP_SIZE = 5;

const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_KEY_HASH_ROUNDS = 12;
const PASSWORD_RESET_PURPOSE = 'password_reset';
const PASSWORD_RESET_AUDIENCE = 'homeinventory:password-reset';
const DUMMY_COMPARE_HASH = bcrypt.hashSync('HOMEINVENTORY-DUMMY-RECOVERY-KEY', 10);

function getPasswordResetJweKey() {
    const secret = String(
        process.env.PASSWORD_RESET_JWE_SECRET ||
        getEnvOrSecret('JWT_SECRET', 'jwt_secret') ||
        process.env.SESSION_SECRET ||
        'development-only-password-reset-secret'
    );

    return crypto.createHash('sha256').update(secret).digest();
}

export function getPasswordRecoveryMode() {
    return process.env.RESEND_API_KEY ? 'email' : 'recovery_key';
}

export function normalizeRecoveryKey(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

export function formatRecoveryKey(value) {
    const normalized = normalizeRecoveryKey(value);
    if (!normalized) {
        return '';
    }

    return normalized.match(new RegExp(`.{1,${RECOVERY_KEY_GROUP_SIZE}}`, 'g'))?.join('-') || normalized;
}

export function generateRecoveryKey() {
    let normalized = '';

    for (let index = 0; index < RECOVERY_KEY_LENGTH; index += 1) {
        const nextChar = RECOVERY_KEY_ALPHABET[crypto.randomInt(RECOVERY_KEY_ALPHABET.length)];
        normalized += nextChar;
    }

    return formatRecoveryKey(normalized);
}

export async function hashRecoveryKey(recoveryKey) {
    return bcrypt.hash(normalizeRecoveryKey(recoveryKey), RECOVERY_KEY_HASH_ROUNDS);
}

export async function compareRecoveryKey(recoveryKey, recoveryKeyHash) {
    if (!recoveryKeyHash) {
        return false;
    }

    return bcrypt.compare(normalizeRecoveryKey(recoveryKey), recoveryKeyHash);
}

export async function performFakeRecoveryKeyCheck(candidateRecoveryKey = '') {
    const candidate = normalizeRecoveryKey(candidateRecoveryKey) || 'DUMMYRECOVERYKEYVALUE';
    return bcrypt.compare(candidate, DUMMY_COMPARE_HASH);
}

export async function applyPasswordResetFailureDelay() {
    const delayMs = 1000 + crypto.randomInt(1001);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function issuePasswordResetToken({ userId }) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((nowSeconds + (PASSWORD_RESET_TOKEN_TTL_MINUTES * 60)) * 1000);
    const jti = crypto.randomBytes(32).toString('hex');
    const payload = {
        sub: String(userId),
        jti,
        purpose: PASSWORD_RESET_PURPOSE,
        aud: PASSWORD_RESET_AUDIENCE,
        iat: nowSeconds,
        exp: nowSeconds + (PASSWORD_RESET_TOKEN_TTL_MINUTES * 60)
    };

    const token = await new CompactEncrypt(
        new TextEncoder().encode(JSON.stringify(payload))
    )
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWE' })
        .encrypt(getPasswordResetJweKey());

    return {
        token,
        expiresAt: expiresAt.toISOString(),
        tokenLookupHash: hashLookupToken(jti)
    };
}

export async function verifyPasswordResetToken(token) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
        throw new Error('missing_token');
    }

    const { plaintext, protectedHeader } = await compactDecrypt(normalizedToken, getPasswordResetJweKey());

    if (protectedHeader.alg !== 'dir' || protectedHeader.enc !== 'A256GCM') {
        throw new Error('invalid_header');
    }

    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload?.purpose !== PASSWORD_RESET_PURPOSE) {
        throw new Error('invalid_purpose');
    }

    if (payload?.aud !== PASSWORD_RESET_AUDIENCE) {
        throw new Error('invalid_audience');
    }

    if (!payload?.jti || !payload?.sub || !payload?.exp) {
        throw new Error('invalid_payload');
    }

    if (Number(payload.exp) <= nowSeconds) {
        throw new Error('expired_token');
    }

    return {
        userId: Number(payload.sub),
        jti: payload.jti,
        expiresAt: new Date(Number(payload.exp) * 1000).toISOString(),
        tokenLookupHash: hashLookupToken(payload.jti)
    };
}

export async function createRecoveryKeyMaterial() {
    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = await hashRecoveryKey(recoveryKey);

    return {
        recoveryKey,
        recoveryKeyHash,
        generatedAt: new Date().toISOString()
    };
}
