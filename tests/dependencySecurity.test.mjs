import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function numericVersion(version) {
    return String(version || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(actual, minimum) {
    const actualParts = numericVersion(actual);
    const minimumParts = numericVersion(minimum);
    const length = Math.max(actualParts.length, minimumParts.length);

    for (let index = 0; index < length; index += 1) {
        const actualPart = actualParts[index] || 0;
        const minimumPart = minimumParts[index] || 0;
        if (actualPart !== minimumPart) {
            return actualPart > minimumPart;
        }
    }

    return true;
}

test('multipart and HTTP client dependencies stay above patched security versions', () => {
    const multerVersion = lockfile.packages?.['node_modules/multer']?.version;
    const undiciVersion = lockfile.packages?.['node_modules/undici']?.version;

    assert.ok(isAtLeast(multerVersion, '2.2.0'), `multer ${multerVersion} is below patched 2.2.0`);
    assert.ok(isAtLeast(undiciVersion, '7.28.0'), `undici ${undiciVersion} is below patched 7.28.0`);
});
