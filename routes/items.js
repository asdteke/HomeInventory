import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import {
    decryptBufferFromStorage,
    encryptBufferForStorage
} from '../utils/encryption.js';
import {
    ensurePrivateDirectory,
    normalizeStoredPath,
    readPrivateFileWithinLimit,
    resolveStoredMediaPath,
    writePrivateFile
} from '../utils/mediaStorage.js';
import { MAX_PHOTO_UPLOAD_BYTES, MAX_PHOTO_UPLOAD_MB } from '../utils/mediaLimits.js';
import { normalizeOptionalCurrency } from '../utils/currencyValidation.js';
import { normalizeOptionalDate } from '../utils/dateValidation.js';
import { validateUploadedImageBuffer } from '../utils/imageValidation.js';
import { normalizeWarrantyDetails } from '../utils/warrantyValidation.js';
import {
    buildBarcodeLookup,
    decryptBorrowRecord,
    decryptItemInvoiceDate,
    decryptItemRecord,
    decryptRoomName,
    encryptBorrowerContact,
    encryptBorrowerName,
    encryptBorrowNote,
    encryptBorrowReturnNote,
    encryptItemBarcode,
    encryptItemDescription,
    encryptItemInvoiceCurrency,
    encryptItemInvoiceDate,
    encryptItemInvoicePrice,
    encryptItemName,
    encryptItemWarrantyDurationUnit,
    encryptItemWarrantyDurationValue,
    encryptItemWarrantyExpiryDate,
    encryptItemWarrantyStartDate
} from '../utils/protectedFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const ITEM_PHOTO_MEDIA_PURPOSE = 'inventory.media.photo';
const ITEM_THUMBNAIL_MEDIA_PURPOSE = 'inventory.media.thumbnail';
const ITEM_INVOICE_MEDIA_PURPOSE = 'inventory.media.invoice';
const ITEM_INVOICE_THUMBNAIL_MEDIA_PURPOSE = 'inventory.media.invoice_thumbnail';
const MAX_MEDIA_READ_BYTES = 16 * 1024 * 1024;

const router = express.Router();
const MEDIA_FILE_REGEX = /^[A-Za-z0-9._-]+\.webp$/;

// Ensure uploads directories exist
const uploadsDir = join(repoRoot, 'uploads');
const thumbnailsDir = join(repoRoot, 'uploads', 'thumbnails');
const invoiceUploadsDir = join(repoRoot, 'uploads', 'invoices');
const invoiceThumbnailsDir = join(repoRoot, 'uploads', 'invoices', 'thumbnails');

for (const directory of [uploadsDir, thumbnailsDir, invoiceUploadsDir, invoiceThumbnailsDir]) {
    ensurePrivateDirectory(directory);
}

const MEDIA_CONFIG = {
    photo: {
        column: 'photo_path',
        label: 'Fotoğraf',
        purpose: ITEM_PHOTO_MEDIA_PURPOSE,
        directory: uploadsDir,
        thumbnailColumn: 'thumbnail_path',
        thumbnailPurpose: ITEM_THUMBNAIL_MEDIA_PURPOSE,
        thumbnailDirectory: thumbnailsDir,
        storedPathPrefix: 'uploads',
        storedThumbnailPrefix: 'uploads/thumbnails'
    },
    invoice: {
        column: 'invoice_photo_path',
        label: 'Fatura fotoğrafı',
        purpose: ITEM_INVOICE_MEDIA_PURPOSE,
        directory: invoiceUploadsDir,
        thumbnailColumn: 'invoice_thumbnail_path',
        thumbnailPurpose: ITEM_INVOICE_THUMBNAIL_MEDIA_PURPOSE,
        thumbnailDirectory: invoiceThumbnailsDir,
        storedPathPrefix: 'uploads/invoices',
        storedThumbnailPrefix: 'uploads/invoices/thumbnails'
    }
};
const ITEM_MEDIA_FIELD_LABELS = {
    photo: 'Fotoğraf',
    invoice_photo: 'Fatura fotoğrafı'
};
const ALLOWED_MEDIA_PREFIXES = Object.values(MEDIA_CONFIG).flatMap((config) => ([
    config.storedPathPrefix,
    config.storedThumbnailPrefix
]));
const ACTIVE_BORROW_SELECT = `
    active_borrow.id AS active_borrow_id,
    active_borrow.borrower_type AS active_borrow_borrower_type,
    active_borrow.borrower_user_id AS active_borrow_borrower_user_id,
    active_borrow.borrower_name AS active_borrow_borrower_name,
    active_borrow.borrower_contact AS active_borrow_borrower_contact,
    active_borrow.note AS active_borrow_note,
    active_borrow.borrowed_at AS active_borrow_borrowed_at,
    active_borrow.due_date AS active_borrow_due_date,
    active_borrow.returned_at AS active_borrow_returned_at,
    active_borrow.return_note AS active_borrow_return_note,
    borrower.username AS active_borrow_borrower_username,
    lender.username AS active_borrow_lent_by_username,
    returner.username AS active_borrow_returned_by_username
`;
const ACTIVE_BORROW_JOINS = `
    LEFT JOIN item_borrows active_borrow
        ON active_borrow.item_id = items.id
       AND active_borrow.house_key = items.house_key
       AND active_borrow.returned_at IS NULL
    LEFT JOIN users borrower ON active_borrow.borrower_user_id = borrower.id
    LEFT JOIN users lender ON active_borrow.lent_by_user_id = lender.id
    LEFT JOIN users returner ON active_borrow.returned_by_user_id = returner.id
`;

// Configure multer with memory storage (for sharp processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES },
    fileFilter(req, file, cb) {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext && mime);
    }
});

const rawUploadFields = upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'invoice_photo', maxCount: 1 }
]);

function createBadRequestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function normalizeUploadError(error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        const fieldLabel = ITEM_MEDIA_FIELD_LABELS[error.field] || 'Fotoğraf';
        return createBadRequestError(`${fieldLabel} en fazla ${MAX_PHOTO_UPLOAD_MB} MB olabilir`);
    }

    return error;
}

function uploadFields(req, res, next) {
    rawUploadFields(req, res, (error) => {
        if (error) {
            next(normalizeUploadError(error));
            return;
        }

        next();
    });
}

/**
 * Görüntü optimizasyonu - Sharp ile işleme
 * - Max 1200px resize (aspect ratio korunur)
 * - WebP formatına dönüştürme (kalite 80)
 * - EXIF metadata temizleme
 * - 200x200 thumbnail oluşturma
 */
async function processImage(buffer, config) {
    // Original file names can leak personal/device data, so store randomized names only.
    const fileId = `${Date.now()}-${crypto.randomUUID()}`;
    const filename = `${fileId}.webp`;
    const thumbnailFilename = `${fileId}_thumb.webp`;

    const outputPath = join(config.directory, filename);
    const thumbnailPath = join(config.thumbnailDirectory, thumbnailFilename);

    try {
        await validateUploadedImageBuffer(buffer, { fieldLabel: config.label });

        // Ana görsel: Max 1200px, WebP, kalite 80, EXIF kaldır
        const optimizedImage = await sharp(buffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .withMetadata(false)  // EXIF/metadata kaldır (güvenlik)
            .toBuffer();

        // Thumbnail: 200x200, WebP, kalite 70
        const optimizedThumbnail = await sharp(buffer)
            .resize(200, 200, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 70 })
            .withMetadata(false)
            .toBuffer();

        writePrivateFile(
            outputPath,
            encryptBufferForStorage(optimizedImage, { purpose: config.purpose })
        );
        writePrivateFile(
            thumbnailPath,
            encryptBufferForStorage(optimizedThumbnail, { purpose: config.thumbnailPurpose })
        );

        console.log(`[ImageOptimizer] Processed: ${filename}`);

        return {
            filename,
            thumbnailFilename,
            path: `${config.storedPathPrefix}/${filename}`,
            thumbnailPath: `${config.storedThumbnailPrefix}/${thumbnailFilename}`
        };
    } catch (err) {
        console.error('[ImageOptimizer] Error:', err.message);
        throw err;
    } finally {
        if (Buffer.isBuffer(buffer)) {
            buffer.fill(0);
        }
    }
}

function getUploadedFile(req, fieldName) {
    return req.files?.[fieldName]?.[0] || null;
}

function parseBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeOptionalMoney(value) {
    const normalized = String(value || '').trim().replace(',', '.');
    if (!normalized) {
        return null;
    }

    if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) {
        throw new Error('Fatura fiyatı geçersiz');
    }

    return normalized;
}

function getRequestErrorStatus(error) {
    return /ge(?:ç|c)ersiz|gerekli|çok uzun|üyesi değil|kendinize/i.test(String(error?.message || '')) ? 400 : 500;
}

function normalizeOptionalText(value, fieldLabel, maxLength = 500) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.length > maxLength) {
        throw new Error(`${fieldLabel} çok uzun`);
    }

    return normalized;
}

function buildActiveBorrowSnapshot(record) {
    if (!record?.active_borrow_id) {
        return null;
    }

    return decryptBorrowRecord({
        id: record.active_borrow_id,
        item_id: record.id,
        borrower_type: record.active_borrow_borrower_type,
        borrower_user_id: record.active_borrow_borrower_user_id,
        borrower_name: record.active_borrow_borrower_name,
        borrower_contact: record.active_borrow_borrower_contact,
        note: record.active_borrow_note,
        borrowed_at: record.active_borrow_borrowed_at,
        due_date: record.active_borrow_due_date,
        returned_at: record.active_borrow_returned_at,
        return_note: record.active_borrow_return_note,
        borrower_username: record.active_borrow_borrower_username,
        lent_by_username: record.active_borrow_lent_by_username,
        returned_by_username: record.active_borrow_returned_by_username
    });
}

function serializeBorrowRecord(record) {
    return decryptBorrowRecord(record);
}

function getActiveBorrowForItem(itemId, houseKey) {
    return db.prepare(`
        SELECT
            ib.*,
            borrower.username AS borrower_username,
            lender.username AS lent_by_username,
            returner.username AS returned_by_username
        FROM item_borrows ib
        LEFT JOIN users borrower ON ib.borrower_user_id = borrower.id
        LEFT JOIN users lender ON ib.lent_by_user_id = lender.id
        LEFT JOIN users returner ON ib.returned_by_user_id = returner.id
        WHERE ib.item_id = ? AND ib.house_key = ? AND ib.returned_at IS NULL
        ORDER BY ib.borrowed_at DESC, ib.id DESC
        LIMIT 1
    `).get(itemId, houseKey);
}

function listBorrowHistory(itemId, houseKey) {
    return db.prepare(`
        SELECT
            ib.*,
            borrower.username AS borrower_username,
            lender.username AS lent_by_username,
            returner.username AS returned_by_username
        FROM item_borrows ib
        LEFT JOIN users borrower ON ib.borrower_user_id = borrower.id
        LEFT JOIN users lender ON ib.lent_by_user_id = lender.id
        LEFT JOIN users returner ON ib.returned_by_user_id = returner.id
        WHERE ib.item_id = ? AND ib.house_key = ?
        ORDER BY ib.borrowed_at DESC, ib.id DESC
    `).all(itemId, houseKey).map(serializeBorrowRecord);
}

function validateBorrowerMember(houseKey, borrowerUserId, actorUserId) {
    if (!borrowerUserId) {
        throw new Error('Ev üyesi seçin');
    }

    if (borrowerUserId === actorUserId) {
        throw new Error('Eşyayı kendinize ödünç veremezsiniz');
    }

    const member = db.prepare(`
        SELECT u.id, u.username
        FROM user_houses uh
        JOIN users u ON u.id = uh.user_id
        WHERE uh.house_key = ? AND uh.user_id = ?
        LIMIT 1
    `).get(houseKey, borrowerUserId);

    if (!member) {
        throw new Error('Seçilen kullanıcı bu evin üyesi değil');
    }

    return member;
}

function resolveStoredPath(storedPath) {
    return resolveStoredMediaPath(storedPath, {
        repoRoot,
        mediaRoot: uploadsDir,
        allowedPrefixes: ALLOWED_MEDIA_PREFIXES
    });
}

function buildMediaUrl(storedPath) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) {
        return null;
    }

    const parts = normalized.split('/');
    const filename = parts.at(-1);

    if (normalized.startsWith(`${MEDIA_CONFIG.invoice.storedThumbnailPrefix}/`)) {
        return `/api/items/media/invoice-thumbnail/${filename}`;
    }

    if (normalized.startsWith(`${MEDIA_CONFIG.invoice.storedPathPrefix}/`)) {
        return `/api/items/media/invoice/${filename}`;
    }

    if (normalized.startsWith(`${MEDIA_CONFIG.photo.storedThumbnailPrefix}/`)) {
        return `/api/items/media/thumbnail/${filename}`;
    }

    if (normalized.startsWith(`${MEDIA_CONFIG.photo.storedPathPrefix}/`)) {
        return `/api/items/media/photo/${filename}`;
    }

    return null;
}

function serializeItem(item) {
    if (!item) {
        return item;
    }

    const decryptedItem = decryptItemRecord(item);
    const activeBorrow = buildActiveBorrowSnapshot(item);

    return {
        ...decryptedItem,
        photo_path: buildMediaUrl(decryptedItem.photo_path),
        thumbnail_path: buildMediaUrl(decryptedItem.thumbnail_path),
        invoice_photo_path: buildMediaUrl(decryptedItem.invoice_photo_path),
        invoice_thumbnail_path: buildMediaUrl(decryptedItem.invoice_thumbnail_path),
        active_borrow: activeBorrow,
        is_borrowed: Boolean(activeBorrow)
    };
}

function deleteStoredFile(storedPath) {
    const fullPath = resolveStoredPath(storedPath);
    if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
}

function getMediaRecord(type, filename, houseKey) {
    if (!MEDIA_FILE_REGEX.test(filename)) {
        return null;
    }

    const typeConfig = (
        type === 'photo'
            ? { column: MEDIA_CONFIG.photo.column, storedPrefix: MEDIA_CONFIG.photo.storedPathPrefix }
            : type === 'thumbnail'
                ? { column: MEDIA_CONFIG.photo.thumbnailColumn, storedPrefix: MEDIA_CONFIG.photo.storedThumbnailPrefix }
                : type === 'invoice'
                    ? { column: MEDIA_CONFIG.invoice.column, storedPrefix: MEDIA_CONFIG.invoice.storedPathPrefix }
                    : type === 'invoice-thumbnail'
                        ? { column: MEDIA_CONFIG.invoice.thumbnailColumn, storedPrefix: MEDIA_CONFIG.invoice.storedThumbnailPrefix }
                        : null
    );

    if (!typeConfig) {
        return null;
    }

    const candidates = [
        `${typeConfig.storedPrefix}/${filename}`,
        `/${typeConfig.storedPrefix}/${filename}`
    ];

    const query = `
        SELECT id, ${typeConfig.column} as media_path
        FROM items
        WHERE house_key = ? AND ${typeConfig.column} IN (?, ?)
        LIMIT 1
    `;

    return db.prepare(query).get(houseKey, candidates[0], candidates[1]);
}

router.use(authenticateToken);
router.use(requireActiveHouse);

router.get('/media/:type/:filename', async (req, res) => {
    try {
        const { type, filename } = req.params;
        const purpose = (
            type === 'photo'
                ? ITEM_PHOTO_MEDIA_PURPOSE
                : type === 'thumbnail'
                    ? ITEM_THUMBNAIL_MEDIA_PURPOSE
                    : type === 'invoice'
                        ? ITEM_INVOICE_MEDIA_PURPOSE
                        : type === 'invoice-thumbnail'
                            ? ITEM_INVOICE_THUMBNAIL_MEDIA_PURPOSE
                            : null
        );

        if (!purpose) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const record = getMediaRecord(type, filename, req.user.house_key);
        if (!record?.media_path) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const mediaPath = resolveStoredPath(record.media_path);
        if (!mediaPath) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const encryptedMedia = await readPrivateFileWithinLimit(mediaPath, {
            maxBytes: MAX_MEDIA_READ_BYTES
        });

        let decryptedMedia;
        try {
            decryptedMedia = decryptBufferFromStorage(encryptedMedia, {
                purpose
            });
        } finally {
            if (Buffer.isBuffer(encryptedMedia)) {
                encryptedMedia.fill(0);
            }
        }

        res.set({
            'Cache-Control': 'private, no-store, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Vary': 'Cookie'
        });
        res.type('image/webp');
        return res.send(decryptedMedia);
    } catch (err) {
        if (err?.code === 'ENOENT' || err?.code === 'EINVAL') {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        if (err?.statusCode === 413 || err?.code === 'FILE_TOO_LARGE') {
            console.warn('Media access blocked due to oversized file:', err.message);
            return res.status(413).json({ error: 'Medya dosyası güvenli sınırı aşıyor' });
        }

        console.error('Media access error:', err);
        return res.status(500).json({ error: 'Medya yüklenemedi' });
    }
});

// Get all items (only from same house)
router.get('/', (req, res) => {
    try {
        const { search, category_id, room_id, location_id, barcode } = req.query;
        const houseKey = req.user.house_key;

        let query = `
            SELECT items.*, categories.name as category_name, categories.icon as category_icon,
                   rooms.name as room_name, locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.house_key = ?
        `;
        const params = [houseKey];

        if (category_id) { query += ' AND items.category_id = ?'; params.push(category_id); }
        if (room_id) { query += ' AND items.room_id = ?'; params.push(room_id); }
        if (location_id) { query += ' AND items.location_id = ?'; params.push(location_id); }
        if (barcode) {
            query += ' AND items.barcode_lookup = ?';
            params.push(buildBarcodeLookup(barcode));
        }

        query += ' ORDER BY items.updated_at DESC';
        let items = db.prepare(query).all(...params).map(serializeItem);

        if (search) {
            const normalizedSearch = String(search).toLocaleLowerCase();
            items = items.filter((item) => item.name?.toLocaleLowerCase().includes(normalizedSearch));
        }

        res.json({ items });
    } catch (err) {
        console.error('Get items error:', err);
        res.status(500).json({ error: 'Eşyalar yüklenirken hata oluştu' });
    }
});

// Search by barcode (within same house)
router.get('/barcode/:code', (req, res) => {
    try {
        const item = db.prepare(`
            SELECT items.*, categories.name as category_name, rooms.name as room_name,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.barcode_lookup = ? AND items.house_key = ?
        `).get(buildBarcodeLookup(req.params.code), req.user.house_key);

        if (!item) {
            return res.json({ found: false, barcode: req.params.code });
        }
        res.json({ found: true, item: serializeItem(item) });
    } catch (err) {
        res.status(500).json({ error: 'Barkod araması başarısız' });
    }
});

// Get single item (must be from same house)
router.get('/:id', (req, res) => {
    try {
        const item = db.prepare(`
            SELECT items.*, categories.name as category_name, rooms.name as room_name,
                   locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.id = ? AND items.house_key = ?
        `).get(req.params.id, req.user.house_key);

        if (!item) return res.status(404).json({ error: 'Eşya bulunamadı' });
        res.json({ item: serializeItem(item) });
    } catch (err) {
        res.status(500).json({ error: 'Eşya yüklenirken hata oluştu' });
    }
});

router.get('/:id/borrow-history', (req, res) => {
    try {
        const item = db.prepare('SELECT id FROM items WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);

        if (!item) {
            return res.status(404).json({ error: 'Eşya bulunamadı' });
        }

        res.json({
            history: listBorrowHistory(item.id, req.user.house_key)
        });
    } catch (err) {
        console.error('Borrow history error:', err);
        res.status(500).json({ error: 'Ödünç geçmişi yüklenemedi' });
    }
});

router.post('/:id/borrow', (req, res) => {
    try {
        const item = db.prepare('SELECT id, name FROM items WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);

        if (!item) {
            return res.status(404).json({ error: 'Eşya bulunamadı' });
        }

        const activeBorrow = getActiveBorrowForItem(item.id, req.user.house_key);
        if (activeBorrow) {
            return res.status(409).json({ error: 'Bu eşya zaten ödünçte' });
        }

        const borrowerType = (
            String(req.body.borrower_type || '').trim() === 'member' || req.body.borrower_user_id
        ) ? 'member' : 'external';
        const dueDate = normalizeOptionalDate(req.body.due_date, 'Planlanan teslim tarihi');
        const note = normalizeOptionalText(req.body.note, 'Ödünç notu', 1000);

        let borrowerUserId = null;
        let borrowerName = null;
        let borrowerContact = null;

        if (borrowerType === 'member') {
            borrowerUserId = Number.parseInt(req.body.borrower_user_id, 10) || null;
            validateBorrowerMember(req.user.house_key, borrowerUserId, req.user.id);
        } else {
            borrowerName = normalizeOptionalText(req.body.borrower_name, 'Ödünç alan adı', 120);
            borrowerContact = normalizeOptionalText(req.body.borrower_contact, 'İletişim bilgisi', 160);

            if (!borrowerName) {
                throw new Error('Ödünç alan adı gerekli');
            }
        }

        const result = db.prepare(`
            INSERT INTO item_borrows (
                item_id, house_key, borrower_type, borrower_user_id, borrower_name,
                borrower_contact, note, due_date, lent_by_user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            item.id,
            req.user.house_key,
            borrowerType,
            borrowerUserId,
            borrowerName ? encryptBorrowerName(borrowerName) : null,
            borrowerContact ? encryptBorrowerContact(borrowerContact) : null,
            note ? encryptBorrowNote(note) : null,
            dueDate,
            req.user.id
        );

        const borrow = db.prepare(`
            SELECT
                ib.*,
                borrower.username AS borrower_username,
                lender.username AS lent_by_username,
                returner.username AS returned_by_username
            FROM item_borrows ib
            LEFT JOIN users borrower ON ib.borrower_user_id = borrower.id
            LEFT JOIN users lender ON ib.lent_by_user_id = lender.id
            LEFT JOIN users returner ON ib.returned_by_user_id = returner.id
            WHERE ib.id = ?
        `).get(result.lastInsertRowid);

        const updatedItem = db.prepare(`
            SELECT items.*, categories.name as category_name, categories.icon as category_icon,
                   rooms.name as room_name, locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.id = ?
        `).get(item.id);

        res.status(201).json({
            message: 'Eşya ödünç verildi',
            borrow: serializeBorrowRecord(borrow),
            item: serializeItem(updatedItem)
        });
    } catch (err) {
        console.error('Borrow item error:', err);

        if (String(err?.message || '').includes('idx_item_borrows_active_item')) {
            return res.status(409).json({ error: 'Bu eşya zaten ödünçte' });
        }

        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Eşya ödünç verilemedi' });
    }
});

router.post('/:id/return', (req, res) => {
    try {
        const item = db.prepare('SELECT id FROM items WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);

        if (!item) {
            return res.status(404).json({ error: 'Eşya bulunamadı' });
        }

        const activeBorrow = getActiveBorrowForItem(item.id, req.user.house_key);
        if (!activeBorrow) {
            return res.status(409).json({ error: 'Bu eşya için aktif ödünç kaydı yok' });
        }

        const returnNote = normalizeOptionalText(req.body.return_note, 'Teslim notu', 1000);

        db.prepare(`
            UPDATE item_borrows
            SET returned_at = CURRENT_TIMESTAMP,
                return_note = ?,
                returned_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            returnNote ? encryptBorrowReturnNote(returnNote) : null,
            req.user.id,
            activeBorrow.id
        );

        const borrow = db.prepare(`
            SELECT
                ib.*,
                borrower.username AS borrower_username,
                lender.username AS lent_by_username,
                returner.username AS returned_by_username
            FROM item_borrows ib
            LEFT JOIN users borrower ON ib.borrower_user_id = borrower.id
            LEFT JOIN users lender ON ib.lent_by_user_id = lender.id
            LEFT JOIN users returner ON ib.returned_by_user_id = returner.id
            WHERE ib.id = ?
        `).get(activeBorrow.id);

        const updatedItem = db.prepare(`
            SELECT items.*, categories.name as category_name, categories.icon as category_icon,
                   rooms.name as room_name, locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.id = ?
        `).get(item.id);

        res.json({
            message: 'Eşya teslim alındı',
            borrow: serializeBorrowRecord(borrow),
            item: serializeItem(updatedItem)
        });
    } catch (err) {
        console.error('Return item error:', err);
        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Eşya teslim alınamadı' });
    }
});

// Create item (with house_key stamp)
router.post('/', uploadFields, async (req, res) => {
    try {
        const {
            name,
            description,
            quantity,
            category_id,
            room_id,
            location_id,
            is_public,
            barcode,
            invoice_price,
            invoice_currency,
            invoice_date,
            warranty_start_date,
            warranty_duration_value,
            warranty_duration_unit,
            warranty_expiry_date
        } = req.body;
        const houseKey = req.user.house_key;
        if (!String(name || '').trim()) {
            throw new Error('Eşya adı gerekli');
        }
        const itemPhotoFile = getUploadedFile(req, 'photo');
        const invoicePhotoFile = getUploadedFile(req, 'invoice_photo');
        const normalizedInvoicePrice = normalizeOptionalMoney(invoice_price);
        const normalizedInvoiceCurrency = normalizeOptionalCurrency(invoice_currency, normalizedInvoicePrice);
        const normalizedInvoiceDate = normalizeOptionalDate(invoice_date, 'Fatura tarihi');
        const normalizedWarrantyDetails = normalizeWarrantyDetails({
            invoice_date: normalizedInvoiceDate,
            warranty_start_date,
            warranty_duration_value,
            warranty_duration_unit,
            warranty_expiry_date
        });
        const normalizedQuantity = Math.max(1, parseInt(quantity, 10) || 1);

        // Görsel işleme
        let photoPath = null;
        let thumbnailPath = null;
        let invoicePhotoPath = null;
        let invoiceThumbnailPath = null;

        if (itemPhotoFile) {
            const processed = await processImage(itemPhotoFile.buffer, MEDIA_CONFIG.photo);
            photoPath = processed.path;
            thumbnailPath = processed.thumbnailPath;
        }

        if (invoicePhotoFile) {
            const processed = await processImage(invoicePhotoFile.buffer, MEDIA_CONFIG.invoice);
            invoicePhotoPath = processed.path;
            invoiceThumbnailPath = processed.thumbnailPath;
        }

        const result = db.prepare(`
            INSERT INTO items (
                name, description, quantity, photo_path, thumbnail_path, invoice_photo_path, invoice_thumbnail_path,
                barcode, invoice_price, invoice_currency, invoice_date, warranty_start_date, warranty_duration_value,
                warranty_duration_unit, warranty_expiry_date, barcode_lookup, category_id, room_id, location_id,
                is_public, user_id, house_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            encryptItemName(name),
            description ? encryptItemDescription(description) : null,
            normalizedQuantity,
            photoPath,
            thumbnailPath,
            invoicePhotoPath,
            invoiceThumbnailPath,
            barcode ? encryptItemBarcode(barcode) : null,
            normalizedInvoicePrice ? encryptItemInvoicePrice(normalizedInvoicePrice) : null,
            normalizedInvoiceCurrency ? encryptItemInvoiceCurrency(normalizedInvoiceCurrency) : null,
            normalizedInvoiceDate ? encryptItemInvoiceDate(normalizedInvoiceDate) : null,
            normalizedWarrantyDetails.warranty_start_date ? encryptItemWarrantyStartDate(normalizedWarrantyDetails.warranty_start_date) : null,
            normalizedWarrantyDetails.warranty_duration_value ? encryptItemWarrantyDurationValue(normalizedWarrantyDetails.warranty_duration_value) : null,
            normalizedWarrantyDetails.warranty_duration_unit ? encryptItemWarrantyDurationUnit(normalizedWarrantyDetails.warranty_duration_unit) : null,
            normalizedWarrantyDetails.warranty_expiry_date ? encryptItemWarrantyExpiryDate(normalizedWarrantyDetails.warranty_expiry_date) : null,
            buildBarcodeLookup(barcode),
            category_id || null, room_id || null, location_id || null,
            is_public !== undefined ? (parseBoolean(is_public) ? 1 : 0) : 1,
            req.user.id, houseKey
        );

        const item = db.prepare(`
            SELECT items.*, categories.name as category_name, categories.icon as category_icon,
                   rooms.name as room_name, locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.id = ?
        `).get(result.lastInsertRowid);
        res.status(201).json({ message: 'Eşya eklendi', item: serializeItem(item) });
    } catch (err) {
        console.error('Create item error:', err);
        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Eşya eklenirken hata oluştu' });
    }
});

// Update item (any house member can update)
router.put('/:id', uploadFields, async (req, res) => {
    try {
        const {
            name,
            description,
            quantity,
            category_id,
            room_id,
            location_id,
            is_public,
            barcode,
            invoice_price,
            invoice_currency,
            invoice_date,
            warranty_start_date,
            warranty_duration_value,
            warranty_duration_unit,
            warranty_expiry_date,
            remove_photo,
            remove_invoice_photo
        } = req.body;
        const itemId = req.params.id;
        if (name !== undefined && !String(name || '').trim()) {
            throw new Error('Eşya adı gerekli');
        }
        const itemPhotoFile = getUploadedFile(req, 'photo');
        const invoicePhotoFile = getUploadedFile(req, 'invoice_photo');
        const shouldRemovePhoto = parseBoolean(remove_photo);
        const shouldRemoveInvoicePhoto = parseBoolean(remove_invoice_photo);
        const normalizedInvoicePrice = invoice_price !== undefined ? normalizeOptionalMoney(invoice_price) : null;
        const normalizedInvoiceCurrency = invoice_currency !== undefined
            ? normalizeOptionalCurrency(invoice_currency, normalizedInvoicePrice)
            : null;
        const normalizedInvoiceDate = invoice_date !== undefined
            ? normalizeOptionalDate(invoice_date, 'Fatura tarihi')
            : null;

        // Check if item belongs to same house (any member can edit)
        const existing = db.prepare('SELECT * FROM items WHERE id = ? AND house_key = ?')
            .get(itemId, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Eşya bulunamadı veya yetkiniz yok' });
        }

        const existingInvoiceDate = decryptItemInvoiceDate(existing.invoice_date);
        const hasWarrantyPayload = [
            warranty_start_date,
            warranty_duration_value,
            warranty_duration_unit,
            warranty_expiry_date
        ].some((value) => value !== undefined);
        const normalizedWarrantyDetails = hasWarrantyPayload
            ? normalizeWarrantyDetails({
                invoice_date: invoice_date !== undefined ? normalizedInvoiceDate : existingInvoiceDate,
                warranty_start_date,
                warranty_duration_value,
                warranty_duration_unit,
                warranty_expiry_date
            })
            : null;

        const normalizedQuantity = quantity !== undefined
            ? Math.max(1, parseInt(quantity, 10) || 1)
            : existing.quantity;

        // Görsel işleme
        let photoPath = existing.photo_path;
        let thumbnailPath = existing.thumbnail_path;
        let invoicePhotoPath = existing.invoice_photo_path;
        let invoiceThumbnailPath = existing.invoice_thumbnail_path;

        if (itemPhotoFile) {
            // Eski görselleri sil (opsiyonel - yer tasarrufu)
            deleteStoredFile(existing.photo_path);
            deleteStoredFile(existing.thumbnail_path);

            const processed = await processImage(itemPhotoFile.buffer, MEDIA_CONFIG.photo);
            photoPath = processed.path;
            thumbnailPath = processed.thumbnailPath;
        } else if (shouldRemovePhoto) {
            deleteStoredFile(existing.photo_path);
            deleteStoredFile(existing.thumbnail_path);
            photoPath = null;
            thumbnailPath = null;
        }

        if (invoicePhotoFile) {
            deleteStoredFile(existing.invoice_photo_path);
            deleteStoredFile(existing.invoice_thumbnail_path);

            const processed = await processImage(invoicePhotoFile.buffer, MEDIA_CONFIG.invoice);
            invoicePhotoPath = processed.path;
            invoiceThumbnailPath = processed.thumbnailPath;
        } else if (shouldRemoveInvoicePhoto) {
            deleteStoredFile(existing.invoice_photo_path);
            deleteStoredFile(existing.invoice_thumbnail_path);
            invoicePhotoPath = null;
            invoiceThumbnailPath = null;
        }

        db.prepare(`
            UPDATE items
            SET name = ?, description = ?, quantity = ?, photo_path = ?, thumbnail_path = ?, invoice_photo_path = ?, invoice_thumbnail_path = ?,
                barcode = ?, invoice_price = ?, invoice_currency = ?, invoice_date = ?, warranty_start_date = ?,
                warranty_duration_value = ?, warranty_duration_unit = ?, warranty_expiry_date = ?, barcode_lookup = ?,
                category_id = ?, room_id = ?, location_id = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name ? encryptItemName(name) : existing.name,
            description !== undefined ? (description ? encryptItemDescription(description) : description) : existing.description,
            normalizedQuantity,
            photoPath,
            thumbnailPath,
            invoicePhotoPath,
            invoiceThumbnailPath,
            barcode !== undefined ? (barcode ? encryptItemBarcode(barcode) : null) : existing.barcode,
            invoice_price !== undefined ? (normalizedInvoicePrice ? encryptItemInvoicePrice(normalizedInvoicePrice) : null) : existing.invoice_price,
            invoice_currency !== undefined ? (normalizedInvoiceCurrency ? encryptItemInvoiceCurrency(normalizedInvoiceCurrency) : null) : existing.invoice_currency,
            invoice_date !== undefined ? (normalizedInvoiceDate ? encryptItemInvoiceDate(normalizedInvoiceDate) : null) : existing.invoice_date,
            hasWarrantyPayload
                ? (normalizedWarrantyDetails.warranty_start_date ? encryptItemWarrantyStartDate(normalizedWarrantyDetails.warranty_start_date) : null)
                : existing.warranty_start_date,
            hasWarrantyPayload
                ? (normalizedWarrantyDetails.warranty_duration_value ? encryptItemWarrantyDurationValue(normalizedWarrantyDetails.warranty_duration_value) : null)
                : existing.warranty_duration_value,
            hasWarrantyPayload
                ? (normalizedWarrantyDetails.warranty_duration_unit ? encryptItemWarrantyDurationUnit(normalizedWarrantyDetails.warranty_duration_unit) : null)
                : existing.warranty_duration_unit,
            hasWarrantyPayload
                ? (normalizedWarrantyDetails.warranty_expiry_date ? encryptItemWarrantyExpiryDate(normalizedWarrantyDetails.warranty_expiry_date) : null)
                : existing.warranty_expiry_date,
            barcode !== undefined ? buildBarcodeLookup(barcode) : existing.barcode_lookup,
            category_id !== undefined ? (category_id || null) : existing.category_id,
            room_id !== undefined ? (room_id || null) : existing.room_id,
            location_id !== undefined ? (location_id || null) : existing.location_id,
            is_public !== undefined ? (parseBoolean(is_public) ? 1 : 0) : existing.is_public,
            itemId
        );

        const item = db.prepare(`
            SELECT items.*, categories.name as category_name, categories.icon as category_icon,
                   rooms.name as room_name, locations.name as location_name, users.username,
                   ${ACTIVE_BORROW_SELECT}
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            ${ACTIVE_BORROW_JOINS}
            WHERE items.id = ?
        `).get(itemId);
        res.json({ message: 'Eşya güncellendi', item: serializeItem(item) });
    } catch (err) {
        console.error('Update item error:', err);
        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Eşya güncellenirken hata oluştu' });
    }
});

// Delete item (any house member can delete)
router.delete('/:id', (req, res) => {
    try {
        // Check if item belongs to same house (any member can delete)
        const item = db.prepare('SELECT * FROM items WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);

        if (!item) {
            return res.status(404).json({ error: 'Eşya bulunamadı veya yetkiniz yok' });
        }

        // Delete photo if exists
        deleteStoredFile(item.photo_path);
        deleteStoredFile(item.thumbnail_path);
        deleteStoredFile(item.invoice_photo_path);
        deleteStoredFile(item.invoice_thumbnail_path);

        db.prepare(`
            UPDATE borrow_requests
            SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
                item_id = NULL,
                borrow_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE item_id = ?
        `).run(req.params.id);
        db.prepare('DELETE FROM item_borrows WHERE item_id = ?').run(req.params.id);
        db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
        res.json({ message: 'Eşya silindi' });
    } catch (err) {
        res.status(500).json({ error: 'Eşya silinirken hata oluştu' });
    }
});

// Stats summary (only for same house)
router.get('/stats/summary', (req, res) => {
    try {
        const houseKey = req.user.house_key;

        const totalItems = db.prepare(`
            SELECT COUNT(*) as count FROM items WHERE house_key = ?
        `).get(houseKey);

        const totalQuantity = db.prepare(`
            SELECT COALESCE(SUM(quantity), 0) as total FROM items WHERE house_key = ?
        `).get(houseKey);

        const topRoom = db.prepare(`
            SELECT room_id, COUNT(*) as count
            FROM items
            WHERE house_key = ? AND room_id IS NOT NULL
            GROUP BY room_id ORDER BY count DESC LIMIT 1
        `).get(houseKey);

        const topRoomRecord = topRoom?.room_id
            ? db.prepare('SELECT name FROM rooms WHERE id = ?').get(topRoom.room_id)
            : null;

        const categoryCount = db.prepare(`
            SELECT COUNT(DISTINCT category_id) as count FROM items WHERE house_key = ? AND category_id IS NOT NULL
        `).get(houseKey);

        res.json({
            totalItems: totalItems?.count || 0,
            totalQuantity: totalQuantity?.total || 0,
            topRoom: topRoomRecord?.name ? decryptRoomName(topRoomRecord.name) : '-',
            topRoomCount: topRoom?.count || 0,
            categoryCount: categoryCount?.count || 0
        });
    } catch (err) {
        res.status(500).json({ error: 'İstatistikler yüklenemedi' });
    }
});

export default router;
