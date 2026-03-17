import jwt from 'jsonwebtoken';

// SECURITY: Fail-secure - JWT_SECRET must be defined in environment
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set! Application cannot start securely.');
}

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Erişim için giriş yapmanız gerekiyor' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
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
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

export { JWT_SECRET };

