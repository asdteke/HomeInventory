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
    resolveStoredMediaPath,
    writePrivateFile
} from '../utils/mediaStorage.js';
import { normalizeOptionalCurrency } from '../utils/currencyValidation.js';
import { normalizeOptionalDate } from '../utils/dateValidation.js';
import { validateUploadedImageBuffer } from '../utils/imageValidation.js';
import { normalizeWarrantyDetails } from '../utils/warrantyValidation.js';
import {
    buildBarcodeLookup,
    decryptItemInvoiceDate,
    decryptItemRecord,
    decryptRoomName,
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
const ALLOWED_MEDIA_PREFIXES = Object.values(MEDIA_CONFIG).flatMap((config) => ([
    config.storedPathPrefix,
    config.storedThumbnailPrefix
]));

// Configure multer with memory storage (for sharp processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext && mime);
    }
});

const uploadFields = upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'invoice_photo', maxCount: 1 }
]);

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
    return /ge(?:ç|c)ersiz|gerekli/i.test(String(error?.message || '')) ? 400 : 500;
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

    return {
        ...decryptedItem,
        photo_path: buildMediaUrl(decryptedItem.photo_path),
        thumbnail_path: buildMediaUrl(decryptedItem.thumbnail_path),
        invoice_photo_path: buildMediaUrl(decryptedItem.invoice_photo_path),
        invoice_thumbnail_path: buildMediaUrl(decryptedItem.invoice_thumbnail_path)
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

router.get('/media/:type/:filename', (req, res) => {
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
        if (!mediaPath || !fs.existsSync(mediaPath)) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        res.set({
            'Cache-Control': 'private, no-store, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Vary': 'Cookie'
        });
        res.type('image/webp');
        return res.send(
            decryptBufferFromStorage(fs.readFileSync(mediaPath), {
                purpose
            })
        );
    } catch (err) {
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
                   rooms.name as room_name, locations.name as location_name, users.username
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
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
            SELECT items.*, categories.name as category_name, rooms.name as room_name
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
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
                   locations.name as location_name, users.username
            FROM items
            LEFT JOIN categories ON items.category_id = categories.id
            LEFT JOIN rooms ON items.room_id = rooms.id
            LEFT JOIN locations ON items.location_id = locations.id
            LEFT JOIN users ON items.user_id = users.id
            WHERE items.id = ? AND items.house_key = ?
        `).get(req.params.id, req.user.house_key);

        if (!item) return res.status(404).json({ error: 'Eşya bulunamadı' });
        res.json({ item: serializeItem(item) });
    } catch (err) {
        res.status(500).json({ error: 'Eşya yüklenirken hata oluştu' });
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

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
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

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
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
