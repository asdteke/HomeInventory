import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const BASE_LANG = 'en';

const GOOGLE_LANGS = {
    no: 'no',
    'sr-Cyrl': 'sr',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW'
};

const PLACEHOLDER_PATTERN = /\{\{\s*[^}]+\s*\}\}/g;

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

function protectPlaceholders(text) {
    const placeholders = [];
    const safeText = text.replace(PLACEHOLDER_PATTERN, (match) => {
        const token = `⟦${placeholders.length}⟧`;
        placeholders.push({ token, value: match.replace(/\s+/g, '') });
        return token;
    });

    return { safeText, placeholders };
}

function restorePlaceholders(text, placeholders) {
    let restored = text;
    for (const { token, value } of placeholders) {
        const index = token.slice(1, -1);
        const tokenVariants = [
            new RegExp(`⟦\\s*${index}\\s*⟧`, 'g'),
            new RegExp(`[‐‑‒–—−-]?\\s*${index}\\s*⟧`, 'g'),
            new RegExp(`⟦\\s*${index}(?!\\d)`, 'g')
        ];
        for (const pattern of tokenVariants) {
            restored = restored.replace(pattern, value);
        }
    }
    return restored;
}

async function translateText(text, targetLang) {
    const mappedTargetLang = GOOGLE_LANGS[targetLang] || targetLang;
    const { safeText, placeholders } = protectPlaceholders(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(mappedTargetLang)}&dt=t&q=${encodeURIComponent(safeText)}`;
    let lastError;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Google Translate returned ${response.status}`);
            }

            const data = await response.json();
            const translated = Array.isArray(data?.[0])
                ? data[0].map((part) => part?.[0] || '').join('')
                : '';

            if (!translated.trim()) {
                throw new Error('Google Translate returned empty text.');
            }

            return restorePlaceholders(translated, placeholders).trim();
        } catch (error) {
            lastError = error;
            if (attempt === 4) {
                break;
            }
            await delay(1500 * (attempt + 1));
        }
    }

    throw lastError;
}

async function run() {
    const separatorIndex = process.argv.indexOf('--');
    if (separatorIndex <= 2 || separatorIndex === process.argv.length - 1) {
        console.log('Usage: node scripts/translate-specific-locale-keys.mjs <key1> <key2> ... -- <lang1> <lang2> ...');
        process.exit(1);
    }

    const keyPaths = process.argv.slice(2, separatorIndex);
    const languages = process.argv.slice(separatorIndex + 1);
    const baseTranslation = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, BASE_LANG, 'translation.json'), 'utf8'));

    for (const lang of languages) {
        const localePath = path.join(LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(localePath)) {
            console.log(`Skipped ${lang}: locale file not found`);
            continue;
        }

        const currentTranslation = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        let changed = 0;

        for (const keyPath of keyPaths) {
            const sourceText = getDeepValue(baseTranslation, keyPath);
            if (!sourceText) {
                console.log(`Skipped ${lang}/${keyPath}: missing source text`);
                continue;
            }

            let translated;
            try {
                translated = await translateText(sourceText, lang);
            } catch (error) {
                throw new Error(`${lang}/${keyPath}: ${error.message}`);
            }
            setDeepValue(currentTranslation, keyPath, translated);
            changed += 1;
            await delay(250);
        }

        fs.writeFileSync(localePath, `${JSON.stringify(currentTranslation, null, 4)}\n`);
        console.log(`Saved ${lang}/translation.json with ${changed} targeted keys`);
        await delay(1000);
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
