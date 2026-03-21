import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../database.js';
import { generateToken, authenticateToken, cookieOptions } from '../middleware/auth.js';
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

const router = express.Router();
const SALT_ROUNDS = 10;
const HOUSE_KEY_REGEX = /^[a-f0-9]{64}$/i;
const MIN_PASSWORD_LENGTH = 10;
const PENDING_REGISTRATION_HOUSE_KEY_PURPOSE = 'pending_registration.house_key';
const USER_RECOVERY_KEY_PURPOSE = 'user.recovery_key';
const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:3001'
).trim().replace(/\/+$/, '');
const RESET_PASSWORD_FAILURE_MESSAGE = 'İşlem gerçekleştirilemedi. Bilgileri kontrol edip tekrar deneyin.';
const RESET_PASSWORD_LOCKED_MESSAGE = 'İşlem gerçekleştirilemedi. Lütfen daha sonra tekrar deneyin.';
const FORGOT_PASSWORD_GENERIC_MESSAGE = 'Hesap mevcutsa gerekli yönlendirme gönderildi.';

const COMMON_PASSWORDS = new Set([
    '123456', '12345678', '123456789', '1234567890', 'password', 'password1',
    'qwerty', 'qwerty123', 'abc123', '111111', '000000', '123123',
    'iloveyou', 'admin', 'admin123', 'letmein', 'welcome', 'test123',
    'asdfgh', 'asdf1234', 'zaq12wsx', '1q2w3e4r', '654321', '987654321',
    '123456a', 'turkiye123', 'ev123456', 'sifre123'
]);

function validatePasswordStrength(password, context = {}) {
    const value = String(password || '');
    const lowered = value.toLowerCase();
    const checks = [];

    if (value.length < MIN_PASSWORD_LENGTH) {
        checks.push(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı`);
    }
    if (!/[a-z]/.test(value)) {
        checks.push('Şifre en az bir küçük harf içermeli');
    }
    if (!/[A-Z]/.test(value)) {
        checks.push('Şifre en az bir büyük harf içermeli');
    }
    if (!/[0-9]/.test(value)) {
        checks.push('Şifre en az bir rakam içermeli');
    }
    if (!/[^a-zA-Z0-9]/.test(value)) {
        checks.push('Şifre en az bir özel karakter içermeli');
    }
    if (/(.)\1{3,}/.test(value)) {
        checks.push('Şifrede art arda tekrar eden karakterler kullanmayın');
    }
    if (/1234|2345|3456|4567|5678|6789|7890|qwerty|asdf|zxcv/i.test(value)) {
        checks.push('Şifrede kolay tahmin edilen sıralar kullanmayın');
    }
    if (COMMON_PASSWORDS.has(lowered)) {
        checks.push('Bu şifre çok yaygın ve güvensiz');
    }

    const username = String(context.username || '').toLowerCase().trim();
    const email = String(context.email || '').toLowerCase().trim();
    const emailLocal = email.includes('@') ? email.split('@')[0] : '';

    if (username && username.length >= 3 && lowered.includes(username)) {
        checks.push('Şifre kullanıcı adı içermemeli');
    }
    if (emailLocal && emailLocal.length >= 3 && lowered.includes(emailLocal)) {
        checks.push('Şifre e-posta bilgisini içermemeli');
    }

    return {
        valid: checks.length === 0,
        errors: checks
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

function getCurrentRecoveryKey(userRow) {
    if (!userRow?.recovery_key_value) {
        return null;
    }

    try {
        return decryptFromStorage(userRow.recovery_key_value, {
            purpose: USER_RECOVERY_KEY_PURPOSE
        });
    } catch (error) {
        console.error('Recovery key decrypt error:', error);
        return null;
    }
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

    return new Date(userRow.password_reset_locked_until).getTime() > Date.now();
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
function createDefaultCategories(houseKey) {
    const insertCategory = db.prepare('INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)');
    const defaultCategories = [
        ['Mutfak', '🍳', '#ef4444'],
        ['Elektronik', '💻', '#3b82f6'],
        ['Hobi', '🎨', '#8b5cf6'],
        ['Mobilya', '🛋️', '#f59e0b'],
        ['Giyim', '👕', '#ec4899'],
        ['Kitaplar', '📚', '#10b981'],
        ['Aletler', '🔧', '#6b7280'],
        ['Spor', '⚽', '#14b8a6'],
        ['Diğer', '📦', '#64748b']
    ];

    const insertMany = db.transaction((categories) => {
        for (const cat of categories) {
            insertCategory.run(encryptCategoryName(cat[0]), cat[1], cat[2], houseKey);
        }
    });
    insertMany(defaultCategories);
}

// Create default rooms for a new house
function createDefaultRooms(houseKey) {
    const insertRoom = db.prepare('INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)');
    const defaultRooms = [
        ['Oturma Odası', 'Ana yaşam alanı'],
        ['Yatak Odası', 'Uyku ve dinlenme alanı'],
        ['Mutfak', 'Yemek hazırlama alanı'],
        ['Banyo', 'Temizlik ve bakım alanı'],
        ['Çalışma Odası', 'Ofis ve çalışma alanı'],
        ['Çocuk Odası', 'Çocuklar için oda'],
        ['Garaj', 'Araç ve depolama alanı'],
        ['Balkon', 'Dış mekan alanı'],
        ['Depo', 'Genel depolama alanı']
    ];

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
    if (!process.env.RESEND_API_KEY) {
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
        const { username, email, password, mode, house_key } = req.body;
        const safeUsername = String(username || '').trim();
        const safeEmail = String(email || '').trim().toLowerCase();

        // Validation
        if (!safeUsername || !safeEmail || !password) {
            return res.status(400).json({ error: 'Tüm alanları doldurun' });
        }

        if (!/^[a-zA-Z0-9_-]{3,30}$/.test(safeUsername)) {
            return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter olmalı ve sadece harf/rakam/_/- içermeli' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
        }

        const passwordValidation = validatePasswordStrength(password, {
            username: safeUsername,
            email: safeEmail
        });
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.errors[0],
                passwordErrors: passwordValidation.errors
            });
        }

        // Check if user already exists in users table
        const existingEmailUser = getUserByEmail(safeEmail);
        const existingUsernameUser = getUserByUsername(safeUsername);

        if (existingEmailUser || existingUsernameUser) {
            return res.status(400).json({ error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı' });
        }

        // Check if already pending registration
        const existingPending = getPendingRegistrationByEmail(safeEmail);

        if (existingPending) {
            // If expired, delete old pending registration
            if (new Date(existingPending.expires_at) < new Date()) {
                db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(existingPending.id);
            } else {
                return res.status(400).json({
                    error: 'Bu e-posta için zaten bir doğrulama bekliyor. Lütfen e-postanızı kontrol edin veya birkaç dakika bekleyin.'
                });
            }
        }

        // Also check if username is pending
        const pendingUsername = getPendingRegistrationByUsername(safeUsername);

        if (pendingUsername) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanımda' });
        }

        let userHouseKey;
        let isNewHouse = false;

        if (mode === 'join') {
            // Mode B: Join existing house
            if (!house_key) {
                return res.status(400).json({ error: 'Mevcut eve katılmak için Ev Anahtarı gerekli' });
            }
            if (!HOUSE_KEY_REGEX.test(String(house_key))) {
                return res.status(400).json({ error: 'Geçersiz Ev Anahtarı formatı' });
            }

            // Verify house key exists
            const existingHouse = db.prepare('SELECT id FROM user_houses WHERE house_key = ?').get(house_key);
            if (!existingHouse) {
                return res.status(400).json({ error: 'Geçersiz Ev Anahtarı. Lütfen doğru anahtarı girin.' });
            }

            userHouseKey = house_key;
        } else {
            // Mode A: Create new house (default)
            userHouseKey = generateHouseKey();
            isNewHouse = true;
        }

        // Hash password with bcrypt
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // If email verification is disabled (no API key), register directly
        if (!process.env.RESEND_API_KEY) {
            const passwordRecoveryMode = getPasswordRecoveryMode();
            const result = db.prepare(`
                INSERT INTO users (username, email, username_lookup, email_lookup, password_hash, house_key, is_verified)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `).run(
                encryptUsername(safeUsername),
                encryptEmail(safeEmail),
                buildUsernameLookup(safeUsername),
                buildEmailLookup(safeEmail),
                passwordHash,
                isNewHouse ? userHouseKey : null
            );
            
            const newUserId = result.lastInsertRowid;
            let newRecoveryKey = null;

            if (isNewHouse) {
                db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                    .run(newUserId, userHouseKey, encryptHouseName('Evim'));
                createDefaultCategories(userHouseKey);
                createDefaultRooms(userHouseKey);
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
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Save to pending_registrations (NOT to users table)
        db.prepare(`
            INSERT INTO pending_registrations 
            (username, email, username_lookup, email_lookup, password_hash, house_key, mode, is_new_house, verification_token, verification_token_hashed, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            expiresAt
        );

        // Send verification email
        sendVerificationEmail(safeEmail, userHouseKey, verificationToken)
            .then(result => {
                if (result.success) {
                    console.log(`📧 Doğrulama e-postası gönderildi: ${safeEmail}`);
                } else {
                    console.error(`❌ Doğrulama e-postası gönderilemedi: ${safeEmail}`, result.error);
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
        res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const loginIdentifier = String(username || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
        }

        // Find user
        const user = getUserByLoginIdentifier(loginIdentifier);

        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
        }

        const decryptedUser = getDecryptedUser(user);

        if (user.is_banned === 1) {
            return res.status(403).json({ error: 'Hesabınız askıya alınmış. Destek ile iletişime geçin.' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            db.prepare('UPDATE users SET failed_login_count = COALESCE(failed_login_count, 0) + 1 WHERE id = ?').run(user.id);
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
        }

        // Check if email is verified
        if (user.is_verified !== 1) {
            return res.status(403).json({
                error: 'E-posta adresiniz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin.',
                emailNotVerified: true,
                email: decryptedUser.email
            });
        }

        const normalizedUser = syncUserHousePointers(user.id);
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
        db.prepare('UPDATE users SET failed_login_count = 0, last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Giriş sırasında bir hata oluştu' });
    }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
    const normalizedUser = syncUserHousePointers(req.user.id);
    const userRow = db.prepare(
        'SELECT id, username, email, house_key, active_house_key, role, created_at FROM users WHERE id = ?'
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
        must_setup_recovery_key: passwordRecoveryFlags.mustSetupRecoveryKey
    });
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
        `).run(user.id, issuedToken.tokenLookupHash, issuedToken.expiresAt);

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
                    passwordErrors: passwordValidation.errors
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
                passwordErrors: passwordValidation.errors
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

router.get('/recovery-key/current', authenticateToken, async (req, res) => {
    try {
        if (getPasswordRecoveryMode() !== 'recovery_key') {
            return res.status(400).json({ error: 'Bu ortamda kurtarma anahtarı kullanılmıyor' });
        }

        const user = db.prepare(`
            SELECT id, recovery_key_hash, recovery_key_value
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        if (!user || !user.recovery_key_hash) {
            return res.status(404).json({ error: 'Kurtarma anahtarı bulunamadı' });
        }

        const recoveryKey = getCurrentRecoveryKey(user);
        if (!recoveryKey) {
            return res.status(404).json({ error: 'Kurtarma anahtarı gösterilemiyor. Lütfen yeniden üretin.' });
        }

        return res.json({
            success: true,
            recoveryKey
        });
    } catch (err) {
        console.error('Get current recovery key error:', err);
        return res.status(500).json({ error: 'Kurtarma anahtarı alınamadı' });
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
                passwordErrors: newPasswordValidation.errors
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

        res.json({ message: 'Şifre başarıyla değiştirildi' });

    } catch (err) {
        console.error('Unexpected error in change-password:', err);
        res.status(500).json({ error: 'Beklenmeyen sunucu hatası' });
    }
});

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
                    `INSERT INTO users (username, email, username_lookup, email_lookup, password_hash, house_key, is_verified)
                     VALUES (?, ?, ?, ?, ?, ?, 1)`
                ).run(
                    encryptUsername(username),
                    encryptEmail(email),
                    buildUsernameLookup(username),
                    buildEmailLookup(email),
                    passwordHash,
                    null
                );

                const newUser = {
                    id: result.lastInsertRowid,
                    username: username,
                    email: email,
                    house_key: null,
                    role: 'user' // Default role
                };
                return cb(null, newUser);
            }

        } catch (err) {
            return cb(err);
        }
    }
));

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
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
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

        const result = db.prepare(`
            INSERT INTO users (username, email, username_lookup, email_lookup, password_hash, house_key, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(
            pending.username,
            pending.email,
            buildUsernameLookup(decryptedPending.username),
            buildEmailLookup(decryptedPending.email),
            pending.password_hash,
            pending.is_new_house === 1 ? pendingHouseKey : null
        );

        const userId = result.lastInsertRowid;

        // If new house, create default categories and rooms
        if (pending.is_new_house === 1) {
            createDefaultCategories(pendingHouseKey);
            createDefaultRooms(pendingHouseKey);
            db.prepare('INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                .run(userId, pendingHouseKey, encryptHouseName('Evim'));
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

        console.log(`✅ Hesap oluşturuldu ve doğrulandı: ${decryptedPending.email}`);

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

        // Generate new house key
        const newHouseKey = generateHouseKey();

        // Add user to new house as owner
        db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
            .run(req.user.id, newHouseKey, encryptHouseName(house_name || 'Yeni Evim'));

        // Create default categories and rooms for the new house
        createDefaultCategories(newHouseKey);
        createDefaultRooms(newHouseKey);

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
        const passwordRecoveryMode = getPasswordRecoveryMode();
        const currentUser = db.prepare('SELECT recovery_key_hash FROM users WHERE id = ?').get(req.user.id);
        let newRecoveryKey = null;

        if (mode === 'create') {
            // Create new house for user
            const newHouseKey = generateHouseKey();

            // Add to user_houses
            db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
                .run(req.user.id, newHouseKey, encryptHouseName(house_name || 'Evim'));

            // Update user's active house and primary house_key
            db.prepare('UPDATE users SET house_key = ?, active_house_key = ? WHERE id = ?')
                .run(newHouseKey, newHouseKey, req.user.id);

            // Create default data
            createDefaultCategories(newHouseKey);
            createDefaultRooms(newHouseKey);

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
    res.clearCookie('token', cookieOptions);
    res.json({ message: 'Başarıyla çıkış yapıldı' });
});

export default router;
