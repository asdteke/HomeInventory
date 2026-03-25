import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidatedIsoDate, normalizeOptionalDate } from '../utils/dateValidation.js';

test('buildValidatedIsoDate returns canonical ISO dates only for real calendar values', () => {
    assert.equal(buildValidatedIsoDate('2026', '3', '25'), '2026-03-25');
    assert.equal(buildValidatedIsoDate('2026', '02', '29'), '');
    assert.equal(buildValidatedIsoDate('2028', '02', '29'), '2028-02-29');
    assert.equal(buildValidatedIsoDate('2026', '13', '01'), '');
});

test('normalizeOptionalDate accepts keyboard-friendly and ISO date formats', () => {
    assert.equal(normalizeOptionalDate('25.03.2026', 'Fatura tarihi'), '2026-03-25');
    assert.equal(normalizeOptionalDate('25/3/2026', 'Fatura tarihi'), '2026-03-25');
    assert.equal(normalizeOptionalDate('2026-03-25', 'Fatura tarihi'), '2026-03-25');
    assert.equal(normalizeOptionalDate('2026.3.25', 'Fatura tarihi'), '2026-03-25');
    assert.equal(normalizeOptionalDate('', 'Fatura tarihi'), null);
});

test('normalizeOptionalDate rejects malformed or impossible dates', () => {
    assert.throws(
        () => normalizeOptionalDate('31.02.2026', 'Fatura tarihi'),
        /Fatura tarihi geçersiz/
    );
    assert.throws(
        () => normalizeOptionalDate('2026-15-10', 'Fatura tarihi'),
        /Fatura tarihi geçersiz/
    );
    assert.throws(
        () => normalizeOptionalDate('yarin', 'Fatura tarihi'),
        /Fatura tarihi geçersiz/
    );
});
