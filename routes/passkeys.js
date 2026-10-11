import express from 'express';
import bcrypt from 'bcrypt';
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} from '@simplewebauthn/server';
import db from '../database.js';
import { authenticateToken, cookieOptions, generateToken } from '../middleware/auth.js';
import { decryptFromStorage } from '../utils/encryption.js';
import { decryptUserRecord } from '../utils/protectedFields.js';
import { syncUserHousePointers } from '../utils/houseMembership.js';
import { verifyBackupCode, verifyTotpToken } from '../utils/totp.js';
import {
    PASSKEY_MAX_PER_USER,
    arePasskeysEnabled,
    consumeChallenge,
    encryptPasskeyName,
    fromBase64Url,
    getOrCreateWebauthnUserId,
    getPasskeyByCredentialId,
    getRequestOrigin,
    listUserPasskeys,
    normalizePasskeyName,
    resolveRelyingParty,
    storeChallenge,
    toBase64Url
} from '../utils/passkeys.js';

const router = express.Router();
const TOTP_SECRET_PURPOSE = 'user.totp_secret';

function translate(req, key, fallback) {
    try {
        const translated = req?.t?.(key);
        if (typeof translated === 'string' && translated.trim() && translated !== key) {
            return translated;
        }
    } catch {}
    return fallback;
}

function sendError(req, res, status, code, fallback, extra = {}) {
    return res.status(status).json({
        error: translate(req, `auth.passkey.${code}`, fallback),
        code: `PASSKEY_${code.toUpperCase()}`,
        ...extra
    });
}

function requireRelyingParty(req, res) {
    const relyingParty = resolveRelyingParty(getRequestOrigin(req));
    if (!relyingParty.available) {
        sendError(req, res, 400, 'unavailable', 'Passkeys are not available at this address.', {
            reason: relyingParty.reason
        });
        return null;
    }
    return relyingParty;
}

/**
 * Adding or removing a passkey changes how the account can be entered, so a
 * stolen session alone must not be enough: ask for the password again, and the
 * TOTP or backup code when two-factor authentication is on.
 */
async function verifyReauthentication(req, res) {
    const { password, totpCode } = req.body || {};
    const userRow = db.prepare('SELECT id, password_hash, totp_enabled, totp_secret FROM users WHERE id = ?').get(req.user.id);

    if (!userRow) {
        sendError(req, res, 404, 'user_not_found', 'User not found.');
        return false;
    }
    if (!password) {
        sendError(req, res, 400, 'password_required', 'Enter your current password to continue.');
        return false;
    }
    if (!(await bcrypt.compare(String(password), userRow.password_hash))) {
        sendError(req, res, 401, 'password_incorrect', 'The password is incorrect.');
        return false;
    }

    if (userRow.totp_enabled === 1 && userRow.totp_secret) {
        if (!totpCode) {
            sendError(req, res, 400, 'totp_required', 'Enter your two-factor code to continue.', { requiresTwoFactor: true });
            return false;
        }
        const secret = decryptFromStorage(userRow.totp_secret, { purpose: TOTP_SECRET_PURPOSE });
        if (!verifyTotpToken(secret, String(totpCode))) {
            const unusedBackupCodes = db.prepare(
                'SELECT id, code_hash FROM totp_backup_codes WHERE user_id = ? AND used_at IS NULL'
            ).all(userRow.id);
            const matchedBackupId = verifyBackupCode(String(totpCode), unusedBackupCodes);
            if (!matchedBackupId) {
                sendError(req, res, 401, 'totp_invalid', 'The two-factor code is incorrect.', { requiresTwoFactor: true });
                return false;
            }
            db.prepare('UPDATE totp_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(matchedBackupId);
        }
    }

    return true;
}

function serializePasskeys(userId, currentRpId) {
    return listUserPasskeys(userId).map(({ credentialId, transports, ...passkey }) => ({
        ...passkey,
        usableHere: Boolean(currentRpId) && passkey.rpId === currentRpId
    }));
}

router.get('/config', (req, res) => {
    const relyingParty = resolveRelyingParty(getRequestOrigin(req));
    res.json({
        enabled: arePasskeysEnabled(),
        available: relyingParty.available,
        reason: relyingParty.available ? null : relyingParty.reason
    });
});

router.post('/login/options', async (req, res) => {
    try {
        const relyingParty = requireRelyingParty(req, res);
        if (!relyingParty) return;

        const options = await generateAuthenticationOptions({
            rpID: relyingParty.rpId,
            userVerification: 'required'
        });
        const challengeId = storeChallenge({
            purpose: 'login',
            challenge: options.challenge,
            rpId: relyingParty.rpId,
            origin: relyingParty.origin
        });

        res.json({ challengeId, options });
    } catch (err) {
        console.error('Passkey login options error:', err);
        sendError(req, res, 500, 'login_error', 'Passkey sign-in could not be started.');
    }
});

router.post('/login/verify', async (req, res) => {
    try {
        const { challengeId, response } = req.body || {};
        const relyingParty = requireRelyingParty(req, res);
        if (!relyingParty) return;

        const challenge = consumeChallenge(challengeId, 'login');
        if (!challenge || challenge.rp_id !== relyingParty.rpId || challenge.origin !== relyingParty.origin) {
            return sendError(req, res, 400, 'challenge_expired', 'The passkey request expired. Please try again.');
        }

        const passkey = getPasskeyByCredentialId(response?.id);
        if (!passkey || passkey.rp_id !== relyingParty.rpId) {
            return sendError(req, res, 401, 'not_recognized', 'This passkey is not registered for this account.');
        }

        const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(passkey.user_id);
        if (!userRow) {
            return sendError(req, res, 401, 'not_recognized', 'This passkey is not registered for this account.');
        }

        const userHandle = response?.response?.userHandle;
        if (userHandle && userRow.webauthn_user_id && userHandle !== userRow.webauthn_user_id) {
            return sendError(req, res, 401, 'not_recognized', 'This passkey is not registered for this account.');
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: challenge.challenge,
                expectedOrigin: challenge.origin,
                expectedRPID: challenge.rp_id,
                requireUserVerification: true,
                credential: {
                    id: passkey.credential_id,
                    publicKey: fromBase64Url(passkey.public_key),
                    counter: passkey.sign_count,
                    transports: passkey.transports
                }
            });
        } catch (verifyError) {
            console.warn('Passkey assertion rejected:', verifyError?.message);
            return sendError(req, res, 401, 'verification_failed', 'The passkey could not be verified.');
        }

        if (!verification.verified) {
            return sendError(req, res, 401, 'verification_failed', 'The passkey could not be verified.');
        }

        if (userRow.is_banned === 1) {
            return res.status(403).json({ error: translate(req, 'auth.account_banned', 'Your account has been suspended. Please contact support.') });
        }

        if (userRow.is_verified !== 1) {
            return res.status(403).json({
                error: translate(req, 'auth.email_not_verified', 'Your email address is not verified. Please check your inbox.'),
                emailNotVerified: true
            });
        }

        const { authenticationInfo } = verification;
        db.prepare(`
            UPDATE user_passkeys
            SET sign_count = ?, backed_up = ?, device_type = ?, last_used_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            authenticationInfo.newCounter,
            authenticationInfo.credentialBackedUp ? 1 : 0,
            authenticationInfo.credentialDeviceType,
            passkey.id
        );

        // A passkey with user verification is already two factors (device + PIN or biometrics),
        // so TOTP is not asked again here.
        const normalizedUser = syncUserHousePointers(userRow.id);
        db.prepare(`
            UPDATE users
            SET failed_login_count = 0, login_failed_at = NULL, login_locked_until = NULL, last_login = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(userRow.id);

        const liveUser = decryptUserRecord(db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id));
        const houseKey = normalizedUser?.active_house_key || normalizedUser?.house_key || null;
        const token = generateToken({
            id: liveUser.id,
            username: liveUser.username,
            email: liveUser.email,
            house_key: houseKey,
            role: liveUser.role || 'user'
        });

        res.cookie('token', token, cookieOptions).json({
            message: 'Giriş başarılı',
            user: {
                id: liveUser.id,
                username: liveUser.username,
                email: liveUser.email,
                house_key: houseKey,
                role: liveUser.role || 'user'
            }
        });
    } catch (err) {
        console.error('Passkey login error:', err);
        sendError(req, res, 500, 'login_error', 'Passkey sign-in could not be completed.');
    }
});

router.get('/', authenticateToken, (req, res) => {
    const relyingParty = resolveRelyingParty(getRequestOrigin(req));
    res.json({
        enabled: arePasskeysEnabled(),
        available: relyingParty.available,
        reason: relyingParty.available ? null : relyingParty.reason,
        passkeys: serializePasskeys(req.user.id, relyingParty.available ? relyingParty.rpId : null)
    });
});

router.post('/register/options', authenticateToken, async (req, res) => {
    try {
        const relyingParty = requireRelyingParty(req, res);
        if (!relyingParty) return;

        if (!(await verifyReauthentication(req, res))) return;

        const existing = listUserPasskeys(req.user.id);
        if (existing.length >= PASSKEY_MAX_PER_USER) {
            return sendError(req, res, 400, 'limit_reached', 'You have reached the maximum number of passkeys.');
        }

        const webauthnUserId = getOrCreateWebauthnUserId(req.user.id);
        const options = await generateRegistrationOptions({
            rpName: relyingParty.rpName,
            rpID: relyingParty.rpId,
            userName: req.user.username || req.user.email || `user-${req.user.id}`,
            userDisplayName: req.user.username || '',
            userID: fromBase64Url(webauthnUserId),
            attestationType: 'none',
            excludeCredentials: existing
                .filter((passkey) => passkey.rpId === relyingParty.rpId)
                .map((passkey) => ({ id: passkey.credentialId, transports: passkey.transports })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required'
            }
        });

        const challengeId = storeChallenge({
            purpose: 'register',
            challenge: options.challenge,
            rpId: relyingParty.rpId,
            origin: relyingParty.origin,
            userId: req.user.id
        });

        res.json({ challengeId, options });
    } catch (err) {
        console.error('Passkey registration options error:', err);
        sendError(req, res, 500, 'register_error', 'The passkey could not be added.');
    }
});

router.post('/register/verify', authenticateToken, async (req, res) => {
    try {
        const { challengeId, response, name } = req.body || {};
        const relyingParty = requireRelyingParty(req, res);
        if (!relyingParty) return;

        const challenge = consumeChallenge(challengeId, 'register', req.user.id);
        if (!challenge || challenge.rp_id !== relyingParty.rpId || challenge.origin !== relyingParty.origin) {
            return sendError(req, res, 400, 'challenge_expired', 'The passkey request expired. Please try again.');
        }

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response,
                expectedChallenge: challenge.challenge,
                expectedOrigin: challenge.origin,
                expectedRPID: challenge.rp_id,
                requireUserVerification: true
            });
        } catch (verifyError) {
            console.warn('Passkey registration rejected:', verifyError?.message);
            return sendError(req, res, 400, 'verification_failed', 'The passkey could not be verified.');
        }

        if (!verification.verified) {
            return sendError(req, res, 400, 'verification_failed', 'The passkey could not be verified.');
        }

        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        if (getPasskeyByCredentialId(credential.id)) {
            return sendError(req, res, 409, 'already_registered', 'This passkey is already registered.');
        }

        const transports = Array.isArray(response?.response?.transports)
            ? response.response.transports.filter((entry) => typeof entry === 'string').slice(0, 8)
            : (credential.transports || []);

        db.prepare(`
            INSERT INTO user_passkeys (user_id, credential_id, public_key, sign_count, transports, device_type, backed_up, name, rp_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            credential.id,
            toBase64Url(credential.publicKey),
            credential.counter || 0,
            JSON.stringify(transports),
            credentialDeviceType,
            credentialBackedUp ? 1 : 0,
            encryptPasskeyName(normalizePasskeyName(name)),
            challenge.rp_id
        );

        res.status(201).json({ success: true, passkeys: serializePasskeys(req.user.id, relyingParty.rpId) });
    } catch (err) {
        console.error('Passkey registration error:', err);
        sendError(req, res, 500, 'register_error', 'The passkey could not be added.');
    }
});

function findOwnedPasskey(req) {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }
    return db.prepare('SELECT id FROM user_passkeys WHERE id = ? AND user_id = ?').get(id, req.user.id) || null;
}

router.patch('/:id', authenticateToken, (req, res) => {
    const passkey = findOwnedPasskey(req);
    if (!passkey) {
        return sendError(req, res, 404, 'not_found', 'Passkey not found.');
    }
    db.prepare('UPDATE user_passkeys SET name = ? WHERE id = ?').run(
        encryptPasskeyName(normalizePasskeyName(req.body?.name)),
        passkey.id
    );
    const relyingParty = resolveRelyingParty(getRequestOrigin(req));
    res.json({ success: true, passkeys: serializePasskeys(req.user.id, relyingParty.available ? relyingParty.rpId : null) });
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const passkey = findOwnedPasskey(req);
        if (!passkey) {
            return sendError(req, res, 404, 'not_found', 'Passkey not found.');
        }
        if (!(await verifyReauthentication(req, res))) return;

        db.prepare('DELETE FROM user_passkeys WHERE id = ? AND user_id = ?').run(passkey.id, req.user.id);
        const relyingParty = resolveRelyingParty(getRequestOrigin(req));
        res.json({ success: true, passkeys: serializePasskeys(req.user.id, relyingParty.available ? relyingParty.rpId : null) });
    } catch (err) {
        console.error('Passkey delete error:', err);
        sendError(req, res, 500, 'delete_error', 'The passkey could not be removed.');
    }
});

export default router;
