import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuditReport } from '../scripts/audit-client-dependencies.mjs';

test('client audit policy narrowly allows the non-applicable React Router RSC advisory', () => {
    const result = evaluateAuditReport({
        vulnerabilities: {
            'react-router': {
                severity: 'high',
                via: [{ url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2' }]
            },
            'react-router-dom': {
                severity: 'high',
                via: ['react-router']
            }
        }
    });

    assert.deepEqual(result.allowedPackages, ['react-router', 'react-router-dom']);
    assert.deepEqual(result.blocked, []);
});

test('client audit policy still blocks every other moderate-or-higher advisory', () => {
    const result = evaluateAuditReport({
        vulnerabilities: {
            postcss: {
                severity: 'high',
                via: [{ url: 'https://github.com/advisories/GHSA-r28c-9q8g-f849' }]
            }
        }
    });

    assert.deepEqual(result.allowedPackages, []);
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].name, 'postcss');
});
