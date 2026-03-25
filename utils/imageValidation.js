import sharp from 'sharp';

const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

export async function validateUploadedImageBuffer(buffer, { fieldLabel = 'Görsel' } = {}) {
    try {
        const metadata = await sharp(buffer, {
            limitInputPixels: MAX_IMAGE_PIXELS
        }).metadata();

        if (!ALLOWED_IMAGE_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
            throw new Error(`${fieldLabel} geçersiz`);
        }

        return metadata;
    } catch (error) {
        const message = String(error?.message || '');
        if (/ge(?:ç|c)ersiz/i.test(message)) {
            throw error;
        }

        if (
            /pixel limit/i.test(message) ||
            /unsupported image format/i.test(message) ||
            /input buffer/i.test(message) ||
            /corrupt/i.test(message) ||
            /bad seek/i.test(message)
        ) {
            throw new Error(`${fieldLabel} geçersiz`);
        }

        throw error;
    }
}
