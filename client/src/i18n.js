import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
const UNAVAILABLE_LANGUAGE_CODES = new Set(['yi', 'tg']);

function normalizeLanguageCode(lang) {
    if (!lang) return 'tr';
    return lang.split('-')[0].toLowerCase();
}

function getFallbackLanguages(lang) {
    return normalizeLanguageCode(lang) === 'tr' ? ['tr', 'en'] : ['en', 'tr'];
}

function applyDocumentLanguage(lang) {
    if (typeof document === 'undefined') return;

    const normalized = normalizeLanguageCode(lang);
    const isRTL = RTL_LANGUAGES.includes(normalized);

    document.documentElement.setAttribute('lang', normalized);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: getFallbackLanguages,
        load: 'currentOnly',
        debug: false,
        interpolation: {
            escapeValue: false,
            format: (value, format, lng) => {
                if (value instanceof Date) {
                    if (format === 'datetime') {
                        return new Intl.DateTimeFormat(lng, {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        }).format(value);
                    }
                    return new Intl.DateTimeFormat(lng, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }).format(value);
                }
                if (typeof value === 'number') {
                    if (format === 'currency') {
                        return new Intl.NumberFormat(lng, { style: 'currency', currency: 'TRY' }).format(value);
                    }
                    return new Intl.NumberFormat(lng).format(value);
                }
                return value;
            }
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            convertDetectedLanguage: (lang) => (
                UNAVAILABLE_LANGUAGE_CODES.has(normalizeLanguageCode(lang)) ? 'en' : lang
            )
        },
        backend: {
            loadPath: '/locales/{{lng}}/translation.json?v=' + new Date().getTime()
        }
    });

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
