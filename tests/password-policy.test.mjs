import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MIN_PASSWORD_LENGTH,
    RECOMMENDED_PASSWORD_LENGTH,
    getPasswordGuidanceMessage,
    validatePasswordStrengthClient
} from '../client/src/utils/passwordValidation.js';

function translate(_key, options = {}) {
    return String(options.defaultValue || '')
        .replace('{{min}}', String(options.min))
        .replace('{{recommended}}', String(options.recommended));
}

test('client password policy enforces length without composition rules', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.equal(RECOMMENDED_PASSWORD_LENGTH, 12);
    assert.equal(validatePasswordStrengthClient('abcdefg', translate).valid, false);

    const lowercaseOnly = validatePasswordStrengthClient('mintleaf', translate);
    assert.equal(lowercaseOnly.valid, true);
    assert.equal(lowercaseOnly.recommended, false);

    const passphrase = validatePasswordStrengthClient('four calm words', translate);
    assert.equal(passphrase.valid, true);
    assert.equal(passphrase.recommended, true);
});

test('password guidance states both the minimum and recommendation', () => {
    const guidance = getPasswordGuidanceMessage(translate);
    assert.match(guidance, /8/);
    assert.match(guidance, /12/);
    assert.match(guidance, /spaces are allowed/i);
});
