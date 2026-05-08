import express from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { buildAdminEmailHtml, getAdminEmailCopy, sendEmail } from '../utils/emailService.js';
import { DEFAULT_FROM } from '../utils/branding.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

// Rate limiter: Dakikada maksimum 3 e-posta
const emailRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: 3,
    message: {
        success: false,
        error: 'Çok fazla e-posta isteği. Lütfen 1 dakika bekleyin.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, // Tüm validasyonları devre dışı bırak (IPv6 hatası önleme)
    keyGenerator: (req) => String(req.user?.id || 'anonymous') // Sadece kullanıcı ID'si
});

// XSS temizleme fonksiyonu
function sanitizeInput(input) {
    if (!input) return '';
    return validator.escape(String(input).trim());
}

// HTML içerik için basit temizleme (script taglerini kaldır)
function sanitizeHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
}

/**
 * POST /api/admin/email/send
 * Admin panelinden e-posta gönder
 */
router.post('/send', authenticateToken, requireAdmin, emailRateLimiter, async (req, res) => {
    const startTime = Date.now();

    try {
        const { to, subject, message } = req.body;

        // Input validasyonu
        if (!to || !subject || !message) {
            return res.status(400).json({
                success: false,
                error: 'Tüm alanları doldurun (to, subject, message)'
            });
        }

        // E-posta formatı kontrolü
        const cleanTo = sanitizeInput(to);
        if (!validator.isEmail(cleanTo)) {
            return res.status(400).json({
                success: false,
                error: 'Geçersiz e-posta adresi formatı'
            });
        }

        // Girdi temizleme
        const cleanSubject = sanitizeInput(subject);
        const cleanMessage = sanitizeHtml(message);

        if (cleanSubject.length > 200) {
            return res.status(400).json({
                success: false,
                error: 'Konu en fazla 200 karakter olabilir'
            });
        }

        if (cleanMessage.length > 50000) {
            return res.status(400).json({
                success: false,
                error: 'Mesaj çok uzun (max 50.000 karakter)'
            });
        }

        const emailCopy = getAdminEmailCopy();

        // E-posta gönder
        const html = buildAdminEmailHtml(cleanMessage, emailCopy);

        const result = await sendEmail({
            to: cleanTo,
            subject: cleanSubject,
            html
        });

        // Loglama (içerik hariç, sadece alıcı ve tarih)
        const logEntry = {
            timestamp: new Date().toISOString(),
            admin_id: req.user.id,
            admin_username: req.user.username,
            recipient: cleanTo,
            subject_length: cleanSubject.length,
            success: result.success,
            duration_ms: Date.now() - startTime
        };

        if (result.success) {
            console.log('[Admin Email] ✅ Gönderildi:', JSON.stringify(logEntry));
            res.json({
                success: true,
                message: `E-posta başarıyla gönderildi: ${cleanTo}`,
                emailId: result.data?.id
            });
        } else {
            logEntry.error = result.error;
            console.error('[Admin Email] ❌ Hata:', JSON.stringify(logEntry));
            logError(new Error(result.error), { context: 'admin-email.send', details: logEntry });
            res.status(500).json({
                success: false,
                error: result.error || 'E-posta gönderilemedi'
            });
        }

    } catch (error) {
        console.error('[Admin Email] ❌ Sunucu hatası:', error);
        logError(error, { context: 'admin-email.send', user_id: req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası oluştu'
        });
    }
});

/**
 * GET /api/admin/email/status
 * Admin e-posta durumu
 */
router.get('/status', authenticateToken, requireAdmin, (req, res) => {
    const apiKeyExists = !!process.env.RESEND_API_KEY;

    res.json({
        configured: apiKeyExists,
        from: DEFAULT_FROM,
        service: 'Resend API',
        rateLimit: '3 e-posta / dakika',
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        }
    });
});

export default router;
