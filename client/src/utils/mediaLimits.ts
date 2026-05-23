export const MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_MB = MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024);

export function isPhotoUploadTooLarge(file: File | null | undefined): boolean {
    return Number(file?.size || 0) > MAX_PHOTO_UPLOAD_BYTES;
}
