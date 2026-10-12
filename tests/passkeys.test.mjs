import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.SECRET_PROVIDER = 'env';
process.env.JWT_SECRET = 'passkey-unit-secret-1234567890';
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'passkey-unit-key';
process.env.HOMEINVENTORY_DB_PATH = join(mkdtempSync(join(tmpdir(), 'homeinventory-passkey-unit-')), 'inventory.db');

const { resolveRelyingParty, getRequestOrigin, normalizePasskeyName, storeChallenge, consumeChallenge } = await import('../utils/passkeys.js');

test('relying party is derived from secure origins only', () => {
    assert.deepEqual(
        resolveRelyingParty('https://inventory.example.com', {}),
        { available: true, rpId: 'inventory.example.com', rpName: resolveRelyingParty('https://a.example', {}).rpName, origin: 'https://inventory.example.com' }
    );
    assert.equal(resolveRelyingParty('http://localhost:3001', {}).rpId, 'localhost');
    assert.equal(resolveRelyingParty('http://app.localhost:3001', {}).rpId, 'app.localhost');
    assert.equal(resolveRelyingParty('http://inventory.example.com', {}).reason, 'insecure_origin');
    assert.equal(resolveRelyingParty('https://192.168.1.10:8443', {}).reason, 'ip_address');
    assert.equal(resolveRelyingParty('https://[::1]:8443', {}).reason, 'ip_address');
    assert.equal(resolveRelyingParty('not a url', {}).reason, 'unknown_origin');
    assert.equal(resolveRelyingParty('https://inventory.example.com', { PASSKEYS_ENABLED: 'off' }).reason, 'disabled');
});

test('configured RP ID and origins take precedence', () => {
    const env = { WEBAUTHN_RP_ID: 'example.com', WEBAUTHN_ORIGINS: 'https://inventory.example.com, https://example.com' };
    assert.equal(resolveRelyingParty('https://inventory.example.com', env).rpId, 'example.com');
    assert.equal(resolveRelyingParty('https://other.example.com', env).reason, 'origin_not_allowed');
    assert.equal(resolveRelyingParty('https://example.com', { WEBAUTHN_RP_ID: 'example.com' }).available, true);
    assert.equal(resolveRelyingParty('https://evil.test', { WEBAUTHN_RP_ID: 'example.com', WEBAUTHN_ORIGINS: 'https://evil.test' }).reason, 'origin_not_allowed');
    assert.equal(resolveRelyingParty('https://inventory.example.com', { WEBAUTHN_RP_NAME: 'Ev Envanteri' }).rpName, 'Ev Envanteri');
});

test('origin-less requests behind a TLS proxy use the configured public origin', () => {
    const request = (headers, protocol = 'http') => ({ protocol, get: (name) => headers[name.toLowerCase()] });
    const proxied = request({ host: 'inventory.example.com' });
    assert.equal(getRequestOrigin(proxied, { WEBAUTHN_ORIGINS: 'https://inventory.example.com' }), 'https://inventory.example.com');
    assert.equal(getRequestOrigin(proxied, { SITE_URL: 'https://inventory.example.com/' }), 'https://inventory.example.com');
    assert.equal(getRequestOrigin(proxied, { SITE_URL: 'https://other.example.com' }), 'http://inventory.example.com');
    assert.equal(getRequestOrigin(request({ host: 'inventory.example.com', origin: 'https://inventory.example.com' }), {}), 'https://inventory.example.com');
    assert.equal(getRequestOrigin(request({ host: 'localhost:3001' }), {}), 'http://localhost:3001');
});

test('passkey names are trimmed and bounded', () => {
    assert.equal(normalizePasskeyName('  iPhone\u0000 '), 'iPhone');
    assert.equal(normalizePasskeyName(''), 'Passkey');
    assert.equal(normalizePasskeyName('x'.repeat(200)).length, 64);
});

test('challenges are single use and bound to their purpose and user', () => {
    const id = storeChallenge({ purpose: 'login', challenge: 'abc', rpId: 'localhost', origin: 'http://localhost' });
    assert.equal(consumeChallenge(id, 'register'), null);
    assert.equal(consumeChallenge(id, 'login').challenge, 'abc');
    assert.equal(consumeChallenge(id, 'login'), null);
    assert.equal(consumeChallenge({ not: 'a string' }, 'login'), null);
});
