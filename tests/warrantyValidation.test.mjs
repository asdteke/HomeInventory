import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateWarrantyExpiryDate,
    normalizeOptionalWarrantyDurationUnit,
    normalizeOptionalWarrantyDurationValue,
    normalizeWarrantyDetails
} from '../utils/warrantyValidation.js';

test('calculateWarrantyExpiryDate adds calendar months and years safely', () => {
    assert.equal(calculateWarrantyExpiryDate('2026-03-25', '24', 'months'), '2028-03-25');
    assert.equal(calculateWarrantyExpiryDate('2026-01-31', '1', 'months'), '2026-02-28');
    assert.equal(calculateWarrantyExpiryDate('2024-02-29', '1', 'years'), '2025-02-28');
});

test('normalizeWarrantyDetails computes expiry automatically from start date and duration', () => {
    assert.deepEqual(
        normalizeWarrantyDetails({
            invoice_date: '',
            warranty_start_date: '25.03.2026',
            warranty_duration_value: '24',
            warranty_duration_unit: 'months',
            warranty_expiry_date: ''
        }),
        {
            warranty_start_date: '2026-03-25',
            warranty_duration_value: '24',
            warranty_duration_unit: 'months',
            warranty_expiry_date: '2028-03-25'
        }
    );
});

test('normalizeWarrantyDetails falls back to invoice date for warranty start', () => {
    assert.deepEqual(
        normalizeWarrantyDetails({
            invoice_date: '25.03.2026',
            warranty_start_date: '',
            warranty_duration_value: '24',
            warranty_duration_unit: 'months',
            warranty_expiry_date: ''
        }),
        {
            warranty_start_date: '2026-03-25',
            warranty_duration_value: '24',
            warranty_duration_unit: 'months',
            warranty_expiry_date: '2028-03-25'
        }
    );
});

test('normalizeWarrantyDetails keeps manual expiry when calculation inputs are empty', () => {
    assert.deepEqual(
        normalizeWarrantyDetails({
            invoice_date: '',
            warranty_start_date: '',
            warranty_duration_value: '',
            warranty_duration_unit: '',
            warranty_expiry_date: '25.03.2028'
        }),
        {
            warranty_start_date: null,
            warranty_duration_value: null,
            warranty_duration_unit: null,
            warranty_expiry_date: '2028-03-25'
        }
    );
});

test('warranty validation rejects malformed or incomplete duration details', () => {
    assert.throws(
        () => normalizeOptionalWarrantyDurationValue('0'),
        /Garanti süresi geçersiz/
    );
    assert.throws(
        () => normalizeOptionalWarrantyDurationUnit('weeks', 12),
        /Garanti süresi birimi geçersiz/
    );
    assert.throws(
        () => normalizeWarrantyDetails({
            invoice_date: '',
            warranty_start_date: '25.03.2026',
            warranty_duration_value: '',
            warranty_duration_unit: '',
            warranty_expiry_date: ''
        }),
        /Garanti süresi gerekli/
    );
    assert.throws(
        () => normalizeWarrantyDetails({
            invoice_date: '',
            warranty_start_date: '',
            warranty_duration_value: '24',
            warranty_duration_unit: 'months',
            warranty_expiry_date: ''
        }),
        /Garanti başlangıç tarihi gerekli/
    );
});
