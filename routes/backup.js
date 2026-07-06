import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { isHouseOwner } from '../utils/houseMembership.js';
import { normalizeWarrantyDetails } from '../utils/warrantyValidation.js';
import { ensurePrivateDirectory, normalizeStoredPath, resolveStoredMediaPath, writePrivateFile } from '../utils/mediaStorage.js';
import { getUploadsRoot } from '../utils/runtimePaths.js';
import {
    buildBarcodeLookup,
    buildUsernameLookup,
    decryptBorrowRecord,
    decryptAttachmentOriginalName,
    decryptCategoryRecord,
    decryptItemRecord,
    decryptLocationRecord,
    decryptRoomRecord,
    encryptBorrowerContact,
    encryptBorrowerName,
    encryptBorrowNote,
    encryptBorrowReturnNote,
    encryptAttachmentOriginalName,
    encryptCategoryName,
    encryptItemBarcode,
    encryptItemDescription,
    encryptItemInvoiceCurrency,
    encryptItemInvoiceDate,
    encryptItemInvoicePrice,
    encryptItemName,
    encryptItemWarrantyDurationUnit,
    encryptItemWarrantyDurationValue,
    encryptItemWarrantyExpiryDate,
    encryptItemWarrantyStartDate,
    encryptLocationName,
    encryptRoomDescription,
    encryptRoomName
} from '../utils/protectedFields.js';

const router = express.Router();
const MAX_IMPORT_ITEMS = 5000;
const MAX_FULL_BACKUP_MEDIA_BYTES = 250 * 1024 * 1024;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const uploadsRoot = getUploadsRoot(repoRoot);
const BACKUP_MEDIA_PREFIXES = [
    'uploads',
    'uploads/thumbnails',
    'uploads/invoices',
    'uploads/invoices/thumbnails',
    'uploads/attachments'
];

const backupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla yedekleme isteği. Lütfen daha sonra tekrar deneyin.' }
});

function requireBackupOwner(req, res, next) {
    if (!isHouseOwner(req.user.id, req.user.house_key)) {
        return res.status(403).json({ error: 'Yedekleme işlemleri yalnızca ev sahibi tarafından yapılabilir' });
    }

    next();
}

router.use(authenticateToken);
router.use(requireActiveHouse);
router.use(requireBackupOwner);

function buildNameMap(records) {
    const map = new Map();

    for (const record of records) {
        if (record?.name && !map.has(record.name)) {
            map.set(record.name, record);
        }
    }

    return map;
}

function pushUniquePreview(list, value, limit = 5) {
    if (!value || list.length >= limit || list.includes(value)) {
        return;
    }

    list.push(value);
}

function normalizeImportValue(value) {
    return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function createItemFingerprint(item) {
    return JSON.stringify([
        normalizeImportValue(item.name),
        normalizeImportValue(item.description),
        Number(item.quantity || 1),
        normalizeImportValue(item.barcode),
        normalizeImportValue(item.category_name),
        normalizeImportValue(item.room_name),
        normalizeImportValue(item.location_name),
        normalizeImportValue(item.invoice_price),
        normalizeImportValue(item.invoice_currency),
        normalizeImportValue(item.invoice_date),
        normalizeImportValue(item.warranty_start_date),
        normalizeImportValue(item.warranty_duration_value),
        normalizeImportValue(item.warranty_duration_unit),
        normalizeImportValue(item.warranty_expiry_date),
        normalizeImportValue(item.expiry_date),
        Number(item.min_quantity || 0)
    ]);
}

function collectMediaEntries(items, attachments = []) {
    const mediaEntries = [];
    const seen = new Set();
    let totalBytes = 0;

    for (const item of items) {
        for (const field of ['photo_path', 'thumbnail_path', 'invoice_photo_path', 'invoice_thumbnail_path']) {
            const storedPath = normalizeStoredPath(item?.[field]);
            if (!storedPath || seen.has(storedPath)) {
                continue;
            }

            const resolvedPath = resolveStoredMediaPath(storedPath, {
                repoRoot,
                mediaRoot: uploadsRoot,
                allowedPrefixes: BACKUP_MEDIA_PREFIXES
            });
            if (!resolvedPath || !fs.existsSync(resolvedPath)) {
                continue;
            }

            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                continue;
            }

            totalBytes += stats.size;
            if (totalBytes > MAX_FULL_BACKUP_MEDIA_BYTES) {
                const error = new Error('Medya yedeği güvenli boyut sınırını aşıyor');
                error.statusCode = 413;
                throw error;
            }

            mediaEntries.push({
                path: storedPath,
                size: stats.size,
                content_base64: fs.readFileSync(resolvedPath).toString('base64')
            });
            seen.add(storedPath);
        }
    }

    for (const attachment of attachments) {
        const storedPath = normalizeStoredPath(attachment?.stored_path);
        if (!storedPath || seen.has(storedPath)) {
            continue;
        }

        const resolvedPath = resolveStoredMediaPath(storedPath, {
            repoRoot,
            mediaRoot: uploadsRoot,
            allowedPrefixes: BACKUP_MEDIA_PREFIXES
        });
        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
            continue;
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            continue;
        }

        totalBytes += stats.size;
        if (totalBytes > MAX_FULL_BACKUP_MEDIA_BYTES) {
            const error = new Error('Medya yedeği güvenli boyut sınırını aşıyor');
            error.statusCode = 413;
            throw error;
        }

        mediaEntries.push({
            path: storedPath,
            size: stats.size,
            content_base64: fs.readFileSync(resolvedPath).toString('base64')
        });
        seen.add(storedPath);
    }

    return { mediaEntries, totalBytes };
}

function restoreMediaEntries(mediaEntries = []) {
    if (!Array.isArray(mediaEntries) || mediaEntries.length === 0) {
        return { restoredMedia: 0, restoredBytes: 0 };
    }

    let restoredMedia = 0;
    let restoredBytes = 0;
    const seen = new Set();

    for (const entry of mediaEntries) {
        const storedPath = normalizeStoredPath(entry?.path);
        const contentBase64 = String(entry?.content_base64 || '');
        if (!storedPath || !contentBase64 || seen.has(storedPath)) {
            continue;
        }

        const resolvedPath = resolveStoredMediaPath(storedPath, {
            repoRoot,
            mediaRoot: uploadsRoot,
            allowedPrefixes: BACKUP_MEDIA_PREFIXES
        });
        if (!resolvedPath) {
            continue;
        }

        const buffer = Buffer.from(contentBase64, 'base64');
        restoredBytes += buffer.length;
        if (restoredBytes > MAX_FULL_BACKUP_MEDIA_BYTES) {
            throw new Error('İçe aktarılan medya güvenli boyut sınırını aşıyor');
        }

        ensurePrivateDirectory(dirname(resolvedPath));
        writePrivateFile(resolvedPath, buffer);
        restoredMedia++;
        seen.add(storedPath);
    }

    return { restoredMedia, restoredBytes };
}

function createBorrowFingerprint(borrow, mappedItemId, fallbackBorrowerName = '') {
    return JSON.stringify([
        Number(mappedItemId || 0),
        normalizeImportValue(borrow.borrower_type === 'member' ? 'member' : 'external'),
        normalizeImportValue(borrow.borrower_username),
        normalizeImportValue(borrow.borrower_name || fallbackBorrowerName),
        normalizeImportValue(borrow.borrower_contact),
        normalizeImportValue(borrow.note),
        normalizeImportValue(borrow.borrowed_at),
        normalizeImportValue(borrow.due_date),
        normalizeImportValue(borrow.return_requested_at),
        normalizeImportValue(borrow.return_request_note),
        normalizeImportValue(borrow.returned_at),
        normalizeImportValue(borrow.return_note)
    ]);
}

// GET /api/backup/export - Export all data for current house
router.get('/export', backupRateLimiter, (req, res) => {
    try {
        const houseKey = req.user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        // Get all items for this house
        const items = db.prepare(`
            SELECT
                i.id, i.name, i.description, i.quantity, i.barcode,
                i.invoice_price, i.invoice_currency, i.invoice_date,
                i.warranty_start_date, i.warranty_duration_value, i.warranty_duration_unit, i.warranty_expiry_date,
                i.expiry_date, i.min_quantity, i.is_public,
                c.name as category_name, c.icon as category_icon, c.color as category_color,
                r.name as room_name,
                l.name as location_name,
                i.created_at, i.updated_at
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN rooms r ON i.room_id = r.id
            LEFT JOIN locations l ON i.location_id = l.id
            WHERE i.house_key = ?
            ORDER BY i.created_at DESC
        `).all(houseKey).map(decryptItemRecord);

        // Get all categories for this house
        const categories = db.prepare('SELECT id, name, icon, color FROM categories WHERE house_key = ?')
            .all(houseKey)
            .map(decryptCategoryRecord);

        // Get all rooms for this house
        const rooms = db.prepare('SELECT id, name, description FROM rooms WHERE house_key = ?')
            .all(houseKey)
            .map(decryptRoomRecord);

        // Get all locations for this house
        const locations = db.prepare(`
            SELECT l.id, l.name, r.name as room_name
            FROM locations l
            LEFT JOIN rooms r ON l.room_id = r.id
            WHERE l.house_key = ?
        `).all(houseKey).map(decryptLocationRecord);

        const borrows = db.prepare(`
            SELECT
                ib.id,
                ib.item_id,
                ib.borrower_type,
                ib.borrower_user_id,
                ib.borrower_name,
                ib.borrower_contact,
                ib.note,
                ib.borrowed_at,
                ib.due_date,
                ib.return_requested_at,
                ib.return_request_note,
                ib.returned_at,
                ib.return_note,
                borrower.username as borrower_username
            FROM item_borrows ib
            LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
            WHERE ib.house_key = ?
            ORDER BY ib.borrowed_at DESC, ib.id DESC
        `).all(houseKey).map(decryptBorrowRecord);

        const exportData = {
            version: '1.3',
            exportDate: new Date().toISOString(),
            meta: {
                containsDecryptedData: true,
                securityWarning: 'This backup contains decrypted household data. Store it in a secure location and do not share it over insecure channels.'
            },
            items,
            categories,
            rooms,
            locations,
            borrows
        };

        res.json(exportData);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Yedekleme oluşturulurken hata oluştu' });
    }
});

router.get('/export-full', backupRateLimiter, (req, res) => {
    try {
        const houseKey = req.user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        const items = db.prepare(`
            SELECT
                i.id, i.name, i.description, i.quantity, i.barcode,
                i.photo_path, i.thumbnail_path, i.invoice_photo_path, i.invoice_thumbnail_path,
                i.invoice_price, i.invoice_currency, i.invoice_date,
                i.warranty_start_date, i.warranty_duration_value, i.warranty_duration_unit, i.warranty_expiry_date,
                i.expiry_date, i.min_quantity, i.is_public,
                c.name as category_name, c.icon as category_icon, c.color as category_color,
                r.name as room_name,
                l.name as location_name,
                i.created_at, i.updated_at
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN rooms r ON i.room_id = r.id
            LEFT JOIN locations l ON i.location_id = l.id
            WHERE i.house_key = ?
            ORDER BY i.created_at DESC
        `).all(houseKey).map(decryptItemRecord);

        const categories = db.prepare('SELECT id, name, icon, color FROM categories WHERE house_key = ?')
            .all(houseKey)
            .map(decryptCategoryRecord);
        const rooms = db.prepare('SELECT id, name, description FROM rooms WHERE house_key = ?')
            .all(houseKey)
            .map(decryptRoomRecord);
        const locations = db.prepare(`
            SELECT l.id, l.name, r.name as room_name
            FROM locations l
            LEFT JOIN rooms r ON l.room_id = r.id
            WHERE l.house_key = ?
        `).all(houseKey).map(decryptLocationRecord);
        const borrows = db.prepare(`
            SELECT
                ib.id,
                ib.item_id,
                ib.borrower_type,
                ib.borrower_user_id,
                ib.borrower_name,
                ib.borrower_contact,
                ib.note,
                ib.borrowed_at,
                ib.due_date,
                ib.return_requested_at,
                ib.return_request_note,
                ib.returned_at,
                ib.return_note,
                borrower.username as borrower_username
            FROM item_borrows ib
            LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
            WHERE ib.house_key = ?
            ORDER BY ib.borrowed_at DESC, ib.id DESC
        `).all(houseKey).map(decryptBorrowRecord);

        const attachments = db.prepare(`
            SELECT id, item_id, original_name, stored_path, mime_type, size_bytes, created_at
            FROM item_attachments
            WHERE house_key = ?
            ORDER BY created_at DESC, id DESC
        `).all(houseKey).map((attachment) => ({
            ...attachment,
            original_name: decryptAttachmentOriginalName(attachment.original_name)
        }));

        const { mediaEntries, totalBytes } = collectMediaEntries(items, attachments);

        res.json({
            version: '1.5-full',
            exportDate: new Date().toISOString(),
            meta: {
                containsDecryptedData: true,
                includesEncryptedMedia: true,
                mediaCount: mediaEntries.length,
                mediaBytes: totalBytes,
                securityWarning: 'This full backup contains decrypted household records and encrypted media blobs. Keep it encrypted and stored safely.'
            },
            items,
            categories,
            rooms,
            locations,
            borrows,
            attachments,
            media: mediaEntries
        });
    } catch (err) {
        console.error('Full export error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Tam yedek oluşturulurken hata oluştu' });
    }
});

// POST /api/backup/import - Import data to current house
router.post('/import', backupRateLimiter, (req, res) => {
    try {
        const houseKey = req.user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        const { items, categories, rooms, locations, borrows, attachments, media } = req.body;
        const hasMediaEntries = Array.isArray(media) && media.length > 0;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz yedek dosyası formatı' });
        }
        if (items.length > MAX_IMPORT_ITEMS) {
            return res.status(400).json({ error: `Tek seferde en fazla ${MAX_IMPORT_ITEMS} eşya içe aktarılabilir` });
        }

        let importedCategories = 0;
        let importedRooms = 0;
        let importedLocations = 0;
        let importedItems = 0;
        let importedBorrows = 0;
        let importedAttachments = 0;
        let skippedCategories = 0;
        let skippedRooms = 0;
        let skippedLocations = 0;
        let skippedItems = 0;
        let skippedBorrows = 0;
        let skippedAttachments = 0;

        const importPreview = {
            items: [],
            categories: [],
            rooms: [],
            locations: [],
            borrows: [],
            attachments: []
        };
        let restoredMedia = { restoredMedia: 0, restoredBytes: 0 };

        // Map to store old_id -> new_id for foreign key references
        const categoryMap = {};
        const roomMap = {};
        const locationMap = {};
        const itemMap = {};

        // Import operation in a transaction
        const importAll = db.transaction(() => {
            const existingCategoriesByName = buildNameMap(
                db.prepare('SELECT * FROM categories WHERE house_key = ?')
                    .all(houseKey)
                    .map(decryptCategoryRecord)
            );

            const existingRoomsByName = buildNameMap(
                db.prepare('SELECT * FROM rooms WHERE house_key = ?')
                    .all(houseKey)
                    .map(decryptRoomRecord)
            );

            const existingLocationsByName = buildNameMap(
                db.prepare('SELECT * FROM locations WHERE house_key = ?')
                    .all(houseKey)
                    .map(decryptLocationRecord)
            );

            const existingItemsByFingerprint = new Map(
                db.prepare(`
                    SELECT
                        i.id, i.name, i.description, i.quantity, i.barcode,
                        i.invoice_price, i.invoice_currency, i.invoice_date,
                        i.warranty_start_date, i.warranty_duration_value, i.warranty_duration_unit, i.warranty_expiry_date,
                        c.name as category_name, r.name as room_name, l.name as location_name
                    FROM items i
                    LEFT JOIN categories c ON i.category_id = c.id
                    LEFT JOIN rooms r ON i.room_id = r.id
                    LEFT JOIN locations l ON i.location_id = l.id
                    WHERE i.house_key = ?
                `).all(houseKey).map(decryptItemRecord).map((existingItem) => [
                    createItemFingerprint(existingItem),
                    existingItem
                ])
            );

            // Import categories
            if (categories && Array.isArray(categories)) {
                const insertCategory = db.prepare('INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)');
                for (const cat of categories) {
                    // Check if category already exists
                    const existing = existingCategoriesByName.get(cat.name);
                    if (existing) {
                        categoryMap[cat.id] = existing.id;
                        skippedCategories++;
                    } else {
                        const result = insertCategory.run(
                            encryptCategoryName(cat.name),
                            cat.icon || '📦',
                            cat.color || '#6366f1',
                            houseKey
                        );
                        categoryMap[cat.id] = result.lastInsertRowid;
                        existingCategoriesByName.set(cat.name, {
                            id: result.lastInsertRowid,
                            name: cat.name,
                            icon: cat.icon || '📦',
                            color: cat.color || '#6366f1'
                        });
                        importedCategories++;
                        pushUniquePreview(importPreview.categories, cat.name);
                    }
                }
            }

            // Import rooms
            if (rooms && Array.isArray(rooms)) {
                const insertRoom = db.prepare('INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)');
                for (const room of rooms) {
                    const existing = existingRoomsByName.get(room.name);
                    if (existing) {
                        roomMap[room.id] = existing.id;
                        skippedRooms++;
                    } else {
                        const result = insertRoom.run(
                            encryptRoomName(room.name),
                            room.description ? encryptRoomDescription(room.description) : '',
                            houseKey
                        );
                        roomMap[room.id] = result.lastInsertRowid;
                        existingRoomsByName.set(room.name, {
                            id: result.lastInsertRowid,
                            name: room.name,
                            description: room.description || ''
                        });
                        importedRooms++;
                        pushUniquePreview(importPreview.rooms, room.name);
                    }
                }
            }

            // Import locations
            if (locations && Array.isArray(locations)) {
                const insertLocation = db.prepare('INSERT INTO locations (name, room_id, created_by, house_key) VALUES (?, ?, ?, ?)');
                for (const loc of locations) {
                    const existing = existingLocationsByName.get(loc.name);
                    if (existing) {
                        locationMap[loc.id] = existing.id;
                        skippedLocations++;
                    } else {
                        // Find room_id from mapping or by name
                        let roomId = null;
                        if (loc.room_id && roomMap[loc.room_id]) {
                            roomId = roomMap[loc.room_id];
                        } else if (loc.room_name) {
                            const room = existingRoomsByName.get(loc.room_name);
                            if (room) roomId = room.id;
                        }
                        const result = insertLocation.run(encryptLocationName(loc.name), roomId, req.user.id, houseKey);
                        locationMap[loc.id] = result.lastInsertRowid;
                        existingLocationsByName.set(loc.name, {
                            id: result.lastInsertRowid,
                            name: loc.name,
                            room_id: roomId
                        });
                        importedLocations++;
                        pushUniquePreview(importPreview.locations, loc.name);
                    }
                }
            }

            // Import items
            const insertItem = db.prepare(`
                INSERT INTO items (
                    name, description, quantity, photo_path, thumbnail_path, invoice_photo_path, invoice_thumbnail_path,
                    barcode, invoice_price, invoice_currency, invoice_date,
                    warranty_start_date, warranty_duration_value, warranty_duration_unit, warranty_expiry_date,
                    barcode_lookup, category_id, room_id, location_id, is_public, user_id, house_key, expiry_date, min_quantity
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of items) {
                const itemFingerprint = createItemFingerprint(item);
                const existingItem = existingItemsByFingerprint.get(itemFingerprint);
                if (existingItem) {
                    itemMap[item.id] = existingItem.id;
                    skippedItems++;
                    continue;
                }

                // Find category_id
                let categoryId = null;
                if (item.category_id && categoryMap[item.category_id]) {
                    categoryId = categoryMap[item.category_id];
                } else if (item.category_name) {
                    const cat = existingCategoriesByName.get(item.category_name);
                    if (cat) categoryId = cat.id;
                }

                // Find room_id
                let roomId = null;
                if (item.room_id && roomMap[item.room_id]) {
                    roomId = roomMap[item.room_id];
                } else if (item.room_name) {
                    const room = existingRoomsByName.get(item.room_name);
                    if (room) roomId = room.id;
                }

                // Find location_id
                let locationId = null;
                if (item.location_id && locationMap[item.location_id]) {
                    locationId = locationMap[item.location_id];
                } else if (item.location_name) {
                    const loc = existingLocationsByName.get(item.location_name);
                    if (loc) locationId = loc.id;
                }

                const result = insertItem.run(
                    ...(() => {
                        const normalizedWarrantyDetails = normalizeWarrantyDetails({
                            invoice_date: item.invoice_date || '',
                            warranty_start_date: item.warranty_start_date || '',
                            warranty_duration_value: item.warranty_duration_value || '',
                            warranty_duration_unit: item.warranty_duration_unit || '',
                            warranty_expiry_date: item.warranty_expiry_date || ''
                        });

                        return [
                    encryptItemName(item.name),
                    item.description ? encryptItemDescription(item.description) : '',
                    item.quantity || 1,
                    hasMediaEntries ? (item.photo_path || null) : null,
                    hasMediaEntries ? (item.thumbnail_path || null) : null,
                    hasMediaEntries ? (item.invoice_photo_path || null) : null,
                    hasMediaEntries ? (item.invoice_thumbnail_path || null) : null,
                    item.barcode ? encryptItemBarcode(item.barcode) : null,
                    item.invoice_price ? encryptItemInvoicePrice(item.invoice_price) : null,
                    item.invoice_currency ? encryptItemInvoiceCurrency(item.invoice_currency) : null,
                    item.invoice_date ? encryptItemInvoiceDate(item.invoice_date) : null,
                    normalizedWarrantyDetails.warranty_start_date ? encryptItemWarrantyStartDate(normalizedWarrantyDetails.warranty_start_date) : null,
                    normalizedWarrantyDetails.warranty_duration_value ? encryptItemWarrantyDurationValue(String(normalizedWarrantyDetails.warranty_duration_value)) : null,
                    normalizedWarrantyDetails.warranty_duration_unit ? encryptItemWarrantyDurationUnit(normalizedWarrantyDetails.warranty_duration_unit) : null,
                    normalizedWarrantyDetails.warranty_expiry_date ? encryptItemWarrantyExpiryDate(normalizedWarrantyDetails.warranty_expiry_date) : null,
                    buildBarcodeLookup(item.barcode),
                    categoryId,
                    roomId,
                    locationId,
                    item.is_public === false || item.is_public === 0 ? 0 : 1,
                    req.user.id,
                    houseKey,
                    item.expiry_date || null,
                    Math.max(0, Number.parseInt(String(item.min_quantity || 0), 10) || 0)
                        ];
                    })()
                );
                itemMap[item.id] = result.lastInsertRowid;
                existingItemsByFingerprint.set(itemFingerprint, {
                    id: result.lastInsertRowid,
                    ...item
                });
                importedItems++;
                pushUniquePreview(importPreview.items, item.name);
            }

            if (borrows && Array.isArray(borrows)) {
                const existingBorrowFingerprints = new Set(
                    db.prepare(`
                        SELECT
                            ib.item_id,
                            ib.borrower_type,
                            ib.borrower_user_id,
                            ib.borrower_name,
                            ib.borrower_contact,
                            ib.note,
                            ib.borrowed_at,
                            ib.due_date,
                            ib.return_requested_at,
                            ib.return_request_note,
                            ib.returned_at,
                            ib.return_note,
                            borrower.username as borrower_username
                        FROM item_borrows ib
                        LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
                        WHERE ib.house_key = ?
                    `).all(houseKey).map(decryptBorrowRecord).map((existingBorrow) =>
                        createBorrowFingerprint(existingBorrow, existingBorrow.item_id)
                    )
                );
                const insertBorrow = db.prepare(`
                    INSERT INTO item_borrows (
                        item_id, house_key, borrower_type, borrower_user_id, borrower_name,
                        borrower_contact, note, borrowed_at, due_date, return_requested_at,
                        return_requested_by_user_id, return_request_note, returned_at, return_note,
                        lent_by_user_id, returned_by_user_id, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const borrow of borrows) {
                    const mappedItemId = itemMap[borrow.item_id];
                    if (!mappedItemId) {
                        continue;
                    }

                    let borrowerType = borrow.borrower_type === 'member' ? 'member' : 'external';
                    let borrowerUserId = null;
                    let borrowerName = borrow.borrower_name || null;

                    if (borrowerType === 'member' && borrow.borrower_username) {
                        const member = db.prepare(`
                            SELECT u.id
                            FROM user_houses uh
                            JOIN users u ON u.id = uh.user_id
                            WHERE uh.house_key = ? AND u.username_lookup = ?
                            LIMIT 1
                        `).get(houseKey, buildUsernameLookup(borrow.borrower_username));

                        if (member?.id) {
                            borrowerUserId = member.id;
                            borrowerName = null;
                        } else {
                            borrowerType = 'external';
                            borrowerName = borrow.borrower_username || borrower.borrower_name || 'Bilinmeyen üye';
                        }
                    }

                    if (borrowerType === 'external' && !borrowerName) {
                        borrowerName = 'Bilinmeyen kişi';
                    }

                    const borrowFingerprint = createBorrowFingerprint(borrow, mappedItemId, borrowerName);
                    if (existingBorrowFingerprints.has(borrowFingerprint)) {
                        skippedBorrows++;
                        continue;
                    }

                    insertBorrow.run(
                        mappedItemId,
                        houseKey,
                        borrowerType,
                        borrowerUserId,
                        borrowerName ? encryptBorrowerName(borrowerName) : null,
                        borrow.borrower_contact ? encryptBorrowerContact(borrow.borrower_contact) : null,
                        borrow.note ? encryptBorrowNote(borrow.note) : null,
                        borrow.borrowed_at || new Date().toISOString(),
                        borrow.due_date || null,
                        borrow.return_requested_at || null,
                        borrow.return_requested_at ? req.user.id : null,
                        borrow.return_request_note ? encryptBorrowReturnNote(borrow.return_request_note) : null,
                        borrow.returned_at || null,
                        borrow.return_note ? encryptBorrowReturnNote(borrow.return_note) : null,
                        req.user.id,
                        borrow.returned_at ? req.user.id : null,
                        borrow.borrowed_at || new Date().toISOString(),
                        borrow.returned_at || borrow.borrowed_at || new Date().toISOString()
                    );
                    existingBorrowFingerprints.add(borrowFingerprint);
                    importedBorrows++;
                    pushUniquePreview(
                        importPreview.borrows,
                        borrow.borrower_username || borrowerName || `item:${mappedItemId}`
                    );
                }
            }

            if (hasMediaEntries && attachments && Array.isArray(attachments)) {
                const existingAttachmentFingerprints = new Set(
                    db.prepare(`
                        SELECT item_id, original_name, stored_path, mime_type, size_bytes
                        FROM item_attachments
                        WHERE house_key = ?
                    `).all(houseKey).map((attachment) => JSON.stringify([
                        Number(attachment.item_id || 0),
                        normalizeImportValue(decryptAttachmentOriginalName(attachment.original_name)),
                        normalizeImportValue(attachment.stored_path),
                        normalizeImportValue(attachment.mime_type),
                        Number(attachment.size_bytes || 0)
                    ]))
                );
                const insertAttachment = db.prepare(`
                    INSERT INTO item_attachments (
                        item_id, house_key, uploaded_by, original_name, stored_path, mime_type, size_bytes, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const attachment of attachments) {
                    const mappedItemId = itemMap[attachment.item_id];
                    const storedPath = normalizeStoredPath(attachment.stored_path);
                    if (!mappedItemId || !storedPath) {
                        continue;
                    }
                    const attachmentName = String(decryptAttachmentOriginalName(attachment.original_name) || 'attachment').slice(0, 160);

                    const fingerprint = JSON.stringify([
                        Number(mappedItemId || 0),
                        normalizeImportValue(attachmentName),
                        normalizeImportValue(storedPath),
                        normalizeImportValue(attachment.mime_type),
                        Number(attachment.size_bytes || 0)
                    ]);
                    if (existingAttachmentFingerprints.has(fingerprint)) {
                        skippedAttachments++;
                        continue;
                    }

                    insertAttachment.run(
                        mappedItemId,
                        houseKey,
                        req.user.id,
                        encryptAttachmentOriginalName(attachmentName),
                        storedPath,
                        String(attachment.mime_type || 'application/octet-stream').slice(0, 120),
                        Math.max(0, Number.parseInt(String(attachment.size_bytes || 0), 10) || 0),
                        attachment.created_at || new Date().toISOString()
                    );
                    existingAttachmentFingerprints.add(fingerprint);
                    importedAttachments++;
                    pushUniquePreview(importPreview.attachments, attachmentName || storedPath);
                }
            }
        });

        importAll();
        restoredMedia = restoreMediaEntries(media);

        res.json({
            message: 'Yedek başarıyla içe aktarıldı',
            imported: {
                items: importedItems,
                categories: importedCategories,
                rooms: importedRooms,
                locations: importedLocations,
                borrows: importedBorrows,
                attachments: importedAttachments,
                media: restoredMedia.restoredMedia
            },
            skipped: {
                items: skippedItems,
                categories: skippedCategories,
                rooms: skippedRooms,
                locations: skippedLocations,
                borrows: skippedBorrows,
                attachments: skippedAttachments
            },
            source: {
                items: Array.isArray(items) ? items.length : 0,
                categories: Array.isArray(categories) ? categories.length : 0,
                rooms: Array.isArray(rooms) ? rooms.length : 0,
                locations: Array.isArray(locations) ? locations.length : 0,
                borrows: Array.isArray(borrows) ? borrows.length : 0,
                attachments: Array.isArray(attachments) ? attachments.length : 0,
                media: Array.isArray(media) ? media.length : 0
            },
            restoredMedia,
            preview: {
                ...importPreview,
                omitted: {
                    items: Math.max(importedItems - importPreview.items.length, 0),
                    categories: Math.max(importedCategories - importPreview.categories.length, 0),
                    rooms: Math.max(importedRooms - importPreview.rooms.length, 0),
                    locations: Math.max(importedLocations - importPreview.locations.length, 0),
                    borrows: Math.max(importedBorrows - importPreview.borrows.length, 0),
                    attachments: Math.max(importedAttachments - importPreview.attachments.length, 0)
                }
            }
        });
    } catch (err) {
        console.error('Import error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Yedek içe aktarılırken hata oluştu' });
    }
});

export default router;
