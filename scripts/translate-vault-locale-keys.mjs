import fs from 'fs';
import path from 'path';
import { translate } from 'bing-translate-api';
import { translate as googleTranslate } from '@vitalets/google-translate-api';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const BASE_LANG = 'en';
const SKIP_LANGS = new Set(['en', 'tr']);
const BATCH_SEPARATOR = '<<<__HI_VAULT_SEP__>>>';
const RETRYABLE_ERROR_PATTERN = /Too Many Requests|429|ENOTFOUND|ECONNRESET|ETIMEDOUT/i;
const UNSUPPORTED_LANG_PATTERN = /not supported/i;
const MAX_BATCH_CHARS = 850;
const MAX_BATCH_ITEMS = 8;
const BATCH_DELAY_MS = 1200;
const LANGUAGE_DELAY_MS = 1800;

const TRANSLATION_LANGS = {
    no: 'nb',
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant'
};

const GOOGLE_TRANSLATION_LANGS = {
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW'
};

const MYMEMORY_TRANSLATION_LANGS = {
    jv: 'jw',
    no: 'nb',
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant'
};

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current ? current[key] : undefined), object);
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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectStringKeyPaths(object, prefix = '') {
    const keyPaths = [];

    for (const [key, value] of Object.entries(object)) {
        const keyPath = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            keyPaths.push(...collectStringKeyPaths(value, keyPath));
            continue;
        }

        if (typeof value === 'string') {
            keyPaths.push(keyPath);
        }
    }

    return keyPaths;
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

async function translateBatch(batch, targetLang) {
    const mappedTargetLang = TRANSLATION_LANGS[targetLang] || targetLang;
    const mappedGoogleTargetLang = GOOGLE_TRANSLATION_LANGS[targetLang] || targetLang;
    const mappedMyMemoryTargetLang = MYMEMORY_TRANSLATION_LANGS[targetLang] || targetLang;
    const payload = batch.map((item) => item.text).join(` ${BATCH_SEPARATOR} `);
    let lastError;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const result = await translate(payload, null, mappedTargetLang);
            const translatedValues = result.translation.split(
                new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g')
            );

            return batch.map((item, index) => ({
                keyPath: item.keyPath,
                value: translatedValues[index] || item.text
            }));
        } catch (error) {
            lastError = error;

            if (UNSUPPORTED_LANG_PATTERN.test(String(error.message || ''))) {
                try {
                    const googleResult = await googleTranslate(payload, { to: mappedGoogleTargetLang });
                    const translatedValues = googleResult.text.split(
                        new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g')
                    );

                    return batch.map((item, index) => ({
                        keyPath: item.keyPath,
                        value: translatedValues[index] || item.text
                    }));
                } catch (googleError) {
                    lastError = googleError;
                }
            }

            if (
                attempt === 4 ||
                RETRYABLE_ERROR_PATTERN.test(String(error.message || '')) ||
                UNSUPPORTED_LANG_PATTERN.test(String(error.message || ''))
            ) {
                const translatedEntries = [];

                for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
                    const item = batch[itemIndex];
                    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.text)}&langpair=en|${encodeURIComponent(mappedMyMemoryTargetLang)}`;
                    let myMemoryResponseData = null;

                    for (let myMemoryAttempt = 0; myMemoryAttempt < 4; myMemoryAttempt += 1) {
                        const response = await fetch(url);
                        if (response.ok) {
                            myMemoryResponseData = await response.json();
                            break;
                        }

                        if (response.status !== 429 && response.status < 500) {
                            throw new Error(`MyMemory request failed with status ${response.status}`);
                        }

                        if (myMemoryAttempt === 3) {
                            throw new Error(`MyMemory request failed with status ${response.status}`);
                        }

                        await delay(2500 * (myMemoryAttempt + 1));
                    }

                    const translatedText = String(myMemoryResponseData?.responseData?.translatedText || '').trim();
                    if (!translatedText) {
                        throw new Error('MyMemory returned an empty translation.');
                    }

                    translatedEntries.push({
                        keyPath: item.keyPath,
                        value: translatedText
                    });

                    if (itemIndex < batch.length - 1) {
                        await delay(250);
                    }
                }

                return translatedEntries;
            }

            if (!RETRYABLE_ERROR_PATTERN.test(String(error.message || '')) || attempt === 4) {
                throw error;
            }

            await delay(3500 * (attempt + 1));
        }
    }

    throw lastError;
}

async function translateEntries(entries, targetLang) {
    const translated = [];
    const batches = buildBatches(entries);

    for (let index = 0; index < batches.length; index += 1) {
        console.log(
            `  ${targetLang}: translating batch ${index + 1}/${batches.length} (${batches[index].length} keys)`
        );

        const batchResult = await translateBatch(batches[index], targetLang);
        translated.push(...batchResult);

        if (index < batches.length - 1) {
            await delay(BATCH_DELAY_MS);
        }
    }

    return translated;
}

function getTargetLanguages(cliLanguages) {
    if (cliLanguages.length > 0) {
        return cliLanguages;
    }

    return fs
        .readdirSync(LOCALES_DIR)
        .filter((lang) => fs.existsSync(path.join(LOCALES_DIR, lang, 'translation.json')))
        .filter((lang) => !SKIP_LANGS.has(lang))
        .sort();
}

async function processLanguage(baseTranslation, lang, keyPaths, { force = false } = {}) {
    const localePath = path.join(LOCALES_DIR, lang, 'translation.json');
    const currentTranslation = fs.existsSync(localePath)
        ? JSON.parse(fs.readFileSync(localePath, 'utf8'))
        : {};

    const entriesToTranslate = keyPaths
        .map((keyPath) => ({
            keyPath,
            text: getDeepValue(baseTranslation, keyPath)
        }))
        .filter(({ keyPath, text }) => {
            const localeValue = getDeepValue(currentTranslation, keyPath);
            return text && (
                force ||
                !localeValue ||
                localeValue === text ||
                String(localeValue).includes('HI_VAULT_SEP')
            );
        });

    if (entriesToTranslate.length === 0) {
        console.log(`Skipped ${lang}: no missing vault keys`);
        return;
    }

    console.log(`Processing ${lang}: ${entriesToTranslate.length} vault keys`);

    const translatedEntries = await translateEntries(entriesToTranslate, lang);
    for (const { keyPath, value } of translatedEntries) {
        setDeepValue(currentTranslation, keyPath, value);
    }

    fs.writeFileSync(localePath, JSON.stringify(currentTranslation, null, 4));
    console.log(`Saved ${lang}/translation.json`);
}

async function run() {
    const baseTranslation = JSON.parse(
        fs.readFileSync(path.join(LOCALES_DIR, BASE_LANG, 'translation.json'), 'utf8')
    );

    const keyPaths = [
        'navigation.personal_vault',
        ...collectStringKeyPaths(baseTranslation.vault, 'vault')
    ];

    const cliArgs = process.argv.slice(2);
    const force = cliArgs.includes('--force');
    const languages = getTargetLanguages(cliArgs.filter((arg) => arg !== '--force'));
    if (languages.length === 0) {
        console.log('No target languages found.');
        process.exit(0);
    }

    const failures = [];

    for (const lang of languages) {
        try {
            await processLanguage(baseTranslation, lang, keyPaths, { force });
        } catch (error) {
            failures.push(lang);
            console.error(`Failed ${lang}: ${error.message}`);
        }

        await delay(LANGUAGE_DELAY_MS);
    }

    if (failures.length > 0) {
        console.error(`Finished with failures: ${failures.join(', ')}`);
        process.exitCode = 1;
        return;
    }

    console.log('Vault locale translation completed successfully.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
