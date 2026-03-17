import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'development';

// RTL diller
export const RTL_LANGUAGES = ['ar'];

// Uygulamada aktif 5 dil
export const SUPPORTED_LANGUAGES = ['tr', 'en', 'es', 'de', 'ar'];

// i18next başlatma fonksiyonu
export const initI18n = async () => {
    await i18next
        .use(Backend)
        .use(middleware.LanguageDetector)
        .init({
            fallbackLng: 'tr',
            supportedLngs: SUPPORTED_LANGUAGES,
            preload: SUPPORTED_LANGUAGES,
            backend: {
                loadPath: join(__dirname, '../locales/{{lng}}.json')
            },
            detection: {
                order: ['querystring', 'cookie', 'header'],
                lookupQuerystring: 'lang',
                lookupCookie: 'i18next',
                lookupHeader: 'accept-language',
                caches: ['cookie'],
                cookieSameSite: 'strict',
                cookieSecure: NODE_ENV === 'production',
                cookieHttpOnly: true,
                cookiePath: '/'
            },
            interpolation: {
                escapeValue: false
            }
        });

    console.log('✅ i18n initialized with', SUPPORTED_LANGUAGES.length, 'languages');
    return i18next;
};

export const i18nMiddleware = middleware.handle(i18next);
export default i18next;
