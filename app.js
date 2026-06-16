import 'dotenv/config';
import express from 'express';
import compression from 'compression';
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
import borrowRequestsRoutes from './routes/borrowRequests.js';
import maintenanceRoutes from './routes/maintenance.js';
import shoppingRoutes from './routes/shopping.js';
import passport from 'passport';
import { BRAND_NAME } from './utils/branding.js';
import { renderStartupSummary } from './utils/devConsole.js';
import { getUploadsRoot } from './utils/runtimePaths.js';

// Public v2 release line: Express app shell, security middleware, and API routing.

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
const clientDist = join(__dirname, 'client', 'dist');
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOCAL_HTTP = process.env.HOMEINVENTORY_LOCAL_HTTP === 'true';
const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:5173'
).trim().replace(/\/+$/, '');

function logLegalConfigurationWarnings() {
    if (NODE_ENV !== 'production') {
        return;
    }

    let host = '';
    try {
        host = new URL(SITE_URL).hostname.replace(/^www\./, '');
    } catch {
        host = '';
    }

    if (!host || /(^|\.)localhost$/.test(host) || host === '127.0.0.1') {
        return;
    }

    const missingRequired = [
        ['APP_DATA_CONTROLLER_NAME', process.env.APP_DATA_CONTROLLER_NAME],
        ['APP_DATA_CONTROLLER_ADDRESS', process.env.APP_DATA_CONTROLLER_ADDRESS],
        ['SUPPORT_EMAIL', process.env.SUPPORT_EMAIL]
    ]
        .filter(([, value]) => !String(value || '').trim())
        .map(([name]) => name);

    const missingRecommended = [
        ['APP_DPO_EMAIL', process.env.APP_DPO_EMAIL],
        ['APP_PRIVACY_TRANSFER_DISCLOSURE', process.env.APP_PRIVACY_TRANSFER_DISCLOSURE],
        ['APP_PRIVACY_COMPLAINT_AUTHORITY', process.env.APP_PRIVACY_COMPLAINT_AUTHORITY]
    ]
        .filter(([, value]) => !String(value || '').trim())
        .map(([name]) => name);

    if (!missingRequired.length && !missingRecommended.length) {
        return;
    }

    console.warn('[Privacy] Production legal configuration is incomplete for this public deployment.');

    if (missingRequired.length) {
        console.warn(`[Privacy] Missing required identity/contact settings: ${missingRequired.join(', ')}`);
    }

    if (missingRecommended.length) {
        console.warn(`[Privacy] Missing recommended privacy disclosure settings: ${missingRecommended.join(', ')}`);
    }
}

function parseTrustProxySetting(value) {
    const normalized = String(value || '').trim();

    if (!normalized) {
        return false;
    }

    if (['false', '0', 'off', 'no'].includes(normalized.toLowerCase())) {
        return false;
    }

    if (['true', 'on', 'yes'].includes(normalized.toLowerCase())) {
        return true;
    }

    if (/^\d+$/.test(normalized)) {
        return Number.parseInt(normalized, 10);
    }

    return normalized;
}

const app = express();
app.disable('x-powered-by');
logLegalConfigurationWarnings();

// SECURITY: Trust proxy must match the real network topology.
// Default to disabled and let deployments opt in explicitly with TRUST_PROXY.
app.set('trust proxy', parseTrustProxySetting(process.env.TRUST_PROXY));

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
            "script-src": LOCAL_HTTP ? ["'self'", "'unsafe-inline'"] : ["'self'"],
            "font-src": ["'self'", "data:"],
            ...(LOCAL_HTTP ? { "upgrade-insecure-requests": null } : {})
        }
    } : false,
    hsts: LOCAL_HTTP ? false : undefined,
    crossOriginEmbedderPolicy: false
}));
const PORT = process.env.PORT || 3001;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;
const HOST = process.env.HOST || (NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

// Get local network IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    let fallback = 'localhost';
    
    for (const name of Object.keys(interfaces)) {
        if (/virtual|vmware|vbox|loopback|tunnel|tailscale/i.test(name)) {
            continue;
        }
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('169.254.')) {
                    continue;
                }
                return iface.address;
            }
        }
    }
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('169.254.')) {
                    continue;
                }
                return iface.address;
            }
        }
    }
    
    return fallback;
}

// Ensure uploads directory exists
const uploadsDir = getUploadsRoot(__dirname);
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(compression());

// SECURITY: Restricted CORS - only allow specific origins
const localIP = getLocalIP();
const allowedOrigins = [
    ...siteOrigins,
    'http://localhost:3000',
    `http://localhost:${FRONTEND_PORT}`,
    'http://127.0.0.1:3000',
    `http://127.0.0.1:${FRONTEND_PORT}`,
    `http://${localIP}:3000`,
    `http://${localIP}:${FRONTEND_PORT}`
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

app.use('/assets', express.static(join(clientDist, 'assets'), {
    immutable: true,
    maxAge: '1y',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}));
app.use('/brand-local', express.static(join(clientDist, 'brand-local'), {
    maxAge: '30d',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
    }
}));
app.use('/locales', express.static(join(clientDist, 'locales'), {
    maxAge: '30d',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
    }
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
app.use('/api/borrow-requests', interactiveApiLimiter);
app.use('/api/maintenance', interactiveApiLimiter);
app.use('/api/shopping', interactiveApiLimiter);

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
app.use('/api/borrow-requests', borrowRequestsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/shopping', shoppingRoutes);

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

// Start server on configurable host; defaults to all network interfaces.
app.listen(PORT, HOST, () => {
    const frontendUrl = String(process.env.SITE_URL || `http://localhost:${FRONTEND_PORT}`)
        .trim()
        .replace(/\/+$/, '');
    const backendUrl = `http://localhost:${PORT}`;
    const hasLanAddress = localIP && localIP !== 'localhost' && localIP !== '127.0.0.1';
    const networkBackendUrl = hasLanAddress ? `http://${localIP}:${PORT}` : null;
    const networkFrontendUrl = hasLanAddress ? `http://${localIP}:${FRONTEND_PORT}` : null;

    console.log(renderStartupSummary({
        appName: BRAND_NAME,
        status: 'Ready',
        frontendUrl,
        backendUrl,
        lanAppUrl: networkFrontendUrl,
        lanApiUrl: networkBackendUrl,
        helpText: 'Use Ctrl+C to stop'
    }));
});
