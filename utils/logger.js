/**
 * KVKK Uyumlu Hata Logger
 * 
 * Özellikler:
 * - Sadece hata logları (500, 404, vb.)
 * - Anonimleştirme (şifre, email, house_key maskelenir)
 * - 7 gün log rotation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log dosyası yolu
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_RETENTION_DAYS = 7;

// Log klasörünü oluştur
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Hassas verileri anonimleştir
 */
function anonymize(data) {
    if (!data) return data;

    // String ise
    if (typeof data === 'string') {
        return data;
    }

    // Object ise kopyasını al
    const sanitized = { ...data };

    // Hassas alanları maskele
    const sensitiveFields = [
        'password', 'şifre', 'sifre',
        'email', 'e-posta', 'eposta', 'mail',
        'house_key', 'houseKey', 'ev_anahtari',
        'token', 'accessToken', 'refreshToken',
        'authorization', 'cookie', 'session'
    ];

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[MASKED]';
        }
    }

    // Body içinde de kontrol et
    if (sanitized.body) {
        sanitized.body = anonymize(sanitized.body);
    }

    // Headers içinde de kontrol et
    if (sanitized.headers) {
        const safeHeaders = { ...sanitized.headers };
        if (safeHeaders.authorization) safeHeaders.authorization = '[MASKED]';
        if (safeHeaders.cookie) safeHeaders.cookie = '[MASKED]';
        sanitized.headers = safeHeaders;
    }

    return sanitized;
}

/**
 * Bugünün log dosyası adı
 */
function getLogFileName() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `error-${today}.log`);
}

/**
 * Hata logu yaz
 */
function logError(context, error, request = null) {
    const timestamp = new Date().toISOString();

    const logEntry = {
        timestamp,
        context,
        error: {
            message: error.message || String(error),
            stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : null,
            code: error.code || null,
            status: error.status || error.statusCode || null
        }
    };

    // Request bilgisi varsa anonimleştirerek ekle
    if (request) {
        logEntry.request = {
            method: request.method,
            url: request.originalUrl || request.url,
            ip: anonymizeIP(request.ip || request.connection?.remoteAddress),
            userAgent: request.get?.('user-agent')?.substring(0, 100) || 'unknown',
            // Body'yi anonimleştir
            body: request.body ? anonymize(request.body) : null
        };
    }

    // Log dosyasına yaz
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
        fs.appendFileSync(getLogFileName(), logLine);
    } catch (writeErr) {
        console.error('[Logger] Log yazılamadı:', writeErr.message);
    }

    // Console'a da yaz (development için)
    console.error(`[${timestamp}] [${context}] ${error.message || error}`);
}

/**
 * IP adresini anonimleştir (son oktet maskelenir)
 */
function anonymizeIP(ip) {
    if (!ip) return 'unknown';

    // IPv4
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
        }
    }

    // IPv6 veya diğer
    return ip.substring(0, ip.length / 2) + '***';
}

/**
 * API hata logla (sadece 4xx ve 5xx)
 */
function logAPIError(statusCode, message, request = null) {
    if (statusCode >= 400) {
        logError(`API-${statusCode}`, { message, status: statusCode }, request);
    }
}

/**
 * 7 günden eski logları temizle
 */
function cleanOldLogs() {
    const now = Date.now();
    const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000; // 7 gün in ms

    try {
        const files = fs.readdirSync(LOG_DIR);

        for (const file of files) {
            if (!file.endsWith('.log')) continue;

            const filePath = path.join(LOG_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`[Logger] Eski log silindi: ${file}`);
            }
        }
    } catch (err) {
        console.error('[Logger] Log temizleme hatası:', err.message);
    }
}

/**
 * Express error middleware
 */
function errorMiddleware(err, req, res, next) {
    const statusCode = err.status || err.statusCode || 500;

    // Hatayı logla
    logError('EXPRESS', err, req);

    // Kullanıcıya güvenli hata mesajı gönder
    res.status(statusCode).json({
        error: statusCode >= 500 ? 'Sunucu hatası oluştu' : (err.message || 'Bir hata oluştu')
    });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
    logAPIError(404, `Route bulunamadı: ${req.method} ${req.originalUrl}`, req);
    res.status(404).json({ error: 'Sayfa bulunamadı' });
}

// Uygulama başladığında eski logları temizle
cleanOldLogs();

// Her gün gece yarısı log temizliği yap
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

export {
    logError,
    logAPIError,
    errorMiddleware,
    notFoundHandler,
    cleanOldLogs
};
