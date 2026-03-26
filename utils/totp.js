import { TOTP, Secret } from 'otpauth';
import crypto from 'crypto';
import { hashLookupToken } from './encryption.js';

const APP_NAME = 'HomeInventory';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = 'SHA1';
const TOTP_WINDOW = 1;
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const DEVICE_TOKEN_BYTES = 32;

/**
 * Generate a new TOTP secret and otpauth URL for QR code.
 * @param {string} username - User's display name for the authenticator app.
 * @returns {{ secret: string, otpauthUrl: string }}
 */
export function generateTotpSecret(username) {
    const secret = new Secret({ size: 20 });

    const totp = new TOTP({
        issuer: APP_NAME,
        label: username,
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
        secret
    });

    return {
        secret: secret.base32,
        otpauthUrl: totp.toString()
    };
}

/**
 * Verify a TOTP token against a base32 secret.
 * @param {string} base32Secret - The user's TOTP secret in base32.
 * @param {string} token - 6-digit code from the authenticator app.
 * @returns {boolean}
 */
export function verifyTotpToken(base32Secret, token) {
    const totp = new TOTP({
        issuer: APP_NAME,
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
        secret: Secret.fromBase32(base32Secret)
    });

    const delta = totp.validate({ token: String(token || ''), window: TOTP_WINDOW });
    return delta !== null;
}

/**
 * Generate random single-use backup codes.
 * @param {number} count
 * @returns {string[]} Array of alphanumeric codes.
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT) {
    const codes = [];
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I to avoid confusion

    for (let i = 0; i < count; i++) {
        const bytes = crypto.randomBytes(BACKUP_CODE_LENGTH);
        let code = '';
        for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
            code += charset[bytes[j] % charset.length];
        }
        codes.push(code);
    }

    return codes;
}

/**
 * Hash a backup code for secure storage.
 * Uses HMAC via the existing encryption infrastructure.
 * @param {string} code
 * @returns {string}
 */
export function hashBackupCode(code) {
    return hashLookupToken(String(code || '').toUpperCase().trim());
}

/**
 * Verify a backup code against an array of stored hashes.
 * @param {string} code - Code entered by user.
 * @param {{ id: number, code_hash: string }[]} storedCodes - DB rows with unused codes.
 * @returns {number|null} ID of the matched row, or null.
 */
export function verifyBackupCode(code, storedCodes) {
    const inputHash = hashBackupCode(code);

    for (const stored of storedCodes) {
        if (stored.code_hash === inputHash) {
            return stored.id;
        }
    }

    return null;
}

/**
 * Generate a random opaque token for trusted device cookies.
 * @returns {string} Base64url-encoded token.
 */
export function generateDeviceToken() {
    return crypto.randomBytes(DEVICE_TOKEN_BYTES)
        .toString('base64url');
}

/**
 * Hash a device token for DB storage.
 * @param {string} token
 * @returns {string}
 */
export function hashDeviceToken(token) {
    return hashLookupToken(String(token || ''));
}
