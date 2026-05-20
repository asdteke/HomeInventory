/**
 * Determines if a translation key path should be protected from automatic translation/overwrite.
 * @param {string} key
 * @returns {boolean}
 */
export function isProtectedTranslationKey(key) {
    const prefixes = (process.env.PROTECTED_TRANSLATION_KEY_PREFIXES || '')
        .split(',')
        .map((prefix) => prefix.trim())
        .filter(Boolean);

    return prefixes.some((prefix) => key.startsWith(prefix));
}
