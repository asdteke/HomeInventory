import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boxManagerSource = readFileSync(
    new URL('../client/src/components/BoxManager.tsx', import.meta.url),
    'utf8'
);
const locationSelectSource = readFileSync(
    new URL('../client/src/components/CreatableLocationSelect.tsx', import.meta.url),
    'utf8'
);

test('box dialogs use localized errors instead of raw API messages', () => {
    assert.doesNotMatch(boxManagerSource, /getRequestErrorMessage|response\?\.data\?\.error/);
    assert.doesNotMatch(locationSelectSource, /getRequestErrorMessage|response\?\.data\?\.error/);

    for (const code of [
        'BOX_CODE_DUPLICATE',
        'BOX_STALE',
        'BOX_VISIBILITY_CONFLICT',
        'BOX_DESTINATION_PRIVATE',
        'BOX_NOT_EMPTY',
        'BOX_PLACEMENT_CONFLICT'
    ]) {
        assert.match(boxManagerSource, new RegExp(`errorCode === '${code}'`));
    }
});
