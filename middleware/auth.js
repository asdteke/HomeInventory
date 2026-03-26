import jwt from 'jsonwebtoken';
import db from '../database.js';
import { decryptUserRecord } from '../utils/protectedFields.js';
import { syncUserHousePointers } from '../utils/houseMembership.js';
import { getEnvOrSecret } from '../utils/secrets.js';

let jwtSecret;

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
        const tokenPayload = jwt.verify(token, getJwtSecret());
        const normalizedUser = syncUserHousePointers(tokenPayload.id);

        if (!normalizedUser) {
            return res.status(401).json({ error: 'Kullanici bulunamadi' });
        }

        const liveUserRow = db.prepare(`
            SELECT id, username, email, role, house_key, active_house_key
            FROM users
            WHERE id = ?
        `).get(tokenPayload.id);

        if (!liveUserRow) {
            return res.status(401).json({ error: 'Kullanici bulunamadi' });
        }

        const liveUser = decryptUserRecord(liveUserRow);
        req.user = {
            id: liveUser.id,
            username: liveUser.username,
            email: liveUser.email,
            role: liveUser.role || tokenPayload.role || 'user',
            house_key: normalizedUser.active_house_key || normalizedUser.house_key || null,
            active_house_key: normalizedUser.active_house_key || null
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
            role: user.role || 'user'  // Role included in token
        },
        getJwtSecret(),
        { expiresIn: '7d' }
    );
};

export { getJwtSecret as JWT_SECRET };
