import test from 'node:test';
import assert from 'node:assert/strict';
import { TOTP, Secret } from 'otpauth';

process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'test-key';

const {
    generateBackupCodes,
    generateDeviceToken,
    generateTotpSecret,
    hashBackupCode,
    hashDeviceToken,
    verifyBackupCode,
    verifyTotpToken
} = await import('../utils/totp.js');

test('generateTotpSecret returns a base32 secret and usable otpauth URL', () => {
    const { secret, otpauthUrl } = generateTotpSecret('alice');

    assert.match(secret, /^[A-Z2-7]+$/);
    assert.match(otpauthUrl, /^otpauth:\/\/totp\//);
    assert.match(otpauthUrl, /issuer=HomeInventory/);
});

test('verifyTotpToken accepts the current authenticator code and rejects invalid input', () => {
    const { secret } = generateTotpSecret('alice');
    const totp = new TOTP({
        issuer: 'HomeInventory',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret)
    });

    const validCode = totp.generate();

    assert.equal(verifyTotpToken(secret, validCode), true);
    assert.equal(verifyTotpToken(secret, '000000'), false);
});

test('backup codes are formatted safely and verify case-insensitively', () => {
    const codes = generateBackupCodes();
    const storedCodes = codes.map((code, index) => ({
        id: index + 1,
        code_hash: hashBackupCode(code)
    }));

    assert.equal(codes.length, 10);
    for (const code of codes) {
        assert.match(code, /^[A-Z2-9]{8}$/);
    }

    assert.equal(
        verifyBackupCode(codes[0].toLowerCase(), storedCodes),
        1
    );
    assert.equal(
        verifyBackupCode('INVALID99', storedCodes),
        null
    );
});

test('trusted device tokens stay opaque and hash deterministically', () => {
    const token = generateDeviceToken();

    assert.match(token, /^[A-Za-z0-9_-]{32,}$/);
    assert.equal(hashDeviceToken(token), hashDeviceToken(token));
    assert.notEqual(hashDeviceToken(token), hashDeviceToken(`${token}-different`));
});
