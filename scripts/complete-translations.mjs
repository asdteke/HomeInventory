import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { translateWithAzure } from './azure-translator.mjs';
import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { isProtectedTranslationKey } from './i18n-helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_LOCALES_DIR = path.join(__dirname, '..', 'locales');
const CLIENT_LOCALES_DIR = path.join(__dirname, '..', 'client', 'public', 'locales');
const BASE_LANG = 'en';
const SKIP_LANGS = new Set(['en', 'brand']);
const BATCH_SIZE = 100; // Since Azure supports large batches, we can increase this. For Google, we process one-by-one inside translateBatch anyway.
const DELAY_MS = 1000;
const USE_AZURE_TRANSLATOR = process.env.USE_AZURE_TRANSLATOR !== '0' && Boolean(process.env.AZURE_TRANSLATOR_KEY);

const AZURE_LANG_MAP = {
    'no': 'nb',       // Norwegian
    'hmn': 'mww',     // Hmong (mww is Hmong Daw in Azure)
    'mn': 'mn-Cyrl',  // Mongolian
    'ny': 'nya',      // Nyanja
    'sr': 'sr-Latn',  // Serbian Latin
    'sr-Cyrl': 'sr-Cyrl',
    'zh': 'zh-Hans',  // Chinese fallback to Simplified
    'zh-Hans': 'zh-Hans',
    'zh-Hant': 'zh-Hant'
};

const AZURE_UNSUPPORTED_LANGS = new Set([
    'ceb', // Cebuano
    'co',  // Corsican
    'eo',  // Esperanto
    'fy',  // Frisian
    'gd',  // Scottish Gaelic
    'haw', // Hawaiian
    'jv',  // Javanese
    'la',  // Latin
    'tg',  // Tajik
    'yi'   // Yiddish
]);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateWithGtxGoogle(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const translated = data[0].map(item => item[0]).join('');
                if (translated) return translated;
            }
        } catch (err) {
            console.warn(`    Google GTX translation attempt ${attempt + 1} failed for ${targetLang}: ${err.message}`);
        }
        await delay(1000);
    }
    return text;
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

    if (USE_AZURE_TRANSLATOR && !AZURE_UNSUPPORTED_LANGS.has(targetLang)) {
        try {
            console.log(`    Trying Azure for ${texts.length} items to ${targetLang}...`);
            return await translateWithAzure(texts, azureTarget);
        } catch (azureError) {
            console.warn(`    Azure failed for ${targetLang}. Falling back to Google GTX...`);
        }
    }

    console.log(`    Using Google GTX for ${texts.length} items to ${targetLang} (one-by-one)...`);
    const results = [];
    for (const text of texts) {
        const res = await translateWithGtxGoogle(text, targetLang);
        results.push(res);
        await delay(100); // Small delay to avoid aggressive rate limiting
    }
    return results;
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
        if (isProtectedTranslationKey(key)) return false;

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
