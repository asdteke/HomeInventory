import express from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendEmail } from '../utils/emailService.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { logError } from '../utils/logger.js';
import { buildDefaultIndexNowUrls, getIndexNowConfig, submitIndexNowUrls } from '../utils/indexNow.js';
import db from '../database.js';
import { buildEmailLookup, decryptUserRecord, decryptUsername } from '../utils/protectedFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

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

// KVKK uyumlu e-posta maskeleme
function maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = local.length > 2
        ? local.charAt(0) + '*'.repeat(Math.min(local.length - 2, 5)) + local.slice(-1)
        : local;
    return `${maskedLocal}@${domain}`;
}

// XSS temizleme
function sanitizeInput(input) {
    if (!input) return '';
    return validator.escape(String(input).trim());
}

// HTML temizleme
function sanitizeHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
}

// Log kaydet
function saveAdminLog(type, action, details, adminId, targetId = null) {
    try {
        db.prepare(`
            INSERT INTO admin_logs (type, action, details, admin_id, target_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(type, action, details, adminId, targetId);
    } catch (e) {
        console.error('[Admin Log] Kayıt hatası:', e.message);
    }
}

// ============================================
// DASHBOARD STATS
// ============================================
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const itemCount = db.prepare('SELECT COUNT(*) as count FROM items').get().count;
        const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
        const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
        const bannedCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get().count;

        // Son 24 saatteki yeni kullanıcılar
        const newUsersToday = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE created_at >= datetime('now', '-1 day')
        `).get().count;

        // Sunucu bilgileri
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
        const uptime = Math.floor(os.uptime() / 3600); // Saat

        // Disk kullanımı (uploads klasörü)
        let uploadsSize = 0;
        const uploadsDir = join(__dirname, '..', 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            files.forEach(file => {
                const stat = fs.statSync(join(uploadsDir, file));
                if (stat.isFile()) uploadsSize += stat.size;
            });
        }

        res.json({
            success: true,
            stats: {
                users: { total: userCount, new_today: newUsersToday, banned: bannedCount },
                inventory: { items: itemCount, rooms: roomCount, categories: categoryCount },
                server: {
                    memory_percent: usedMemPercent,
                    uptime_hours: uptime,
                    uploads_mb: Math.round(uploadsSize / 1024 / 1024 * 100) / 100,
                    node_version: process.version
                }
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
            SELECT id, username, email, role, is_banned, failed_login_count, last_login, created_at
            FROM users ORDER BY created_at DESC
        `).all().map(decryptUserRecord);

        // KVKK uyumlu - e-postaları maskele
        const maskedUsers = users.map(u => ({
            ...u,
            email: maskEmail(u.email),
            is_banned: !!u.is_banned
        }));

        res.json({ success: true, users: maskedUsers });
    } catch (error) {
        console.error('[Admin Users] Hata:', error);
        res.status(500).json({ success: false, error: 'Kullanıcılar alınamadı' });
    }
});

router.post('/users/:id/ban', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
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

        saveAdminLog('user', ban ? 'ban' : 'unban', `Kullanıcı: ${username}`, req.user.id, userId);

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
        const userId = parseInt(req.params.id);
        db.prepare('UPDATE users SET failed_login_count = 0 WHERE id = ?').run(userId);
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
        const userId = parseInt(req.params.id);

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
        const logDetails = `Kullanıcı silindi: ${user.username} | Silinen evler: ${deletedHouses} | Devredilen sahiplikler: ${transferredOwnership}`;
        saveAdminLog('user', 'delete', logDetails, req.user.id, userId);

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

        // Sistem hata loglarını dosyadan oku
        let errorLogs = [];
        const logsDir = join(__dirname, '..', 'logs');
        if (fs.existsSync(logsDir)) {
            const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log')).slice(-3);
            logFiles.forEach(file => {
                try {
                    const content = fs.readFileSync(join(logsDir, file), 'utf8');
                    const lines = content.split('\n').filter(l => l.trim()).slice(-10);
                    lines.forEach(line => {
                        try {
                            const parsed = JSON.parse(line);
                            errorLogs.push({
                                timestamp: parsed.timestamp,
                                error: parsed.message || parsed.error,
                                file: file
                            });
                        } catch (e) { /* JSON parse hatası */ }
                    });
                } catch (e) { /* Dosya okuma hatası */ }
            });
        }

        errorLogs = errorLogs.slice(-10).reverse();

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
        const cleanMessage = sanitizeHtml(message);

        if (cleanSubject.length > 200) {
            return res.status(400).json({ success: false, error: 'Konu max 200 karakter' });
        }

        const html = `
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 30px; line-height: 1.6; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
        </head><body>
            <div class="container">
                <div class="header"><h1>🏠 HomeInventory</h1></div>
                <div class="content">${cleanMessage}</div>
                <div class="footer">
                    <p>This email was sent by HomeInventory Team.</p>
                    <p>© 2026 HomeInventory - support@homeinventory.local</p>
                </div>
            </div>
        </body></html>
        `;

        const result = await sendEmail({ to: cleanTo, subject: cleanSubject, html });

        saveAdminLog('email', 'send', `Alıcı: ${maskEmail(cleanTo)}, Konu: ${cleanSubject.substring(0, 50)}`, req.user.id);

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
    res.json({
        configured: !!process.env.RESEND_API_KEY,
        from: 'HomeInventory Team <support@homeinventory.local>',
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

        saveAdminLog(
            'seo',
            'indexnow_submit',
            `IndexNow submission successful. URL count: ${result.submitted}`,
            req.user.id
        );

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
