import jwt from 'jsonwebtoken';
import db from '../database.js';
import { decryptUserRecord } from '../utils/protectedFields.js';
import { getEnvOrSecret } from '../utils/secrets.js';

let jwtSecret;
const JWT_ALGORITHMS = ['HS256'];
const selectAuthenticatedUser = db.prepare(`
    SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.is_banned,
        u.house_key,
        u.active_house_key,
        EXISTS(
            SELECT 1
            FROM user_houses uh
            WHERE uh.user_id = u.id
              AND uh.house_key = u.active_house_key
        ) AS has_active_house_membership,
        EXISTS(
            SELECT 1
            FROM user_houses uh
            WHERE uh.user_id = u.id
              AND uh.house_key = u.house_key
        ) AS has_primary_house_membership,
        (
            SELECT uh.house_key
            FROM user_houses uh
            WHERE uh.user_id = u.id
            ORDER BY uh.joined_at ASC, uh.id ASC
            LIMIT 1
        ) AS first_house_key
    FROM users u
    WHERE u.id = ?
`);
const updateUserHousePointers = db.prepare(`
    UPDATE users
    SET house_key = ?, active_house_key = ?
    WHERE id = ?
`);

// Resolve lazily so runtime secret loaders and env setup can finish first.
const getJwtSecret = () => {
    if (!jwtSecret) {
        jwtSecret = getEnvOrSecret('JWT_SECRET', 'jwt_secret');
    }

    if (!jwtSecret) {
        throw new Error('FATAL: JWT_SECRET environment variable or Docker secret is not set! Application cannot start securely.');
    }

    return jwtSecret;
};

export const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};
const clearCookieOptions = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite
};

function normalizeUserHousePointers(userRow) {
    if (!userRow) {
        return null;
    }

    const activeHouseKey = userRow.has_active_house_membership
        ? userRow.active_house_key
        : null;
    const primaryHouseKey = userRow.has_primary_house_membership
        ? userRow.house_key
        : null;
    const nextActiveHouseKey = activeHouseKey || userRow.first_house_key || null;
    const nextHouseKey = primaryHouseKey || nextActiveHouseKey || null;

    return {
        house_key: nextHouseKey,
        active_house_key: nextActiveHouseKey
    };
}

export function resolveAuthenticatedUser(userId) {
    const liveUserRow = selectAuthenticatedUser.get(userId);

    if (!liveUserRow) {
        return null;
    }

    const normalizedPointers = normalizeUserHousePointers(liveUserRow);

    if (
        normalizedPointers.house_key !== liveUserRow.house_key ||
        normalizedPointers.active_house_key !== liveUserRow.active_house_key
    ) {
        updateUserHousePointers.run(
            normalizedPointers.house_key,
            normalizedPointers.active_house_key,
            userId
        );
    }

    const liveUser = decryptUserRecord(liveUserRow);
    return {
        id: liveUser.id,
        username: liveUser.username,
        email: liveUser.email,
        role: liveUser.role || 'user',
        is_banned: liveUser.is_banned === 1,
        house_key: normalizedPointers.house_key,
        active_house_key: normalizedPointers.active_house_key
    };
}

export const authenticateToken = (req, res, next) => {
    // Read from cookie first, fall back to Authorization header
    let token = req.cookies?.token;
    
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    }

    if (!token) {
        return res.status(401).json({ error: 'Erişim için giriş yapmanız gerekiyor' });
    }

    try {
        const tokenPayload = jwt.verify(token, getJwtSecret(), {
            algorithms: JWT_ALGORITHMS
        });
        const liveUser = resolveAuthenticatedUser(tokenPayload.id);

        if (!liveUser) {
            return res.status(401).json({ error: 'Kullanici bulunamadi' });
        }

        if (liveUser.is_banned) {
            res.clearCookie('token', clearCookieOptions);
            return res.status(403).json({ error: 'Hesabınız askıya alınmış. Destek ile iletişime geçin.' });
        }

        req.user = {
            id: liveUser.id,
            username: liveUser.username,
            email: liveUser.email,
            role: liveUser.role || tokenPayload.role || 'user',
            house_key: liveUser.active_house_key || liveUser.house_key || null,
            active_house_key: liveUser.active_house_key || null
        };
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }
};

export const requireActiveHouse = (req, res, next) => {
    if (!req.user?.house_key) {
        return res.status(403).json({ error: 'Aktif ev bulunamadi' });
    }

    next();
};

// Admin yetkisi kontrolü
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli' });
    }

    next();
};

export const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            house_key: user.house_key,
            active_house_key: user.active_house_key || user.house_key || null,
            role: user.role || 'user'  // Role included in token
        },
        getJwtSecret(),
        {
            algorithm: JWT_ALGORITHMS[0],
            expiresIn: '7d'
        }
    );
};

export { getJwtSecret as JWT_SECRET };
