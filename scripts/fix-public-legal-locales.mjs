import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const EN_PATH = path.join(LOCALES_DIR, 'en', 'translation.json');
const LEGAL_NAMESPACE = 'legal';
const PLACEHOLDER_RE = /\{\{[^}]+\}\}|<\d+>|<\/\d+>/g;
const CJK_RE = /[\u3000-\u303F\u4E00-\u9FFF\u3400-\u4DBF\uAC00-\uD7A3\u3040-\u309F\u30A0-\u30FF]/;
const BATCH_SEPARATOR = '<<<__HI_LEGAL_BATCH_SEP__>>>';

const TARGET_LANG_MAP = {
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW'
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current ? current[key] : undefined), object);
}

function setDeepValue(object, keyPath, value) {
    const keys = keyPath.split('.');
    let current = object;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys.at(-1)] = value;
}

function collectStringKeyPaths(object, prefix = '') {
    const paths = [];
    for (const [key, value] of Object.entries(object || {})) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            paths.push(...collectStringKeyPaths(value, fullPath));
        } else if (typeof value === 'string') {
            paths.push(fullPath);
        }
    }
    return paths;
}

function isValidLegalLongform(keyPath, value) {
    if (typeof value !== 'string') return false;

    if (keyPath === 'legal.privacy_policy_content') {
        return isValidPrivacyContent(value);
    }

    if (keyPath === 'legal.terms_of_service_content') {
        return isValidTermsContent(value);
    }

    return true;
}

function isValidPrivacyContent(value) {
    const minLength = CJK_RE.test(value) ? 400 : 1200;
    return value.trim().length >= minLength && (value.match(/^## /gm) || []).length >= 5;
}

function isValidTermsContent(value) {
    const minLength = CJK_RE.test(value) ? 200 : 800;
    return value.trim().length >= minLength && (value.match(/^\d+\./gm) || []).length >= 5;
}

function protectPlaceholders(text) {
    const placeholders = [];
    const safe = text.replace(PLACEHOLDER_RE, (match) => {
        const token = `__HI_PH_${placeholders.length}__`;
        placeholders.push([token, match]);
        return token;
    });

    return {
        safe,
        restore(value) {
            let result = value;
            for (const [token, original] of placeholders) {
                result = result.replaceAll(token, original);
            }
            return result;
        }
    };
}

async function translateBatch(texts, targetLang) {
    if (texts.length === 0) {
        return [];
    }

    const mappedLang = TARGET_LANG_MAP[targetLang] || targetLang;
    const protectedEntries = texts.map((text) => protectPlaceholders(text));
    const payload = protectedEntries.map((entry) => entry.safe).join(` ${BATCH_SEPARATOR} `);
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'en');
    url.searchParams.set('tl', mappedLang);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', payload);

    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const translatedPayload = Array.isArray(data?.[0])
                ? data[0].map((part) => part?.[0] || '').join('')
                : '';

            const translatedTexts = translatedPayload.split(
                new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g')
            );

            return texts.map((originalText, index) => {
                const translated = String(translatedTexts[index] || '').trim();
                const restored = protectedEntries[index].restore(translated);
                return restored || originalText;
            });
        } catch (error) {
            if (attempt === 3) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
    }

    return texts;
}

async function repairLegalNamespace(localeContent, sourceContent, targetLang) {
    const sourceLegalPaths = collectStringKeyPaths(sourceContent[LEGAL_NAMESPACE], LEGAL_NAMESPACE);
    const longformUpdates = [];
    const regularUpdates = [];

    for (const keyPath of sourceLegalPaths) {
        const sourceValue = getDeepValue(sourceContent, keyPath);
        const targetValue = getDeepValue(localeContent, keyPath);
        const needsTranslation =
            !targetValue ||
            targetValue === sourceValue ||
            !isValidLegalLongform(keyPath, targetValue);

        if (!needsTranslation) {
            continue;
        }

        if (keyPath === 'legal.privacy_policy_content' || keyPath === 'legal.terms_of_service_content') {
            longformUpdates.push({ keyPath, sourceValue });
        } else {
            regularUpdates.push({ keyPath, sourceValue });
        }
    }

    if (longformUpdates.length === 0 && regularUpdates.length === 0) {
        return false;
    }

    for (const entry of longformUpdates) {
        const [translated] = await translateBatch([entry.sourceValue], targetLang);
        setDeepValue(localeContent, entry.keyPath, translated);
    }

    const REGULAR_BATCH_SIZE = 10;
    for (let index = 0; index < regularUpdates.length; index += REGULAR_BATCH_SIZE) {
        const batch = regularUpdates.slice(index, index + REGULAR_BATCH_SIZE);
        const translatedBatch = await translateBatch(
            batch.map((entry) => entry.sourceValue),
            targetLang
        );

        translatedBatch.forEach((translated, batchIndex) => {
            setDeepValue(localeContent, batch[batchIndex].keyPath, translated);
        });
    }

    return true;
}

async function main() {
    const sourceContent = readJson(EN_PATH);
    const cliTargets = process.argv.slice(2).filter((arg) => arg !== '--force');
    const localeDirs = (cliTargets.length > 0
        ? cliTargets
        : fs
        .readdirSync(LOCALES_DIR)
        .filter((entry) => fs.existsSync(path.join(LOCALES_DIR, entry, 'translation.json')))
        .sort());

    let updatedCount = 0;

    for (const lang of localeDirs) {
        if (lang === 'en') {
            continue;
        }

        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
        const localeContent = readJson(filePath);
        const changed = await repairLegalNamespace(localeContent, sourceContent, lang);

        if (changed) {
            writeJson(filePath, localeContent);
            updatedCount += 1;
            console.log(`Repaired legal namespace for ${lang}`);
        }
    }

    console.log(`Total legal locales repaired: ${updatedCount}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
