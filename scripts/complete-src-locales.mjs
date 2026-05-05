import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { translateWithAzure } from './azure-translator.mjs';

dotenv.config();

const SRC_LOCALES_DIR = 'client/src/locales';
const SOURCE_LANG = 'en';
const BATCH_SIZE = 25;

// All 101 target languages we want to support
const ALL_LANGS = [
    'af', 'am', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'ceb', 'co', 'cs', 'cy', 'da', 'de', 'el', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fil', 'fr', 'fy', 'ga', 'gd', 'gl', 'gu', 'haw', 'he', 'hi', 'hmn', 'hr', 'ht', 'hu', 'hy', 'id', 'ig', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'km', 'kn', 'ko', 'ku', 'ky', 'la', 'lb', 'lo', 'lt', 'lv', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'no', 'ny', 'or', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'sd', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'sr-Cyrl', 'st', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'yi', 'yo', 'zh', 'zh-Hans', 'zh-Hant', 'zu'
];

function getDeepEntries(obj, prefix = '') {
    let entries = [];
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            entries.push(...getDeepEntries(v, p));
        } else {
            entries.push({ path: p, value: v });
        }
    }
    return entries;
}

function setDeepValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processLanguage(lang, sourceEntries) {
    const targetDir = path.join(SRC_LOCALES_DIR, lang);
    const targetFile = path.join(targetDir, 'translation.json');

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    let targetContent = {};
    if (fs.existsSync(targetFile)) {
        try {
            targetContent = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        } catch (e) {
            console.error(`Error parsing ${targetFile}, starting fresh`);
        }
    }

    const targetKeys = new Set(getDeepEntries(targetContent).map(e => e.path));
    const missing = sourceEntries.filter(e => !targetKeys.has(e.path));

    if (missing.length === 0) {
        return; // Skip if complete
    }

    console.log(`  - Found ${missing.length} missing keys for ${lang}. Translating...`);

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const texts = batch.map(e => e.value);
        
        try {
            const translated = await translateWithAzure(texts, lang);
            batch.forEach((entry, idx) => {
                setDeepValue(targetContent, entry.path, translated[idx]);
            });
            fs.writeFileSync(targetFile, JSON.stringify(targetContent, null, 4));
            console.log(`    Saved batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)}`);
            
            // Add a small delay between batches
            await sleep(500);
        } catch (err) {
            console.error(`    Error translating batch for ${lang}:`, err.message);
            if (err.message.includes('429')) {
                console.log('    Rate limit hit. Waiting 30 seconds...');
                await sleep(30000);
                i -= BATCH_SIZE; // Retry this batch
            }
        }
    }
}

async function main() {
    const sourcePath = path.join(SRC_LOCALES_DIR, SOURCE_LANG, 'translation.json');
    const sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const sourceEntries = getDeepEntries(sourceContent);

    console.log(`Starting translation for ${ALL_LANGS.length} languages in ${SRC_LOCALES_DIR}...`);

    for (const lang of ALL_LANGS) {
        if (lang === SOURCE_LANG) continue;
        console.log(`\nProcessing ${lang.toUpperCase()}...`);
        await processLanguage(lang, sourceEntries);
    }

    console.log('\nAll src locales processed!');
}

main();
