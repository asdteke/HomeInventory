import fs from 'fs';
import path from 'path';
import { translate as bingTranslate } from 'bing-translate-api';
import { translate as googleTranslate } from '@vitalets/google-translate-api';

const ROOT = process.cwd();
const BASE_LANG = 'en';
const BATCH_SEPARATOR = '<<<__HI_ADMIN_OVERVIEW_SEP__>>>';
const MAX_BATCH_ITEMS = 8;
const MAX_BATCH_CHARS = 850;

const LOCALE_ROOTS = [
    path.join(ROOT, 'client', 'public', 'locales'),
    path.join(ROOT, 'client', 'src', 'locales')
];

const BING_LANG_MAP = {
    no: 'nb',
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant'
};

const GOOGLE_LANG_MAP = {
    no: 'nb',
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW'
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), object);
}

function setDeepValue(object, keyPath, value) {
    const parts = keyPath.split('.');
    let current = object;

    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    current[parts.at(-1)] = value;
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

function protectPlaceholders(text) {
    const placeholders = [];
    const safe = String(text).replace(/\{\{[^}]+\}\}|<\d+>|<\/\d+>/g, (match) => {
        const token = `__HI_PH_${placeholders.length}__`;
        placeholders.push([token, match]);
        return token;
    });

    return {
        safe,
        restore(value) {
            let result = String(value);
            for (const [token, original] of placeholders) {
                result = result.replaceAll(token, original);
            }
            return result;
        }
    };
}

function buildBatches(entries) {
    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const entry of entries) {
        const nextChars = currentChars + entry.text.length + BATCH_SEPARATOR.length + 4;
        const shouldFlush =
            currentBatch.length >= MAX_BATCH_ITEMS ||
            (currentBatch.length > 0 && nextChars > MAX_BATCH_CHARS);

        if (shouldFlush) {
            batches.push(currentBatch);
            currentBatch = [];
            currentChars = 0;
        }

        currentBatch.push(entry);
        currentChars += entry.text.length + BATCH_SEPARATOR.length + 4;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateBatch(batch, targetLang) {
    const bingTarget = BING_LANG_MAP[targetLang] || targetLang;
    const googleTarget = GOOGLE_LANG_MAP[targetLang] || targetLang;
    const protectedEntries = batch.map((entry) => protectPlaceholders(entry.text));
    const payload = protectedEntries.map((entry) => entry.safe).join(` ${BATCH_SEPARATOR} `);
    let lastError;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const result = await bingTranslate(payload, null, bingTarget);
            const translatedValues = String(result.translation || '').split(
                new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g')
            );

            return batch.map((entry, index) => ({
                keyPath: entry.keyPath,
                value: protectedEntries[index].restore(translatedValues[index] || entry.text)
            }));
        } catch (error) {
            lastError = error;

            try {
                const result = await googleTranslate(payload, { to: googleTarget });
                const translatedValues = String(result.text || '').split(
                    new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g')
                );

                return batch.map((entry, index) => ({
                    keyPath: entry.keyPath,
                    value: protectedEntries[index].restore(translatedValues[index] || entry.text)
                }));
            } catch (googleError) {
                lastError = googleError;
            }

            if (attempt === 3) {
                break;
            }

            await delay(2500 * (attempt + 1));
        }
    }

    return batch.map((entry, index) => ({
        keyPath: entry.keyPath,
        value: protectedEntries[index].restore(entry.text)
    }));
}

async function translateEntries(entries, targetLang) {
    const translated = [];
    const batches = buildBatches(entries);

    for (let index = 0; index < batches.length; index += 1) {
        console.log(`  ${targetLang}: translating batch ${index + 1}/${batches.length} (${batches[index].length} keys)`);
        const batchResult = await translateBatch(batches[index], targetLang);
        translated.push(...batchResult);

        if (index < batches.length - 1) {
            await delay(900);
        }
    }

    return translated;
}

function getLocaleRoots() {
    return LOCALE_ROOTS.filter((root) => fs.existsSync(root));
}

function getLanguageDirs() {
    const langs = new Set();

    for (const root of getLocaleRoots()) {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const localeFile = path.join(root, entry.name, 'translation.json');
            if (fs.existsSync(localeFile)) {
                langs.add(entry.name);
            }
        }
    }

    langs.delete(BASE_LANG);
    return [...langs].sort();
}

async function processLanguageOnRoot(rootDir, baseTranslation, lang, keyPaths) {
    const localePath = path.join(rootDir, lang, 'translation.json');
    if (!fs.existsSync(localePath)) {
        return false;
    }

    const currentTranslation = readJson(localePath);
    const entriesToTranslate = keyPaths
        .map((keyPath) => ({
            keyPath,
            text: getDeepValue(baseTranslation, keyPath)
        }))
        .filter(({ keyPath, text }) => {
            const localeValue = getDeepValue(currentTranslation, keyPath);
            return (
                text &&
                (
                    !localeValue ||
                    localeValue === text ||
                    String(localeValue).includes('HI_ADMIN_OVERVIEW_SEP') ||
                    String(localeValue).includes('HI_MISSING_SEP')
                )
            );
        });

    if (entriesToTranslate.length === 0) {
        return false;
    }

    console.log(`Processing ${path.basename(rootDir)}/${lang}: ${entriesToTranslate.length} missing keys`);

    const translated = await translateEntries(entriesToTranslate, lang);
    for (const { keyPath, value } of translated) {
        setDeepValue(currentTranslation, keyPath, value);
    }

    writeJson(localePath, currentTranslation);
    return true;
}

async function main() {
    const basePath = path.join(LOCALE_ROOTS[0], BASE_LANG, 'translation.json');
    const baseTranslation = readJson(basePath);
    const keyPaths = collectStringKeyPaths(baseTranslation.admin?.overview || {}, 'admin.overview');
    const langs = getLanguageDirs();

    let updatedCount = 0;

    for (const lang of langs) {
        for (const rootDir of getLocaleRoots()) {
            try {
                const changed = await processLanguageOnRoot(rootDir, baseTranslation, lang, keyPaths);
                if (changed) {
                    updatedCount += 1;
                }
            } catch (error) {
                console.error(`Failed ${path.basename(rootDir)}/${lang}:`, error.message);
            }
        }
    }

    console.log(`Admin overview translations repaired in ${updatedCount} file(s).`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
