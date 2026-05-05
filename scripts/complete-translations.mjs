import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { translateWithAzure } from './azure-translator.mjs';
import { translate as googleTranslate } from '@vitalets/google-translate-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_LOCALES_DIR = path.join(__dirname, '..', 'locales');
const CLIENT_LOCALES_DIR = path.join(__dirname, '..', 'client', 'public', 'locales');
const BASE_LANG = 'en';
const MYMEMORY_BATCH_SEPARATOR = 'QX7QX7QX7QX7';
const MYMEMORY_LONG_TEXT_THRESHOLD = 220;

const SKIP_LANGS = new Set(['en', 'brand']);
const BATCH_SIZE = 8; // Smaller batches improve translation quality and reliability
const DELAY_MS = 1500; // Increased delay for stability
const RATE_LIMIT_WAIT_MS = 30000; // Wait 30s on rate limit
const USE_AZURE_TRANSLATOR = process.env.USE_AZURE_TRANSLATOR === '1' && Boolean(process.env.AZURE_TRANSLATOR_KEY);
const AZURE_LANG_MAP = {
    'sr': 'sr-Cyrl',
    'nb': 'nb',
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant',
    'jv': 'jw' // Javanese might be different
};

// Mapping for Google (if needed)
const GOOGLE_LANG_MAP = {
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    'nb': 'no'
};

const MYMEMORY_LANG_MAP = {
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant',
    'nb': 'nb',
    'jv': 'jw'
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildMyMemoryBatches(texts) {
    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const text of texts) {
        const nextChars = currentChars + text.length + MYMEMORY_BATCH_SEPARATOR.length + 4;
        const shouldFlush =
            currentBatch.length >= 8 ||
            (currentBatch.length > 0 && nextChars > 850);

        if (shouldFlush) {
            batches.push(currentBatch);
            currentBatch = [];
            currentChars = 0;
        }

        currentBatch.push(text);
        currentChars += text.length + MYMEMORY_BATCH_SEPARATOR.length + 4;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

async function translateMyMemorySingle(text, targetLang) {
    const myMemoryTarget = MYMEMORY_LANG_MAP[targetLang] || targetLang;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(myMemoryTarget)}`;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            const translatedText = String(data?.responseData?.translatedText || '').trim();

            if (!translatedText) {
                throw new Error('MyMemory returned an empty translation.');
            }

            return translatedText;
        }

        if (response.status !== 429 && response.status < 500) {
            throw new Error(`MyMemory request failed with status ${response.status}`);
        }

        if (attempt === 3) {
            throw new Error(`MyMemory request failed with status ${response.status}`);
        }

        await delay(2500 * (attempt + 1));
    }

    throw new Error('MyMemory translation failed.');
}

async function translateMyMemoryBatch(texts, targetLang) {
    const translatedTexts = [];
    const batches = buildMyMemoryBatches(texts);

    for (const batch of batches) {
        const payload = batch.join(` ${MYMEMORY_BATCH_SEPARATOR} `);
        const translatedPayload = await translateMyMemorySingle(payload, targetLang);
        const translatedValues = translatedPayload.split(
            new RegExp(`\\s*${MYMEMORY_BATCH_SEPARATOR}\\s*`, 'g')
        );

        translatedTexts.push(...batch.map((item, index) => translatedValues[index] || item));
    }

    return translatedTexts;
}

async function translateWithMyMemory(texts, targetLang) {
    if (texts.some((text) => text.length > MYMEMORY_LONG_TEXT_THRESHOLD || text.includes('\n'))) {
        const translatedTexts = [];
        for (const text of texts) {
            translatedTexts.push(await translateMyMemorySingle(text, targetLang));
        }
        return translatedTexts;
    }

    try {
        return await translateMyMemoryBatch(texts, targetLang);
    } catch (error) {
        console.warn(`    MyMemory batch fallback failed for ${targetLang}, retrying one-by-one...`);
        const translatedTexts = [];
        for (const text of texts) {
            translatedTexts.push(await translateMyMemorySingle(text, targetLang));
        }
        return translatedTexts;
    }
}

function getDeepValue(obj, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current ? current[key] : undefined), obj);
}

function setDeepValue(obj, keyPath, value) {
    const parts = keyPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[parts[parts.length - 1]] = value;
}

function collectStringKeyPaths(obj, prefix = '') {
    const paths = [];
    for (const [key, value] of Object.entries(obj)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            paths.push(...collectStringKeyPaths(value, fullPath));
        } else if (typeof value === 'string') {
            paths.push(fullPath);
        }
    }
    return paths;
}

async function translateBatch(texts, targetLang) {
    const azureTarget = AZURE_LANG_MAP[targetLang] || targetLang;
    const googleTarget = GOOGLE_LANG_MAP[targetLang] || targetLang;

    if (USE_AZURE_TRANSLATOR) {
        try {
            console.log(`    Trying Azure for ${texts.length} items to ${targetLang}...`);
            return await translateWithAzure(texts, azureTarget);
        } catch (azureError) {
            console.warn(`    Azure failed for ${targetLang}, trying MyMemory...`);
        }
    }

    try {
        console.warn(`    Using MyMemory for ${targetLang}...`);
        return await translateWithMyMemory(texts, targetLang);
    } catch (myMemoryError) {
        console.warn(`    MyMemory failed for ${targetLang}, trying Google fallback...`);
        try {
            const results = [];
            for (const text of texts) {
                const res = await googleTranslate(text, { to: googleTarget });
                results.push(res.text);
                await delay(200);
            }
            return results;
        } catch (googleError) {
            console.error(`    All translation providers failed for ${targetLang}. Using source text.`);
            return texts;
        }
    }
}

async function processTranslations(sourceFile, targetFile, targetLang) {
    if (!fs.existsSync(sourceFile)) return;
    
    const sourceContent = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    let targetContent = {};
    if (fs.existsSync(targetFile)) {
        try {
            targetContent = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        } catch (e) {
            console.error(`Error parsing ${targetFile}, starting fresh.`);
        }
    }

    const force = process.argv.includes('--force');

    const allKeys = collectStringKeyPaths(sourceContent);
    const missingKeys = allKeys.filter(key => {
        const sourceVal = getDeepValue(sourceContent, key);
        const targetVal = getDeepValue(targetContent, key);
        
        // If force is on, translate everything except brands
        if (force) {
            return !['HomeInventory', 'Google', 'JSON', 'QR Code'].includes(sourceVal);
        }

        // Skip some specific values
        if (['HomeInventory', 'Google', 'JSON', 'QR Code'].includes(sourceVal)) return false;
        
        // Missing or untranslated (identical to source and long enough)
        return !targetVal || (targetVal === sourceVal && sourceVal.length > 3);
    });

    if (missingKeys.length === 0) {
        console.log(`  - No missing keys for ${targetLang}`);
        return;
    }

    console.log(`  - Found ${missingKeys.length} missing keys for ${targetLang}. Translating...`);

    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
        const batchKeys = missingKeys.slice(i, i + BATCH_SIZE);
        const batchTexts = batchKeys.map(k => getDeepValue(sourceContent, k));
        
        let translatedTexts;
        try {
            translatedTexts = await translateBatch(batchTexts, targetLang);
        } catch (error) {
            if (error.response?.status === 429 || error.message.includes('429')) {
                console.log(`    Rate limit hit. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s...`);
                await delay(RATE_LIMIT_WAIT_MS);
                translatedTexts = await translateBatch(batchTexts, targetLang);
            } else {
                throw error;
            }
        }
        
        batchKeys.forEach((key, index) => {
            let translated = translatedTexts[index];
            // Fix some interpolation artifacts if necessary
            if (translated) {
                translated = translated.replace(/\{\{\s?([^}]+)\s?\}\}/g, '{{$1}}');
            }
            setDeepValue(targetContent, key, translated || batchTexts[index]);
        });

        // Save progress after each batch
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.writeFileSync(targetFile, JSON.stringify(targetContent, null, 4));
        console.log(`    Saved batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missingKeys.length / BATCH_SIZE)}`);
        
        await delay(DELAY_MS);
    }
}

async function run() {
    const args = process.argv.slice(2);
    const targetLangsArg = args.filter(a => !a.startsWith('--'));
    
    // Determine languages to process
    let languages = [];
    if (targetLangsArg.length > 0) {
        languages = targetLangsArg;
    } else {
        const clientLangs = fs.readdirSync(CLIENT_LOCALES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && !SKIP_LANGS.has(d.name))
            .map(d => d.name);
        languages = clientLangs;
    }

    console.log(`Starting translation for ${languages.length} languages: ${languages.join(', ')}`);

    for (const lang of languages) {
        console.log(`\nProcessing ${lang.toUpperCase()}...`);
        
        // 1. Process client locales
        const clientSource = path.join(CLIENT_LOCALES_DIR, BASE_LANG, 'translation.json');
        const clientTarget = path.join(CLIENT_LOCALES_DIR, lang, 'translation.json');
        await processTranslations(clientSource, clientTarget, lang);
        
        // 2. Process root locales
        const rootSource = path.join(ROOT_LOCALES_DIR, `${BASE_LANG}.json`);
        const rootTarget = path.join(ROOT_LOCALES_DIR, `${lang}.json`);
        await processTranslations(rootSource, rootTarget, lang);
        
        console.log(`Finished ${lang.toUpperCase()}`);
        await delay(DELAY_MS * 2);
    }

    console.log('\nAll translations completed!');
}

run().catch(console.error);
