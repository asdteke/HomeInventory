import { Resend } from 'resend';
import { logError } from './logger.js';

// Resend API istemcisi - lazy initialization (dotenv yüklendikten sonra çalışır)
let resend = null;
function getResendClient() {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

const PUBLIC_BASE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:3001'
).trim().replace(/\/+$/, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@homeinventory.local';
// Varsayılan gönderen bilgisi
const DEFAULT_FROM = `HomeInventory Team <${SUPPORT_EMAIL}>`;

/**
 * E-posta gönderim fonksiyonu
 * @param {Object} options - E-posta seçenekleri
 * @param {string} options.to - Alıcı e-posta adresi
 * @param {string} options.subject - E-posta konusu
 * @param {string} options.html - HTML içerik
 * @param {string} [options.text] - Düz metin içerik (opsiyonel)
 * @param {string} [options.from] - Gönderen (varsayılan: HomeInventory Team)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text, from = DEFAULT_FROM }) {
    try {
        // API anahtarı kontrolü
        if (!process.env.RESEND_API_KEY) {
            const errorMsg = 'RESEND_API_KEY ortam değişkeni tanımlı değil!';
            logError(new Error(errorMsg), { context: 'emailService.sendEmail' });
            return {
                success: false,
                error: errorMsg
            };
        }

        console.log(`📧 E-posta gönderiliyor: ${to} - Konu: ${subject}`);

        const client = getResendClient();
        if (!client) {
            throw new Error('Resend istemcisi başlatılamadı');
        }

        const response = await client.emails.send({
            from,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, '') // HTML'den düz metin oluştur
        });

        // Resend API yanıtını kontrol et
        if (response.error) {
            const errorDetails = {
                code: response.error.name,
                message: response.error.message,
                recipient: to,
                subject: subject
            };

            console.error('❌ E-posta gönderilemedi:', errorDetails);
            logError(new Error(response.error.message), {
                context: 'emailService.sendEmail',
                details: errorDetails
            });

            return {
                success: false,
                error: response.error.message,
                details: errorDetails
            };
        }

        console.log(`✅ E-posta başarıyla gönderildi! ID: ${response.data?.id}`);

        return {
            success: true,
            data: response.data
        };

    } catch (error) {
        const errorDetails = {
            message: error.message,
            recipient: to,
            subject: subject,
            stack: error.stack
        };

        console.error('❌ E-posta gönderim hatası:', errorDetails);
        logError(error, {
            context: 'emailService.sendEmail',
            details: errorDetails
        });

        return {
            success: false,
            error: error.message,
            details: errorDetails
        };
    }
}

/**
 * E-posta doğrulama maili gönder (Hoş Geldin + Doğrulama)
 * @param {string} email - Kullanıcı e-posta adresi
 * @param {string} houseKey - Ev anahtarı
 * @param {string} verificationToken - Doğrulama token'ı
 */
export async function sendVerificationEmail(email, houseKey, verificationToken) {
    const verificationUrl = `${PUBLIC_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
            .content { padding: 30px; }
            .verify-box { background: linear-gradient(135deg, #10b981, #059669); padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; }
            .verify-button { display: inline-block; background: white; color: #059669; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
            .house-key { background: #f0f9ff; border: 2px dashed #6366f1; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .house-key code { font-size: 20px; color: #6366f1; font-weight: bold; letter-spacing: 2px; word-break: break-all; }
            .features { list-style: none; padding: 0; }
            .features li { padding: 10px 0; border-bottom: 1px solid #eee; }
            .features li:last-child { border-bottom: none; }
            .features li::before { content: "✓"; color: #22c55e; margin-right: 10px; font-weight: bold; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; font-size: 14px; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏠 HomeInventory'e Hoş Geldiniz!</h1>
                <p>Ev envanter yönetim sisteminiz hazır</p>
            </div>
            <div class="content">
                <p>Merhaba,</p>
                <p>HomeInventory'e kayıt olduğunuz için teşekkür ederiz! Hesabınızı aktifleştirmek için lütfen e-posta adresinizi doğrulayın:</p>
                
                <div class="verify-box">
                    <p style="color: white; margin: 0 0 15px; font-size: 16px;">📧 E-posta Adresinizi Doğrulayın</p>
                    <a href="${verificationUrl}" class="verify-button">✓ Hesabımı Doğrula</a>
                </div>

                <div class="warning">
                    <strong>⚠️ Önemli:</strong> Bu doğrulama linki 24 saat geçerlidir. Hesabınızı doğrulamadan bazı özellikleri kullanamazsınız.
                </div>
                
                <div class="house-key">
                    <p style="margin: 0 0 10px; color: #6b7280;">Ev Anahtarınız:</p>
                    <code>${houseKey}</code>
                    <p style="margin: 10px 0 0; color: #6b7280; font-size: 12px;">Bu anahtarı saklayın! Diğer aile üyeleri bu anahtarla eve katılabilir.</p>
                </div>

                <h3>Neler yapabilirsiniz?</h3>
                <ul class="features">
                    <li>Eşyalarınızı fotoğraf ve barkod ile kaydedin</li>
                    <li>Odalar ve kategoriler oluşturun</li>
                    <li>Aile üyelerini eve davet edin</li>
                    <li>Verilerinizi JSON olarak yedekleyin</li>
                </ul>

                <p style="font-size: 12px; color: #6b7280;">Link çalışmıyorsa, aşağıdaki adresi tarayıcınıza yapıştırın:</p>
                <p style="word-break: break-all; color: #6b7280; font-size: 11px; background: #f3f4f6; padding: 10px; border-radius: 4px;">${verificationUrl}</p>

                <p>Sorularınız için <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> adresinden bize ulaşabilirsiniz.</p>
            </div>
            <div class="footer">
                <p>© 2026 HomeInventory - Ev Envanter Yönetim Sistemi</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail({
        to: email,
        subject: '🏠 HomeInventory - Hesabınızı Doğrulayın',
        html
    });
}

/**
 * Hoş geldiniz e-postası gönder (doğrulama gerektirmeyen kullanıcılar için)
 * @param {string} email - Kullanıcı e-posta adresi
 * @param {string} houseKey - Ev anahtarı
 */
export async function sendWelcomeEmail(email, houseKey) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
            .content { padding: 30px; }
            .house-key { background: #f0f9ff; border: 2px dashed #6366f1; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .house-key code { font-size: 24px; color: #6366f1; font-weight: bold; letter-spacing: 2px; }
            .features { list-style: none; padding: 0; }
            .features li { padding: 10px 0; border-bottom: 1px solid #eee; }
            .features li:last-child { border-bottom: none; }
            .features li::before { content: "✓"; color: #22c55e; margin-right: 10px; font-weight: bold; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏠 HomeInventory'e Hoş Geldiniz!</h1>
                <p>Ev envanter yönetim sisteminiz hazır</p>
            </div>
            <div class="content">
                <p>Merhaba,</p>
                <p>HomeInventory'e kayıt olduğunuz için teşekkür ederiz! Evinizin envanter yönetimini artık kolayca yapabilirsiniz.</p>
                
                <div class="house-key">
                    <p style="margin: 0 0 10px; color: #6b7280;">Ev Anahtarınız:</p>
                    <code>${houseKey}</code>
                    <p style="margin: 10px 0 0; color: #6b7280; font-size: 12px;">Bu anahtarı saklayın! Diğer aile üyeleri bu anahtarla yeni cihazlardan eve katılabilir.</p>
                </div>

                <h3>Neler yapabilirsiniz?</h3>
                <ul class="features">
                    <li>Eşyalarınızı fotoğraf ve barkod ile kaydedin</li>
                    <li>Odalar ve kategoriler oluşturun</li>
                    <li>Aile üyelerini eve davet edin</li>
                    <li>Verilerinizi JSON olarak yedekleyin</li>
                </ul>

                <p>Sorularınız için <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> adresinden bize ulaşabilirsiniz.</p>
            </div>
            <div class="footer">
                <p>© 2026 HomeInventory - Ev Envanter Yönetim Sistemi</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail({
        to: email,
        subject: '🏠 HomeInventory\'e Hoş Geldiniz!',
        html
    });
}

export async function sendHouseJoinRequestNotification({ to, requesterUsername, requestedHouseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(requestedHouseName || 'bir ev').trim();
    const safeRequesterUsername = String(requesterUsername || 'Bir kullanici').trim();

    return sendEmail({
        to,
        subject: 'HomeInventory - Yeni katilim istegi',
        html: `
            <p>Merhaba,</p>
            <p><strong>${safeRequesterUsername}</strong> kullanicisi <strong>${safeHouseName}</strong> icin katilim istegi gonderdi.</p>
            <p>Istekleri uygulama icindeki Ayarlar ekranindan yonetebilirsiniz.</p>
        `
    });
}

export async function sendHouseJoinRequestDecisionNotification({ to, status, requestedHouseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(requestedHouseName || 'ev').trim();
    const statusLabel = status === 'approved'
        ? 'onaylandi'
        : status === 'rejected'
            ? 'reddedildi'
            : 'guncellendi';

    return sendEmail({
        to,
        subject: `HomeInventory - Katilim isteginiz ${statusLabel}`,
        html: `
            <p>Merhaba,</p>
            <p><strong>${safeHouseName}</strong> icin gonderdiginiz katilim istegi <strong>${statusLabel}</strong>.</p>
            <p>Guncel durumu uygulama icinden takip edebilirsiniz.</p>
        `
    });
}

export async function sendHouseKickNotification({ to, houseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(houseName || 'ev').trim();

    return sendEmail({
        to,
        subject: 'HomeInventory - Ev erisiminiz guncellendi',
        html: `
            <p>Merhaba,</p>
            <p><strong>${safeHouseName}</strong> evindeki uyeliginiz sonlandirildi.</p>
            <p>Farkli bir eve istek gonderebilir veya yeni bir ev olusturabilirsiniz.</p>
        `
    });
}

/**
 * Şifre sıfırlama e-postası gönder
 * @param {Object} options
 * @param {string} options.email - Kullanıcı e-posta adresi
 * @param {string} options.resetUrl - Sıfırlama linki
 */
export async function sendPasswordResetEmail({ email, resetUrl }) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #ef4444, #f97316); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 Şifre Sıfırlama</h1>
            </div>
            <div class="content">
                <p>Merhaba,</p>
                <p>HomeInventory hesabınız için şifre sıfırlama talebinde bulundunuz. Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:</p>
                
                <p style="text-align: center;">
                    <a href="${resetUrl}" class="button">Şifremi Sıfırla</a>
                </p>

                <div class="warning">
                    <strong>⚠️ Önemli:</strong> Bu link 15 dakika boyunca geçerlidir. Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
                </div>

                <p>Link çalışmıyorsa, aşağıdaki adresi tarayıcınıza yapıştırın:</p>
                <p style="word-break: break-all; color: #6b7280; font-size: 12px;">${resetUrl}</p>
            </div>
            <div class="footer">
                <p>© 2026 HomeInventory - Ev Envanter Yönetim Sistemi</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail({
        to: email,
        subject: '🔐 HomeInventory Şifre Sıfırlama',
        html
    });
}

export default {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail
};
