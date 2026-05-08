import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BRAND_HOST, BRAND_NAME, SUPPORT_EMAIL } from '../utils/branding.js';
import { formatScopedLog } from '../utils/devConsole.js';

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
    return normalizeLanguageCode(lang) === 'tr' ? ['tr', 'en'] : ['en'];
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
                escapeValue: false,
                defaultVariables: {
                    brandName: BRAND_NAME,
                    supportEmail: SUPPORT_EMAIL,
                    siteHost: BRAND_HOST
                }
            }
        });

    // Calculate unique language count (deduplicating redundant fallbacks like 'zh' and 'sr-Cyrl')
    const uniqueLangs = new Set(SUPPORTED_LANGUAGES.map(lang => {
        if (lang === 'zh') return 'zh-Hans'; // zh is a fallback for zh-Hans
        if (lang === 'sr-Cyrl') return 'sr'; // sr-Cyrl is a script variant for sr
        return lang;
    }));

    console.log(formatScopedLog('i18n', `${uniqueLangs.size} languages loaded`));
    return i18next;
};

export const i18nMiddleware = middleware.handle(i18next);
export default i18next;
