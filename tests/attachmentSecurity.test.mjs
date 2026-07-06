import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSafeAttachmentHeaders,
    validateAttachmentFile
} from '../utils/attachmentSecurity.js';

function file(mimetype, buffer, originalname = 'manual.pdf') {
    return {
        mimetype,
        originalname,
        size: buffer.length,
        buffer
    };
}

test('validateAttachmentFile accepts passive PDFs and rejects active PDF content', () => {
    const passivePdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    assert.doesNotThrow(() => validateAttachmentFile(file('application/pdf', passivePdf)));

    const activePdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /OpenAction 2 0 R /JavaScript 3 0 R >>\nendobj');
    assert.throws(
        () => validateAttachmentFile(file('application/pdf', activePdf)),
        /aktif içerik|gömülü ek/i
    );
});

test('validateAttachmentFile verifies declared image types against magic bytes', () => {
    assert.doesNotThrow(() => validateAttachmentFile(file(
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    )));

    assert.throws(
        () => validateAttachmentFile(file('image/png', Buffer.from('not really a png'))),
        /PNG dosya imzası geçersiz/
    );
});

test('validateAttachmentFile allows text but rejects binary disguised as text', () => {
    assert.doesNotThrow(() => validateAttachmentFile(file('text/plain', Buffer.from('Servis notu\nGaranti kaydı'))));
    assert.throws(
        () => validateAttachmentFile(file('text/plain', Buffer.from([0x48, 0x00, 0x49]))),
        /düz metin/
    );
});

test('buildSafeAttachmentHeaders forces download-only attachment handling', () => {
    const headers = buildSafeAttachmentHeaders('invoice "2026";.pdf');

    assert.equal(headers['Content-Type'], 'application/octet-stream');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Download-Options'], 'noopen');
    assert.match(headers['Content-Security-Policy'], /sandbox/);
    assert.match(headers['Content-Disposition'], /^attachment;/);
    assert.doesNotMatch(headers['Content-Disposition'], /2026";/);
});
