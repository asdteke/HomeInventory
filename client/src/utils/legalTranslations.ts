const DEFAULT_LANGUAGE = 'en';

type LegalValidator = (value: any) => boolean;

const LEGAL_LONGFORM_VALIDATORS: Record<string, LegalValidator> = {
    'legal.privacy_policy_content': (value: any) => {
        if (typeof value !== 'string') {
            return false;
        }

        const isCJK = /[\u3000-\u303F\u4E00-\u9FFF\u3400-\u4DBF\uAC00-\uD7A3\u3040-\u309F\u30A0-\u30FF]/.test(value);
        const minLength = isCJK ? 400 : 1200;

        return value.trim().length >= minLength && (value.match(/^## /gm) || []).length >= 5;
    },
    'legal.terms_of_service_content': (value: any) => {
        if (typeof value !== 'string') {
            return false;
        }

        const isCJK = /[\u3000-\u303F\u4E00-\u9FFF\u3400-\u4DBF\uAC00-\uD7A3\u3040-\u309F\u30A0-\u30FF]/.test(value);
        const minLength = isCJK ? 200 : 800;

        return value.trim().length >= minLength && (value.match(/^\d+\./gm) || []).length >= 5;
    }
};

function normalizeLanguage(language: string | null | undefined): string {
    const value = String(language || '').trim();
    return value || DEFAULT_LANGUAGE;
}

function getTranslationValue(i18n: any, language: string, key: string): any {
    if (typeof i18n?.getResource === 'function') {
        return i18n.getResource(language, 'translation', key);
    }

    return undefined;
}

function hasRequiredKeysForLanguage(i18n: any, language: string, requiredKeys: string[]): boolean {
    return requiredKeys.every((key) => {
        const exists = i18n.exists(key, {
            lng: language,
            fallbackLng: false
        });

        if (!exists) {
            return false;
        }

        const validator = LEGAL_LONGFORM_VALIDATORS[key];
        if (!validator) {
            return true;
        }

        return validator(getTranslationValue(i18n, language, key));
    });
}

export function resolveCompleteTranslationLanguage(i18n: any, requiredKeys: string[], fallbackLanguage = DEFAULT_LANGUAGE): string {
    const activeLanguage = normalizeLanguage(i18n?.resolvedLanguage || i18n?.language);
    const hasRequiredKeys = hasRequiredKeysForLanguage(i18n, activeLanguage, requiredKeys);

    return hasRequiredKeys ? activeLanguage : fallbackLanguage;
}

export function resolveVerifiedLegalTranslationLanguage(i18n: any, requiredKeys: string[], fallbackLanguage = DEFAULT_LANGUAGE): string {
    const activeLanguage = normalizeLanguage(i18n?.resolvedLanguage || i18n?.language);
    const normalizedFallbackLanguage = normalizeLanguage(fallbackLanguage);
    const activeBaseLanguage = activeLanguage.split('-')[0];
    const fallbackBaseLanguage = normalizedFallbackLanguage.split('-')[0];
    const candidates = [
        activeLanguage,
        activeBaseLanguage,
        normalizedFallbackLanguage,
        fallbackBaseLanguage,
        'tr',
        'en',
        DEFAULT_LANGUAGE
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        if (hasRequiredKeysForLanguage(i18n, candidate, requiredKeys)) {
            return candidate;
        }
    }

    return DEFAULT_LANGUAGE;
}
