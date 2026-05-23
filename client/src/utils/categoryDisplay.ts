import i18n from '../i18n';
import { CATEGORY_ALIAS_TO_ID, normalizeAliasText } from './defaultEntityAliases';

interface CategoryDefault {
    id: string;
    tr: string;
    fallback: string;
}

const CATEGORY_DEFAULTS: CategoryDefault[] = [
    { id: 'kitchen', tr: 'Mutfak', fallback: 'Kitchen' },
    { id: 'electronics', tr: 'Elektronik', fallback: 'Electronics' },
    { id: 'hobbies', tr: 'Hobi', fallback: 'Hobbies' },
    { id: 'furniture', tr: 'Mobilya', fallback: 'Furniture' },
    { id: 'clothing', tr: 'Giyim', fallback: 'Clothing' },
    { id: 'books', tr: 'Kitaplar', fallback: 'Books' },
    { id: 'tools', tr: 'Aletler', fallback: 'Tools' },
    { id: 'sports', tr: 'Spor', fallback: 'Sports' },
    { id: 'other', tr: 'Diğer', fallback: 'Other' }
];

const CATEGORY_LEGACY_LOOKUP = new Map<string, CategoryDefault>();

for (const category of CATEGORY_DEFAULTS) {
    CATEGORY_LEGACY_LOOKUP.set(category.tr, category);
    CATEGORY_LEGACY_LOOKUP.set(category.fallback, category);
}

function normalizeLanguageCode(language?: string): string {
    return String(language || '')
        .split('-')[0]
        .trim()
        .toLowerCase();
}

function getCategoryFallback(categoryDefault: CategoryDefault, language?: string): string {
    return normalizeLanguageCode(language) === 'tr'
        ? categoryDefault.tr
        : categoryDefault.fallback;
}

interface CategoryLike {
    name?: string | null;
}

export function getCategoryPresentation(category: CategoryLike | null | undefined, language?: string): { name: string } {
    const rawName = String(category?.name || '').trim();
    const categoryDefaultId = CATEGORY_ALIAS_TO_ID[normalizeAliasText(rawName)];
    const categoryDefault = categoryDefaultId
        ? CATEGORY_DEFAULTS.find((entry) => entry.id === categoryDefaultId)
        : CATEGORY_LEGACY_LOOKUP.get(rawName);

    if (!categoryDefault) {
        return { name: rawName };
    }

    const t = i18n.getFixedT(language || null);

    return {
        name: t(`categories.defaults.${categoryDefault.id}`, {
            defaultValue: getCategoryFallback(categoryDefault, language)
        }) as string
    };
}
