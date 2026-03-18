import jwt from 'jsonwebtoken';

// Helper to get JWT_SECRET lazily, because ES module imports are hoisted
// before dotenv/config has finished parsing .env in server.js
const getJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error('FATAL: JWT_SECRET environment variable is not set! Application cannot start securely.');
    }
    return process.env.JWT_SECRET;
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
        const user = jwt.verify(token, getJwtSecret());
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }
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

