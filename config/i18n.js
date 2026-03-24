import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'development';

// RTL diller
export const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

const LOCALES_DIR = join(__dirname, '../locales');

export const SUPPORTED_LANGUAGES = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort((left, right) => left.localeCompare(right));

function normalizeLanguageCode(lang) {
    if (!lang) return 'tr';
    return lang.split('-')[0].toLowerCase();
}

function getFallbackLanguages(lang) {
    return normalizeLanguageCode(lang) === 'tr' ? ['tr', 'en'] : ['en', 'tr'];
}

// i18next başlatma fonksiyonu
export const initI18n = async () => {
    await i18next
        .use(Backend)
        .use(middleware.LanguageDetector)
        .init({
            fallbackLng: getFallbackLanguages,
            load: 'currentOnly',
            supportedLngs: SUPPORTED_LANGUAGES,
            preload: SUPPORTED_LANGUAGES,
            backend: {
                loadPath: join(LOCALES_DIR, '{{lng}}.json')
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
