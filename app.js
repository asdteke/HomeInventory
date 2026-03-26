import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// Import routes
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import categoriesRoutes from './routes/categories.js';
import roomsRoutes from './routes/rooms.js';
import locationsRoutes from './routes/locations.js';
import barcodeRoutes from './routes/barcode.js';
import emailRoutes from './routes/email.js';
import adminRoutes from './routes/admin.js';
import housesRoutes from './routes/houses.js';
import backupRoutes from './routes/backup.js';
import vaultRoutes from './routes/vault.js';
import passport from 'passport';

// Import KVKK-compliant logger
import { errorMiddleware, notFoundHandler } from './utils/logger.js';

// Import i18n configuration
import { i18nMiddleware, initI18n } from './config/i18n.js';

// Initialize i18n
await initI18n();

// Initialize database (this will create tables if they don't exist)
import './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:5173'
).trim().replace(/\/+$/, '');

const app = express();
app.disable('x-powered-by');

// SECURITY: Trust proxy is required when running behind Nginx/Apache
// This ensures req.ip and rate limiters work correctly
app.set('trust proxy', 1);

const siteOrigins = [];
try {
    const parsedSiteUrl = new URL(SITE_URL);
    siteOrigins.push(parsedSiteUrl.origin);
    if (!parsedSiteUrl.hostname.startsWith('www.')) {
        siteOrigins.push(`${parsedSiteUrl.protocol}//www.${parsedSiteUrl.host}`);
    }
} catch {
    // Ignore invalid env input and fall back to localhost-only dev origins below.
}

// SECURITY: Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet({
    contentSecurityPolicy: NODE_ENV === 'production' ? {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "connect-src": ["'self'", ...siteOrigins],
            "img-src": ["'self'", "data:", "blob:"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "script-src": ["'self'"],
            "font-src": ["'self'", "data:"]
        }
    } : false,
    crossOriginEmbedderPolicy: false
}));
const PORT = process.env.PORT || 3001;
const FRONTEND_PORT = 5173;

// Get local network IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Ensure uploads directory exists
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
// SECURITY: Restricted CORS - only allow specific origins
const localIP = getLocalIP();
const allowedOrigins = [
    ...siteOrigins,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    `http://${localIP}:3000`,
    `http://${localIP}:5173`
];
const devLanOriginRegex = /^http:\/\/((localhost|127\.0\.0\.1)|((10|192\.168)\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(:\d+)?$/;
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else if (NODE_ENV !== 'production' && devLanOriginRegex.test(origin)) {
            callback(null, true);
        } else {
            // Do not throw a server error for disallowed origins.
            // Return no CORS headers so browsers block the request.
            callback(null, false);
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(passport.initialize());

// i18n middleware - enables req.t() for translations
app.use(i18nMiddleware);

function buildRateLimitKey(req) {
    const token = String(req.cookies?.token || '').trim();
    if (!token) {
        return req.ip;
    }

    const tokenFingerprint = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')
        .slice(0, 24);

    return `${req.ip}:${tokenFingerprint}`;
}

// SECURITY: Keep a generous interactive limiter for day-to-day app usage,
// but avoid punishing normal inventory flows with long lockouts.
const interactiveApiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: (req) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return 600;
        }

        return 240;
    },
    message: { error: 'Kısa sürede çok fazla işlem yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: buildRateLimitKey
});

// Stricter limit for auth endpoints (login/register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Only 20 attempts per 15 minutes for auth
    message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to interactive app routes.
// Sensitive routes such as auth/reset, backup, and admin mail keep their own stricter policies.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/items', interactiveApiLimiter);
app.use('/api/categories', interactiveApiLimiter);
app.use('/api/rooms', interactiveApiLimiter);
app.use('/api/locations', interactiveApiLimiter);
app.use('/api/houses', interactiveApiLimiter);
app.use('/api/barcode', interactiveApiLimiter);
app.use('/api/vault', interactiveApiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/houses', housesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/vault', vaultRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Server info endpoint for QR code generation
app.get('/api/server-info', (req, res) => {
    if (NODE_ENV === 'production' && process.env.EXPOSE_SERVER_INFO !== 'true') {
        return res.status(200).json({
            status: 'disabled',
            message: 'Server info endpoint is disabled in production'
        });
    }

    const localIP = getLocalIP();
    res.json({
        ip: localIP,
        backendPort: PORT,
        frontendPort: FRONTEND_PORT,
        frontendUrl: `http://${localIP}:${FRONTEND_PORT}`,
        timestamp: new Date().toISOString()
    });
});

app.use('/api', notFoundHandler);

// Serve frontend in production
// Serve frontend static files
const clientDist = join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));

// IndexNow key verification file endpoint: https://<host>/<INDEXNOW_KEY>.txt
app.get(/^\/([A-Za-z0-9-]{8,128})\.txt$/, (req, res) => {
    const configuredKey = (process.env.INDEXNOW_KEY || '').trim();
    const requestedKey = req.params[0];

    if (!configuredKey || requestedKey !== configuredKey) {
        return res.status(404).type('text/plain; charset=utf-8').send('Not found');
    }

    return res.status(200).type('text/plain; charset=utf-8').send(configuredKey);
});

// Handle SPA routing - return index.html for all non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Sayfa bulunamadı' });
    }
    res.sendFile(join(clientDist, 'index.html'));
});

// Error handling middleware (KVKK uyumlu)
app.use(errorMiddleware);

// Start server on all network interfaces (0.0.0.0)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              🏠 HomeInventory Started 🏠                   ║
╠════════════════════════════════════════════════════════════╣
║  Backend:   http://localhost:${PORT}${' '.repeat(Math.max(0, 24 - PORT.toString().length))} ║
║  Network:   http://${localIP}:${PORT}${' '.repeat(Math.max(0, 24 - (localIP.length + 1 + PORT.toString().length)))} ║
║                                                            ║
║  Frontend:  ${process.env.SITE_URL || 'http://localhost:5173'}${' '.repeat(Math.max(0, 58 - 10 - (process.env.SITE_URL || 'http://localhost:5173').length))} ║
║  Network:   http://${localIP}:5173${' '.repeat(Math.max(0, 24 - (localIP.length + 1 + 4)))} ║
║                                                            ║
║  📱 Use Network addresses to access from your phone!       ║
║  📁 Log files: ./logs/ (kept for 7 days)                  ║
╚════════════════════════════════════════════════════════════╝
    `);
});
