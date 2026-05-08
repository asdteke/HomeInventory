import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const FALLBACK_LANGS = ["ceb", "co", "da", "eo", "fa", "fy", "gd", "gl", "haw", "hmn", "ht", "hy", "ig", "jv", "km", "kn", "ky", "la", "lb", "mn", "my", "ne", "ny", "or", "pa", "ps", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr-Cyrl", "st", "sw", "ta", "te", "tg", "th", "uk", "ur", "uz", "vi", "yi", "yo", "zu"];

const VARIABLES = [
    '{{brandName}}',
    '{{controllerName}}',
    '{{controllerAddress}}',
    '{{privacyEmail}}',
    '{{supportEmail}}'
];

async function translateChunk(text, targetLang) {
    if (!text.trim()) return text;
    
    // Replace variables with safe uppercase words to prevent translation issues
    let safeText = text;
    VARIABLES.forEach((v, i) => {
        safeText = safeText.split(v).join(` VAR${i} `);
    });

    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(safeText);
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        let translated = data[0].map(item => item[0]).join('');
        
        // Restore variables
        VARIABLES.forEach((v, i) => {
            // Google Translate might add spaces around the variable
            const regex = new RegExp(`\\s*VAR${i}\\s*`, 'g');
            translated = translated.replace(regex, v);
        });
        
        return translated;
    } catch (e) {
        console.error(`Error translating to ${targetLang}:`, e.message);
        return text; // Fallback to original
    }
}

async function translateFullText(text, targetLang) {
    const chunks = text.split('\\n\\n');
    const translatedChunks = [];
    for (const chunk of chunks) {
        const lines = chunk.split('\\n');
        const translatedLines = [];
        for (const line of lines) {
            // Further split to keep it under URL length limits
            const translatedLine = await translateChunk(line, targetLang);
            translatedLines.push(translatedLine);
        }
        translatedChunks.push(translatedLines.join('\\n'));
    }
    return translatedChunks.join('\\n\\n');
}

async function main() {
    let count = 0;
    for (const lang of FALLBACK_LANGS) {
        // Map language codes to Google Translate compatible codes if necessary
        let gLang = lang;
        if (gLang === 'sr-Cyrl') gLang = 'sr';
        if (gLang === 'zh-Hans') gLang = 'zh-CN';
        if (gLang === 'zh-Hant') gLang = 'zh-TW';

        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Check if it has the English fallback text (starts with "## Overview and Purpose")
        const privacyText = content.legal?.privacy_policy_content || '';
        if (privacyText.includes('Overview and Purpose')) {
            console.log(`Translating ${lang}...`);
            
            const transPrivacy = await translateFullText(privacyText, gLang);
            await new Promise(r => setTimeout(r, 1000)); // Sleep to avoid rate limit
            const transTerms = await translateFullText(content.legal.terms_of_service_content, gLang);
            
            content.legal.privacy_policy_content = transPrivacy;
            content.legal.terms_of_service_content = transTerms;
            
            fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
            console.log(`  - [OK] ${lang} translated.`);
            count++;
            await new Promise(r => setTimeout(r, 2000)); // Sleep 2s between languages
        }
    }
    console.log(`Total translated: ${count}`);
}

main();
