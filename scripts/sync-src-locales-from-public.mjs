import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_LOCALES_DIR = path.join(ROOT, 'client', 'public', 'locales');
const SRC_LOCALES_DIR = path.join(ROOT, 'client', 'src', 'locales');
const BASE_LANG = 'en';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

function collectStringKeyPaths(object, prefix = '') {
    const paths = [];

    for (const [key, value] of Object.entries(object || {})) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            paths.push(...collectStringKeyPaths(value, fullPath));
        } else if (typeof value === 'string') {
            paths.push(fullPath);
        }
    }

    return paths;
}

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

function getLanguages() {
    if (!fs.existsSync(PUBLIC_LOCALES_DIR)) {
        return [];
    }

    return fs.readdirSync(PUBLIC_LOCALES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((lang) => lang !== BASE_LANG && fs.existsSync(path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json')));
}

function syncLanguage(lang) {
    const publicPath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
    const srcPath = path.join(SRC_LOCALES_DIR, lang, 'translation.json');

    if (!fs.existsSync(publicPath)) {
        return;
    }

    const publicTranslation = readJson(publicPath);
    const publicBaseTranslation = readJson(path.join(PUBLIC_LOCALES_DIR, BASE_LANG, 'translation.json'));
    const publicKeys = collectStringKeyPaths(publicTranslation);
    const publicBaseMap = new Map(collectStringKeyPaths(publicBaseTranslation).map((keyPath) => [keyPath, getDeepValue(publicBaseTranslation, keyPath)]));

    let srcTranslation = {};
    if (fs.existsSync(srcPath)) {
        srcTranslation = readJson(srcPath);
    } else {
        fs.mkdirSync(path.dirname(srcPath), { recursive: true });
    }

    let changed = false;

    for (const keyPath of publicKeys) {
        const publicValue = getDeepValue(publicTranslation, keyPath);
        const baseValue = publicBaseMap.get(keyPath);
        const srcValue = getDeepValue(srcTranslation, keyPath);

        if (typeof publicValue !== 'string') {
            continue;
        }

        const hasMeaningfulTranslation = typeof baseValue === 'string' ? publicValue.trim() !== baseValue.trim() : true;
        if (!hasMeaningfulTranslation && typeof srcValue === 'string' && srcValue.trim()) {
            continue;
        }

        if (srcValue !== publicValue) {
            setDeepValue(srcTranslation, keyPath, publicValue);
            changed = true;
        }
    }

    if (changed) {
        writeJson(srcPath, srcTranslation);
        console.log(`Synced src/${lang} from public/${lang}`);
    }
}

function main() {
    for (const lang of getLanguages()) {
        syncLanguage(lang);
    }
}

main();
