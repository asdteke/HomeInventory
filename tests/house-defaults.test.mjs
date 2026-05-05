import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getDefaultNewHouseName,
    getDefaultOwnedHouseName,
    resolveSeedLanguage
} from '../utils/houseDefaults.js';

test('resolveSeedLanguage keeps supported locale codes when present', () => {
    assert.equal(resolveSeedLanguage({ query: { lang: 'es-ES' } }), 'es');
    assert.equal(resolveSeedLanguage({ query: { lang: 'zh-Hant' } }), 'zh-Hant');
    assert.equal(resolveSeedLanguage({ query: { lang: 'tr-TR' } }), 'tr');
    assert.equal(resolveSeedLanguage({ query: { lang: 'unknown-locale' } }), 'en');
});

test('default owned house names use localized locale content when available', () => {
    assert.equal(getDefaultOwnedHouseName('tr'), 'Evim');
    assert.equal(getDefaultOwnedHouseName('es'), 'Mi casa');
    assert.equal(getDefaultOwnedHouseName('ja'), 'マイホーム');
    assert.equal(getDefaultOwnedHouseName('unknown-locale'), 'My Home');
});

test('default new house names use localized locale content when available', () => {
    assert.equal(getDefaultNewHouseName('tr'), 'Yeni Evim');
    assert.equal(getDefaultNewHouseName('es'), 'Mi nueva casa');
    assert.equal(getDefaultNewHouseName('ja'), 'My New House');
    assert.equal(getDefaultNewHouseName('unknown-locale'), 'My New House');
});
