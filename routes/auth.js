import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'node:fs';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import db from '../database.js';
import { generateToken, authenticateToken, cookieOptions, shouldUseSecureCookies } from '../middleware/auth.js';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import {
    decryptFromStorage,
    encryptForStorage,
    generateOpaqueToken,
    hashLookupToken,
    listLookupTokenHashes
} from '../utils/encryption.js';
import {
    buildEmailLookup,
    buildUsernameLookup,
    decryptHouseRecord,
    decryptPendingRegistrationRecord,
    decryptUserRecord,
    decryptUsername,
    encryptBorrowerName,
    encryptCategoryName,
    encryptEmail,
    encryptHouseName,
    encryptRoomDescription,
    encryptRoomName,
    encryptUsername
} from '../utils/protectedFields.js';
import {
    sendHouseJoinRequestNotification,
    sendHouseJoinRequestDecisionNotification,
    sendPasswordResetEmail,
    sendVerificationEmail
} from '../utils/emailService.js';
import {
    createJoinRequest,
    getHouseOwners,
    getMembershipStateForUser,
    getUserHouseList,
    listPendingJoinRequestsForUser,
    syncUserHousePointers
} from '../utils/houseMembership.js';
import {
    PASSWORD_RESET_LOCK_WINDOW_MS,
    PASSWORD_RESET_MAX_FAILURES,
    PASSWORD_RESET_TOKEN_TTL_MINUTES,
    applyPasswordResetFailureDelay,
    compareRecoveryKey,
    createRecoveryKeyMaterial,
    getPasswordRecoveryMode,
    issuePasswordResetToken,
    performFakeRecoveryKeyCheck,
    verifyPasswordResetToken
} from '../utils/passwordRecovery.js';
import {
    generateTotpSecret,
    verifyTotpToken,
    generateBackupCodes,
    hashBackupCode,
    verifyBackupCode,
    generateDeviceToken,
    hashDeviceToken
} from '../utils/totp.js';
import { resolveStoredMediaPath } from '../utils/mediaStorage.js';
import { getUploadsRoot } from '../utils/runtimePaths.js';
import {
    getDefaultCategorySeeds,
    getDefaultNewHouseName,
    getDefaultOwnedHouseName,
    getDefaultRoomSeeds,
    resolveSeedLanguage
} from '../utils/houseDefaults.js';
import { parseSqliteUtcTimestamp, toSqliteUtcTimestamp } from '../utils/sqliteDate.js';
import { getEmailDeliveryStatus } from '../utils/branding.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();
const SALT_ROUNDS = 10;
const HOUSE_KEY_REGEX = /^[a-f0-9]{64}$/i;
const MIN_PASSWORD_LENGTH = 10;
const PENDING_REGISTRATION_HOUSE_KEY_PURPOSE = 'pending_registration.house_key';
const USER_RECOVERY_KEY_PURPOSE = 'user.recovery_key';
const TOTP_SECRET_PURPOSE = 'user.totp_secret';
const TRUSTED_DEVICE_DAYS = 30;
const TRUSTED_DEVICE_COOKIE = 'trusted_device';
const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state';
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const LEGAL_TERMS_VERSION = '2026-04-16-selfhost';
const PRIVACY_NOTICE_VERSION = '2026-04-17-privacy';
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_MINUTES = 15;
const LOGIN_LOCK_DURATION_MINUTES = 60;
const LOGIN_LOCKED_MESSAGE = 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.';
const BOOTSTRAP_ADMIN_EMAIL = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:3001'
).trim().replace(/\/+$/, '');
const RESET_PASSWORD_FAILURE_MESSAGE = 'İşlem gerçekleştirilemedi. Bilgileri kontrol edip tekrar deneyin.';
const RESET_PASSWORD_LOCKED_MESSAGE = 'İşlem gerçekleştirilemedi. Lütfen daha sonra tekrar deneyin.';
const FORGOT_PASSWORD_GENERIC_MESSAGE = 'Hesap mevcutsa gerekli yönlendirme gönderildi.';
const repoRoot = join(__dirname, '..');
const uploadsRoot = getUploadsRoot(repoRoot);
const ACCOUNT_MEDIA_ALLOWED_PREFIXES = [
    'uploads',
    'uploads/thumbnails',
    'uploads/invoices',
    'uploads/invoices/thumbnails'
];
const DELETED_ACCOUNT_BORROWER_NAME = encryptBorrowerName('Silinmiş hesap');

const COMMON_PASSWORDS = new Set([
    '123456', '12345678', '123456789', '1234567890', 'password', 'password1',
    'qwerty', 'qwerty123', 'abc123', '111111', '000000', '123123',
    'iloveyou', 'admin', 'admin123', 'letmein', 'welcome', 'test123',
    'asdfgh', 'asdf1234', 'zaq12wsx', '1q2w3e4r', '654321', '987654321',
    '123456a', 'turkiye123', 'ev123456', 'sifre123'
]);

function translateAuth(req, key, fallback, options = {}) {
    try {
        const translated = req?.t?.(key, options);
        if (typeof translated === 'string' && translated.trim() && translated !== key) {
            return translated;
        }
    } catch {}

    return fallback;
}

function passwordError(code, fallback, options = {}) {
    return {
        code,
        fallback,
        options
    };
}

function formatPasswordError(error) {
    return error.options && Object.keys(error.options).length > 0
        ? error.fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(error.options[key] ?? ''))
        : error.fallback;
}

function resolveRoleForEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    return BOOTSTRAP_ADMIN_EMAIL && normalizedEmail === BOOTSTRAP_ADMIN_EMAIL
        ? 'admin'
        : 'user';
}

function clearSessionCookies(res) {
    const baseCookieOptions = {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'lax',
        path: '/'
    };

    res.clearCookie('token', baseCookieOptions);
    res.clearCookie(TRUSTED_DEVICE_COOKIE, baseCookieOptions);
}

function clearAuthTokenCookie(res) {
    res.clearCookie('token', {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'lax',
        path: '/'
    });
}

function getGoogleOauthStateCookieOptions() {
    return {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'lax',
        path: '/api/auth/google'
    };
}

function clearGoogleOauthStateCookie(res) {
    res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, getGoogleOauthStateCookieOptions());
}

function timingSafeEqualStrings(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');

    if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function issueGoogleOauthState(res) {
    const state = generateOpaqueToken();
    res.cookie(
        GOOGLE_OAUTH_STATE_COOKIE,
        hashLookupToken(state),
        {
            ...getGoogleOauthStateCookieOptions(),
            maxAge: GOOGLE_OAUTH_STATE_TTL_MS
        }
    );
    return state;
}

function consumeGoogleOauthState(req, res) {
    const expectedStateHash = String(req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE] || '').trim();
    const receivedState = String(req.query?.state || '').trim();
    clearGoogleOauthStateCookie(res);

    if (!expectedStateHash || !receivedState) {
        return false;
    }

    return timingSafeEqualStrings(expectedStateHash, hashLookupToken(receivedState));
}

function hasAcceptedCurrentLegalDocuments(row) {
    return Boolean(
        row?.legal_terms_accepted_at &&
        row?.privacy_notice_acknowledged_at &&
        row?.legal_terms_version === LEGAL_TERMS_VERSION &&
        row?.privacy_notice_version === PRIVACY_NOTICE_VERSION
    );
}

function resolveAccountMediaPath(storedPath) {
    return resolveStoredMediaPath(storedPath, {
        repoRoot,
        mediaRoot: uploadsRoot,
        allowedPrefixes: ACCOUNT_MEDIA_ALLOWED_PREFIXES
    });
}

function deleteAccountMediaFiles(mediaPaths) {
    for (const storedPath of mediaPaths) {
        const fullPath = resolveAccountMediaPath(storedPath);
        if (!fullPath) {
            continue;
        }

        try {
            fs.unlinkSync(fullPath);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }
}

function buildSqlPlaceholders(values) {
    return values.map(() => '?').join(', ');
}

function promoteReplacementHouseOwners(userId) {
    const ownedMemberships = db.prepare(`
        SELECT house_key
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
    `).all(userId);

    for (const membership of ownedMemberships) {
        const anotherOwner = db.prepare(`
            SELECT id
            FROM user_houses
            WHERE house_key = ? AND user_id != ? AND is_owner = 1
            LIMIT 1
        `).get(membership.house_key, userId);

        if (anotherOwner) {
            continue;
        }

        const replacement = db.prepare(`
            SELECT id
            FROM user_houses
            WHERE house_key = ? AND user_id != ?
            ORDER BY joined_at ASC, id ASC
            LIMIT 1
        `).get(membership.house_key, userId);

        if (replacement) {
            db.prepare('UPDATE user_houses SET is_owner = 1 WHERE id = ?').run(replacement.id);
        }
    }
}

function reassignOrDeleteUserLocations(userId) {
    const locations = db.prepare(`
        SELECT id, house_key
        FROM locations
        WHERE created_by = ?
    `).all(userId);

    for (const location of locations) {
        const replacementMember = db.prepare(`
            SELECT user_id
            FROM user_houses
            WHERE house_key = ? AND user_id != ?
            ORDER BY is_owner DESC, joined_at ASC, id ASC
            LIMIT 1
        `).get(location.house_key, userId);

        if (replacementMember?.user_id) {
            db.prepare(`
                UPDATE locations
                SET created_by = ?
                WHERE id = ?
            `).run(replacementMember.user_id, location.id);
            continue;
        }

        const locationUsage = db.prepare(`
            SELECT id
            FROM items
            WHERE location_id = ?
            LIMIT 1
        `).get(location.id);

        if (locationUsage) {
            throw new Error('Kullanıcıya ait konumlar başka kayıtlar tarafından kullanılmaya devam ediyor');
        }

        db.prepare('DELETE FROM locations WHERE id = ?').run(location.id);
    }
}

function runDeleteAccountTransaction({
    userId,
    emailLookup,
    usernameLookup,
    itemIds = []
}) {
    const deleteAccount = db.transaction((input) => {
        const { userId: deletingUserId, emailLookup: deletingEmailLookup, usernameLookup: deletingUsernameLookup, itemIds: ownedItemIds } = input;

        promoteReplacementHouseOwners(deletingUserId);

        let ownedBorrowIds = [];
        if (ownedItemIds.length > 0) {
            const itemPlaceholders = buildSqlPlaceholders(ownedItemIds);
            ownedBorrowIds = db.prepare(`
                SELECT id
                FROM item_borrows
                WHERE item_id IN (${itemPlaceholders})
            `).all(...ownedItemIds).map((row) => row.id);
        }

        if (ownedBorrowIds.length > 0) {
            const borrowPlaceholders = buildSqlPlaceholders(ownedBorrowIds);
            db.prepare(`
                DELETE FROM borrow_requests
                WHERE borrow_id IN (${borrowPlaceholders})
            `).run(...ownedBorrowIds);
        }

        if (ownedItemIds.length > 0) {
            const itemPlaceholders = buildSqlPlaceholders(ownedItemIds);

            db.prepare(`
                DELETE FROM borrow_requests
                WHERE item_id IN (${itemPlaceholders})
            `).run(...ownedItemIds);

            db.prepare(`
                DELETE FROM item_borrows
                WHERE item_id IN (${itemPlaceholders})
            `).run(...ownedItemIds);

            db.prepare(`
                DELETE FROM items
                WHERE id IN (${itemPlaceholders})
            `).run(...ownedItemIds);
        }

        db.prepare(`
            DELETE FROM borrow_requests
            WHERE initiator_user_id = ?
               OR recipient_user_id = ?
               OR decided_by_user_id = ?
        `).run(deletingUserId, deletingUserId, deletingUserId);

        db.prepare(`
            UPDATE item_borrows
            SET borrower_type = 'external',
                borrower_user_id = NULL,
                borrower_name = ?,
                borrower_contact = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE borrower_user_id = ?
        `).run(DELETED_ACCOUNT_BORROWER_NAME, deletingUserId);

        db.prepare(`
            UPDATE item_borrows
            SET lent_by_user_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE lent_by_user_id = ?
        `).run(deletingUserId);

        db.prepare(`
            UPDATE item_borrows
            SET returned_by_user_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE returned_by_user_id = ?
        `).run(deletingUserId);

        db.prepare(`
            UPDATE item_borrows
            SET return_requested_by_user_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE return_requested_by_user_id = ?
        `).run(deletingUserId);

        db.prepare('DELETE FROM personal_vault_items WHERE user_id = ?').run(deletingUserId);
        db.prepare('DELETE FROM personal_vaults WHERE user_id = ?').run(deletingUserId);
        db.prepare('DELETE FROM password_reset_requests WHERE user_id = ?').run(deletingUserId);
        db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(deletingUserId);
        db.prepare('DELETE FROM totp_backup_codes WHERE user_id = ?').run(deletingUserId);
        db.prepare('DELETE FROM house_join_requests WHERE requester_user_id = ?').run(deletingUserId);
        db.prepare('UPDATE house_join_requests SET decided_by_user_id = NULL WHERE decided_by_user_id = ?').run(deletingUserId);

        reassignOrDeleteUserLocations(deletingUserId);

        db.prepare('DELETE FROM user_houses WHERE user_id = ?').run(deletingUserId);

        if (deletingUsernameLookup || deletingEmailLookup) {
            db.prepare(`
                DELETE FROM pending_registrations
                WHERE username_lookup = ? OR email_lookup = ?
            `).run(deletingUsernameLookup || '', deletingEmailLookup || '');
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(deletingUserId);
    });

    deleteAccount({
        userId,
        emailLookup,
        usernameLookup,
        itemIds
    });
}

function validatePasswordStrength(password, context = {}) {
    const value = String(password || '');
    const lowered = value.toLowerCase();
    const checks = [];

    if (value.length < MIN_PASSWORD_LENGTH) {
        checks.push(passwordError('min_length', 'Password must be at least {{min}} characters long', { min: MIN_PASSWORD_LENGTH }));
    }
    if (!/[a-z]/.test(value)) {
        checks.push(passwordError('lowercase_required', 'Password must include at least one lowercase letter'));
    }
    if (!/[A-Z]/.test(value)) {
        checks.push(passwordError('uppercase_required', 'Password must include at least one uppercase letter'));
    }
    if (!/[0-9]/.test(value)) {
        checks.push(passwordError('number_required', 'Password must include at least one number'));
    }
    if (!/[^a-zA-Z0-9]/.test(value)) {
        checks.push(passwordError('symbol_required', 'Password must include at least one symbol'));
    }
    if (/(.)\1{3,}/.test(value)) {
        checks.push(passwordError('repeated_chars', 'Do not use repeated characters in your password'));
    }
    if (/1234|2345|3456|4567|5678|6789|7890|qwerty|asdf|zxcv/i.test(value)) {
        checks.push(passwordError('predictable_sequence', 'Do not use easy-to-guess sequences in your password'));
    }
    if (COMMON_PASSWORDS.has(lowered)) {
        checks.push(passwordError('common_password', 'This password is too common and unsafe'));
    }

    const username = String(context.username || '').toLowerCase().trim();
    const email = String(context.email || '').toLowerCase().trim();
    const emailLocal = email.includes('@') ? email.split('@')[0] : '';

    if (username && username.length >= 3 && lowered.includes(username)) {
        checks.push(passwordError('contains_username', 'Password must not contain your username'));
    }
    if (emailLocal && emailLocal.length >= 3 && lowered.includes(emailLocal)) {
        checks.push(passwordError('contains_email', 'Password must not contain your email information'));
    }

    return {
        valid: checks.length === 0,
        errors: checks.map(formatPasswordError),
        errorCodes: checks.map(({ code }) => code)
    };
}

// Generate a secure 256-bit house key
function generateHouseKey() {
    return crypto.randomBytes(32).toString('hex'); // 64 characters, 256-bit
}

function findPendingRegistrationByVerificationToken(rawToken) {
    const normalizedToken = String(rawToken || '').trim();
    if (!normalizedToken) {
        return null;
    }

    const getHashedPendingRegistration = db.prepare(
        'SELECT * FROM pending_registrations WHERE verification_token_hashed = 1 AND verification_token = ?'
    );

    for (const hashedToken of listLookupTokenHashes(normalizedToken, { includeLegacy: true })) {
        const hashedMatch = getHashedPendingRegistration.get(hashedToken);
        if (hashedMatch) {
            return hashedMatch;
        }
    }

    return db.prepare(
        'SELECT * FROM pending_registrations WHERE COALESCE(verification_token_hashed, 0) = 0 AND verification_token = ?'
    ).get(normalizedToken);
}

function getPendingRegistrationHouseKey(pendingRegistration) {
    return decryptFromStorage(pendingRegistration.house_key, {
        purpose: PENDING_REGISTRATION_HOUSE_KEY_PURPOSE
    });
}

function getUserByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        return null;
    }

    return db.prepare(
        'SELECT * FROM users WHERE email_lookup = ? OR email = ? LIMIT 1'
    ).get(buildEmailLookup(normalizedEmail), normalizedEmail);
}

function getUserByUsername(username) {
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername) {
        return null;
    }

    return db.prepare(
        'SELECT * FROM users WHERE username_lookup = ? OR username = ? LIMIT 1'
    ).get(buildUsernameLookup(normalizedUsername), normalizedUsername);
}

function getPendingRegistrationByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        return null;
    }

    return db.prepare(
        'SELECT id, expires_at FROM pending_registrations WHERE email_lookup = ? OR email = ? LIMIT 1'
    ).get(buildEmailLookup(normalizedEmail), normalizedEmail);
}

function getPendingRegistrationByUsername(username) {
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername) {
        return null;
    }

    return db.prepare(
        'SELECT id FROM pending_registrations WHERE username_lookup = ? OR username = ? LIMIT 1'
    ).get(buildUsernameLookup(normalizedUsername), normalizedUsername);
}

function getUserByLoginIdentifier(loginIdentifier) {
    const normalizedIdentifier = String(loginIdentifier || '').trim();
    if (!normalizedIdentifier) {
        return null;
    }

    const usernameLookup = buildUsernameLookup(normalizedIdentifier);
    const emailLookup = buildEmailLookup(normalizedIdentifier);

    return db.prepare(`
        SELECT *
        FROM users
        WHERE username_lookup = ?
           OR email_lookup = ?
           OR username = ?
           OR email = ?
        LIMIT 1
    `).get(usernameLookup, emailLookup, normalizedIdentifier, normalizedIdentifier.toLowerCase());
}

function getDecryptedUser(userRow) {
    return decryptUserRecord(userRow);
}

function getUserTokenPayload(userRow, houseKey = userRow.active_house_key || userRow.house_key) {
    const user = getDecryptedUser(userRow);
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        house_key: houseKey,
        role: user.role || 'user'
    };
}

function getDecryptedHousesForUser(userId) {
    return getUserHouseList(userId);
}

function getPasswordRecoveryFlags(userSecurityRow) {
    const mode = getPasswordRecoveryMode();
    const hasRecoveryKey = Boolean(userSecurityRow?.recovery_key_hash);

    return {
        passwordRecoveryMode: mode,
        hasRecoveryKey: mode === 'recovery_key' ? hasRecoveryKey : false,
        mustSetupRecoveryKey: mode === 'recovery_key' && !hasRecoveryKey
    };
}

async function assignRecoveryKeyToUser(userId) {
    const recoveryMaterial = await createRecoveryKeyMaterial();
    const encryptedRecoveryKey = encryptForStorage(recoveryMaterial.recoveryKey, {
        purpose: USER_RECOVERY_KEY_PURPOSE
    });

    db.prepare(`
        UPDATE users
        SET recovery_key_hash = ?, recovery_key_value = ?, recovery_key_generated_at = ?
        WHERE id = ?
    `).run(
        recoveryMaterial.recoveryKeyHash,
        encryptedRecoveryKey,
        recoveryMaterial.generatedAt,
        userId
    );

    return recoveryMaterial.recoveryKey;
}

function incrementPasswordResetFailure(userId) {
    if (!userId) {
        return;
    }

    db.prepare(`
        UPDATE users
        SET password_reset_failed_count = COALESCE(password_reset_failed_count, 0) + 1,
            password_reset_locked_until = CASE
                WHEN password_reset_locked_until IS NOT NULL AND password_reset_locked_until > CURRENT_TIMESTAMP
                    THEN password_reset_locked_until
                WHEN COALESCE(password_reset_failed_count, 0) + 1 >= ?
                    THEN DATETIME('now', '+1 hour')
                ELSE password_reset_locked_until
            END
        WHERE id = ?
    `).run(PASSWORD_RESET_MAX_FAILURES, userId);
}

function clearPasswordResetState(userId) {
    db.prepare(`
        UPDATE users
        SET password_reset_failed_count = 0,
            password_reset_locked_until = NULL
        WHERE id = ?
    `).run(userId);
}

function isPasswordResetLocked(userRow) {
    if (!userRow?.password_reset_locked_until) {
        return false;
    }

    const lockedUntil = parseSqliteUtcTimestamp(userRow.password_reset_locked_until);
    return typeof lockedUntil === 'number' && lockedUntil > Date.now();
}

async function awaitPasswordResetFailureMitigations(candidateRecoveryKey = '') {
    await Promise.all([
        applyPasswordResetFailureDelay(),
        performFakeRecoveryKeyCheck(candidateRecoveryKey)
    ]);
}

async function respondWithPasswordResetFailure(res, {
    userId = null,
    recoveryKey = '',
    statusCode = 400,
    message = RESET_PASSWORD_FAILURE_MESSAGE
} = {}) {
    if (userId) {
        incrementPasswordResetFailure(userId);
    }

    await awaitPasswordResetFailureMitigations(recoveryKey);
    return res.status(statusCode).json({ error: message });
}

function recordLoginFailure(userId) {
    if (!userId) {
        return null;
    }

    const loginFailureWindow = `-${LOGIN_FAILURE_WINDOW_MINUTES} minutes`;
    const lockDuration = `+${LOGIN_LOCK_DURATION_MINUTES} minutes`;

    db.prepare(`
        UPDATE users
        SET failed_login_count = CASE
                WHEN login_failed_at IS NOT NULL AND login_failed_at > DATETIME('now', ?)
                    THEN COALESCE(failed_login_count, 0) + 1
                ELSE 1
            END,
            login_failed_at = CURRENT_TIMESTAMP,
            login_locked_until = CASE
                WHEN login_locked_until IS NOT NULL AND login_locked_until > CURRENT_TIMESTAMP
                    THEN login_locked_until
                WHEN (
                    CASE
                        WHEN login_failed_at IS NOT NULL AND login_failed_at > DATETIME('now', ?)
                            THEN COALESCE(failed_login_count, 0) + 1
                        ELSE 1
                    END
                ) >= ?
                    THEN DATETIME('now', ?)
                ELSE NULL
            END
        WHERE id = ?
    `).run(
        loginFailureWindow,
        loginFailureWindow,
        LOGIN_MAX_FAILURES,
        lockDuration,
        userId
    );

    return db.prepare(`
        SELECT failed_login_count, login_failed_at, login_locked_until
        FROM users
        WHERE id = ?
    `).get(userId);
}

function clearLoginFailureState(userId) {
    db.prepare(`
        UPDATE users
        SET failed_login_count = 0,
            login_failed_at = NULL,
            login_locked_until = NULL,
            last_login = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(userId);
}

function touchAuthenticatedActivity(userId) {
    db.prepare(`
        UPDATE users
        SET last_login = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (
              last_login IS NULL
              OR last_login < DATETIME('now', '-5 minutes')
          )
    `).run(userId);
}

function isLoginLocked(userRow) {
    if (!userRow?.login_locked_until) {
        return false;
    }

    const lockedUntil = parseSqliteUtcTimestamp(userRow.login_locked_until);
    return typeof lockedUntil === 'number' && lockedUntil > Date.now();
}

const resetPasswordLimiter = rateLimit({
    windowMs: PASSWORD_RESET_LOCK_WINDOW_MS,
    max: PASSWORD_RESET_MAX_FAILURES,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Çok fazla başarısız sıfırlama denemesi. Lütfen 1 saat sonra tekrar deneyin.'
    }
});

// Create default categories for a new house
function createDefaultCategories(houseKey, language = 'tr') {
    const insertCategory = db.prepare('INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)');
    const defaultCategories = getDefaultCategorySeeds(language);

    const insertMany = db.transaction((categories) => {
        for (const cat of categories) {
            insertCategory.run(encryptCategoryName(cat[0]), cat[1], cat[2], houseKey);
        }
    });
    insertMany(defaultCategories);
}

// Create default rooms for a new house
function createDefaultRooms(houseKey, language = 'tr') {
    const insertRoom = db.prepare('INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)');
    const defaultRooms = getDefaultRoomSeeds(language);

    const insertMany = db.transaction((rooms) => {
        for (const room of rooms) {
            insertRoom.run(encryptRoomName(room[0]), encryptRoomDescription(room[1]), houseKey);
        }
    });
    insertMany(defaultRooms);
}

function fireAndForget(task, label) {
    Promise.resolve()
        .then(task)
        .catch((error) => console.error(label, error));
}

function notifyOwnersAboutJoinRequest(houseKey, requesterUsername, requestedHouseName) {
    if (!getEmailDeliveryStatus().configured) {
        return;
    }

    const owners = getHouseOwners(houseKey)
        .map((owner) => owner.email)
        .filter(Boolean);

    if (owners.length === 0) {
        return;
    }

    fireAndForget(
        () => sendHouseJoinRequestNotification({
            to: owners,
            requesterUsername,
            requestedHouseName
        }),
        'Join request owner notification error:'
    );
}

function getResetPasswordUrl(token) {
    return `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

// Register new user - saves to pending_registrations until email is verified
router.post('/register', async (req, res) => {
    try {
        const {
            username,
            email,
            password,
            mode,
            house_key,
            acceptedTerms,
            acknowledgedPrivacyNotice
        } = req.body;
        const safeUsername = String(username || '').trim();
        const safeEmail = String(email || '').trim().toLowerCase();
        const hasAcceptedTerms = acceptedTerms === true;
        const hasAcknowledgedPrivacyNotice = acknowledgedPrivacyNotice === true;

        // Validation
        if (!safeUsername || !safeEmail || !password) {
            return res.status(400).json({ error: translateAuth(req, 'auth.fill_all_fields', 'Tüm alanları doldurun') });
        }

        if (!hasAcceptedTerms || !hasAcknowledgedPrivacyNotice) {
            return res.status(400).json({
                error: translateAuth(req, 'auth.legal_acceptance_required', 'Devam etmek için Kullanım Koşulları ile Aydınlatma Metni onayları gerekli')
            });
        }

        if (!/^[a-zA-Z0-9_-]{3,30}$/.test(safeUsername)) {
            return res.status(400).json({ error: translateAuth(req, 'auth.invalid_username', 'Kullanıcı adı 3-30 karakter olmalı ve sadece harf/rakam/_/- içermeli') });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
            return res.status(400).json({ error: translateAuth(req, 'auth.invalid_email', 'Geçerli bir e-posta adresi girin') });
        }

        const passwordValidation = validatePasswordStrength(password, {
            username: safeUsername,
            email: safeEmail
        });
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.errors[0],
                passwordErrors: passwordValidation.errors,
                passwordErrorCodes: passwordValidation.errorCodes
            });
        }

        // Check if user already exists in users table
        const existingEmailUser = getUserByEmail(safeEmail);
        const existingUsernameUser = getUserByUsername(safeUsername);

        if (existingEmailUser || existingUsernameUser) {
            return res.status(400).json({ error: translateAuth(req, 'auth.identifier_already_registered', 'Bu kullanıcı adı veya e-posta zaten kayıtlı') });
        }

        // Check if already pending registration
        const existingPending = getPendingRegistrationByEmail(safeEmail);

        if (existingPending) {
            // If expired, delete old pending registration
            if (new Date(existingPending.expires_at) < new Date()) {
                db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(existingPending.id);
            } else {
                return res.status(400).json({
                    error: translateAuth(req, 'auth.email_pending_verification', 'Bu e-posta için zaten bir doğrulama bekliyor. Lütfen e-postanızı kontrol edin veya birkaç dakika bekleyin.')
                });
            }
        }

        // Also check if username is pending
        const pendingUsername = getPendingRegistrationByUsername(safeUsername);

        if (pendingUsername) {
            return res.status(400).json({ error: translateAuth(req, 'auth.username_in_use', 'Bu kullanıcı adı zaten kullanımda') });
        }

        let userHouseKey;
        let isNewHouse = false;

        if (mode === 'join') {
            // Mode B: Join existing house
            if (!house_key) {
                return res.status(400).json({ error: translateAuth(req, 'auth.join_house_key_required', 'Mevcut eve katılmak için Ev Anahtarı gerekli') });
            }
            if (!HOUSE_KEY_REGEX.test(String(house_key))) {
                return res.status(400).json({ error: translateAuth(req, 'auth.invalid_house_key_format', 'Geçersiz Ev Anahtarı formatı') });
            }

            // Verify house key exists
            const existingHouse = db.prepare('SELECT id FROM user_houses WHERE house_key = ?').get(house_key);
            if (!existingHouse) {
                return res.status(400).json({ error: translateAuth(req, 'auth.house_key_not_found', 'Geçersiz Ev Anahtarı. Lütfen doğru anahtarı girin.') });
            }

            userHouseKey = house_key;
        } else {
            // Mode A: Create new house (default)
            userHouseKey = generateHouseKey();
            isNewHouse = true;
        }

        // Hash password with bcrypt
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const legalAcceptedAt = toSqliteUtcTimestamp(Date.now());

        // If email verification is disabled or incomplete, register directly.
        if (!getEmailDeliveryStatus().configured) {
            const seedLanguage = resolveSeedLanguage(req);
            const passwordRecoveryMode = getPasswordRecoveryMode();
            const initialRole = resolveRoleForEmail(safeEmail);
            const result = db.prepare(`
                INSERT INTO users (
                    username,
                    email,
                    username_lookup,
                    email_lookup,
                    password_hash,
                    house_key,
                    role,
                    is_verified,
                    legal_terms_version,
                    legal_terms_accepted_at,
                    privacy_notice_version,
                    privacy_notice_acknowledged_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            `).run(
                encryptUsername(safeUsername),
                encryptEmail(safeEmail),
                buildUsernameLookup(safeUsername),
                buildEmailLookup(safeEmail),
                passwordHash,
                isNewHouse ? userHouseKey : null,
                initialRole,
                LEGAL_TERMS_VERSION,
                legalAcceptedAt,
                PRIVACY_NOTICE_VERSION,
                legalAcceptedAt
            );
            
            const newUserId = result.lastInsertRowid;
            let newRecoveryKey = null;

            if (isNewHouse) {
                db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                    .run(newUserId, userHouseKey, encryptHouseName(getDefaultOwnedHouseName(seedLanguage)));
                createDefaultCategories(userHouseKey, seedLanguage);
                createDefaultRooms(userHouseKey, seedLanguage);
                db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?')
                    .run(userHouseKey, newUserId);
            } else {
                const { request } = createJoinRequest({
                    requesterUserId: newUserId,
                    houseKey: userHouseKey,
                    requestedHouseName: null
                });
                notifyOwnersAboutJoinRequest(userHouseKey, safeUsername, request.requested_house_name);
            }

            if (passwordRecoveryMode === 'recovery_key') {
                newRecoveryKey = await assignRecoveryKeyToUser(newUserId);
            }
                
            const newUserRow = db.prepare('SELECT id, username, email, house_key, active_house_key, role, is_verified FROM users WHERE id = ?').get(newUserId);
            const newUser = getDecryptedUser(newUserRow);
            
            // Generate token and set cookie
            const token = generateToken(getUserTokenPayload(newUserRow, newUserRow.active_house_key || newUserRow.house_key));
            res.cookie('token', token, cookieOptions);
            
            return res.status(201).json({
                message: isNewHouse ? 'Kayit basarili' : 'Katilim isteginiz gonderildi',
                success: true,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    house_key: newUser.active_house_key || newUser.house_key,
                    role: newUser.role,
                    is_verified: true
                },
                isNewHouse,
                house_key: userHouseKey,
                newRecoveryKey,
                password_recovery_mode: passwordRecoveryMode
            });
        }

        // Generate verification token (24 hour expiry)
        const verificationToken = generateOpaqueToken();
        const verificationTokenHash = hashLookupToken(verificationToken);
        const encryptedHouseKey = encryptForStorage(userHouseKey, {
            purpose: PENDING_REGISTRATION_HOUSE_KEY_PURPOSE
        });
        const expiresAt = toSqliteUtcTimestamp(Date.now() + (24 * 60 * 60 * 1000));

        // Save to pending_registrations (NOT to users table)
        db.prepare(`
            INSERT INTO pending_registrations 
            (
                username,
                email,
                username_lookup,
                email_lookup,
                password_hash,
                house_key,
                mode,
                is_new_house,
                verification_token,
                verification_token_hashed,
                expires_at,
                legal_terms_version,
                legal_terms_accepted_at,
                privacy_notice_version,
                privacy_notice_acknowledged_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            encryptUsername(safeUsername),
            encryptEmail(safeEmail),
            buildUsernameLookup(safeUsername),
            buildEmailLookup(safeEmail),
            passwordHash,
            encryptedHouseKey,
            mode || 'create',
            isNewHouse ? 1 : 0,
            verificationTokenHash,
            1,
            expiresAt,
            LEGAL_TERMS_VERSION,
            legalAcceptedAt,
            PRIVACY_NOTICE_VERSION,
            legalAcceptedAt
        );

        // Send verification email
        sendVerificationEmail(safeEmail, userHouseKey, verificationToken)
            .then(result => {
                const emailDomain = safeEmail.includes('@') ? safeEmail.split('@')[1] : '***';
                if (result.success) {
                    console.log(`📧 Doğrulama e-postası gönderildi: ***@${emailDomain}`);
                } else {
                    console.error(`❌ Doğrulama e-postası gönderilemedi: ***@${emailDomain}`, result.error);
                }
            })
            .catch(err => console.error('Email gönderim hatası:', err));

        res.status(201).json({
            message: 'E-posta adresinize bir doğrulama linki gönderdik. Hesabınız doğrulama yapıldıktan sonra aktifleştirilecektir.',
            success: true,
            requiresEmailVerification: true,
            isNewHouse,
            house_key: userHouseKey
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.registration_error', 'Kayıt sırasında bir hata oluştu') });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password, totpCode, rememberDevice } = req.body;
        const loginIdentifier = String(username || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ error: translateAuth(req, 'auth.username_password_required', 'Kullanıcı adı ve şifre gerekli') });
        }

        // Find user
        const user = getUserByLoginIdentifier(loginIdentifier);

        if (!user) {
            return res.status(401).json({ error: translateAuth(req, 'auth.invalid_credentials', 'Kullanıcı adı veya şifre hatalı') });
        }

        const decryptedUser = getDecryptedUser(user);

        if (user.is_banned === 1) {
            return res.status(403).json({ error: translateAuth(req, 'auth.account_banned', 'Hesabınız askıya alınmış. Destek ile iletişime geçin.') });
        }

        if (isLoginLocked(user)) {
            return res.status(429).json({ error: LOGIN_LOCKED_MESSAGE });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            const updatedLoginState = recordLoginFailure(user.id);
            if (isLoginLocked(updatedLoginState)) {
                return res.status(429).json({ error: LOGIN_LOCKED_MESSAGE });
            }
            return res.status(401).json({ error: translateAuth(req, 'auth.invalid_credentials', 'Kullanıcı adı veya şifre hatalı') });
        }

        // Check if email is verified
        if (user.is_verified !== 1) {
            return res.status(403).json({
                error: translateAuth(req, 'auth.email_not_verified', 'E-posta adresiniz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin.'),
                emailNotVerified: true,
                email: decryptedUser.email
            });
        }

        // ── TOTP 2FA Check ──
        if (user.totp_enabled === 1 && user.totp_secret) {
            // Check for trusted device cookie first
            const trustedDeviceCookie = req.cookies?.[TRUSTED_DEVICE_COOKIE];
            let deviceTrusted = false;

            if (trustedDeviceCookie) {
                const tokenHash = hashDeviceToken(trustedDeviceCookie);
                const device = db.prepare(
                    'SELECT id FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > CURRENT_TIMESTAMP'
                ).get(user.id, tokenHash);
                deviceTrusted = Boolean(device);
            }

            if (!deviceTrusted) {
                // No trusted device – require TOTP code
                if (!totpCode) {
                    return res.status(200).json({ requiresTwoFactor: true });
                }

                // Decrypt TOTP secret and verify
                const base32Secret = decryptFromStorage(user.totp_secret, { purpose: TOTP_SECRET_PURPOSE });
                const totpValid = verifyTotpToken(base32Secret, totpCode);

                if (!totpValid) {
                    // Try backup codes
                    const unusedBackupCodes = db.prepare(
                        'SELECT id, code_hash FROM totp_backup_codes WHERE user_id = ? AND used_at IS NULL'
                    ).all(user.id);
                    const matchedBackupId = verifyBackupCode(totpCode, unusedBackupCodes);

                    if (!matchedBackupId) {
                        return res.status(401).json({
                            error: translateAuth(req, 'auth.two_factor_invalid', 'Doğrulama kodu hatalı'),
                            requiresTwoFactor: true
                        });
                    }

                    // Mark backup code as used
                    db.prepare('UPDATE totp_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(matchedBackupId);
                }

                // Set trusted device cookie if requested
                if (rememberDevice) {
                    const deviceToken = generateDeviceToken();
                    const deviceTokenHash = hashDeviceToken(deviceToken);
                    const expiresAt = toSqliteUtcTimestamp(Date.now() + (TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000));

                    db.prepare(
                        'INSERT INTO trusted_devices (user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?)'
                    ).run(user.id, deviceTokenHash, req.headers['user-agent'] || '', expiresAt);

                    res.cookie(TRUSTED_DEVICE_COOKIE, deviceToken, {
                        httpOnly: true,
                        secure: shouldUseSecureCookies(),
                        sameSite: 'lax',
                        maxAge: TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000
                    });
                }
            }
        }

        const normalizedUser = syncUserHousePointers(user.id);
        clearLoginFailureState(user.id);
        const liveUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        const liveDecryptedUser = getDecryptedUser(liveUser);
        const token = generateToken(getUserTokenPayload(liveUser, normalizedUser?.active_house_key || normalizedUser?.house_key || null));

        res.cookie('token', token, cookieOptions).json({
            message: 'Giriş başarılı',
            user: {
                id: liveDecryptedUser.id,
                username: liveDecryptedUser.username,
                email: liveDecryptedUser.email,
                house_key: normalizedUser?.active_house_key || normalizedUser?.house_key || null,
                role: liveDecryptedUser.role || 'user'
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.login_error', 'Giriş sırasında bir hata oluştu') });
    }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
    const normalizedUser = syncUserHousePointers(req.user.id);
    touchAuthenticatedActivity(req.user.id);
    const userRow = db.prepare(
        `SELECT
            id,
            username,
            email,
            house_key,
            active_house_key,
            role,
            created_at,
            last_login,
            totp_enabled,
            legal_terms_version,
            legal_terms_accepted_at,
            privacy_notice_version,
            privacy_notice_acknowledged_at
        FROM users
        WHERE id = ?`
    ).get(req.user.id);
    const userSecurityRow = db.prepare(
        'SELECT recovery_key_hash FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!normalizedUser || !userRow) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const user = getDecryptedUser(userRow);
    const { membershipState, pendingHouseRequest } = getMembershipStateForUser(req.user.id);
    const passwordRecoveryFlags = getPasswordRecoveryFlags(userSecurityRow);

    let activeHouseId = null;
    if (normalizedUser.active_house_key) {
        const activeHouse = db.prepare('SELECT id FROM user_houses WHERE user_id = ? AND house_key = ?').get(req.user.id, normalizedUser.active_house_key);
        if (activeHouse) {
            activeHouseId = activeHouse.id;
        }
    }

    const houseMemberCount = normalizedUser.active_house_key
        ? db.prepare('SELECT COUNT(*) as count FROM user_houses WHERE house_key = ?').get(normalizedUser.active_house_key)
        : null;

    const latestTokenPayload = getUserTokenPayload(
        userRow,
        normalizedUser.active_house_key || normalizedUser.house_key || null
    );

    if (
        req.user.role !== latestTokenPayload.role ||
        req.user.house_key !== latestTokenPayload.house_key ||
        req.user.username !== latestTokenPayload.username ||
        req.user.email !== latestTokenPayload.email
    ) {
        res.cookie('token', generateToken(latestTokenPayload), cookieOptions);
    }

    res.json({
        user: {
            ...user,
            house_key: normalizedUser.house_key,
            active_house_key: normalizedUser.active_house_key,
            active_house_id: activeHouseId
        },
        membership_state: membershipState,
        pending_house_request: pendingHouseRequest,
        houseMemberCount: houseMemberCount ? houseMemberCount.count : 0,
        password_recovery_mode: passwordRecoveryFlags.passwordRecoveryMode,
        has_recovery_key: passwordRecoveryFlags.hasRecoveryKey,
        must_setup_recovery_key: passwordRecoveryFlags.mustSetupRecoveryKey,
        totp_enabled: Boolean(userRow.totp_enabled),
        must_accept_legal: !hasAcceptedCurrentLegalDocuments(userRow)
    });
});

router.post('/legal-acceptance', authenticateToken, (req, res) => {
    try {
        const {
            acceptedTerms,
            acknowledgedPrivacyNotice
        } = req.body;

        if (acceptedTerms !== true || acknowledgedPrivacyNotice !== true) {
            return res.status(400).json({
                error: 'Kullanım Koşulları ve Aydınlatma Metni onayı gereklidir'
            });
        }

        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const acceptedAt = toSqliteUtcTimestamp(Date.now());
        db.prepare(`
            UPDATE users
            SET legal_terms_version = ?,
                legal_terms_accepted_at = ?,
                privacy_notice_version = ?,
                privacy_notice_acknowledged_at = ?
            WHERE id = ?
        `).run(
            LEGAL_TERMS_VERSION,
            acceptedAt,
            PRIVACY_NOTICE_VERSION,
            acceptedAt,
            req.user.id
        );

        return res.json({
            success: true,
            message: 'Yasal metin onayları kaydedildi'
        });
    } catch (error) {
        console.error('Legal acceptance error:', error);
        return res.status(500).json({ error: 'Yasal onay kaydedilemedi' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        const safeIdentifier = String(identifier || '').trim();
        const passwordRecoveryMode = getPasswordRecoveryMode();

        if (!safeIdentifier) {
            return res.status(400).json({ error: 'Kullanıcı adı veya e-posta gerekli' });
        }

        const genericResponse = {
            success: true,
            mode: passwordRecoveryMode,
            message: FORGOT_PASSWORD_GENERIC_MESSAGE
        };

        if (passwordRecoveryMode !== 'email') {
            return res.json(genericResponse);
        }

        const user = getUserByLoginIdentifier(safeIdentifier);

        if (!user || user.is_banned === 1) {
            return res.json(genericResponse);
        }

        const decryptedUser = getDecryptedUser(user);
        const issuedToken = await issuePasswordResetToken({ userId: user.id });

        db.prepare(`
            DELETE FROM password_reset_requests
            WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP
        `).run(user.id);

        db.prepare(`
            INSERT INTO password_reset_requests (user_id, token_lookup_hash, channel, expires_at)
            VALUES (?, ?, 'email', ?)
        `).run(user.id, issuedToken.tokenLookupHash, toSqliteUtcTimestamp(issuedToken.expiresAt));

        fireAndForget(
            () => sendPasswordResetEmail({
                email: decryptedUser.email,
                resetUrl: getResetPasswordUrl(issuedToken.token)
            }),
            'Password reset email error:'
        );

        return res.json(genericResponse);
    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({ error: 'Şifre sıfırlama isteği oluşturulamadı' });
    }
});

router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
    try {
        const passwordRecoveryMode = getPasswordRecoveryMode();
        const { token, identifier, recoveryKey, newPassword, confirmPassword } = req.body;

        if (!newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'Yeni şifre alanları gerekli' });
        }

        if (passwordRecoveryMode === 'email') {
            if (!token) {
                return res.status(400).json({ error: 'Şifre sıfırlama bağlantısı gerekli' });
            }

            let verifiedToken;
            try {
                verifiedToken = await verifyPasswordResetToken(token);
            } catch {
                return respondWithPasswordResetFailure(res);
            }

            const resetRequest = db.prepare(`
                SELECT *
                FROM password_reset_requests
                WHERE token_lookup_hash = ?
                  AND channel = 'email'
                  AND used_at IS NULL
                  AND expires_at > CURRENT_TIMESTAMP
                LIMIT 1
            `).get(verifiedToken.tokenLookupHash);

            if (!resetRequest || Number(resetRequest.user_id) !== Number(verifiedToken.userId)) {
                return respondWithPasswordResetFailure(res);
            }

            const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(verifiedToken.userId);

            if (!user || user.is_banned === 1) {
                return respondWithPasswordResetFailure(res);
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ error: 'Yeni şifreler eşleşmiyor' });
            }

            const decryptedUser = getDecryptedUser(user);
            const passwordValidation = validatePasswordStrength(newPassword, {
                username: decryptedUser.username,
                email: decryptedUser.email
            });

            if (!passwordValidation.valid) {
                return res.status(400).json({
                    error: passwordValidation.errors[0],
                    passwordErrors: passwordValidation.errors,
                    passwordErrorCodes: passwordValidation.errorCodes
                });
            }

            const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
            clearPasswordResetState(user.id);
            db.prepare('DELETE FROM password_reset_requests WHERE user_id = ?').run(user.id);

            return res.json({
                success: true,
                mode: passwordRecoveryMode,
                message: `Şifreniz başarıyla sıfırlandı. Link ${PASSWORD_RESET_TOKEN_TTL_MINUTES} dakika geçerliydi ve artık kullanılamaz.`
            });
        }

        const safeIdentifier = String(identifier || '').trim();
        if (!safeIdentifier || !recoveryKey) {
            return res.status(400).json({ error: 'Kullanıcı ve kurtarma anahtarı gerekli' });
        }

        const user = getUserByLoginIdentifier(safeIdentifier);

        if (!user) {
            return respondWithPasswordResetFailure(res, { recoveryKey });
        }

        if (user.is_banned === 1) {
            return respondWithPasswordResetFailure(res, {
                userId: user.id,
                recoveryKey,
                statusCode: 403
            });
        }

        if (isPasswordResetLocked(user)) {
            await awaitPasswordResetFailureMitigations(recoveryKey);
            return res.status(423).json({ error: RESET_PASSWORD_LOCKED_MESSAGE });
        }

        if (!user.recovery_key_hash) {
            return respondWithPasswordResetFailure(res, {
                userId: user.id,
                recoveryKey
            });
        }

        const matchesRecoveryKey = await compareRecoveryKey(recoveryKey, user.recovery_key_hash);
        if (!matchesRecoveryKey) {
            return respondWithPasswordResetFailure(res, {
                userId: user.id,
                recoveryKey
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Yeni şifreler eşleşmiyor' });
        }

        const decryptedUser = getDecryptedUser(user);
        const passwordValidation = validatePasswordStrength(newPassword, {
            username: decryptedUser.username,
            email: decryptedUser.email
        });

        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.errors[0],
                passwordErrors: passwordValidation.errors,
                passwordErrorCodes: passwordValidation.errorCodes
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        const recoveryMaterial = await createRecoveryKeyMaterial();
        const encryptedRecoveryKey = encryptForStorage(recoveryMaterial.recoveryKey, {
            purpose: USER_RECOVERY_KEY_PURPOSE
        });

        db.prepare(`
            UPDATE users
            SET password_hash = ?,
                recovery_key_hash = ?,
                recovery_key_value = ?,
                recovery_key_generated_at = ?,
                password_reset_failed_count = 0,
                password_reset_locked_until = NULL
            WHERE id = ?
        `).run(
            passwordHash,
            recoveryMaterial.recoveryKeyHash,
            encryptedRecoveryKey,
            recoveryMaterial.generatedAt,
            user.id
        );

        return res.json({
            success: true,
            mode: passwordRecoveryMode,
            message: 'Şifreniz başarıyla sıfırlandı.',
            newRecoveryKey: recoveryMaterial.recoveryKey
        });
    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({ error: 'Şifre sıfırlanamadı' });
    }
});

router.post('/recovery-key/setup', authenticateToken, async (req, res) => {
    try {
        if (getPasswordRecoveryMode() !== 'recovery_key') {
            return res.status(400).json({ error: 'Bu ortamda kurtarma anahtarı kullanılmıyor' });
        }

        const user = db.prepare('SELECT id, recovery_key_hash FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        if (user.recovery_key_hash) {
            return res.status(400).json({ error: 'Kurtarma anahtarı zaten ayarlı' });
        }

        const recoveryKey = await assignRecoveryKeyToUser(req.user.id);

        return res.json({
            success: true,
            message: 'Kurtarma anahtarı oluşturuldu',
            recoveryKey
        });
    } catch (err) {
        console.error('Recovery key setup error:', err);
        return res.status(500).json({ error: 'Kurtarma anahtarı oluşturulamadı' });
    }
});

router.post('/recovery-key/regenerate', authenticateToken, async (req, res) => {
    try {
        if (getPasswordRecoveryMode() !== 'recovery_key') {
            return res.status(400).json({ error: 'Bu ortamda kurtarma anahtarı kullanılmıyor' });
        }

        const { currentPassword } = req.body;
        if (!currentPassword) {
            return res.status(400).json({ error: 'Mevcut şifre gerekli' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ error: 'Mevcut şifre hatalı' });
        }

        const recoveryKey = await assignRecoveryKeyToUser(req.user.id);

        return res.json({
            success: true,
            message: 'Kurtarma anahtarı yenilendi',
            recoveryKey
        });
    } catch (err) {
        console.error('Recovery key regeneration error:', err);
        return res.status(500).json({ error: 'Kurtarma anahtarı yenilenemedi' });
    }
});

// Get house members
router.get('/house-members', authenticateToken, (req, res) => {
    const members = db.prepare(`
        SELECT u.id, u.username, u.created_at
        FROM users u
        JOIN user_houses uh ON uh.user_id = u.id
        WHERE uh.house_key = ?
        ORDER BY u.created_at ASC
    `).all(req.user.house_key).map((member) => ({
        ...member,
        username: decryptUsername(member.username)
    }));

    res.json({ members });
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'Tüm alanları doldurun' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Yeni şifreler eşleşmiyor' });
        }

        // Get user with hash
        let user;
        try {
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        } catch (dbError) {
            console.error('Database SELECT error:', dbError);
            return res.status(500).json({ error: 'Veritabanı okuma hatası' });
        }

        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const decryptedUser = getDecryptedUser(user);

        // Verify current password
        let validPassword;
        try {
            validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        } catch (bcryptError) {
            console.error('Bcrypt compare error:', bcryptError);
            return res.status(500).json({ error: 'Şifre doğrulama hatası' });
        }

        if (!validPassword) {
            return res.status(401).json({ error: 'Mevcut şifre hatalı' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'Yeni şifre mevcut şifre ile aynı olamaz' });
        }

        const newPasswordValidation = validatePasswordStrength(newPassword, {
            username: decryptedUser.username,
            email: decryptedUser.email
        });
        if (!newPasswordValidation.valid) {
            return res.status(400).json({
                error: newPasswordValidation.errors[0],
                passwordErrors: newPasswordValidation.errors,
                passwordErrorCodes: newPasswordValidation.errorCodes
            });
        }

        // Hash new password
        let newPasswordHash;
        try {
            newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        } catch (hashError) {
            console.error('Bcrypt hash error:', hashError);
            return res.status(500).json({ error: 'Yeni şifre oluşturma hatası' });
        }

        // Update password in database
        try {
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.user.id);
        } catch (updateError) {
            console.error('Database UPDATE error:', updateError);
            return res.status(500).json({ error: 'Veritabanı yazma hatası - dosya izinlerini kontrol edin' });
        }

        // Revoke all trusted devices on password change
        db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(req.user.id);

        res.json({ message: 'Şifre başarıyla değiştirildi' });

    } catch (err) {
        console.error('Unexpected error in change-password:', err);
        res.status(500).json({ error: 'Beklenmeyen sunucu hatası' });
    }
});

async function handleDeleteAccountRequest(req, res) {
    try {
        const { currentPassword } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ error: 'Mevcut şifre gerekli' });
        }

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Mevcut şifre hatalı' });
        }

        const userItems = db.prepare(`
            SELECT id, photo_path, thumbnail_path, invoice_photo_path, invoice_thumbnail_path
            FROM items
            WHERE user_id = ?
        `).all(req.user.id);
        const itemIds = userItems.map((item) => item.id);
        const mediaPaths = Array.from(new Set(
            userItems.flatMap((item) => ([
                item.photo_path,
                item.thumbnail_path,
                item.invoice_photo_path,
                item.invoice_thumbnail_path
            ])).filter(Boolean)
        ));

        deleteAccountMediaFiles(mediaPaths);
        runDeleteAccountTransaction({
            userId: req.user.id,
            emailLookup: user.email_lookup,
            usernameLookup: user.username_lookup,
            itemIds
        });

        clearSessionCookies(res);

        return res.json({
            success: true,
            message: 'Hesabınız ve ilişkili verileriniz kalıcı olarak silindi'
        });
    } catch (error) {
        console.error('Delete account error:', error);
        return res.status(500).json({ error: 'Hesap silinirken bir hata oluştu' });
    }
}

router.delete('/delete-account', authenticateToken, handleDeleteAccountRequest);
router.post('/delete-account', authenticateToken, handleDeleteAccountRequest);

// Change username
router.post('/change-username', authenticateToken, async (req, res) => {
    try {
        const { newUsername } = req.body;

        // Validation
        if (!newUsername || newUsername.trim().length < 3) {
            return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalı' });
        }

        if (newUsername.trim().length > 30) {
            return res.status(400).json({ error: 'Kullanıcı adı en fazla 30 karakter olabilir' });
        }

        // Check for valid characters (alphanumeric, underscore, dash)
        if (!/^[a-zA-Z0-9_-]+$/.test(newUsername.trim())) {
            return res.status(400).json({ error: 'Kullanıcı adı sadece harf, rakam, alt çizgi ve tire içerebilir' });
        }

        const trimmedUsername = newUsername.trim();

        // Check if username is already taken
        const existingUser = db.prepare(
            'SELECT id FROM users WHERE username_lookup = ? AND id != ? LIMIT 1'
        ).get(buildUsernameLookup(trimmedUsername), req.user.id);
        if (existingUser) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
        }

        // Update username
        db.prepare('UPDATE users SET username = ?, username_lookup = ? WHERE id = ?')
            .run(encryptUsername(trimmedUsername), buildUsernameLookup(trimmedUsername), req.user.id);

        // Generate new token with updated username
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const decryptedUser = getDecryptedUser(user);
        const token = generateToken(getUserTokenPayload(user, user.active_house_key || user.house_key));

        res.cookie('token', token, cookieOptions).json({
            message: 'Kullanıcı adı başarıyla değiştirildi',
            username: decryptedUser.username
        });

    } catch (err) {
        console.error('Change username error:', err);
        res.status(500).json({ error: 'Kullanıcı adı değiştirirken hata oluştu' });
    }
});

// -----------------------------------------------------------------------------
// GOOGLE AUTH IMPLEMENTATION
// -----------------------------------------------------------------------------

// Configure Google Strategy
// NOTE: In production, these should be ENV variables.
// For this task, we assume they are in process.env or keys are set up.
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleConfigured) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${SITE_URL}/api/auth/google/callback`
    },
        async function (accessToken, refreshToken, profile, cb) {
            try {
                const email = String(profile.emails[0].value || '').trim().toLowerCase();
                const googleId = profile.id;
                const displayName = profile.displayName;

                // Check if user exists by email
                let user = getUserByEmail(email);

                if (user) {
                    // User exists, return user
                    return cb(null, getDecryptedUser(user));
                } else {
                    // New user - create account without assigning a house yet
                    // Create a random password since they use Google
                    const randomPassword = crypto.randomBytes(16).toString('hex');
                    const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);

                    // Make username unique - check if displayName exists
                    let username = displayName;
                    const existingUsername = getUserByUsername(username);
                    if (existingUsername) {
                        // Append random suffix to make it unique
                        const suffix = crypto.randomBytes(3).toString('hex');
                        username = `${displayName}_${suffix}`;
                    }

                    // Insert user with is_verified = 1 (Google already verified their email)
                    const result = db.prepare(
                        `INSERT INTO users (username, email, username_lookup, email_lookup, password_hash, house_key, role, is_verified)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
                    ).run(
                        encryptUsername(username),
                        encryptEmail(email),
                        buildUsernameLookup(username),
                        buildEmailLookup(email),
                        passwordHash,
                        null,
                        resolveRoleForEmail(email)
                    );

                    const newUser = {
                        id: result.lastInsertRowid,
                        username: username,
                        email: email,
                        house_key: null,
                        role: resolveRoleForEmail(email)
                    };
                    return cb(null, newUser);
                }

            } catch (err) {
                return cb(err);
            }
        }
    ));
}

// Serialize/Deserialize user (required for session, though we mostly use tokens)
// We might not need session if we handle token generation directly in callback.
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user);
});

// Routes
router.get('/google', (req, res, next) => {
    if (!googleConfigured) {
        return res.status(501).json({ message: 'Google Authentication is not configured.' });
    }
    const state = issueGoogleOauthState(res);
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state
    })(req, res, next);
});

router.get('/google/callback',
    (req, res, next) => {
        if (!googleConfigured) {
            return res.redirect('/login');
        }
        if (!consumeGoogleOauthState(req, res)) {
            return res.redirect('/login');
        }
        next();
    },
    (req, res, next) => {
        if (!googleConfigured) {
            return res.redirect('/login');
        }
        passport.authenticate('google', { failureRedirect: '/login', session: false })(req, res, next);
    },
    function (req, res) {
        // Successful authentication
        const user = req.user;
        const normalizedUser = syncUserHousePointers(user.id);

        // Check if this is a new user (first time Google login)
        const userHouses = db.prepare('SELECT * FROM user_houses WHERE user_id = ?').all(user.id);
        const isNewUser = userHouses.length === 0;

        // Generate JWT
        const token = generateToken({
            id: user.id,
            username: user.username,
            email: user.email,
            house_key: normalizedUser?.active_house_key || normalizedUser?.house_key || null,
            role: user.role || 'user'
        });

        // Redirect new users to house selection, existing users directly to app
        // SECURITY: Using HttpOnly cookie to store token, redirecting without token in URL
        res.cookie('token', token, cookieOptions);
        if (isNewUser) {
            res.redirect(`/google-house-select?isNew=true`);
        } else {
            res.redirect(`/`);
        }
    });

// Email verification endpoint - creates actual user account from pending_registrations
router.get('/verify-email', (req, res) => {
    try {
        const { token } = req.query;
        const normalizedToken = String(token || '').trim();

        if (!normalizedToken) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Doğrulama Hatası</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #ef4444, #f97316); }
                        .card { background: white; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                        h1 { color: #ef4444; margin-bottom: 16px; }
                        p { color: #6b7280; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>❌ Hata</h1>
                        <p>Doğrulama token'ı bulunamadı.</p>
                        <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Ana Sayfaya Git</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Find pending registration with this token
        const pending = findPendingRegistrationByVerificationToken(normalizedToken);

        if (!pending) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Geçersiz Token</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #ef4444, #f97316); }
                        .card { background: white; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                        h1 { color: #ef4444; margin-bottom: 16px; }
                        p { color: #6b7280; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>❌ Geçersiz Token</h1>
                        <p>Bu doğrulama linki geçersiz veya zaten kullanılmış.</p>
                        <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Ana Sayfaya Git</a>
                    </div>
                </body>
                </html>
            `);
        }

        const pendingHouseKey = getPendingRegistrationHouseKey(pending);
        const decryptedPending = decryptPendingRegistrationRecord(pending);

        // Check token expiry
        const expiresAt = new Date(pending.expires_at);
        if (expiresAt < new Date()) {
            // Delete expired pending registration
            db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);

            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Token Süresi Dolmuş</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #f59e0b, #d97706); }
                        .card { background: white; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                        h1 { color: #f59e0b; margin-bottom: 16px; }
                        p { color: #6b7280; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>⏰ Süre Doldu</h1>
                        <p>Bu doğrulama linkinin süresi dolmuş. Lütfen yeniden kayıt olun.</p>
                        <a href="/register" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Yeniden Kayıt Ol</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Create the actual user account
        const existingEmailUser = getUserByEmail(decryptedPending.email);
        const existingUsernameUser = getUserByUsername(decryptedPending.username);
        if (existingEmailUser || existingUsernameUser) {
            db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
            return res.status(400).send('Bu e-posta veya kullanıcı adı artık kullanımda. Lütfen yeniden kayıt olun.');
        }

        const initialRole = resolveRoleForEmail(decryptedPending.email);
        const result = db.prepare(`
            INSERT INTO users (
                username,
                email,
                username_lookup,
                email_lookup,
                password_hash,
                house_key,
                role,
                is_verified,
                legal_terms_version,
                legal_terms_accepted_at,
                privacy_notice_version,
                privacy_notice_acknowledged_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `).run(
            pending.username,
            pending.email,
            buildUsernameLookup(decryptedPending.username),
            buildEmailLookup(decryptedPending.email),
            pending.password_hash,
            pending.is_new_house === 1 ? pendingHouseKey : null,
            initialRole,
            pending.legal_terms_version || LEGAL_TERMS_VERSION,
            pending.legal_terms_accepted_at || toSqliteUtcTimestamp(Date.now()),
            pending.privacy_notice_version || PRIVACY_NOTICE_VERSION,
            pending.privacy_notice_acknowledged_at || toSqliteUtcTimestamp(Date.now())
        );

        const userId = result.lastInsertRowid;

        // If new house, create default categories and rooms
        if (pending.is_new_house === 1) {
            const seedLanguage = resolveSeedLanguage(req);
            createDefaultCategories(pendingHouseKey, seedLanguage);
            createDefaultRooms(pendingHouseKey, seedLanguage);
            db.prepare('INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                .run(userId, pendingHouseKey, encryptHouseName(getDefaultOwnedHouseName(seedLanguage)));
            db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(pendingHouseKey, userId);
        } else {
            const { request } = createJoinRequest({
                requesterUserId: userId,
                houseKey: pendingHouseKey,
                requestedHouseName: null
            });
            notifyOwnersAboutJoinRequest(pendingHouseKey, decryptedPending.username, request.requested_house_name);
            syncUserHousePointers(userId);
        }

        // Delete the pending registration
        db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);

        console.log(`✅ Hesap oluşturuldu ve doğrulandı: ***@${decryptedPending.email?.split('@')[1] || '***'}`);

        // Success response
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Hesap Aktifleştirildi!</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
                    .card { background: white; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                    h1 { color: #22c55e; margin-bottom: 16px; }
                    p { color: #6b7280; }
                    .icon { font-size: 64px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">🎉</div>
                    <h1>Hesabınız Aktifleştirildi!</h1>
                    <p>${pending.is_new_house === 1 ? 'E-posta doğrulaması başarılı. Artik giris yapabilirsiniz.' : 'E-posta dogrulamasi basarili. Katilim isteginiz gonderildi, artik giris yapabilirsiniz.'}</p>
                    <a href="/login" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Giriş Yap</a>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).send('Doğrulama sırasında hata oluştu');
    }
});

// -----------------------------------------------------------------------------
// MULTI-HOUSE MANAGEMENT ENDPOINTS
// -----------------------------------------------------------------------------

// Get all houses for current user
router.get('/my-houses', authenticateToken, (req, res) => {
    try {
        const houses = db.prepare(`
            SELECT uh.*, 
                   (SELECT COUNT(*) FROM users u2 
                    JOIN user_houses uh2 ON u2.id = uh2.user_id 
                    WHERE uh2.house_key = uh.house_key) as member_count,
                   (SELECT COUNT(*) FROM items WHERE house_key = uh.house_key) as item_count
            FROM user_houses uh 
            WHERE uh.user_id = ?
            ORDER BY uh.joined_at DESC
        `).all(req.user.id).map(decryptHouseRecord);

        const user = db.prepare('SELECT active_house_key FROM users WHERE id = ?').get(req.user.id);

        res.json({
            houses,
            activeHouseKey: user?.active_house_key || req.user.house_key,
            pendingRequests: listPendingJoinRequestsForUser(req.user.id)
        });
    } catch (err) {
        console.error('Get houses error:', err);
        res.status(500).json({ error: 'Evler yüklenirken hata oluştu' });
    }
});

// Join an existing house
router.post('/join-house', authenticateToken, async (req, res) => {
    try {
        const { house_key, house_name } = req.body;

        if (!house_key) {
            return res.status(400).json({ error: 'Ev anahtarı gerekli' });
        }
        if (!HOUSE_KEY_REGEX.test(String(house_key))) {
            return res.status(400).json({ error: 'Geçersiz ev anahtarı formatı' });
        }

        const existingUserHouse = db.prepare('SELECT id FROM user_houses WHERE house_key = ?').get(house_key);

        if (!existingUserHouse) {
            return res.status(400).json({ error: 'Geçersiz ev anahtarı. Bu anahtara sahip bir ev bulunamadı.' });
        }

        // Check if user already belongs to this house
        const alreadyMember = db.prepare('SELECT id FROM user_houses WHERE user_id = ? AND house_key = ?').get(req.user.id, house_key);
        if (alreadyMember) {
            return res.status(400).json({ error: 'Zaten bu eve üyesiniz' });
        }

        const { request } = createJoinRequest({
            requesterUserId: req.user.id,
            houseKey: house_key,
            requestedHouseName: house_name
        });
        notifyOwnersAboutJoinRequest(house_key, req.user.username, request.requested_house_name);

        res.json({
            message: 'Katilim isteginiz gonderildi',
            pendingRequests: listPendingJoinRequestsForUser(req.user.id)
        });
    } catch (err) {
        console.error('Join house error:', err);
        res.status(500).json({ error: 'Eve katılırken hata oluştu' });
    }
});

// Switch active house
router.post('/switch-house', authenticateToken, (req, res) => {
    try {
        const { house_key } = req.body;

        if (!house_key) {
            return res.status(400).json({ error: 'Ev anahtarı gerekli' });
        }
        if (!HOUSE_KEY_REGEX.test(String(house_key))) {
            return res.status(400).json({ error: 'Geçersiz ev anahtarı formatı' });
        }

        // Verify user belongs to this house
        const userHouse = db.prepare('SELECT * FROM user_houses WHERE user_id = ? AND house_key = ?').get(req.user.id, house_key);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        // Update active house
        db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(house_key, req.user.id);

        // Generate new token with updated house_key
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const token = generateToken(getUserTokenPayload(user, house_key));

        res.cookie('token', token, cookieOptions).json({
            message: 'Ev başarıyla değiştirildi!',
            house_key,
            house_name: decryptHouseRecord(userHouse).house_name
        });
    } catch (err) {
        console.error('Switch house error:', err);
        res.status(500).json({ error: 'Ev değiştirirken hata oluştu' });
    }
});

// Leave a house
router.post('/leave-house', authenticateToken, (req, res) => {
    try {
        const { house_key } = req.body;

        if (!house_key) {
            return res.status(400).json({ error: 'Ev anahtarı gerekli' });
        }

        // Get user's houses
        const userHouses = db.prepare('SELECT * FROM user_houses WHERE user_id = ?').all(req.user.id);

        if (userHouses.length <= 1) {
            return res.status(400).json({ error: 'En az bir eve üye olmalısınız. Başka bir eve katıldıktan sonra bu evden ayrılabilirsiniz.' });
        }

        // Check if user is owner
        const houseToLeave = userHouses.find(h => h.house_key === house_key);
        if (!houseToLeave) {
            return res.status(400).json({ error: 'Bu eve üye değilsiniz' });
        }

        if (houseToLeave.is_owner) {
            // Check if there are other members
            const otherMembers = db.prepare('SELECT COUNT(*) as count FROM user_houses WHERE house_key = ? AND user_id != ?').get(house_key, req.user.id);
            if (otherMembers.count > 0) {
                return res.status(400).json({ error: 'Ev sahibi olarak evden ayrılamazsınız. Önce sahipliği başka bir üyeye devredin veya diğer üyeleri çıkarın.' });
            }
        }

        // Remove user from house
        db.prepare('DELETE FROM user_houses WHERE user_id = ? AND house_key = ?').run(req.user.id, house_key);

        // If this was the active house, switch to another one
        const user = db.prepare('SELECT active_house_key FROM users WHERE id = ?').get(req.user.id);
        if (user.active_house_key === house_key) {
            const remainingHouse = db.prepare('SELECT house_key FROM user_houses WHERE user_id = ? LIMIT 1').get(req.user.id);
            if (remainingHouse) {
                db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(remainingHouse.house_key, req.user.id);
            }
        }

        // Get updated houses and generate new token
        const houses = getDecryptedHousesForUser(req.user.id);
        const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        const token = generateToken(getUserTokenPayload(updatedUser, updatedUser.active_house_key));

        res.cookie('token', token, cookieOptions).json({
            message: 'Evden başarıyla ayrıldınız',
            houses
        });
    } catch (err) {
        console.error('Leave house error:', err);
        res.status(500).json({ error: 'Evden ayrılırken hata oluştu' });
    }
});

// Create a new house
router.post('/create-house', authenticateToken, (req, res) => {
    try {
        const { house_name } = req.body;
        const seedLanguage = resolveSeedLanguage(req);

        // Generate new house key
        const newHouseKey = generateHouseKey();

        // Add user to new house as owner
        db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
            .run(req.user.id, newHouseKey, encryptHouseName(house_name || getDefaultNewHouseName(seedLanguage)));

        // Create default categories and rooms for the new house
        createDefaultCategories(newHouseKey, seedLanguage);
        createDefaultRooms(newHouseKey, seedLanguage);

        // Get updated houses
        const houses = getDecryptedHousesForUser(req.user.id);

        res.json({
            message: 'Yeni ev oluşturuldu!',
            house_key: newHouseKey,
            houses
        });
    } catch (err) {
        console.error('Create house error:', err);
        res.status(500).json({ error: 'Ev oluşturulurken hata oluştu' });
    }
});

// Google OAuth house selection complete
router.post('/google-complete', authenticateToken, async (req, res) => {
    try {
        const { mode, house_key, house_name } = req.body;
        const seedLanguage = resolveSeedLanguage(req);
        const passwordRecoveryMode = getPasswordRecoveryMode();
        const currentUser = db.prepare('SELECT recovery_key_hash FROM users WHERE id = ?').get(req.user.id);
        let newRecoveryKey = null;

        if (mode === 'create') {
            // Create new house for user
            const newHouseKey = generateHouseKey();

            // Add to user_houses
            db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                .run(req.user.id, newHouseKey, encryptHouseName(house_name || getDefaultOwnedHouseName(seedLanguage)));

            // Update user's active house and primary house_key
            db.prepare('UPDATE users SET house_key = ?, active_house_key = ? WHERE id = ?')
                .run(newHouseKey, newHouseKey, req.user.id);

            // Create default data
            createDefaultCategories(newHouseKey, seedLanguage);
            createDefaultRooms(newHouseKey, seedLanguage);

            // Generate new token
            const token = generateToken({
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                house_key: newHouseKey,
                role: req.user.role || 'user'
            });

            if (passwordRecoveryMode === 'recovery_key' && !currentUser?.recovery_key_hash) {
                newRecoveryKey = await assignRecoveryKeyToUser(req.user.id);
            }

            res.cookie('token', token, cookieOptions).json({
                message: 'Yeni ev oluşturuldu!',
                house_key: newHouseKey,
                newRecoveryKey,
                password_recovery_mode: passwordRecoveryMode
            });
        } else if (mode === 'join') {
            if (!house_key) {
                return res.status(400).json({ error: 'Ev anahtarı gerekli' });
            }

            // Verify house exists
            const existingHouse = db.prepare('SELECT id FROM user_houses WHERE house_key = ?').get(house_key);
            if (!existingHouse) {
                return res.status(400).json({ error: 'Geçersiz ev anahtarı' });
            }

            const { request } = createJoinRequest({
                requesterUserId: req.user.id,
                houseKey: house_key,
                requestedHouseName: house_name
            });
            notifyOwnersAboutJoinRequest(house_key, req.user.username, request.requested_house_name);
            const normalizedUser = syncUserHousePointers(req.user.id);

            // Generate new token
            const token = generateToken({
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                house_key: normalizedUser?.active_house_key || normalizedUser?.house_key || null,
                role: req.user.role || 'user'
            });

            if (passwordRecoveryMode === 'recovery_key' && !currentUser?.recovery_key_hash) {
                newRecoveryKey = await assignRecoveryKeyToUser(req.user.id);
            }

            res.cookie('token', token, cookieOptions).json({
                message: 'Katilim isteginiz gonderildi',
                house_key,
                request,
                newRecoveryKey,
                password_recovery_mode: passwordRecoveryMode
            });
        } else {
            res.status(400).json({ error: 'Geçersiz mod. "create" veya "join" olmalı.' });
        }
    } catch (err) {
        console.error('Google complete error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'İşlem sırasında hata oluştu' });
    }
});

// Rename a house
router.post('/rename-house', authenticateToken, (req, res) => {
    try {
        const { house_key, house_name } = req.body;

        if (!house_key || !house_name) {
            return res.status(400).json({ error: 'Ev anahtarı ve yeni isim gerekli' });
        }

        // Verify user belongs to this house
        const userHouse = db.prepare('SELECT * FROM user_houses WHERE user_id = ? AND house_key = ?').get(req.user.id, house_key);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        // Update house name for this user
        db.prepare('UPDATE user_houses SET house_name = ? WHERE user_id = ? AND house_key = ?')
            .run(encryptHouseName(house_name), req.user.id, house_key);

        res.json({ message: 'Ev ismi güncellendi' });
    } catch (err) {
        console.error('Rename house error:', err);
        res.status(500).json({ error: 'Ev ismi güncellenirken hata oluştu' });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    clearAuthTokenCookie(res);
    res.json({ message: 'Başarıyla çıkış yapıldı' });
});

// ══════════════════════════════════════════════════════════
// TOTP Two-Factor Authentication Endpoints
// ══════════════════════════════════════════════════════════

// Start 2FA setup – generate TOTP secret and otpauth URL
router.post('/2fa/setup', authenticateToken, (req, res) => {
    try {
        const userRow = db.prepare('SELECT id, totp_enabled FROM users WHERE id = ?').get(req.user.id);

        if (!userRow) {
            return res.status(404).json({ error: translateAuth(req, 'auth.two_factor_user_not_found', 'Kullanıcı bulunamadı') });
        }

        if (userRow.totp_enabled === 1) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_already_enabled', '2FA zaten etkin durumda') });
        }

        const { secret, otpauthUrl } = generateTotpSecret(req.user.username || 'User');

        // Store the secret temporarily (encrypted) but don't enable yet
        const encryptedSecret = encryptForStorage(secret, { purpose: TOTP_SECRET_PURPOSE });
        db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
            .run(encryptedSecret, req.user.id);

        res.json({ secret, otpauthUrl });
    } catch (err) {
        console.error('2FA setup error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.two_factor_setup_error', '2FA kurulumu sırasında hata oluştu') });
    }
});

// Verify first TOTP code and activate 2FA
router.post('/2fa/verify-setup', authenticateToken, (req, res) => {
    try {
        const { token: totpCode } = req.body;

        if (!totpCode) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_code_required', 'Doğrulama kodu gerekli') });
        }

        const userRow = db.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id);

        if (!userRow) {
            return res.status(404).json({ error: translateAuth(req, 'auth.two_factor_user_not_found', 'Kullanıcı bulunamadı') });
        }

        if (userRow.totp_enabled === 1) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_already_enabled', '2FA zaten etkin durumda') });
        }

        if (!userRow.totp_secret) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_setup_not_started', 'Önce 2FA kurulumunu başlatın') });
        }

        const base32Secret = decryptFromStorage(userRow.totp_secret, { purpose: TOTP_SECRET_PURPOSE });
        const isValid = verifyTotpToken(base32Secret, totpCode);

        if (!isValid) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_invalid_try_again', 'Doğrulama kodu hatalı. Lütfen tekrar deneyin.') });
        }

        // Enable 2FA
        db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);

        // Generate backup codes
        const backupCodes = generateBackupCodes();
        const insertBackupCode = db.prepare(
            'INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?, ?)'
        );

        const insertAll = db.transaction((codes) => {
            // Clear any existing codes
            db.prepare('DELETE FROM totp_backup_codes WHERE user_id = ?').run(req.user.id);
            for (const code of codes) {
                insertBackupCode.run(req.user.id, hashBackupCode(code));
            }
        });
        insertAll(backupCodes);

        res.json({
            success: true,
            message: translateAuth(req, 'auth.two_factor_enabled_success', '2FA başarıyla etkinleştirildi'),
            backupCodes
        });
    } catch (err) {
        console.error('2FA verify-setup error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.two_factor_activation_error', '2FA etkinleştirme sırasında hata oluştu') });
    }
});

// Disable 2FA – requires password + (TOTP code | backup code | recovery key)
router.post('/2fa/disable', authenticateToken, async (req, res) => {
    try {
        const { password, token: totpCode, backupCode, recoveryKey } = req.body;

        if (!password) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_password_required', 'Şifre gerekli') });
        }

        if (!totpCode && !backupCode && !recoveryKey) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_credentials_required', 'TOTP kodu, yedek kod veya kurtarma anahtarı gerekli') });
        }

        const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        if (!userRow) {
            return res.status(404).json({ error: translateAuth(req, 'auth.two_factor_user_not_found', 'Kullanıcı bulunamadı') });
        }

        if (userRow.totp_enabled !== 1) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_already_disabled', '2FA zaten devre dışı') });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, userRow.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: translateAuth(req, 'auth.two_factor_password_incorrect', 'Şifre hatalı') });
        }

        // Verify the second factor
        let secondFactorValid = false;

        if (totpCode) {
            const base32Secret = decryptFromStorage(userRow.totp_secret, { purpose: TOTP_SECRET_PURPOSE });
            secondFactorValid = verifyTotpToken(base32Secret, totpCode);
        } else if (backupCode) {
            const unusedCodes = db.prepare(
                'SELECT id, code_hash FROM totp_backup_codes WHERE user_id = ? AND used_at IS NULL'
            ).all(req.user.id);
            const matchedId = verifyBackupCode(backupCode, unusedCodes);
            if (matchedId) {
                db.prepare('UPDATE totp_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(matchedId);
                secondFactorValid = true;
            }
        } else if (recoveryKey && userRow.recovery_key_hash) {
            secondFactorValid = await compareRecoveryKey(recoveryKey, userRow.recovery_key_hash);
        }

        if (!secondFactorValid) {
            return res.status(401).json({ error: translateAuth(req, 'auth.two_factor_verification_failed', 'Doğrulama başarısız. Kodu kontrol edip tekrar deneyin.') });
        }

        // Disable 2FA and clean up
        db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
        db.prepare('DELETE FROM totp_backup_codes WHERE user_id = ?').run(req.user.id);
        db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(req.user.id);

        res.clearCookie(TRUSTED_DEVICE_COOKIE, {
            httpOnly: true,
            secure: shouldUseSecureCookies(),
            sameSite: 'lax'
        });

        res.json({ success: true, message: translateAuth(req, 'auth.two_factor_disabled_success', '2FA başarıyla devre dışı bırakıldı') });
    } catch (err) {
        console.error('2FA disable error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.two_factor_disable_error', '2FA devre dışı bırakılırken hata oluştu') });
    }
});

// Regenerate backup codes
router.post('/2fa/backup-codes', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_password_required', 'Şifre gerekli') });
        }

        const userRow = db.prepare('SELECT id, password_hash, totp_enabled FROM users WHERE id = ?').get(req.user.id);

        if (!userRow || userRow.totp_enabled !== 1) {
            return res.status(400).json({ error: translateAuth(req, 'auth.two_factor_not_enabled', '2FA etkin değil') });
        }

        const validPassword = await bcrypt.compare(password, userRow.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: translateAuth(req, 'auth.two_factor_password_incorrect', 'Şifre hatalı') });
        }

        // Generate new backup codes
        const backupCodes = generateBackupCodes();
        const insertBackupCode = db.prepare(
            'INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?, ?)'
        );

        const replaceAll = db.transaction((codes) => {
            db.prepare('DELETE FROM totp_backup_codes WHERE user_id = ?').run(req.user.id);
            for (const code of codes) {
                insertBackupCode.run(req.user.id, hashBackupCode(code));
            }
        });
        replaceAll(backupCodes);

        res.json({
            success: true,
            message: translateAuth(req, 'settings.two_factor.codes_regenerated', 'Yedek kodlar yenilendi'),
            backupCodes
        });
    } catch (err) {
        console.error('2FA backup-codes error:', err);
        res.status(500).json({ error: translateAuth(req, 'auth.two_factor_regenerate_codes_error', 'Yedek kodlar oluşturulurken hata oluştu') });
    }
});

// Revoke all trusted devices
router.delete('/2fa/trusted-devices', authenticateToken, (req, res) => {
    try {
        const result = db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(req.user.id);

        res.clearCookie(TRUSTED_DEVICE_COOKIE, {
            httpOnly: true,
            secure: shouldUseSecureCookies(),
            sameSite: 'lax'
        });

        res.json({
            success: true,
            message: 'Tüm güvenilen cihazlar kaldırıldı',
            devicesRevoked: result.changes
        });
    } catch (err) {
        console.error('Trusted devices revoke error:', err);
        res.status(500).json({ error: 'Güvenilen cihazlar kaldırılırken hata oluştu' });
    }
});

export default router;
