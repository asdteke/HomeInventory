import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import axios from 'axios';
import { BRAND_HOST, BRAND_NAME, BRAND_KEY, SUPPORT_EMAIL } from './constants/branding';
import { formatDateForLanguage, formatNumberForLanguage } from './utils/appFormatting';
import { resolveSupportedLanguageCode, SUPPORTED_PRODUCT_LANGUAGE_CODES } from './utils/languageSupport';

const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
const LOCALE_ASSET_VERSION = (
    typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__.trim()
        ? __APP_BUILD_ID__.trim()
        : 'dev'
);

function getStoredLanguagePreference() {
    if (typeof window === 'undefined') {
        return '';
    }

    const localStorageValue = window.localStorage?.getItem('i18next');
    if (localStorageValue) {
        return localStorageValue;
    }

    const legacyDetectorValue = window.localStorage?.getItem('i18nextLng');
    if (legacyDetectorValue) {
        return legacyDetectorValue;
    }

    const cookieMatch = document.cookie.match(/(?:^|;\s*)i18next=([^;]+)/);
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
}

function getDomainDefaultLanguage() {
    if (typeof window === 'undefined') {
        return 'en';
    }

    const host = window.location.hostname.toLowerCase();
    return host.endsWith('.tr') ? 'tr' : 'en';
}

const DEFAULT_LANGUAGE = getDomainDefaultLanguage();
const INITIAL_LANGUAGE = resolveSupportedLanguageCode(getStoredLanguagePreference() || DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);

function normalizeLanguageCode(lang) {
    return resolveSupportedLanguageCode(lang, DEFAULT_LANGUAGE);
}

function getFallbackLanguages(lang) {
    return normalizeLanguageCode(lang) === 'tr' ? ['tr', 'en'] : ['en'];
}

function applyDocumentLanguage(lang) {
    if (typeof document === 'undefined') return;

    const normalized = normalizeLanguageCode(lang);
    const isRTL = RTL_LANGUAGES.includes(normalized);

    document.documentElement.setAttribute('lang', normalized);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

function applyRequestLanguage(lang) {
    const normalized = normalizeLanguageCode(lang);
    axios.defaults.headers.common['Accept-Language'] = normalized;

    if (typeof document !== 'undefined') {
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `i18next=${encodeURIComponent(normalized)}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;
    }

    if (typeof window !== 'undefined') {
        window.localStorage?.setItem('i18next', normalized);
        window.localStorage?.setItem('i18nextLng', normalized);
    }
}

let requestLanguageInterceptorInstalled = false;

function installRequestLanguageInterceptor() {
    if (requestLanguageInterceptorInstalled) return;

    axios.interceptors.request.use((config) => {
        const normalized = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language);

        config.headers = config.headers || {};
        config.headers['Accept-Language'] = normalized;

        if (typeof config.url === 'string' && config.url.startsWith('/api/')) {
            config.params = {
                ...(config.params || {}),
                lang: config.params?.lang || normalized
            };
        }

        return config;
    });

    requestLanguageInterceptorInstalled = true;
}

i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        lng: INITIAL_LANGUAGE,
        supportedLngs: SUPPORTED_PRODUCT_LANGUAGE_CODES,
        nonExplicitSupportedLngs: false,
        lowerCaseLng: false,
        cleanCode: false,
        react: {
            useSuspense: false
        },
        fallbackLng: getFallbackLanguages,
        load: 'currentOnly',
        debug: false,
        interpolation: {
            escapeValue: false,
            defaultVariables: {
                brandName: BRAND_NAME,
                supportEmail: SUPPORT_EMAIL,
                siteHost: BRAND_HOST
            },
            format: (value, format, lng) => {
                if (value instanceof Date) {
                    if (format === 'datetime') {
                        return formatDateForLanguage(value, lng, {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        }, { fallback: 'datetime' });
                    }
                    return formatDateForLanguage(value, lng, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                }
                if (typeof value === 'number') {
                    if (format === 'currency') {
                        return formatNumberForLanguage(value, lng, { style: 'currency', currency: 'TRY' });
                    }
                    return formatNumberForLanguage(value, lng);
                }
                return value;
            }
        },
        detection: {
            order: ['localStorage', 'cookie', 'navigator'],
            caches: ['localStorage', 'cookie'],
            lookupLocalStorage: 'i18next',
            lookupCookie: 'i18next',
            excludeCacheFor: ['cimode'],
            convertDetectedLanguage: (lang) => lang
        },
        backend: {
            // Normalize script/region codes before loading locale assets so folders like zh-Hans
            // and sr-Cyrl resolve correctly instead of silently falling back to English.
            loadPath: (languages) => {
                const requested = Array.isArray(languages) ? languages[0] : languages;
                const normalized = normalizeLanguageCode(requested);
                if (BRAND_KEY !== 'homeinventory') {
                    return `/brand-local/${encodeURIComponent(BRAND_KEY)}/locales/${encodeURIComponent(normalized)}/translation.json?v=${encodeURIComponent(LOCALE_ASSET_VERSION)}`;
                }
                return `/locales/${encodeURIComponent(normalized)}/translation.json?v=${encodeURIComponent(LOCALE_ASSET_VERSION)}`;
            },
            request: async (options, url, payload, callback) => {
                // If it is a custom brand request, try loading from brand-local first.
                // If that fails (e.g. 404 or network error), safely fall back to the baseline locales path.
                if (url.includes('/brand-local/')) {
                    try {
                        const res = await axios.get(url, { validateStatus: (status) => status === 200 });
                        callback(null, { status: 200, data: res.data });
                        return;
                    } catch (err) {
                        console.warn(`[i18n] Brand-local assets failed to load from ${url}. Falling back to baseline locale.`, err.message);
                        const fallbackUrl = url.replace(/\/brand-local\/[^/]+/, '');
                        try {
                            const res = await axios.get(fallbackUrl);
                            callback(null, { status: 200, data: res.data });
                            return;
                        } catch (fallbackErr) {
                            callback(fallbackErr, null);
                            return;
                        }
                    }
                }
                // Standard baseline loading
                try {
                    const res = await axios.get(url);
                    callback(null, { status: 200, data: res.data });
                } catch (err) {
                    callback(err, null);
                }
            }
        }
    });

if (typeof document !== 'undefined') {
    document.title = BRAND_NAME;
}

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language);
applyRequestLanguage(i18n.resolvedLanguage || i18n.language);
installRequestLanguageInterceptor();
i18n.on('languageChanged', applyDocumentLanguage);
i18n.on('languageChanged', applyRequestLanguage);

export default i18n;
