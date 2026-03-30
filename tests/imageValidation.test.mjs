import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUploadedImageBuffer } from '../utils/imageValidation.js';
import { MAX_PHOTO_UPLOAD_BYTES, MAX_PHOTO_UPLOAD_MB } from '../utils/mediaLimits.js';

const VALID_PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQH8AAAAASUVORK5CYII=',
    'base64'
);

test('validateUploadedImageBuffer accepts real supported images', async () => {
    const metadata = await validateUploadedImageBuffer(VALID_PNG_BUFFER, { fieldLabel: 'Fotoğraf' });

    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 1);
    assert.equal(metadata.height, 1);
});

test('validateUploadedImageBuffer rejects non-image payloads disguised as uploads', async () => {
    await assert.rejects(
        () => validateUploadedImageBuffer(Buffer.from('not-an-image'), { fieldLabel: 'Fotoğraf' }),
        /Fotoğraf geçersiz/
    );
});

test('validateUploadedImageBuffer rejects oversized buffers before image decoding', async () => {
    const oversizedBuffer = Buffer.alloc(MAX_PHOTO_UPLOAD_BYTES + 1, 0);

    await assert.rejects(
        () => validateUploadedImageBuffer(oversizedBuffer, { fieldLabel: 'Fotoğraf' }),
        new RegExp(`Fotoğraf en fazla ${MAX_PHOTO_UPLOAD_MB} MB olabilir`)
    );
});
