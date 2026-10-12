import crypto from 'node:crypto';
import { isIP } from 'node:net';
import db from '../database.js';
import { BRAND_NAME } from './branding.js';
import { decryptFromStorage, encryptForStorage } from './encryption.js';
import { toSqliteUtcTimestamp } from './sqliteDate.js';

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const PASSKEY_MAX_PER_USER = 20;
export const PASSKEY_NAME_MAX_LENGTH = 64;
const PASSKEY_NAME_PURPOSE = 'user.passkey_name';
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

export function arePasskeysEnabled(env = process.env) {
    const value = String(env.PASSKEYS_ENABLED ?? '').trim().toLowerCase();
    if (FALSE_VALUES.has(value)) {
        return false;
    }
    return value === '' || TRUE_VALUES.has(value);
}

function parseOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

function isLocalhostName(hostname) {
    return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function stripIpv6Brackets(hostname) {
    return hostname.replace(/^\[|\]$/g, '');
}

function isHostWithinRpId(hostname, rpId) {
    return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

function configuredOrigins(env) {
    return String(env.WEBAUTHN_ORIGINS || '')
        .split(',')
        .map((entry) => parseOrigin(entry)?.origin)
        .filter(Boolean);
}

/**
 * Decide which relying party (domain) a passkey request belongs to.
 *
 * WEBAUTHN_RP_ID / WEBAUTHN_ORIGINS win when set. Otherwise the browser origin of
 * the request is used, but only when browsers allow WebAuthn there: an https
 * domain, or localhost. IP addresses can never be an RP ID.
 */
export function resolveRelyingParty(requestOrigin, env = process.env) {
    if (!arePasskeysEnabled(env)) {
        return { available: false, reason: 'disabled' };
    }

    const origin = parseOrigin(requestOrigin);
    if (!origin) {
        return { available: false, reason: 'unknown_origin' };
    }

    const hostname = stripIpv6Brackets(origin.hostname.toLowerCase());
    const rpName = String(env.WEBAUTHN_RP_NAME || BRAND_NAME || 'HomeInventory').trim();
    const configuredRpId = String(env.WEBAUTHN_RP_ID || '').trim().toLowerCase();

    if (configuredRpId) {
        const allowedOrigins = configuredOrigins(env);
        const origins = allowedOrigins.length > 0 ? allowedOrigins : [`https://${configuredRpId}`];
        if (!origins.includes(origin.origin) || !isHostWithinRpId(hostname, configuredRpId)) {
            return { available: false, reason: 'origin_not_allowed' };
        }
        return { available: true, rpId: configuredRpId, rpName, origin: origin.origin };
    }

    if (isIP(hostname)) {
        return { available: false, reason: 'ip_address' };
    }

    if (origin.protocol !== 'https:' && !isLocalhostName(hostname)) {
        return { available: false, reason: 'insecure_origin' };
    }

    const allowedOrigins = configuredOrigins(env);
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin.origin)) {
        return { available: false, reason: 'origin_not_allowed' };
    }

    return { available: true, rpId: hostname, rpName, origin: origin.origin };
}

/**
 * Browsers often leave Origin off same-origin GET requests. Behind a TLS-terminating
 * proxy without TRUST_PROXY, req.protocol then says http, so prefer a configured
 * public origin (WEBAUTHN_ORIGINS, then SITE_URL) whose host matches the request.
 */
export function getRequestOrigin(req, env = process.env) {
    const headerOrigin = req.get('origin');
    if (headerOrigin && headerOrigin !== 'null') {
        return headerOrigin;
    }
    const host = String(req.get('host') || '').toLowerCase();
    const publicOrigins = [...configuredOrigins(env), parseOrigin(env.SITE_URL)?.origin].filter(Boolean);
    const matching = publicOrigins.find((origin) => new URL(origin).host === host);
    return matching || `${req.protocol}://${host}`;
}

export function toBase64Url(bytes) {
    return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value) {
    return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

export function getOrCreateWebauthnUserId(userId) {
    const row = db.prepare('SELECT webauthn_user_id FROM users WHERE id = ?').get(userId);
    if (row?.webauthn_user_id) {
        return row.webauthn_user_id;
    }
    const handle = crypto.randomBytes(32).toString('base64url');
    db.prepare('UPDATE users SET webauthn_user_id = ? WHERE id = ? AND webauthn_user_id IS NULL').run(handle, userId);
    return db.prepare('SELECT webauthn_user_id FROM users WHERE id = ?').get(userId).webauthn_user_id;
}

export function storeChallenge({ purpose, challenge, rpId, origin, userId = null }) {
    const id = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    db.prepare('DELETE FROM webauthn_challenges WHERE expires_at <= ?').run(toSqliteUtcTimestamp(now));
    db.prepare(`
        INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, rp_id, origin, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, purpose, challenge, rpId, origin, toSqliteUtcTimestamp(now + PASSKEY_CHALLENGE_TTL_MS));
    return id;
}

/** Fetch and delete a challenge in one step so it can be used only once. */
export function consumeChallenge(id, purpose, userId = null) {
    if (typeof id !== 'string' || !id || id.length > 128) {
        return null;
    }
    const row = db.prepare(`
        DELETE FROM webauthn_challenges
        WHERE id = ? AND purpose = ? AND expires_at > ?
        RETURNING id, user_id, challenge, rp_id, origin
    `).get(id, purpose, toSqliteUtcTimestamp(Date.now()));

    if (!row) {
        return null;
    }
    if (userId !== null && row.user_id !== userId) {
        return null;
    }
    return row;
}

export function normalizePasskeyName(value, fallback = 'Passkey') {
    const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, PASSKEY_NAME_MAX_LENGTH);
    return name || fallback;
}

export function encryptPasskeyName(name) {
    return encryptForStorage(name, { purpose: PASSKEY_NAME_PURPOSE });
}

export function decryptPasskeyName(value) {
    try {
        return decryptFromStorage(value, { purpose: PASSKEY_NAME_PURPOSE }) || 'Passkey';
    } catch {
        return 'Passkey';
    }
}

function parseTransports(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
        return [];
    }
}

export function listUserPasskeys(userId) {
    return db.prepare(`
        SELECT id, credential_id, transports, device_type, backed_up, name, rp_id, created_at, last_used_at
        FROM user_passkeys
        WHERE user_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(userId).map((row) => ({
        id: row.id,
        credentialId: row.credential_id,
        transports: parseTransports(row.transports),
        deviceType: row.device_type || null,
        backedUp: row.backed_up === 1,
        name: decryptPasskeyName(row.name),
        rpId: row.rp_id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at
    }));
}

export function getPasskeyByCredentialId(credentialId) {
    if (typeof credentialId !== 'string' || !credentialId || credentialId.length > 1024) {
        return null;
    }
    const row = db.prepare('SELECT * FROM user_passkeys WHERE credential_id = ?').get(credentialId);
    if (!row) {
        return null;
    }
    return { ...row, transports: parseTransports(row.transports) };
}
