import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUploadedImageBuffer } from '../utils/imageValidation.js';

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
