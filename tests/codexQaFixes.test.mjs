import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveStoredMediaPath } from '../utils/mediaStorage.js';
import { parseServerTimestamp } from '../client/src/utils/appFormatting.js';

test('attachment downloads resolve inside uploads/attachments', () => {
    const uploads = path.resolve('/data/uploads');
    const attachments = path.join(uploads, 'attachments');
    const resolved = resolveStoredMediaPath('uploads/attachments/1-abc.bin', {
        repoRoot: '/repo',
        mediaRoot: attachments,
        allowedPrefixes: ['uploads/attachments']
    });
    assert.equal(resolved, path.join(attachments, '1-abc.bin'));
});

test('attachment download route resolves against the attachments directory', () => {
    const source = readFileSync(new URL('../routes/items.js', import.meta.url), 'utf8');
    assert.match(source, /mediaRoot: attachmentsDir,\s*allowedPrefixes: \['uploads\/attachments'\]/);
});

test('SQLite timestamps without a zone are read as UTC', () => {
    assert.equal(parseServerTimestamp('2026-10-07 09:38:52').toISOString(), '2026-10-07T09:38:52.000Z');
    assert.equal(parseServerTimestamp('2026-10-07T09:38:52Z').toISOString(), '2026-10-07T09:38:52.000Z');
    assert.equal(parseServerTimestamp('2026-10-07T12:38:52+03:00').toISOString(), '2026-10-07T09:38:52.000Z');
});

test('page content is not remounted when only the query string changes', () => {
    const layout = readFileSync(new URL('../client/src/components/Layout.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(layout, /key=\{`\$\{location\.pathname\}\$\{location\.search\}`\}/);
});

test('template placeholders from .env.example are ignored by server branding', async () => {
    const keys = ['APP_DATA_CONTROLLER_NAME', 'APP_DPO_EMAIL', 'APP_PRIVACY_TRANSFER_DISCLOSURE'];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.APP_DATA_CONTROLLER_NAME = 'Your Company Ltd.';
    process.env.APP_DPO_EMAIL = 'privacy@your-domain.com';
    process.env.APP_PRIVACY_TRANSFER_DISCLOSURE = 'EU-hosted infrastructure; optional Google services';
    try {
        const branding = await import(`../utils/branding.js?placeholder=${Date.now()}`);
        assert.equal(branding.DATA_CONTROLLER_NAME, '');
        assert.equal(branding.DPO_EMAIL, '');
        assert.equal(branding.PRIVACY_TRANSFER_DISCLOSURE, '');
    } finally {
        for (const key of keys) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
        }
    }
});
