import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOptionalCurrency } from '../utils/currencyValidation.js';

test('normalizeOptionalCurrency keeps preset and custom currency codes for invoice amounts', () => {
    assert.equal(normalizeOptionalCurrency('TRY', '24999.90'), 'TRY');
    assert.equal(normalizeOptionalCurrency('btc', '24999.90'), 'BTC');
    assert.equal(normalizeOptionalCurrency('usdt', '24999.90'), 'USDT');
    assert.equal(normalizeOptionalCurrency('', '24999.90'), 'TRY');
});

test('normalizeOptionalCurrency ignores currency when there is no invoice amount', () => {
    assert.equal(normalizeOptionalCurrency('EUR', null), null);
    assert.equal(normalizeOptionalCurrency('BTC', ''), null);
});

test('normalizeOptionalCurrency rejects unsafe or malformed custom values', () => {
    assert.throws(() => normalizeOptionalCurrency('usd$', '10'), /Para birimi geçersiz/);
    assert.throws(() => normalizeOptionalCurrency('DROP TABLE', '10'), /Para birimi geçersiz/);
    assert.throws(() => normalizeOptionalCurrency('ABCDEFGHIJK', '10'), /Para birimi geçersiz/);
});
