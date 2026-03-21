import fs from 'fs';
import path from 'path';
import { translate } from 'bing-translate-api';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const BASE_LANG = 'en';

// Deep clone object
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function traverse(obj, callback, currentPath = '') {
    for (const key in obj) {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            traverse(obj[key], callback, fullPath);
        } else if (typeof obj[key] === 'string') {
            callback(fullPath, obj[key]);
        }
    }
}

function setDeepVal(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

// Convert lang code format if necessary (e.g., pt -> pt, ja -> ja)
const BING_LANGS = {
    'pt': 'pt',
    'fr': 'fr',
    'it': 'it',
    'ru': 'ru',
    'ja': 'ja',
    'tr': 'tr',
    'en': 'en',
    'es': 'es',
    'de': 'de',
    'ar': 'ar',
    'no': 'nb'
};

async function translateBatched(baseObj, targetObj, targetLang) {
    const result = deepClone(targetObj || {});
    const itemsToTranslate = [];
    
    // Find missing or English-matching keys
    traverse(baseObj, (pathStr, val) => {
        const targetVal = pathStr.split('.').reduce((o, i) => o ? o[i] : undefined, targetObj);
        if (!targetVal || (targetVal === val && val.length > 2)) {
            if (['HomeInventory', 'Google', 'JSON', 'QR Code'].includes(val)) {
                setDeepVal(result, pathStr, val);
            } else {
                itemsToTranslate.push({ path: pathStr, text: val });
            }
        }
    });

    if (itemsToTranslate.length === 0) return result;

    console.log(`Found ${itemsToTranslate.length} strings to translate to ${targetLang}. Batching...`);
    
    const BATCH_SIZE = 15; // Bing text limit is 1000 chars usually. 15 strings is safe.
    for (let i = 0; i < itemsToTranslate.length; i += BATCH_SIZE) {
        const batch = itemsToTranslate.slice(i, i + BATCH_SIZE);
        const combinedText = batch.map(b => b.text).join(' ||| ');
        
        try {
            console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
            const res = await translate(combinedText, null, BING_LANGS[targetLang] || targetLang);
            
            // Bing might be slow or return an error if we bombard it.
            const translatedSegments = res.translation.split(/(?:\s*\|\|\|\s*)+/);
            
            for (let j = 0; j < batch.length; j++) {
                const item = batch[j];
                const finalStr = translatedSegments[j] || item.text;
                // Minor cleanup if Bing adds space near interps. Usually it's fine.
                setDeepVal(result, item.path, finalStr);
            }
            
            await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
            console.error('Batch translation error:', err.message);
            for (const item of batch) {
                setDeepVal(result, item.path, item.text);
            }
            await new Promise(r => setTimeout(r, 4000));
        }
    }
    
    return result;
}

async function processLanguage(baseContent, lang) {
    console.log(`\nProcessing language: ${lang}`);
    const langFile = path.join(LOCALES_DIR, lang, 'translation.json');
    
    let targetContent = {};
    if (fs.existsSync(langFile)) {
        targetContent = JSON.parse(fs.readFileSync(langFile, 'utf8'));
    }
    
    try {
        const translatedContent = await translateBatched(baseContent, targetContent, lang);
        
        if (!fs.existsSync(path.dirname(langFile))) {
            fs.mkdirSync(path.dirname(langFile), { recursive: true });
        }
        
        fs.writeFileSync(langFile, JSON.stringify(translatedContent, null, 4));
        console.log(`Saved ${langFile}`);
    } catch (e) {
        console.error(`Error processing ${lang}:`, e.message);
    }
}

async function run() {
    const targetLangs = process.argv.slice(2);
    if(targetLangs.length === 0) {
        console.log("Usage: node auto-translate.mjs <lang1> <lang2> ...");
        process.exit(1);
    }
    
    const baseContent = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, BASE_LANG, 'translation.json'), 'utf8'));

    // Process languages with concurrency of 6
    const chunk_size = 6;
    for (let i = 0; i < targetLangs.length; i += chunk_size) {
        const chunk = targetLangs.slice(i, i + chunk_size);
        await Promise.all(chunk.map(lang => processLanguage(baseContent, lang)));
    }
}

run();
