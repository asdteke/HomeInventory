import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeStoredPath,
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
