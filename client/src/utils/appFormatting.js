const DEFAULT_FORMATTING_LANGUAGE = 'en';

function padNumber(value) {
    return String(value).padStart(2, '0');
}

function formatIsoFallback(date, includeTime = false) {
    const year = date.getUTCFullYear();
    const month = padNumber(date.getUTCMonth() + 1);
    const day = padNumber(date.getUTCDate());

    if (!includeTime) {
        return `${year}-${month}-${day}`;
    }

    const hours = padNumber(date.getUTCHours());
    const minutes = padNumber(date.getUTCMinutes());
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function resolveFormattingLanguage(language) {
    const normalized = String(language || '').trim();
    const candidates = normalized
        ? [normalized, normalized.split('-')[0]].filter(Boolean)
        : [];

    const [supportedLocale] = Intl.DateTimeFormat.supportedLocalesOf(candidates);
    return supportedLocale || '';
}

export function formatDateForLanguage(date, language, options, { fallback = 'date' } = {}) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    const locale = resolveFormattingLanguage(language);
    if (locale) {
        return new Intl.DateTimeFormat(locale, options).format(date);
    }

    return formatIsoFallback(date, fallback === 'datetime');
}

export function formatNumberForLanguage(value, language, options) {
    const locale = resolveFormattingLanguage(language) || DEFAULT_FORMATTING_LANGUAGE;
    return new Intl.NumberFormat(locale, options).format(value);
}
