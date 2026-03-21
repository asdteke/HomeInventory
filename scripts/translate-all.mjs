import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { translate } from '@vitalets/google-translate-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetLanguages = ['it', 'fr', 'pt', 'ru', 'ja'];
const enPath = path.join(__dirname, '..', 'client', 'public', 'locales', 'en', 'translation.json');

const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Helper to translate object values recursively
async function translateObject(obj, targetLang, basePath = '') {
    const result = {};
    const entries = Object.entries(obj);
    let count = 0;

    for (const [key, value] of entries) {
        if (typeof value === 'object' && value !== null) {
            result[key] = await translateObject(value, targetLang, `${basePath}${key}.`);
        } else if (typeof value === 'string') {
            try {
                // To avoid translating interpolation variables e.g. {{name}}, {{count}}
                // Usually Google Translate messes up {{name}}. But let's see. 
                // Using standard translate.
                let translatedText = value;
                if (value.trim()) {
                    const res = await translate(value, { to: targetLang });
                    translatedText = res.text;
                }
                
                // Hack to fix {{variable}} formatting if broken
                translatedText = translatedText.replace(/\{\s?\{\s?([^}]+)\s?\}\s?\}/g, '{{$1}}');
                translatedText = translatedText.replace(/<\s?1\s?>/g, '<1>');
                translatedText = translatedText.replace(/<\s?\/\s?1\s?>/g, '</1>');
                
                result[key] = translatedText;
                count++;
                if (count % 20 === 0) console.log(`   Translated ${count} strings...`);
                
                // small delay to prevent rate limiting
                await new Promise(r => setTimeout(r, 200));
            } catch (err) {
                console.error(`Error translating key ${basePath}${key}:`, err.message);
                result[key] = value; // fallback to English if it fails
            }
        } else {
            result[key] = value;
        }
    }
    return result;
}

async function run() {
    for (const lang of targetLanguages) {
        console.log(`\n============================`);
        console.log(`Translating to ${lang.toUpperCase()}...`);
        console.log(`============================`);
        
        try {
            const translatedJson = await translateObject(enJson, lang);
            
            const outPath = path.join(__dirname, '..', 'client', 'public', 'locales', lang, 'translation.json');
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, JSON.stringify(translatedJson, null, 4));
            console.log(`✅ Saved ${lang}/translation.json`);
        } catch (error) {
            console.error(`Failed to handle ${lang}:`, error);
        }
    }
    console.log('All done!');
}

run();
