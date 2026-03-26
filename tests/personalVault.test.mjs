import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizePersonalVaultEnvelope,
    normalizePersonalVaultSetupPayload,
    serializePersonalVaultEnvelope
} from '../utils/personalVault.js';

test('normalizePersonalVaultSetupPayload accepts a valid setup package', () => {
    const payload = normalizePersonalVaultSetupPayload({
        kdfAlgorithm: 'PBKDF2-SHA-256',
        kdfSalt: 'qL4WfO7cL8Jg1v3T8F4aow',
        kdfIterations: 600000,
        wrapAlgorithm: 'A256GCM',
        wrapIv: 'a8v8F0xQ5K3L7mNp',
        wrappedVaultKey: 'Q2lwaGVydGV4dF9fX2lzX2Jhc2U2NHVybA',
        recoveryKdfAlgorithm: 'PBKDF2-SHA-256',
        recoveryKdfSalt: '2P9qzGq1v3zZByr6vQbb1Q',
        recoveryKdfIterations: 600000,
        recoveryWrapAlgorithm: 'A256GCM',
        recoveryWrapIv: 'Jd8vF0xQ5K3L7mNp',
        recoveryWrappedVaultKey: 'QmFja3VwX19jaXBoZXJ0ZXh0X2lzX2hlcmU'
    });

    assert.equal(payload.kdfIterations, 600000);
    assert.equal(payload.wrapAlgorithm, 'A256GCM');
});

test('normalizePersonalVaultEnvelope accepts a valid item envelope', () => {
    const envelope = normalizePersonalVaultEnvelope({
        v: 1,
        alg: 'A256GCM',
        iv: 'a8v8F0xQ5K3L7mNp',
        ciphertext: 'Q2lwaGVydGV4dF9wYXlsb2FkX2RhdGE'
    });

    assert.equal(envelope.v, 1);
    assert.equal(envelope.alg, 'A256GCM');
});

test('serializePersonalVaultEnvelope rejects oversized payloads', () => {
    assert.throws(() => {
        serializePersonalVaultEnvelope({
            v: 1,
            alg: 'A256GCM',
            iv: 'a8v8F0xQ5K3L7mNp',
            ciphertext: 'a'.repeat((128 * 1024 * 3) + 1)
        });
    });
});

