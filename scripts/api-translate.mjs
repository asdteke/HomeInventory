import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { isProtectedTranslationKey } from './i18n-helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT_DIR, 'client', 'public', 'locales');
const BASE_LANG = 'en';

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current ? current[key] : undefined), object);
}

function collectStringKeyPaths(object, prefix = '') {
    const keyPaths = [];

    if (Array.isArray(object)) {
        object.forEach((value, index) => {
            const keyPath = prefix ? `${prefix}.${index}` : String(index);

            if (value && typeof value === 'object') {
                keyPaths.push(...collectStringKeyPaths(value, keyPath));
                return;
            }

            if (typeof value === 'string') {
                keyPaths.push(keyPath);
            }
        });

        return keyPaths;
    }

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

function getTargetLanguages() {
    return fs
        .readdirSync(LOCALES_DIR)
        .filter((lang) => fs.existsSync(path.join(LOCALES_DIR, lang, 'translation.json')))
        .filter((lang) => lang !== BASE_LANG && lang !== 'brand')
        .sort();
}

async function run() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const force = args.includes('--force');

    const baseTranslation = JSON.parse(
        fs.readFileSync(path.join(LOCALES_DIR, BASE_LANG, 'translation.json'), 'utf8')
    );
    const keyPaths = collectStringKeyPaths(baseTranslation);
    const targetLangs = getTargetLanguages();

    console.log(`Scanning translations. Base language: "${BASE_LANG}". Found ${keyPaths.length} keys total.`);

    const reports = [];
    let totalMissing = 0;

    for (const lang of targetLangs) {
        const localePath = path.join(LOCALES_DIR, lang, 'translation.json');
        const currentTranslation = JSON.parse(fs.readFileSync(localePath, 'utf8'));

        const missing = keyPaths.filter((keyPath) => {
            if (isProtectedTranslationKey(keyPath)) {
                return false;
            }
            const text = getDeepValue(baseTranslation, keyPath);
            const localeValue = getDeepValue(currentTranslation, keyPath);

            if (['HomeInventory', 'Google', 'JSON', 'QR Code'].includes(text)) {
                return false;
            }

            return text && (
                force ||
                !localeValue ||
                (localeValue === text && text.length > 2) ||
                String(localeValue).includes('HI_MISSING_SEP') ||
                String(localeValue).includes('HI_VAULT_SEP')
            );
        });

        if (missing.length > 0) {
            reports.push({ lang, count: missing.length, sample: missing.slice(0, 5) });
            totalMissing += missing.length;
        }
    }

    if (isDryRun) {
        console.log('\n--- TRANSLATION QUALITY DEBT REPORT (KALİTE BORCU RAPORU) ---');
        if (reports.length === 0) {
            console.log('✅ All translations are fully up-to-date! No quality debt detected.');
        } else {
            console.log('QUALITY DEBT DETECTED (KALITE BORCU TESPIT EDILDI):');
            console.log(`Found ${totalMissing} missing/stale keys across ${reports.length} languages that require translation.\n`);
            for (const r of reports) {
                console.log(`- Language "${r.lang}": ${r.count} missing keys. Sample: ${r.sample.join(', ')}`);
            }
            console.log('\n[Quality Debt Summary] This represents outstanding translation work that must be resolved to achieve complete localization quality.');
            console.log('[Dry Run] No translation API calls were made and no files were modified.');
        }
        process.exit(0);
    }

    // If not a dry run, forward arguments to scripts/translate-missing-keys.mjs
    const passArgs = args.filter(a => a !== '--dry-run');
    console.log(`\nLaunching full translation via translate-missing-keys.mjs...`);
    try {
        execFileSync(process.execPath, ['scripts/translate-missing-keys.mjs', ...passArgs], {
            stdio: 'inherit',
            cwd: ROOT_DIR
        });
    } catch (err) {
        console.error('Translation process exited with an error.');
        process.exit(1);
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
