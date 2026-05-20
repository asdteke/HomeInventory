import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const localeRoots = [
    'client/public/locales'
];
const sourceRoot = path.join(rootDir, 'client/src');
const baseLanguage = 'en';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenKeys(value, prefix = '', out = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        out.push(prefix);
        return out;
    }

    for (const [key, child] of Object.entries(value)) {
        const next = prefix ? `${prefix}.${key}` : key;
        flattenKeys(child, next, out);
    }

    return out;
}

function hasKey(value, dottedKey) {
    let current = value;
    for (const part of dottedKey.split('.')) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return false;
        }
        current = current[part];
    }
    return true;
}

function walkFiles(directory, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walkFiles(entryPath, files);
        } else {
            files.push(entryPath);
        }
    }
    return files;
}

function collectCodeTranslationKeys() {
    const files = walkFiles(sourceRoot).filter((file) => /\.(jsx?|tsx?)$/.test(file));
    const keys = new Set();
    const translationCall = /\bt\(\s*(['"])([^'"${}]+)\1/g;

    for (const file of files) {
        const contents = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = translationCall.exec(contents))) {
            keys.add(match[2]);
        }
    }

    return [...keys].sort();
}

function checkLocaleRoot(localeRoot) {
    const absoluteRoot = path.join(rootDir, localeRoot);
    const baseFile = path.join(absoluteRoot, baseLanguage, 'translation.json');
    const base = readJson(baseFile);
    const baseKeys = new Set(flattenKeys(base).filter(Boolean));
    const failures = [];
    let languageCount = 0;

    for (const language of fs.readdirSync(absoluteRoot).sort()) {
        const translationFile = path.join(absoluteRoot, language, 'translation.json');
        if (!fs.existsSync(translationFile)) {
            continue;
        }

        languageCount += 1;
        const translation = readJson(translationFile);
        const translationKeys = new Set(flattenKeys(translation).filter(Boolean));
        const missing = [...baseKeys].filter((key) => !translationKeys.has(key));

        if (missing.length) {
            failures.push({
                language,
                missingCount: missing.length,
                sample: missing.slice(0, 10)
            });
        }
    }

    return {
        localeRoot,
        languageCount,
        missingLocaleCount: failures.length,
        failures
    };
}

const publicEnglish = readJson(path.join(rootDir, 'client/public/locales/en/translation.json'));
const codeKeys = collectCodeTranslationKeys();
const missingCodeKeys = codeKeys.filter((key) => !hasKey(publicEnglish, key));
const localeResults = localeRoots.map(checkLocaleRoot);
const failedLocaleRoots = localeResults.filter((result) => result.missingLocaleCount > 0);

console.log(JSON.stringify({
    codeUsedKeys: codeKeys.length,
    missingCodeKeys,
    localeResults: localeResults.map(({ localeRoot, languageCount, missingLocaleCount }) => ({
        localeRoot,
        languageCount,
        missingLocaleCount
    }))
}, null, 2));

if (missingCodeKeys.length || failedLocaleRoots.length) {
    for (const result of failedLocaleRoots) {
        console.error(`${result.localeRoot} has incomplete locale files:`);
        for (const failure of result.failures.slice(0, 10)) {
            console.error(`- ${failure.language}: ${failure.missingCount} missing (${failure.sample.join(', ')})`);
        }
    }
    process.exit(1);
}
