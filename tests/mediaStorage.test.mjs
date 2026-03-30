import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
    normalizeStoredPath,
    readPrivateFileWithinLimit,
    resolveStoredMediaPath
} from '../utils/mediaStorage.js';

const repoRoot = '/app';
const mediaRoot = '/app/uploads';
const allowedPrefixes = [
    'uploads',
    'uploads/thumbnails',
    'uploads/invoices',
    'uploads/invoices/thumbnails'
];

test('normalizeStoredPath converts slashes and strips leading prefixes', () => {
    assert.equal(
        normalizeStoredPath('\\uploads\\invoices\\photo.webp'),
        'uploads/invoices/photo.webp'
    );
    assert.equal(
        normalizeStoredPath('/uploads/photo.webp'),
        'uploads/photo.webp'
    );
});

test('resolveStoredMediaPath accepts known upload prefixes inside the media root', () => {
    assert.equal(
        resolveStoredMediaPath('uploads/photo.webp', {
            repoRoot,
            mediaRoot,
            allowedPrefixes
        }),
        '/app/uploads/photo.webp'
    );
    assert.equal(
        resolveStoredMediaPath('uploads/invoices/thumbnails/invoice.webp', {
            repoRoot,
            mediaRoot,
            allowedPrefixes
        }),
        '/app/uploads/invoices/thumbnails/invoice.webp'
    );
});

test('resolveStoredMediaPath rejects traversal and unknown prefixes', () => {
    assert.equal(
        resolveStoredMediaPath('uploads/../secrets.txt', {
            repoRoot,
            mediaRoot,
            allowedPrefixes
        }),
        null
    );
    assert.equal(
        resolveStoredMediaPath('private/photo.webp', {
            repoRoot,
            mediaRoot,
            allowedPrefixes
        }),
        null
    );
});

test('readPrivateFileWithinLimit reads small files and blocks oversized ones', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-media-storage-'));
    const smallFile = join(tempDir, 'small.bin');
    const largeFile = join(tempDir, 'large.bin');

    t.after(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    writeFileSync(smallFile, Buffer.from('safe'));
    writeFileSync(largeFile, Buffer.alloc(8, 1));

    const smallContents = await readPrivateFileWithinLimit(smallFile, {
        maxBytes: 16
    });

    assert.equal(smallContents.toString('utf8'), 'safe');

    await assert.rejects(
        () => readPrivateFileWithinLimit(largeFile, { maxBytes: 4 }),
        (error) => error?.code === 'FILE_TOO_LARGE' && error?.statusCode === 413
    );
});
