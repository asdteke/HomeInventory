import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const SUPPORTED_LANGUAGES = ['tr', 'en', 'es', 'de', 'ar'];
const RTL_LANGUAGES = ['ar'];

function normalizeLanguageCode(lang) {
    if (!lang) return 'tr';
    return lang.split('-')[0].toLowerCase();
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
        fallbackLng: 'tr',
        supportedLngs: SUPPORTED_LANGUAGES,
        nonExplicitSupportedLngs: true,
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
            caches: ['localStorage']
        },
        backend: {
            loadPath: '/locales/{{lng}}/translation.json'
        }
    });

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
