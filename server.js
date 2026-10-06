import 'dotenv/config';
import { loadRuntimeSecrets } from './utils/runtimeSecrets.js';
import { getEnvOrSecret } from './utils/secrets.js';

await loadRuntimeSecrets();

// Public v2 release line startup guard.

// --- Production startup guard ---
// Kritik secret'lar eksikse uygulamayı başlatma.
// Bu kontrol, sessiz güvenlik hatalarını (zayıf fallback key kullanımı vb.) önler.
if (process.env.NODE_ENV === 'production') {
    // Docker secrets (/run/secrets/<name>) count as configured, matching how
    // auth.js and utils/encryption.js read these values.
    const requiredSecrets = [
        ['JWT_SECRET', 'jwt_secret'],
        ['APP_ENCRYPTION_KEY', 'app_encryption_key'],
        ['APP_ENCRYPTION_KEY_ID', 'app_encryption_key_id'],
    ];

    const missing = requiredSecrets
        .filter(([key, secretName]) => !String(getEnvOrSecret(key, secretName) || '').trim())
        .map(([key]) => key);

    if (missing.length > 0) {
        console.error(
            `[Startup] HATA: Production ortamında zorunlu environment variable'lar eksik: ${missing.join(', ')}\n` +
            '[Startup] Uygulama başlatılmıyor. Lütfen tüm zorunlu secret\'ları yapılandırın.'
        );
        process.exit(1);
    }
}
// ---------------------------------

await import('./app.js');
