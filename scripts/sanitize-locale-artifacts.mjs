import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TARGET_DIRS = [
    path.join(ROOT, 'client', 'public', 'locales'),
    path.join(ROOT, 'locales')
];

const ARTIFACT_PATTERN = /QX7|QUERY LENGTH LIMIT EXCEEDED|<<<|__HI_(?!PH_)[A-Z0-9_]+|HI_(?!PH_)[A-Z0-9_]+/i;
const SPLIT_PATTERN = /(?:\s*QX7+\s*|\s*<<<[^>]*>>>\s*|\s*QUERY LENGTH LIMIT EXCEEDED\. MAX ALLOWED QUERY : 500 CHARS\s*|\s*__HI_(?!PH_)[A-Z0-9_]+\s*|\s*HI_(?!PH_)[A-Z0-9_]+\s*)/i;

function walk(value, callback, keyPath = '') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, callback, `${keyPath}[${index}]`));
        return;
    }

    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            const nextPath = keyPath ? `${keyPath}.${key}` : key;
            walk(child, callback, nextPath);
        }
        return;
    }

    if (typeof value === 'string') {
        callback(keyPath, value);
    }
}

function setDeepValue(obj, keyPath, newValue) {
    const parts = keyPath.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i += 1) {
        const segment = parts[i];
        const indexMatch = segment.match(/^(.*)\[(\d+)\]$/);
        if (indexMatch) {
            const [, name, idxStr] = indexMatch;
            const idx = Number(idxStr);
            current[name] = current[name] || [];
            current = current[name][idx];
            continue;
        }

        current[segment] = current[segment] || {};
        current = current[segment];
    }

    const last = parts[parts.length - 1];
    const indexMatch = last.match(/^(.*)\[(\d+)\]$/);
    if (indexMatch) {
        const [, name, idxStr] = indexMatch;
        const idx = Number(idxStr);
        current[name] = current[name] || [];
        current[name][idx] = newValue;
    } else {
        current[last] = newValue;
    }
}

function sanitizeString(value, fallback) {
    if (!ARTIFACT_PATTERN.test(value)) {
        return value;
    }

    const segments = value
        .split(SPLIT_PATTERN)
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length > 0) {
        const first = segments[0];
        if (first && !ARTIFACT_PATTERN.test(first)) {
            return first;
        }
    }

    return typeof fallback === 'string' && fallback.trim() ? fallback : value;
}

function processFile(filePath, fallbackFilePath) {
    const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const fallback = fs.existsSync(fallbackFilePath)
        ? JSON.parse(fs.readFileSync(fallbackFilePath, 'utf8'))
        : null;

    let changed = false;

    walk(current, (keyPath, value) => {
        if (!ARTIFACT_PATTERN.test(value)) {
            return;
        }

        const fallbackValue = fallback
            ? keyPath.split('.').reduce((acc, key) => acc?.[key], fallback)
            : undefined;
        const cleaned = sanitizeString(value, fallbackValue);

        if (cleaned !== value) {
            setDeepValue(current, keyPath, cleaned);
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
    }

    return changed;
}

function main() {
    let changedCount = 0;

    for (const dir of TARGET_DIRS) {
        if (!fs.existsSync(dir)) continue;

        const baseEnglishPath = path.join(dir, 'en', 'translation.json');
        const rootFallbackPath = path.join(ROOT, 'locales', 'en.json');

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;

            const filePath = path.join(dir, entry.name, 'translation.json');
            if (!fs.existsSync(filePath)) continue;

            const fallbackFilePath = dir.includes(path.join('client', 'public', 'locales'))
                ? baseEnglishPath
                : rootFallbackPath;

            if (processFile(filePath, fallbackFilePath)) {
                changedCount += 1;
            }
        }
    }

    console.log(`Sanitized locale artifacts in ${changedCount} file(s).`);
}

main();
