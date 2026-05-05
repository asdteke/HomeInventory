import fs from 'fs';
import path from 'path';
import { translateWithAzure } from './azure-translator.mjs';

const PUBLIC_LOCALES_DIR = 'client/public/locales';
const SOURCE_LANG = 'en';

const LEGAL_KEYS = [
    'legal.privacy_policy_content',
    'legal.terms_of_service_content'
];

function getDeepValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (!current[key]) return undefined;
        current = current[key];
    }
    return current;
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

async function repairLanguage(lang, sourceValues) {
    const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
    if (!fs.existsSync(filePath)) return;

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Check if ALREADY repaired (length >= 1200)
    const currentPrivacy = getDeepValue(content, 'legal.privacy_policy_content') || '';
    if (currentPrivacy.length >= 1200) {
        return;
    }

    console.log(`Repairing (1:1 Translation) legal keys for ${lang}...`);

    try {
        const textsToTranslate = LEGAL_KEYS.map(key => sourceValues[key]);
        const translated = await translateWithAzure(textsToTranslate, lang);
        
        LEGAL_KEYS.forEach((key, idx) => {
            setDeepValue(content, key, translated[idx]);
        });

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`  - [OK] ${lang}`);
        
        // Significant delay for large legal text to avoid 429
        await sleep(5000); 
    } catch (err) {
        console.error(`  - [FAIL] ${lang}:`, err.message);
        if (err.message.includes('429')) {
            console.log('    Rate limit hit. Waiting 60 seconds...');
            await sleep(60000);
            return await repairLanguage(lang, sourceValues); // Retry
        }
    }
}

async function main() {
    const sourcePath = path.join(PUBLIC_LOCALES_DIR, SOURCE_LANG, 'translation.json');
    const sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const sourceValues = {};
    LEGAL_KEYS.forEach(key => {
        sourceValues[key] = getDeepValue(sourceContent, key);
    });

    const langs = fs.readdirSync(PUBLIC_LOCALES_DIR).filter(f => fs.lstatSync(path.join(PUBLIC_LOCALES_DIR, f)).isDirectory());

    for (const lang of langs) {
        if (lang === SOURCE_LANG || lang === 'tr') continue; // English is source, Turkish is usually manually verified
        await repairLanguage(lang, sourceValues);
    }
    console.log('1:1 Legal translation repair complete!');
}

main();
