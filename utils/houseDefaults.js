import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOCALES_DIR = resolve(__dirname, '../client/public/locales');
const LOCALE_CACHE = new Map();
const AVAILABLE_LOCALE_CODES = new Set(
    readdirSync(LOCALES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
);
const QUOTED_TEXT_PATTERN = /["“”«»„‟'‘’「」『』]([^"“”«»„‟'‘’「」『』]+)["“”«»„‟'‘’「」『』]/u;

function normalizeSeedLanguage(value) {
    const normalized = String(value || '')
        .split(',')[0]
        .trim()
        .split('-')[0]
        .toLowerCase();

    return normalized === 'tr' ? 'tr' : 'en';
}

function normalizeLocaleLanguage(value) {
    const rawLanguage = String(value || '')
        .split(',')[0]
        .trim();

    if (!rawLanguage) {
        return 'en';
    }

    const exactCandidates = [
        rawLanguage,
        rawLanguage.trim(),
        rawLanguage.toLowerCase()
    ];

    for (const candidate of exactCandidates) {
        if (AVAILABLE_LOCALE_CODES.has(candidate)) {
            return candidate;
        }
    }

    const baseLanguage = rawLanguage.split('-')[0].toLowerCase();
    return AVAILABLE_LOCALE_CODES.has(baseLanguage) ? baseLanguage : 'en';
}

const CATEGORY_SEEDS = {
    tr: [
        ['Mutfak', '🍳', '#ef4444'],
        ['Elektronik', '💻', '#3b82f6'],
        ['Hobi', '🎨', '#8b5cf6'],
        ['Mobilya', '🛋️', '#f59e0b'],
        ['Giyim', '👕', '#ec4899'],
        ['Kitaplar', '📚', '#10b981'],
        ['Aletler', '🔧', '#6b7280'],
        ['Spor', '⚽', '#14b8a6'],
        ['Diğer', '📦', '#64748b']
    ],
    en: [
        ['Kitchen', '🍳', '#ef4444'],
        ['Electronics', '💻', '#3b82f6'],
        ['Hobbies', '🎨', '#8b5cf6'],
        ['Furniture', '🛋️', '#f59e0b'],
        ['Clothing', '👕', '#ec4899'],
        ['Books', '📚', '#10b981'],
        ['Tools', '🔧', '#6b7280'],
        ['Sports', '⚽', '#14b8a6'],
        ['Other', '📦', '#64748b']
    ]
};

const ROOM_SEEDS = {
    tr: [
        ['Oturma Odası', 'Ana yaşam alanı'],
        ['Yatak Odası', 'Uyku ve dinlenme alanı'],
        ['Mutfak', 'Yemek hazırlama alanı'],
        ['Banyo', 'Temizlik ve bakım alanı'],
        ['Çalışma Odası', 'Ofis ve çalışma alanı'],
        ['Çocuk Odası', 'Çocuklar için oda'],
        ['Garaj', 'Araç ve depolama alanı'],
        ['Balkon', 'Dış mekan alanı'],
        ['Depo', 'Genel depolama alanı']
    ],
    en: [
        ['Living Room', 'Main everyday living area'],
        ['Bedroom', 'Sleeping and rest area'],
        ['Kitchen', 'Food preparation area'],
        ['Bathroom', 'Cleaning and care area'],
        ['Office', 'Focused work area'],
        ['Kids Room', 'Children’s room'],
        ['Garage', 'Vehicle and storage area'],
        ['Balcony', 'Outdoor extension area'],
        ['Storage', 'General storage area']
    ]
};

function getLocaleDictionary(language) {
    const normalizedLanguage = normalizeLocaleLanguage(language);
    const cached = LOCALE_CACHE.get(normalizedLanguage);
    if (cached) {
        return cached;
    }

    try {
        const localePath = resolve(LOCALES_DIR, normalizedLanguage, 'translation.json');
        const parsed = JSON.parse(readFileSync(localePath, 'utf8'));
        LOCALE_CACHE.set(normalizedLanguage, parsed);
        return parsed;
    } catch {
        return {};
    }
}

function getNestedLocaleString(language, path) {
    const value = path.reduce((current, segment) => current?.[segment], getLocaleDictionary(language));
    return typeof value === 'string' ? value : '';
}

function extractQuotedText(value) {
    const match = String(value || '').match(QUOTED_TEXT_PATTERN);
    return match?.[1]?.trim() || '';
}

function getLocalizedDefaultHouseName(language, translationPath, fallback) {
    const extracted = extractQuotedText(getNestedLocaleString(language, translationPath));
    return extracted || fallback;
}

export function resolveSeedLanguage(req) {
    return normalizeLocaleLanguage(
        req?.resolvedLanguage ||
        req?.language ||
        req?.query?.lang ||
        req?.cookies?.i18next ||
        req?.headers?.['accept-language']
    );
}

export function getDefaultCategorySeeds(language) {
    return CATEGORY_SEEDS[normalizeSeedLanguage(language)];
}

export function getDefaultRoomSeeds(language) {
    return ROOM_SEEDS[normalizeSeedLanguage(language)];
}

export function getDefaultOwnedHouseName(language) {
    const fallback = normalizeSeedLanguage(language) === 'tr' ? 'Evim' : 'My Home';
    return getLocalizedDefaultHouseName(language, ['google_house_select', 'house_name_hint'], fallback);
}

export function getDefaultNewHouseName(language) {
    const fallback = normalizeSeedLanguage(language) === 'tr' ? 'Yeni Evim' : 'New Home';
    return getLocalizedDefaultHouseName(language, ['settings', 'modals', 'create_house', 'name_help'], fallback);
}
