import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import crypto from 'node:crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { hashLookupToken } from '../utils/encryption.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { isHouseOwner } from '../utils/houseMembership.js';
import { normalizeWarrantyDetails } from '../utils/warrantyValidation.js';
import {
    ensurePrivateDirectory,
    normalizeStoredPath,
    PRIVATE_FILE_MODE,
    resolveStoredMediaPath
} from '../utils/mediaStorage.js';
import { getUploadsRoot } from '../utils/runtimePaths.js';
import {
    buildBarcodeLookup,
    decryptBoxRecord,
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
    encryptBoxCode,
    encryptBoxName,
    encryptBoxNote,
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
    'uploads/attachments',
    'uploads/boxes',
    'uploads/boxes/thumbnails'
];
const RESTORE_MEDIA_DIRECTORIES = new Map([
    ['uploads', '.webp'],
    ['uploads/thumbnails', '.webp'],
    ['uploads/invoices', '.webp'],
    ['uploads/invoices/thumbnails', '.webp'],
    ['uploads/attachments', '.bin'],
    ['uploads/boxes', '.webp'],
    ['uploads/boxes/thumbnails', '.webp']
]);

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

function normalizeImportBoolean(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLocaleLowerCase('en-US'));
}

function createLocationScopeKey(name, roomId) {
    return JSON.stringify([
        String(roomId ?? ''),
        normalizeImportValue(name)
    ]);
}

function buildScopedLocationMap(records) {
    const map = new Map();

    for (const record of records) {
        if (!record?.name) continue;
        const key = createLocationScopeKey(record.name, record.room_id);
        if (!map.has(key)) map.set(key, record);
    }

    return map;
}

function createItemFingerprint(item, {
    ownerId = item?.user_id,
    categoryId = item?.category_id,
    roomId = item?.room_id,
    locationId = item?.location_id,
    boxId = item?.box_id
} = {}) {
    return JSON.stringify([
        normalizeImportValue(item.name),
        normalizeImportValue(item.description),
        Number(item.quantity || 1),
        normalizeImportValue(item.barcode),
        Number(categoryId || 0),
        Number(roomId || 0),
        Number(locationId || 0),
        Number(boxId || 0),
        normalizeImportBoolean(item.is_public, true) ? 1 : 0,
        Number(ownerId || 0),
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

function findMatchingItemCandidate(candidates = [], importedMediaSignature = []) {
    const suppliedMediaIndexes = importedMediaSignature
        .map((digest, index) => digest ? index : -1)
        .filter((index) => index >= 0);

    if (suppliedMediaIndexes.length === 0) {
        return candidates[0]?.item || null;
    }

    return candidates.find((candidate) => (
        suppliedMediaIndexes.every(
            (index) => candidate.mediaSignature[index] === importedMediaSignature[index]
        )
    ))?.item || null;
}

function collectMediaEntries(items, attachments = [], boxes = []) {
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

    for (const box of boxes) {
        for (const field of ['photo_path', 'thumbnail_path']) {
            const storedPath = normalizeStoredPath(box?.[field]);
            if (!storedPath || seen.has(storedPath)) continue;
            const resolvedPath = resolveStoredMediaPath(storedPath, {
                repoRoot,
                mediaRoot: uploadsRoot,
                allowedPrefixes: BACKUP_MEDIA_PREFIXES
            });
            if (!resolvedPath || !fs.existsSync(resolvedPath)) continue;
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) continue;
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

function getStoredMediaDirectory(storedPath) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) return null;
    const lastSeparator = normalized.lastIndexOf('/');
    return lastSeparator > 0 ? normalized.slice(0, lastSeparator) : null;
}

function createRestoreTarget(directory, extension, reservedTargets) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const targetPath = `${directory}/restore-${Date.now()}-${crypto.randomUUID()}${extension}`;
        const resolvedTargetPath = resolveStoredMediaPath(targetPath, {
            repoRoot,
            mediaRoot: uploadsRoot,
            allowedPrefixes: BACKUP_MEDIA_PREFIXES
        });
        if (
            resolvedTargetPath
            && !reservedTargets.has(targetPath)
            && !fs.existsSync(resolvedTargetPath)
        ) {
            reservedTargets.add(targetPath);
            return { targetPath, resolvedTargetPath };
        }
    }

    throw new Error('İçe aktarılan medya için benzersiz dosya adı oluşturulamadı');
}

function buildRestoreMediaPlan(mediaEntries = []) {
    const plan = {
        entries: [],
        bySource: new Map(),
        totalBytes: 0
    };
    if (!Array.isArray(mediaEntries)) return plan;

    let totalBytes = 0;
    const reservedTargets = new Set();
    for (const entry of mediaEntries) {
        const storedPath = normalizeStoredPath(entry?.path);
        const contentBase64 = String(entry?.content_base64 || '').replace(/\s+/g, '');
        const sourceDirectory = getStoredMediaDirectory(storedPath);
        const extension = RESTORE_MEDIA_DIRECTORIES.get(sourceDirectory);
        if (!storedPath || !contentBase64 || !extension || plan.bySource.has(storedPath)) continue;

        const resolvedSourcePath = resolveStoredMediaPath(storedPath, {
            repoRoot,
            mediaRoot: uploadsRoot,
            allowedPrefixes: BACKUP_MEDIA_PREFIXES
        });
        if (!resolvedSourcePath) continue;

        const buffer = Buffer.from(contentBase64, 'base64');
        const canonicalInput = contentBase64.replace(/=+$/g, '');
        const canonicalDecoded = buffer.toString('base64').replace(/=+$/g, '');
        const declaredSize = Number.parseInt(String(entry?.size ?? ''), 10);
        const sizeMatches = !Number.isInteger(declaredSize)
            || (declaredSize >= 0 && declaredSize === buffer.length);
        if (!buffer.length || canonicalDecoded !== canonicalInput || !sizeMatches) {
            if (Buffer.isBuffer(buffer)) buffer.fill(0);
            continue;
        }

        totalBytes += buffer.length;
        if (totalBytes > MAX_FULL_BACKUP_MEDIA_BYTES) {
            if (Buffer.isBuffer(buffer)) buffer.fill(0);
            const error = new Error('İçe aktarılan medya güvenli boyut sınırını aşıyor');
            error.statusCode = 413;
            throw error;
        }

        const { targetPath, resolvedTargetPath } = createRestoreTarget(
            sourceDirectory,
            extension,
            reservedTargets
        );
        const plannedEntry = {
            sourcePath: storedPath,
            targetPath,
            resolvedTargetPath,
            contentBase64,
            size: buffer.length,
            digest: crypto.createHash('sha256').update(buffer).digest('hex'),
            staged: false
        };
        plan.entries.push(plannedEntry);
        plan.bySource.set(storedPath, plannedEntry);
        buffer.fill(0);
    }

    plan.totalBytes = totalBytes;
    return plan;
}

function getRestoreMediaEntry(value, restoreMediaPlan, expectedDirectory) {
    const storedPath = normalizeStoredPath(value);
    if (!storedPath || getStoredMediaDirectory(storedPath) !== expectedDirectory) return null;
    return restoreMediaPlan.bySource.get(storedPath) || null;
}

function removeRestoreEntry(entry) {
    if (!entry?.resolvedTargetPath) return;
    try {
        if (fs.existsSync(entry.resolvedTargetPath)) fs.unlinkSync(entry.resolvedTargetPath);
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            console.warn('[Backup] Restore media cleanup failed:', error.message);
        }
    } finally {
        entry.staged = false;
    }
}

function cleanupRestoreMediaPlan(restoreMediaPlan, keepTargetPaths = new Set()) {
    if (!restoreMediaPlan?.entries) return;
    for (const entry of restoreMediaPlan.entries) {
        if (!keepTargetPaths.has(entry.targetPath)) removeRestoreEntry(entry);
    }
}

function stageRestoreMediaPlan(restoreMediaPlan) {
    if (!restoreMediaPlan?.entries?.length) return;
    const configuredFailurePoint = process.env.NODE_ENV === 'test'
        ? Number.parseInt(String(process.env.HOMEINVENTORY_TEST_BACKUP_MEDIA_FAIL_AFTER || ''), 10)
        : Number.NaN;
    const failAfter = Number.isInteger(configuredFailurePoint) && configuredFailurePoint >= 0
        ? configuredFailurePoint
        : null;
    let stagedCount = 0;

    try {
        for (const entry of restoreMediaPlan.entries) {
            if (failAfter !== null && stagedCount >= failAfter) {
                throw new Error('Test backup media staging failure');
            }

            ensurePrivateDirectory(dirname(entry.resolvedTargetPath));
            const buffer = Buffer.from(entry.contentBase64, 'base64');
            try {
                fs.writeFileSync(entry.resolvedTargetPath, buffer, {
                    flag: 'wx',
                    mode: PRIVATE_FILE_MODE
                });
                entry.staged = true;
                if (process.platform !== 'win32') {
                    fs.chmodSync(entry.resolvedTargetPath, PRIVATE_FILE_MODE);
                }
            } finally {
                buffer.fill(0);
            }
            stagedCount++;
        }
    } catch (error) {
        cleanupRestoreMediaPlan(restoreMediaPlan);
        throw error;
    }
}

function getStoredMediaDigest(storedPath, expectedDirectory) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) return null;
    if (getStoredMediaDirectory(normalized) !== expectedDirectory) {
        return 'unavailable';
    }

    const resolvedPath = resolveStoredMediaPath(normalized, {
        repoRoot,
        mediaRoot: uploadsRoot,
        allowedPrefixes: BACKUP_MEDIA_PREFIXES
    });
    if (!resolvedPath || !fs.existsSync(resolvedPath)) return 'unavailable';

    try {
        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile() || stats.size > MAX_FULL_BACKUP_MEDIA_BYTES) return 'unavailable';
        const buffer = fs.readFileSync(resolvedPath);
        try {
            return crypto.createHash('sha256').update(buffer).digest('hex');
        } finally {
            buffer.fill(0);
        }
    } catch {
        return 'unavailable';
    }
}

function getExistingItemMediaSignature(item) {
    return [
        getStoredMediaDigest(item.photo_path, 'uploads'),
        getStoredMediaDigest(item.thumbnail_path, 'uploads/thumbnails'),
        getStoredMediaDigest(item.invoice_photo_path, 'uploads/invoices'),
        getStoredMediaDigest(item.invoice_thumbnail_path, 'uploads/invoices/thumbnails')
    ];
}

function getImportedItemMediaEntries(item, restoreMediaPlan) {
    return [
        getRestoreMediaEntry(item.photo_path, restoreMediaPlan, 'uploads'),
        getRestoreMediaEntry(item.thumbnail_path, restoreMediaPlan, 'uploads/thumbnails'),
        getRestoreMediaEntry(item.invoice_photo_path, restoreMediaPlan, 'uploads/invoices'),
        getRestoreMediaEntry(item.invoice_thumbnail_path, restoreMediaPlan, 'uploads/invoices/thumbnails')
    ];
}

function resolveImportedItemOwnerId(item, memberIdsByUsernameLookup, fallbackUserId) {
    const ownerUsername = String(
        item?.username
        || item?.owner_name
        || item?.created_by_name
        || ''
    ).trim().slice(0, 255);
    if (!ownerUsername) return fallbackUserId;

    try {
        return memberIdsByUsernameLookup.get(buildUsernameLookup(ownerUsername)) || fallbackUserId;
    } catch {
        return fallbackUserId;
    }
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
                i.category_id, i.room_id, i.location_id,
                c.name as category_name, c.icon as category_icon, c.color as category_color,
                r.name as room_name,
                l.name as location_name,
                b.id as box_id, b.name as box_name, b.code as box_code,
                owner.username as username,
                i.created_at, i.updated_at
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN rooms r ON i.room_id = r.id
            LEFT JOIN locations l ON i.location_id = l.id
            LEFT JOIN boxes b ON i.box_id = b.id
            LEFT JOIN users owner ON i.user_id = owner.id
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
            SELECT l.id, l.name, l.room_id, l.is_public, r.name as room_name,
                   creator.username AS created_by_name
            FROM locations l
            LEFT JOIN rooms r ON l.room_id = r.id
            LEFT JOIN users creator ON l.created_by = creator.id
            WHERE l.house_key = ?
        `).all(houseKey).map(decryptLocationRecord);

        const boxes = db.prepare(`
            SELECT b.id, b.name, b.code, b.note, b.is_public, b.room_id, b.location_id,
                   r.name AS room_name, l.name AS location_name,
                   creator.username AS created_by_name,
                   b.archived_at, b.created_at, b.updated_at
            FROM boxes b
            LEFT JOIN rooms r ON b.room_id = r.id
            LEFT JOIN locations l ON b.location_id = l.id
            LEFT JOIN users creator ON b.created_by = creator.id
            WHERE b.house_key = ?
        `).all(houseKey).map(decryptBoxRecord);

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
            version: '1.6',
            exportDate: new Date().toISOString(),
            meta: {
                containsDecryptedData: true,
                securityWarning: 'This backup contains decrypted household data. Store it in a secure location and do not share it over insecure channels.'
            },
            items,
            categories,
            rooms,
            locations,
            boxes,
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
                i.category_id, i.room_id, i.location_id,
                c.name as category_name, c.icon as category_icon, c.color as category_color,
                r.name as room_name,
                l.name as location_name,
                b.id as box_id, b.name as box_name, b.code as box_code,
                owner.username as username,
                i.created_at, i.updated_at
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN rooms r ON i.room_id = r.id
            LEFT JOIN locations l ON i.location_id = l.id
            LEFT JOIN boxes b ON i.box_id = b.id
            LEFT JOIN users owner ON i.user_id = owner.id
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
            SELECT l.id, l.name, l.room_id, l.is_public, r.name as room_name,
                   creator.username AS created_by_name
            FROM locations l
            LEFT JOIN rooms r ON l.room_id = r.id
            LEFT JOIN users creator ON l.created_by = creator.id
            WHERE l.house_key = ?
        `).all(houseKey).map(decryptLocationRecord);
        const boxes = db.prepare(`
            SELECT b.id, b.name, b.code, b.note, b.is_public, b.room_id, b.location_id,
                   b.photo_path, b.thumbnail_path,
                   r.name AS room_name, l.name AS location_name,
                   creator.username AS created_by_name,
                   b.archived_at, b.created_at, b.updated_at
            FROM boxes b
            LEFT JOIN rooms r ON b.room_id = r.id
            LEFT JOIN locations l ON b.location_id = l.id
            LEFT JOIN users creator ON b.created_by = creator.id
            WHERE b.house_key = ?
        `).all(houseKey).map(decryptBoxRecord);
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

        const { mediaEntries, totalBytes } = collectMediaEntries(items, attachments, boxes);

        res.json({
            version: '1.6-full',
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
            boxes,
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
    let restoreMediaPlan = null;
    let databaseCommitted = false;
    try {
        const houseKey = req.user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        const { items, categories, rooms, locations, boxes, borrows, attachments, media } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz yedek dosyası formatı' });
        }
        if (items.length > MAX_IMPORT_ITEMS) {
            return res.status(400).json({ error: `Tek seferde en fazla ${MAX_IMPORT_ITEMS} eşya içe aktarılabilir` });
        }
        restoreMediaPlan = buildRestoreMediaPlan(media);
        const usedRestoredMediaPaths = new Set();

        let importedCategories = 0;
        let importedRooms = 0;
        let importedLocations = 0;
        let importedBoxes = 0;
        let importedItems = 0;
        let importedBorrows = 0;
        let importedAttachments = 0;
        let skippedCategories = 0;
        let skippedRooms = 0;
        let skippedLocations = 0;
        let skippedBoxes = 0;
        let skippedItems = 0;
        let skippedBorrows = 0;
        let skippedAttachments = 0;

        const importPreview = {
            items: [],
            categories: [],
            rooms: [],
            locations: [],
            boxes: [],
            borrows: [],
            attachments: []
        };
        let restoredMedia = { restoredMedia: 0, restoredBytes: 0 };

        // Map to store old_id -> new_id for foreign key references
        const categoryMap = {};
        const roomMap = {};
        const locationMap = {};
        const boxMap = {};
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

            const existingLocationsByScope = buildScopedLocationMap(
                db.prepare('SELECT * FROM locations WHERE house_key = ?')
                    .all(houseKey)
                    .map(decryptLocationRecord)
            );

            const existingBoxesByCode = new Map(
                db.prepare('SELECT * FROM boxes WHERE house_key = ?')
                    .all(houseKey)
                    .map(decryptBoxRecord)
                    .map((box) => [String(box.code || '').toLocaleUpperCase('en-US'), box])
            );

            const memberIdsByUsernameLookup = new Map(
                db.prepare(`
                    SELECT u.id, u.username_lookup
                    FROM user_houses uh
                    JOIN users u ON u.id = uh.user_id
                    WHERE uh.house_key = ?
                `).all(houseKey)
                    .filter((member) => member.username_lookup)
                    .map((member) => [member.username_lookup, member.id])
            );

            const existingItemsByFingerprint = new Map();
            const existingItems = db.prepare(`
                SELECT
                    i.id, i.name, i.description, i.quantity, i.barcode,
                    i.photo_path, i.thumbnail_path, i.invoice_photo_path, i.invoice_thumbnail_path,
                    i.invoice_price, i.invoice_currency, i.invoice_date,
                    i.warranty_start_date, i.warranty_duration_value, i.warranty_duration_unit, i.warranty_expiry_date,
                    i.expiry_date, i.min_quantity, i.is_public, i.user_id,
                    i.category_id, i.room_id, i.location_id, i.box_id,
                    c.name as category_name, r.name as room_name, l.name as location_name,
                    b.name as box_name, b.code as box_code
                FROM items i
                LEFT JOIN categories c ON i.category_id = c.id
                LEFT JOIN rooms r ON i.room_id = r.id
                LEFT JOIN locations l ON i.location_id = l.id
                LEFT JOIN boxes b ON i.box_id = b.id
                WHERE i.house_key = ?
            `).all(houseKey).map(decryptItemRecord);
            for (const existingItem of existingItems) {
                const fingerprint = createItemFingerprint(existingItem, {
                    ownerId: existingItem.user_id,
                    categoryId: existingItem.category_id,
                    roomId: existingItem.room_id,
                    locationId: existingItem.location_id,
                    boxId: existingItem.box_id
                });
                const candidates = existingItemsByFingerprint.get(fingerprint) || [];
                candidates.push({
                    item: existingItem,
                    mediaSignature: getExistingItemMediaSignature(existingItem)
                });
                existingItemsByFingerprint.set(fingerprint, candidates);
            }

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
                const insertLocation = db.prepare(`
                    INSERT INTO locations (name, room_id, created_by, is_public, house_key)
                    VALUES (?, ?, ?, ?, ?)
                `);
                for (const loc of locations) {
                    // Resolve the room before matching the location: different rooms may
                    // intentionally contain shelves/locations with the same name.
                    let roomId = null;
                    if (loc.room_id && roomMap[loc.room_id]) {
                        roomId = roomMap[loc.room_id];
                    } else if (loc.room_name) {
                        const room = existingRoomsByName.get(loc.room_name);
                        if (room) roomId = room.id;
                    }
                    const locationKey = createLocationScopeKey(loc.name, roomId);
                    const existing = existingLocationsByScope.get(locationKey);
                    const locationIsPublic = normalizeImportBoolean(loc.is_public, false);
                    const locationOwnerId = resolveImportedItemOwnerId(
                        loc,
                        memberIdsByUsernameLookup,
                        req.user.id
                    );
                    const canReuseExisting = existing && (
                        Boolean(existing.is_public) === locationIsPublic
                        && (locationIsPublic || existing.created_by === locationOwnerId)
                    );
                    if (canReuseExisting) {
                        locationMap[loc.id] = existing.id;
                        skippedLocations++;
                    } else {
                        const result = insertLocation.run(
                            encryptLocationName(loc.name),
                            roomId,
                            locationOwnerId,
                            locationIsPublic ? 1 : 0,
                            houseKey
                        );
                        locationMap[loc.id] = result.lastInsertRowid;
                        existingLocationsByScope.set(locationKey, {
                            id: result.lastInsertRowid,
                            name: loc.name,
                            room_id: roomId,
                            is_public: locationIsPublic ? 1 : 0,
                            created_by: locationOwnerId
                        });
                        importedLocations++;
                        pushUniquePreview(importPreview.locations, loc.name);
                    }
                }
            }

            // Boxes are restored after rooms/locations so their last known place remains intact.
            if (boxes && Array.isArray(boxes)) {
                const insertBox = db.prepare(`
                    INSERT INTO boxes (
                        name, code, code_lookup, note, is_public, room_id, location_id,
                        photo_path, thumbnail_path, created_by, house_key, archived_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const box of boxes) {
                    const normalizedCode = String(box.code || '').trim().toLocaleUpperCase('en-US').slice(0, 24);
                    if (!normalizedCode || !/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(normalizedCode)) {
                        skippedBoxes++;
                        continue;
                    }
                    const boxIsPublic = normalizeImportBoolean(box.is_public, true);
                    const boxOwnerId = resolveImportedItemOwnerId(
                        box,
                        memberIdsByUsernameLookup,
                        req.user.id
                    );
                    const existing = existingBoxesByCode.get(normalizedCode);
                    if (existing) {
                        const canReuseExisting = (
                            Boolean(existing.is_public) === boxIsPublic
                            && (boxIsPublic || existing.created_by === boxOwnerId)
                        );
                        if (canReuseExisting) {
                            boxMap[box.id] = existing.id;
                        }
                        skippedBoxes++;
                        continue;
                    }

                    let roomId = box.room_id && roomMap[box.room_id] ? roomMap[box.room_id] : null;
                    if (!roomId && box.room_name) roomId = existingRoomsByName.get(box.room_name)?.id || null;
                    let locationId = box.location_id && locationMap[box.location_id] ? locationMap[box.location_id] : null;
                    if (!locationId && box.location_name) {
                        locationId = existingLocationsByScope.get(createLocationScopeKey(box.location_name, roomId))?.id || null;
                    }
                    if (locationId) {
                        const mappedLocation = db.prepare(`
                            SELECT is_public, created_by
                            FROM locations
                            WHERE id = ? AND house_key = ?
                        `).get(locationId, houseKey);
                        if (
                            !mappedLocation
                            || (boxIsPublic && !mappedLocation.is_public)
                            || (
                                !mappedLocation.is_public
                                && mappedLocation.created_by !== boxOwnerId
                            )
                        ) {
                            locationId = null;
                        }
                    }
                    const boxPhotoEntry = getRestoreMediaEntry(
                        box.photo_path,
                        restoreMediaPlan,
                        'uploads/boxes'
                    );
                    const boxThumbnailEntry = getRestoreMediaEntry(
                        box.thumbnail_path,
                        restoreMediaPlan,
                        'uploads/boxes/thumbnails'
                    );

                    const result = insertBox.run(
                        encryptBoxName(String(box.name || normalizedCode).trim().slice(0, 120)),
                        encryptBoxCode(normalizedCode),
                        hashLookupToken(normalizedCode),
                        box.note ? encryptBoxNote(String(box.note).slice(0, 1000)) : null,
                        boxIsPublic ? 1 : 0,
                        roomId,
                        locationId,
                        boxPhotoEntry?.targetPath || null,
                        boxThumbnailEntry?.targetPath || null,
                        boxOwnerId,
                        houseKey,
                        box.archived_at || null
                    );
                    if (boxPhotoEntry) usedRestoredMediaPaths.add(boxPhotoEntry.targetPath);
                    if (boxThumbnailEntry) usedRestoredMediaPaths.add(boxThumbnailEntry.targetPath);
                    boxMap[box.id] = result.lastInsertRowid;
                    existingBoxesByCode.set(normalizedCode, {
                        id: result.lastInsertRowid,
                        code: normalizedCode,
                        is_public: boxIsPublic ? 1 : 0,
                        created_by: boxOwnerId
                    });
                    importedBoxes++;
                    pushUniquePreview(importPreview.boxes, box.name || normalizedCode);
                }
            }

            // Import items
            const insertItem = db.prepare(`
                INSERT INTO items (
                    name, description, quantity, photo_path, thumbnail_path, invoice_photo_path, invoice_thumbnail_path,
                    barcode, invoice_price, invoice_currency, invoice_date,
                    warranty_start_date, warranty_duration_value, warranty_duration_unit, warranty_expiry_date,
                    barcode_lookup, category_id, room_id, location_id, box_id, is_public, user_id, house_key, expiry_date, min_quantity
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of items) {
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
                    const loc = existingLocationsByScope.get(createLocationScopeKey(item.location_name, roomId));
                    if (loc) locationId = loc.id;
                }

                const itemOwnerId = resolveImportedItemOwnerId(
                    item,
                    memberIdsByUsernameLookup,
                    req.user.id
                );
                if (locationId) {
                    const targetLocation = db.prepare(`
                        SELECT is_public, created_by
                        FROM locations
                        WHERE id = ? AND house_key = ?
                    `).get(locationId, houseKey);
                    if (
                        !targetLocation
                        || (!targetLocation.is_public && targetLocation.created_by !== itemOwnerId)
                    ) {
                        locationId = null;
                    }
                }
                let boxId = null;
                if (item.box_id && boxMap[item.box_id]) {
                    boxId = boxMap[item.box_id];
                } else if (item.box_code) {
                    const existingBox = existingBoxesByCode.get(String(item.box_code).toLocaleUpperCase('en-US'));
                    if (existingBox?.is_public || existingBox?.created_by === itemOwnerId) {
                        boxId = existingBox.id;
                    }
                }
                if (boxId) {
                    const targetBox = db.prepare(`
                        SELECT is_public, created_by
                        FROM boxes
                        WHERE id = ? AND house_key = ?
                    `).get(boxId, houseKey);
                    if (
                        !targetBox
                        || (!targetBox.is_public && targetBox.created_by !== itemOwnerId)
                    ) {
                        boxId = null;
                    }
                }
                const itemIsPublic = normalizeImportBoolean(item.is_public, true);
                const itemMediaEntries = getImportedItemMediaEntries(item, restoreMediaPlan);
                const importedMediaSignature = itemMediaEntries.map((entry) => entry?.digest || null);
                const itemFingerprint = createItemFingerprint(item, {
                    ownerId: itemOwnerId,
                    categoryId,
                    roomId,
                    locationId,
                    boxId
                });
                const existingItem = findMatchingItemCandidate(
                    existingItemsByFingerprint.get(itemFingerprint),
                    importedMediaSignature
                );
                if (existingItem) {
                    itemMap[item.id] = existingItem.id;
                    skippedItems++;
                    continue;
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
                    itemMediaEntries[0]?.targetPath || null,
                    itemMediaEntries[1]?.targetPath || null,
                    itemMediaEntries[2]?.targetPath || null,
                    itemMediaEntries[3]?.targetPath || null,
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
                    boxId,
                    itemIsPublic ? 1 : 0,
                    itemOwnerId,
                    houseKey,
                    item.expiry_date || null,
                    Math.max(0, Number.parseInt(String(item.min_quantity || 0), 10) || 0)
                        ];
                    })()
                );
                for (const mediaEntry of itemMediaEntries) {
                    if (mediaEntry) usedRestoredMediaPaths.add(mediaEntry.targetPath);
                }
                itemMap[item.id] = result.lastInsertRowid;
                const itemCandidates = existingItemsByFingerprint.get(itemFingerprint) || [];
                itemCandidates.push({
                    item: {
                        id: result.lastInsertRowid,
                        ...item
                    },
                    mediaSignature: importedMediaSignature
                });
                existingItemsByFingerprint.set(itemFingerprint, itemCandidates);
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

            if (restoreMediaPlan.entries.length > 0 && attachments && Array.isArray(attachments)) {
                const existingAttachmentFingerprints = new Set(
                    db.prepare(`
                        SELECT item_id, original_name, stored_path, mime_type, size_bytes
                        FROM item_attachments
                        WHERE house_key = ?
                    `).all(houseKey).map((attachment) => JSON.stringify([
                        Number(attachment.item_id || 0),
                        normalizeImportValue(decryptAttachmentOriginalName(attachment.original_name)),
                        normalizeImportValue(attachment.mime_type),
                        Number(attachment.size_bytes || 0),
                        getStoredMediaDigest(attachment.stored_path, 'uploads/attachments')
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
                    const mediaEntry = getRestoreMediaEntry(
                        attachment.stored_path,
                        restoreMediaPlan,
                        'uploads/attachments'
                    );
                    if (!mappedItemId || !mediaEntry) {
                        continue;
                    }
                    const attachmentName = String(decryptAttachmentOriginalName(attachment.original_name) || 'attachment').slice(0, 160);

                    const fingerprint = JSON.stringify([
                        Number(mappedItemId || 0),
                        normalizeImportValue(attachmentName),
                        normalizeImportValue(attachment.mime_type),
                        Number(attachment.size_bytes || 0),
                        mediaEntry.digest
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
                        mediaEntry.targetPath,
                        String(attachment.mime_type || 'application/octet-stream').slice(0, 120),
                        Math.max(0, Number.parseInt(String(attachment.size_bytes || 0), 10) || 0),
                        attachment.created_at || new Date().toISOString()
                    );
                    usedRestoredMediaPaths.add(mediaEntry.targetPath);
                    existingAttachmentFingerprints.add(fingerprint);
                    importedAttachments++;
                    pushUniquePreview(importPreview.attachments, attachmentName || mediaEntry.targetPath);
                }
            }
        });

        stageRestoreMediaPlan(restoreMediaPlan);
        importAll();
        databaseCommitted = true;
        cleanupRestoreMediaPlan(restoreMediaPlan, usedRestoredMediaPaths);
        const usedMediaEntries = restoreMediaPlan.entries.filter(
            (entry) => usedRestoredMediaPaths.has(entry.targetPath)
        );
        restoredMedia = {
            restoredMedia: usedMediaEntries.length,
            restoredBytes: usedMediaEntries.reduce((total, entry) => total + entry.size, 0)
        };

        res.json({
            message: 'Yedek başarıyla içe aktarıldı',
            imported: {
                items: importedItems,
                categories: importedCategories,
                rooms: importedRooms,
                locations: importedLocations,
                boxes: importedBoxes,
                borrows: importedBorrows,
                attachments: importedAttachments,
                media: restoredMedia.restoredMedia
            },
            skipped: {
                items: skippedItems,
                categories: skippedCategories,
                rooms: skippedRooms,
                locations: skippedLocations,
                boxes: skippedBoxes,
                borrows: skippedBorrows,
                attachments: skippedAttachments
            },
            source: {
                items: Array.isArray(items) ? items.length : 0,
                categories: Array.isArray(categories) ? categories.length : 0,
                rooms: Array.isArray(rooms) ? rooms.length : 0,
                locations: Array.isArray(locations) ? locations.length : 0,
                boxes: Array.isArray(boxes) ? boxes.length : 0,
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
                    boxes: Math.max(importedBoxes - importPreview.boxes.length, 0),
                    borrows: Math.max(importedBorrows - importPreview.borrows.length, 0),
                    attachments: Math.max(importedAttachments - importPreview.attachments.length, 0)
                }
            }
        });
    } catch (err) {
        if (!databaseCommitted) cleanupRestoreMediaPlan(restoreMediaPlan);
        console.error('Import error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Yedek içe aktarılırken hata oluştu' });
    }
});

export default router;
