import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const barcodeRoute = readFileSync(new URL('../routes/barcode.js', import.meta.url), 'utf8');

test('barcode catalogue lookups run concurrently and cancel slower sources', () => {
    assert.match(barcodeRoute, /Promise\.any\(lookupTasks\)/);
    assert.match(barcodeRoute, /new AbortController\(\)/);
    assert.match(barcodeRoute, /lookupController\.abort\(\)/);
    assert.match(barcodeRoute, /PRODUCT_LOOKUP_TIMEOUT_MS = 3500/);
    assert.doesNotMatch(barcodeRoute, /await tryOpenFoodFacts\(barcode\)[\s\S]*await tryOpenProductsFacts\(barcode\)/);
});

test('external barcode catalogues require explicit client consent', () => {
    assert.match(barcodeRoute, /req\.query\.online !== '1'/);
    assert.match(barcodeRoute, /onlineLookupAvailable: true/);
    assert.ok(
        barcodeRoute.indexOf("req.query.online !== '1'") < barcodeRoute.indexOf('new AbortController()'),
        'the privacy gate must run before any external lookup starts'
    );
});
