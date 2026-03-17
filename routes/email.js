import express from 'express';
import { sendEmail } from '../utils/emailService.js';
import { logError } from '../utils/logger.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/email/test
 * Test e-postası gönder
 */
router.post('/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { to } = req.body;

        // Alıcı adresi kontrolü
        if (!to) {
            return res.status(400).json({
                success: false,
                error: 'Alıcı e-posta adresi (to) gerekli!'
            });
        }

        // E-posta formatı kontrolü
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({
                success: false,
                error: 'Geçersiz e-posta adresi formatı!'
            });
        }

        console.log(`🧪 Test e-postası gönderiliyor: ${to}`);

        const result = await sendEmail({
            to,
            subject: '🧪 HomeInventory Test E-postası',
            html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
                    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #22c55e, #16a34a); padding: 30px; text-align: center; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { padding: 30px; text-align: center; }
                    .success-icon { font-size: 64px; margin: 20px 0; }
                    .info-box { background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🧪 Test E-postası</h1>
                    </div>
                    <div class="content">
                        <div class="success-icon">✅</div>
                        <h2>E-posta Sistemi Çalışıyor!</h2>
                        <p>Bu e-postayı aldıysanız, HomeInventory e-posta gönderim sistemi doğru şekilde yapılandırılmış demektir.</p>
                        
                        <div class="info-box">
                            <p><strong>Gönderim Zamanı:</strong> ${new Date().toLocaleString('tr-TR')}</p>
                            <p><strong>Gönderen:</strong> support@homeinventory.local</p>
                            <p><strong>Servis:</strong> Resend API</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p>© 2024 HomeInventory - Ev Envanter Yönetim Sistemi</p>
                    </div>
                </div>
            </body>
            </html>
            `
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Test e-postası başarıyla gönderildi: ${to}`,
                emailId: result.data?.id
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                details: result.details
            });
        }

    } catch (error) {
        console.error('❌ Test e-postası hatası:', error);
        logError(error, { context: 'email.test', body: req.body });
        res.status(500).json({
            success: false,
            error: 'E-posta gönderilirken bir hata oluştu',
            details: error.message
        });
    }
});

/**
 * GET /api/email/status
 * E-posta servis durumunu kontrol et
 */
router.get('/status', authenticateToken, requireAdmin, (req, res) => {
    const apiKeyExists = !!process.env.RESEND_API_KEY;

    res.json({
        configured: apiKeyExists,
        from: 'HomeInventory Team <support@homeinventory.local>',
        service: 'Resend API',
        message: apiKeyExists
            ? '✅ E-posta servisi yapılandırılmış'
            : '❌ RESEND_API_KEY ortam değişkeni tanımlı değil'
    });
});

export default router;
