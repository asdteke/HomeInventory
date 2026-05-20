import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const LOCALES_DIR = path.resolve(projectRoot, 'client/public/locales');

function normalizeBrandKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
}

function detectJsonIndent(text) {
    const match = text.match(/\n( +)"/);
    return match?.[1]?.length || 4;
}

function cleanFile(filePath, brandKey) {
    if (!fs.existsSync(filePath)) return false;

    const originalText = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(originalText);

    if (data && data.landing && brandKey in data.landing) {
        delete data.landing[brandKey];

        const indent = detectJsonIndent(originalText);
        const cleanedText = JSON.stringify(data, null, indent) + '\n';

        if (cleanedText !== originalText) {
            fs.writeFileSync(filePath, cleanedText, 'utf8');
            return true;
        }
    }
    return false;
}

function run() {
    const brandKey = normalizeBrandKey(process.env.LOCALE_BRAND_KEY || process.argv[2]);
    if (!brandKey) {
        console.error('Usage: node scripts/cleanup-baseline-locales.mjs <brand-key>');
        process.exit(1);
    }

    console.log('=== Cleaning baseline locale files ===');
    if (!fs.existsSync(LOCALES_DIR)) {
        console.error(`Locales directory not found: ${LOCALES_DIR}`);
        process.exit(1);
    }

    const languages = fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    let cleanedCount = 0;

    for (const lang of languages) {
        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
        try {
            if (cleanFile(filePath, brandKey)) {
                cleanedCount++;
                console.log(`Cleaned landing.${brandKey} from baseline: ${lang}`);
            }
        } catch (err) {
            console.error(`Failed to clean baseline file for ${lang}:`, err.message);
        }
    }

    console.log(`=== Cleanup Complete. Cleaned ${cleanedCount} files. ===\n`);
}

run();
