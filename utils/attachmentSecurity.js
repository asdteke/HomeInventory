const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;

const PDF_ACTIVE_CONTENT_PATTERNS = [
    /\/AA\b/i,
    /\/AcroForm\b/i,
    /\/EmbeddedFile\b/i,
    /\/JavaScript\b/i,
    /\/JS\b/i,
    /\/Launch\b/i,
    /\/OpenAction\b/i,
    /\/RichMedia\b/i,
    /\/SubmitForm\b/i,
    /\/XFA\b/i
];

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
]);

function hasPngSignature(buffer) {
    return buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;
}

function hasJpegSignature(buffer) {
    return buffer.length >= 4 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;
}

function hasWebpSignature(buffer) {
    return buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function hasPdfSignature(buffer) {
    const prefix = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
    return prefix.trimStart().startsWith('%PDF-');
}

function isPlainTextBuffer(buffer) {
    if (buffer.length > MAX_TEXT_ATTACHMENT_BYTES) {
        return false;
    }

    for (const byte of buffer) {
        const allowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
        const printableAscii = byte >= 0x20 && byte <= 0x7e;
        const utf8Byte = byte >= 0x80;

        if (!allowedControl && !printableAscii && !utf8Byte) {
            return false;
        }
    }

    return true;
}

function assertPdfIsPassive(buffer) {
    const searchable = buffer
        .subarray(0, Math.min(buffer.length, 2 * 1024 * 1024))
        .toString('latin1');

    const blockedPattern = PDF_ACTIVE_CONTENT_PATTERNS.find((pattern) => pattern.test(searchable));
    if (blockedPattern) {
        throw new Error('PDF dosyasında aktif içerik veya gömülü ek tespit edildi');
    }
}

export function validateAttachmentFile(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
        throw new Error('Ek dosya gerekli');
    }

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
        throw new Error('Ek dosya türü desteklenmiyor');
    }

    const buffer = file.buffer;
    if (buffer.length === 0) {
        throw new Error('Ek dosya boş olamaz');
    }

    if (file.mimetype === 'application/pdf') {
        if (!hasPdfSignature(buffer)) {
            throw new Error('PDF dosya imzası geçersiz');
        }
        assertPdfIsPassive(buffer);
        return;
    }

    if (file.mimetype === 'image/jpeg' && !hasJpegSignature(buffer)) {
        throw new Error('JPEG dosya imzası geçersiz');
    }

    if (file.mimetype === 'image/png' && !hasPngSignature(buffer)) {
        throw new Error('PNG dosya imzası geçersiz');
    }

    if (file.mimetype === 'image/webp' && !hasWebpSignature(buffer)) {
        throw new Error('WebP dosya imzası geçersiz');
    }

    if (file.mimetype === 'text/plain' && !isPlainTextBuffer(buffer)) {
        throw new Error('Metin dosyası yalnızca düz metin içermelidir');
    }
}

export function buildSafeAttachmentHeaders(originalName) {
    const fallbackName = String(originalName || 'attachment')
        .replace(/[\r\n\\/]+/g, ' ')
        .replace(/[";]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160) || 'attachment';

    const encodedName = encodeURIComponent(fallbackName);

    return {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
        'X-Content-Type-Options': 'nosniff',
        'X-Download-Options': 'noopen'
    };
}
