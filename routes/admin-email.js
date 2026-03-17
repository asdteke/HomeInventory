import express from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { sendEmail } from '../utils/emailService.js';
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

        // E-posta gönder
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 24px; }
                .content { padding: 30px; line-height: 1.6; }
                .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏠 HomeInventory</h1>
                </div>
                <div class="content">
                    ${cleanMessage}
                </div>
                <div class="footer">
                    <p>This email was sent by HomeInventory Team.</p>
                    <p>© 2026 HomeInventory - support@homeinventory.local</p>
                </div>
            </div>
        </body>
        </html>
        `;

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
        from: 'HomeInventory Team <support@homeinventory.local>',
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
