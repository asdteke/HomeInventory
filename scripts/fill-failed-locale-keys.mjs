import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const BASE_LANG = 'en';
const LANGS = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((lang) => lang !== BASE_LANG);

const KEY_PATHS = [
    'admin.overview.email_warning_title',
    'admin.overview.sections.governance_title',
    'admin.overview.sections.activity_title',
    'admin.overview.summary.admin_seats',
    'admin.logs.type.email',
    'admin.logs.action.send',
    'admin.logs.action.delete',
    'admin.logs.audit.email_sent',
    'admin.logs.audit.user_deleted'
];

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), object);
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

async function run() {
    const basePath = path.join(LOCALES_DIR, BASE_LANG, 'translation.json');
    const baseTranslation = JSON.parse(fs.readFileSync(basePath, 'utf8'));

    for (const lang of LANGS) {
        const localePath = path.join(LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(localePath)) {
            continue;
        }

        const currentTranslation = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        let changed = false;

        for (const keyPath of KEY_PATHS) {
            const sourceText = getDeepValue(baseTranslation, keyPath);
            const currentValue = getDeepValue(currentTranslation, keyPath);

            if (!sourceText) {
                continue;
            }

            if (currentValue && String(currentValue).trim() && String(currentValue).trim() !== String(sourceText).trim()) {
                continue;
            }

            setDeepValue(currentTranslation, keyPath, sourceText);
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(localePath, JSON.stringify(currentTranslation, null, 4));
            console.log(`Updated ${lang}`);
        }
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
