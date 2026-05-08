import 'dotenv/config';
import { loadRuntimeSecrets } from './utils/runtimeSecrets.js';

await loadRuntimeSecrets();

// --- Production startup guard ---
// Kritik secret'lar eksikse uygulamayı başlatma.
// Bu kontrol, sessiz güvenlik hatalarını (zayıf fallback key kullanımı vb.) önler.
if (process.env.NODE_ENV === 'production') {
    const requiredSecrets = [
        'JWT_SECRET',
        'APP_ENCRYPTION_KEY',
        'APP_ENCRYPTION_KEY_ID',
    ];

    const missing = requiredSecrets.filter((key) => !String(process.env[key] || '').trim());

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
