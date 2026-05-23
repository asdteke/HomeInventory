import express from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildAdminEmailHtml, getAdminEmailCopy, sendEmail } from '../utils/emailService.js';
import { getEmailDeliveryStatus } from '../utils/branding.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { logError } from '../utils/logger.js';
import { buildDefaultIndexNowUrls, getIndexNowConfig, submitIndexNowUrls } from '../utils/indexNow.js';
import db from '../database.js';
import { buildEmailLookup, decryptUserRecord, decryptUsername } from '../utils/protectedFields.js';
import { getUploadsRoot } from '../utils/runtimePaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MAX_ADMIN_EMAIL_MESSAGE_LENGTH = 10000;

const router = express.Router();

function maskEmailForLogs(email) {
    if (!email) return '';
    const [local, domain] = String(email).split('@');
    if (!domain) return String(email);
    const domainParts = domain.split('.');
    const tld = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';
    return `${local.charAt(0)}•••@•••${tld}`;
}

// Rate limiter: Dakikada maksimum 3 e-posta
const emailRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { success: false, error: 'Çok fazla e-posta isteği. Lütfen 1 dakika bekleyin.', retryAfter: 60 },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => String(req.user?.id || 'anonymous')
});

// XSS temizleme
function sanitizeInput(input) {
    if (!input) return '';
    return validator.escape(String(input).trim());
}

// Admin e-postalarında ham HTML'e güvenmeyip metni güvenli biçimde işleriz.
function renderSafeEmailMessageHtml(message) {
    const normalized = String(message || '').trim();
    if (!normalized) {
        return '';
    }

    return normalized
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${validator.escape(paragraph).replace(/\r?\n/g, '<br />')}</p>`)
        .join('');
}

// Log kaydet
function saveAdminLog(type, action, details, adminId, targetId = null) {
    try {
        const serializedDetails = typeof details === 'string' ? details : JSON.stringify(details || {});
        db.prepare(`
            INSERT INTO admin_logs (type, action, details, admin_id, target_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(type, action, serializedDetails, adminId, targetId);
    } catch (e) {
        console.error('[Admin Log] Kayıt hatası:', e.message);
    }
}

function getUploadsSizeMb() {
    let uploadsSize = 0;
    const uploadsDir = getUploadsRoot(join(__dirname, '..'));

    if (!fs.existsSync(uploadsDir)) {
        return 0;
    }

    const files = fs.readdirSync(uploadsDir);
    files.forEach((file) => {
        const stat = fs.statSync(join(uploadsDir, file));
        if (stat.isFile()) {
            uploadsSize += stat.size;
        }
    });

    return Math.round((uploadsSize / 1024 / 1024) * 100) / 100;
}

function readRecentErrorLogs({ maxFiles = 3, maxLinesPerFile = 10, maxEntries = 10 } = {}) {
    let errorLogs = [];
    const logsDir = join(__dirname, '..', 'logs');

    if (!fs.existsSync(logsDir)) {
        return errorLogs;
    }

    const logFiles = fs.readdirSync(logsDir).filter((file) => file.endsWith('.log')).slice(-maxFiles);
    logFiles.forEach((file) => {
        try {
            const content = fs.readFileSync(join(logsDir, file), 'utf8');
            const lines = content.split('\n').filter((line) => line.trim()).slice(-maxLinesPerFile);
            lines.forEach((line) => {
                try {
                    const parsed = JSON.parse(line);
                    errorLogs.push({
                        timestamp: parsed.timestamp,
                        error: parsed.message || parsed.error,
                        file
                    });
                } catch {
                    // ignore malformed lines
                }
            });
        } catch {
            // ignore unreadable files
        }
    });

    return errorLogs.slice(-maxEntries).reverse();
}

// ============================================
// DASHBOARD STATS
// ============================================
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = {
            total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            admins: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count,
            banned: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get().count,
            locked: db.prepare(`
                SELECT COUNT(*) as count
                FROM users
                WHERE login_locked_until IS NOT NULL
                  AND login_locked_until > CURRENT_TIMESTAMP
            `).get().count,
            new_today: db.prepare(`
                SELECT COUNT(*) as count
                FROM users
                WHERE created_at >= datetime('now', '-1 day')
            `).get().count,
            new_week: db.prepare(`
                SELECT COUNT(*) as count
                FROM users
                WHERE created_at >= datetime('now', '-7 day')
            `).get().count
        };

        const households = {
            total: db.prepare('SELECT COUNT(DISTINCT house_key) as count FROM user_houses').get().count,
            memberships: db.prepare('SELECT COUNT(*) as count FROM user_houses').get().count,
            pending_requests: db.prepare(`
                SELECT COUNT(*) as count
                FROM house_join_requests
                WHERE status = 'pending'
            `).get().count
        };

        const inventory = {
            items: db.prepare('SELECT COUNT(*) as count FROM items').get().count,
            public_items: db.prepare('SELECT COUNT(*) as count FROM items WHERE is_public = 1').get().count,
            private_items: db.prepare('SELECT COUNT(*) as count FROM items WHERE is_public = 0').get().count,
            active_borrows: db.prepare(`
                SELECT COUNT(*) as count
                FROM item_borrows
                WHERE returned_at IS NULL
            `).get().count,
            rooms: db.prepare('SELECT COUNT(*) as count FROM rooms').get().count,
            categories: db.prepare('SELECT COUNT(*) as count FROM categories').get().count,
            locations: db.prepare('SELECT COUNT(*) as count FROM locations').get().count
        };

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
        const uptime = Math.floor(os.uptime() / 3600);
        const errorLogs = readRecentErrorLogs();
        const recentActivity = db.prepare(`
            SELECT id, type, action, details, admin_id, target_id, created_at
            FROM admin_logs
            ORDER BY created_at DESC
            LIMIT 6
        `).all();
        const recentUsers = db.prepare(`
            SELECT id, username, role, is_banned, created_at, last_login
            FROM users
            ORDER BY created_at DESC
            LIMIT 6
        `).all().map(decryptUserRecord).map((user) => ({
            ...user,
            is_banned: Boolean(user.is_banned)
        }));

        res.json({
            success: true,
            stats: {
                users,
                households,
                inventory,
                server: {
                    memory_percent: usedMemPercent,
                    uptime_hours: uptime,
                    uploads_mb: getUploadsSizeMb(),
                    node_version: process.version,
                    email_configured: getEmailDeliveryStatus().configured,
                    error_log_count: errorLogs.length
                },
                recent_activity: recentActivity,
                recent_users: recentUsers
            }
        });
    } catch (error) {
        console.error('[Admin Stats] Hata:', error);
        res.status(500).json({ success: false, error: 'İstatistikler alınamadı' });
    }
});

// ============================================
// USER MANAGEMENT
// ============================================
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT
                users.id,
                users.username,
                users.role,
                users.is_banned,
                users.failed_login_count,
                users.last_login,
                users.created_at,
                (
                    SELECT COUNT(*)
                    FROM user_houses
                    WHERE user_houses.user_id = users.id
                ) AS house_count,
                (
                    SELECT COUNT(*)
                    FROM items
                    WHERE items.user_id = users.id
                ) AS owned_item_count,
                (
                    SELECT COUNT(*)
                    FROM house_join_requests
                    WHERE house_join_requests.requester_user_id = users.id
                      AND house_join_requests.status = 'pending'
                ) AS pending_house_requests
            FROM users
            ORDER BY created_at DESC
        `).all().map(decryptUserRecord);

        const minimizedUsers = users.map(u => ({
            ...u,
            is_banned: !!u.is_banned,
            house_count: Number(u.house_count || 0),
            owned_item_count: Number(u.owned_item_count || 0),
            pending_house_requests: Number(u.pending_house_requests || 0)
        }));

        res.json({ success: true, users: minimizedUsers });
    } catch (error) {
        console.error('[Admin Users] Hata:', error);
        res.status(500).json({ success: false, error: 'Kullanıcılar alınamadı' });
    }
});

router.post('/users/:id/ban', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ success: false, error: 'Geçersiz kullanıcı kimliği' });
        }
        const { ban } = req.body; // true = ban, false = unban

        // Admin kendini banlayamaz
        if (userId === req.user.id) {
            return res.status(400).json({ success: false, error: 'Kendinizi banlayamazsınız' });
        }

        const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        const username = decryptUsername(user.username);

        // Diğer adminleri banlayamaz
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, error: 'Admin kullanıcılar banlanamaz' });
        }

        db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(ban ? 1 : 0, userId);

        saveAdminLog('user', ban ? 'ban' : 'unban', {
            kind: 'user_target',
            username
        }, req.user.id, userId);

        res.json({
            success: true,
            message: ban ? `${username} banlandı` : `${username} ban kaldırıldı`
        });
    } catch (error) {
        console.error('[Admin Ban] Hata:', error);
        res.status(500).json({ success: false, error: 'İşlem başarısız' });
    }
});

router.post('/users/:id/reset-failed-logins', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ success: false, error: 'Geçersiz kullanıcı kimliği' });
        }
        db.prepare(`
            UPDATE users
            SET failed_login_count = 0,
                login_failed_at = NULL,
                login_locked_until = NULL
            WHERE id = ?
        `).run(userId);
        res.json({ success: true, message: 'Başarısız giriş sayacı sıfırlandı' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'İşlem başarısız' });
    }
});

// ============================================
// DELETE USER (with shared house logic)
// ============================================
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ success: false, error: 'Geçersiz kullanıcı kimliği' });
        }

        // Admin kendini silemez
        if (userId === req.user.id) {
            return res.status(400).json({ success: false, error: 'Kendinizi silemezsiniz' });
        }

        const userRow = db.prepare('SELECT username, role, email FROM users WHERE id = ?').get(userId);
        if (!userRow) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        const user = decryptUserRecord(userRow);

        // Diğer adminleri silemez
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, error: 'Admin kullanıcıları silemezsiniz' });
        }

        // Kullanıcının üye olduğu tüm evleri al
        const userHouses = db.prepare('SELECT house_key, is_owner FROM user_houses WHERE user_id = ?').all(userId);

        let deletedHouses = 0;
        let transferredOwnership = 0;

        // Transaction ile paylaşımlı ev mantığını uygula
        const deleteTransaction = db.transaction(() => {
            for (const house of userHouses) {
                const houseKey = house.house_key;

                // Bu evdeki diğer üyeleri say
                const otherMembers = db.prepare(
                    'SELECT user_id, joined_at FROM user_houses WHERE house_key = ? AND user_id != ? ORDER BY joined_at ASC'
                ).all(houseKey, userId);

                if (otherMembers.length > 0) {
                    // Evde başka üyeler var - evi silme!

                    // Eğer silinen kullanıcı owner ise, sahipliği en eski üyeye devret
                    if (house.is_owner) {
                        const newOwner = otherMembers[0]; // En eski üye
                        db.prepare('UPDATE user_houses SET is_owner = 1 WHERE user_id = ? AND house_key = ?')
                            .run(newOwner.user_id, houseKey);
                        transferredOwnership++;
                    }

                    // Sadece bu kullanıcıyı ev üyeliğinden çıkar
                    db.prepare('DELETE FROM user_houses WHERE user_id = ? AND house_key = ?')
                        .run(userId, houseKey);

                } else {
                    // Evde kalan son kişi bu kullanıcı - evi tamamen sil!

                    // Eve ait tüm items'ları sil
                    db.prepare('DELETE FROM items WHERE house_key = ?').run(houseKey);

                    // Eve ait tüm locations'ları sil
                    db.prepare('DELETE FROM locations WHERE house_key = ?').run(houseKey);

                    // Eve ait tüm rooms'ları sil
                    db.prepare('DELETE FROM rooms WHERE house_key = ?').run(houseKey);

                    // Eve ait tüm categories'i sil
                    db.prepare('DELETE FROM categories WHERE house_key = ?').run(houseKey);

                    // Kullanıcıyı ev üyeliğinden çıkar
                    db.prepare('DELETE FROM user_houses WHERE user_id = ? AND house_key = ?')
                        .run(userId, houseKey);

                    deletedHouses++;
                }
            }

            // pending_registrations kayıtlarını sil (varsa email ile)
            if (user.email) {
                db.prepare('DELETE FROM pending_registrations WHERE email_lookup = ? OR email = ?')
                    .run(buildEmailLookup(user.email), user.email);
            }

            // Kullanıcıyı sil
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        });

        deleteTransaction();

        // Admin log kaydı
        saveAdminLog('user', 'delete', {
            kind: 'user_deleted',
            username: user.username,
            deletedHouses,
            transferredOwnerships: transferredOwnership
        }, req.user.id, userId);

        res.json({
            success: true,
            message: `${user.username} kullanıcısı silindi`,
            details: {
                deletedHouses,
                transferredOwnership,
                preservedHouses: userHouses.length - deletedHouses
            }
        });
    } catch (error) {
        console.error('[Admin Delete User] Hata:', error);
        logError(error, { context: 'admin-delete-user', userId: req.params.id });
        res.status(500).json({ success: false, error: 'Silme işlemi başarısız' });
    }
});

// ============================================
// LOGS
// ============================================
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
    try {
        // Admin logları
        const adminLogs = db.prepare(`
            SELECT id, type, action, details, admin_id, target_id, created_at
            FROM admin_logs ORDER BY created_at DESC LIMIT 20
        `).all();

        const errorLogs = readRecentErrorLogs();

        res.json({
            success: true,
            adminLogs: adminLogs.map(l => ({
                ...l,
                created_at: l.created_at
            })),
            errorLogs
        });
    } catch (error) {
        console.error('[Admin Logs] Hata:', error);
        res.status(500).json({ success: false, error: 'Loglar alınamadı' });
    }
});

// ============================================
// EMAIL SENDING
// ============================================
router.post('/email/send', authenticateToken, requireAdmin, emailRateLimiter, async (req, res) => {
    const startTime = Date.now();

    try {
        const { to, subject, message } = req.body;

        if (!to || !subject || !message) {
            return res.status(400).json({ success: false, error: 'Tüm alanları doldurun' });
        }

        const cleanTo = sanitizeInput(to);
        if (!validator.isEmail(cleanTo)) {
            return res.status(400).json({ success: false, error: 'Geçersiz e-posta adresi' });
        }

        const cleanSubject = sanitizeInput(subject);
        const rawMessage = String(message || '').trim();
        const cleanMessage = renderSafeEmailMessageHtml(rawMessage);

        if (cleanSubject.length > 200) {
            return res.status(400).json({ success: false, error: 'Konu max 200 karakter' });
        }
        if (!cleanMessage) {
            return res.status(400).json({ success: false, error: 'Mesaj boş olamaz' });
        }
        if (rawMessage.length > MAX_ADMIN_EMAIL_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, error: `Mesaj max ${MAX_ADMIN_EMAIL_MESSAGE_LENGTH} karakter olabilir` });
        }

        const emailCopy = getAdminEmailCopy();

        const html = buildAdminEmailHtml(cleanMessage, emailCopy);

        const result = await sendEmail({ to: cleanTo, subject: cleanSubject, html });

        saveAdminLog('email', 'send', {
            kind: 'email_sent',
            recipient: maskEmailForLogs(cleanTo),
            subject: cleanSubject.substring(0, 50)
        }, req.user.id);

        if (result.success) {
            res.json({ success: true, message: `E-posta gönderildi: ${cleanTo}`, emailId: result.data?.id });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Admin Email] Hata:', error);
        logError(error, { context: 'admin-email.send' });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

router.get('/email/status', authenticateToken, requireAdmin, (req, res) => {
    const deliveryStatus = getEmailDeliveryStatus();

    res.json({
        configured: deliveryStatus.configured,
        deliveryReady: deliveryStatus.configured,
        apiKeyConfigured: deliveryStatus.apiKeyConfigured,
        senderConfigured: deliveryStatus.senderConfigured,
        from: deliveryStatus.from,
        service: deliveryStatus.service,
        message: deliveryStatus.message,
        rateLimit: '3/dakika',
        user: { id: req.user.id, username: req.user.username, role: req.user.role }
    });
});

router.post('/indexnow/submit', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const config = getIndexNowConfig();
        if (!config.enabled) {
            return res.status(400).json({ success: false, error: config.reason });
        }

        const incomingUrls = Array.isArray(req.body?.urls) ? req.body.urls : [];
        const urls = incomingUrls.length ? incomingUrls : buildDefaultIndexNowUrls(config.baseUrl);

        const result = await submitIndexNowUrls(urls);

        saveAdminLog('seo', 'indexnow_submit', {
            kind: 'indexnow_submit',
            count: result.submitted
        }, req.user.id);

        return res.json({
            success: true,
            message: 'IndexNow submission completed',
            submitted: result.submitted,
            status: result.status
        });
    } catch (error) {
        logError(error, { context: 'admin-indexnow.submit', userId: req.user?.id });
        return res.status(500).json({ success: false, error: 'IndexNow submission failed' });
    }
});

export default router;
