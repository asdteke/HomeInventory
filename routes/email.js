import express from 'express';
import { sendTestEmail } from '../utils/emailService.js';
import { getEmailDeliveryStatus } from '../utils/branding.js';
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

        const result = await sendTestEmail(to);

        if (result.success) {
            res.json({
                success: true,
                message: `Test e-postası başarıyla gönderildi: ${to}`,
                emailId: result.data?.id
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'E-posta gönderilirken bir hata oluştu'
            });
        }

    } catch (error) {
        console.error('❌ Test e-postası hatası:', error);
        logError(error, { context: 'email.test', body: req.body });
        res.status(500).json({
            success: false,
            error: 'E-posta gönderilirken bir hata oluştu'
        });
    }
});

/**
 * GET /api/email/status
 * E-posta servis durumunu kontrol et
 */
router.get('/status', authenticateToken, requireAdmin, (req, res) => {
    const deliveryStatus = getEmailDeliveryStatus();

    res.json({
        configured: deliveryStatus.configured,
        deliveryReady: deliveryStatus.configured,
        apiKeyConfigured: deliveryStatus.apiKeyConfigured,
        senderConfigured: deliveryStatus.senderConfigured,
        from: deliveryStatus.from,
        service: deliveryStatus.service,
        message: deliveryStatus.message
    });
});

export default router;
