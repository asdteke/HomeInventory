import fs from 'fs';
import path from 'path';
import { translateWithAzure } from './azure-translator.mjs';

const PUBLIC_LOCALES_DIR = 'client/public/locales';
const SOURCE_LANG = 'en';

const PRIORITY_LANGS = ['ru', 'nl', 'pt', 'pl', 'it', 'sv', 'da', 'fi', 'no', 'cs', 'hu', 'ro', 'sk', 'uk'];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function repairLanguage(lang) {
    console.log(`Priority Repairing: ${lang}...`);
    const sourcePath = path.join(PUBLIC_LOCALES_DIR, SOURCE_LANG, 'translation.json');
    const targetPath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');

    if (!fs.existsSync(targetPath)) return;

    const sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const targetContent = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

    const privacySrc = sourceContent.legal.privacy_policy_content;
    const termsSrc = sourceContent.legal.terms_of_service_content;

    try {
        const [privacyTrans] = await translateWithAzure([privacySrc], lang);
        await sleep(1000);
        const [termsTrans] = await translateWithAzure([termsSrc], lang);

        targetContent.legal.privacy_policy_content = privacyTrans;
        targetContent.legal.terms_of_service_content = termsTrans;

        fs.writeFileSync(targetPath, JSON.stringify(targetContent, null, 2));
        console.log(`  - [OK] ${lang}`);
    } catch (err) {
        console.error(`  - [FAIL] ${lang}:`, err.message);
    }
}

async function main() {
    for (const lang of PRIORITY_LANGS) {
        await repairLanguage(lang);
        console.log('Waiting 5s for rate limit safety...');
        await sleep(5000);
    }
}

main();
