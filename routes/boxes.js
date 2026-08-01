import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path, { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { decryptBufferFromStorage, encryptBufferForStorage, hashLookupToken } from '../utils/encryption.js';
import {
    decryptBoxRecord,
    decryptItemRecord,
    encryptBoxCode,
    encryptBoxName,
    encryptBoxNote,
    sortByName
} from '../utils/protectedFields.js';
import {
    ensurePrivateDirectory,
    normalizeStoredPath,
    readPrivateFileWithinLimit,
    resolveStoredMediaPath,
    writePrivateFile
} from '../utils/mediaStorage.js';
import { getUploadsRoot } from '../utils/runtimePaths.js';
import { MAX_PHOTO_UPLOAD_BYTES, MAX_PHOTO_UPLOAD_MB } from '../utils/mediaLimits.js';
import { validateUploadedImageBuffer } from '../utils/imageValidation.js';
import { recordItemActivity } from '../utils/activityLog.js';
import { isHouseOwner } from '../utils/houseMembership.js';

const router = express.Router();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const uploadsRoot = getUploadsRoot(repoRoot);
const boxUploadsDir = join(uploadsRoot, 'boxes');
const boxThumbnailsDir = join(boxUploadsDir, 'thumbnails');
const BOX_PHOTO_PURPOSE = 'inventory.box.media.photo';
const BOX_THUMBNAIL_PURPOSE = 'inventory.box.media.thumbnail';
const MAX_MEDIA_READ_BYTES = 16 * 1024 * 1024;
const MEDIA_FILE_REGEX = /^[A-Za-z0-9._-]+\.webp$/;
const MAX_BOX_ITEM_IDS = 250;

for (const directory of [boxUploadsDir, boxThumbnailsDir]) {
    ensurePrivateDirectory(directory);
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES },
    fileFilter(req, file, cb) {
        const allowed = /jpeg|jpg|png|gif|webp/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype));
    }
}).single('photo');

function uploadPhoto(req, res, next) {
    upload(req, res, (error) => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `Fotoğraf en fazla ${MAX_PHOTO_UPLOAD_MB} MB olabilir` });
        }
        if (error) {
            return next(error);
        }
        next();
    });
}

function normalizeOptionalText(value, field, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new Error(`${field} çok uzun`);
    return normalized;
}

function normalizeBoxName(value) {
    const name = normalizeOptionalText(value, 'Kutu adı', 120);
    if (!name) throw new Error('Kutu adı gerekli');
    return name;
}

function normalizeBoxCode(value) {
    const code = String(value ?? '').trim().toLocaleUpperCase('en-US');
    if (!code) throw new Error('Kısa kod gerekli');
    if (!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(code)) {
        throw new Error('Kısa kod 1-24 karakter olmalı; yalnızca harf, sayı, tire ve alt çizgi kullanılabilir');
    }
    return code;
}

function normalizePositiveId(value, field) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    const id = Number.parseInt(normalized, 10);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`${field} geçersiz`);
    return id;
}

function parseBooleanValue(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLocaleLowerCase('en-US'));
}

function createRequestError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    return error;
}

function resolvePlacement(body, houseKey, {
    existing = null,
    isPublic = true,
    ownerUserId
} = {}) {
    let roomId = body.room_id !== undefined
        ? normalizePositiveId(body.room_id, 'Oda')
        : existing?.room_id ?? null;
    const locationId = body.location_id !== undefined
        ? normalizePositiveId(body.location_id, 'Konum')
        : existing?.location_id ?? null;

    if (roomId && !db.prepare('SELECT id FROM rooms WHERE id = ? AND house_key = ?').get(roomId, houseKey)) {
        throw new Error('Oda bu eve ait değil');
    }

    if (locationId) {
        const location = db.prepare(`
            SELECT id, room_id, created_by, is_public
            FROM locations
            WHERE id = ? AND house_key = ?
        `)
            .get(locationId, houseKey);
        if (!location) throw new Error('Konum bu eve ait değil');
        if (isPublic && !location.is_public) {
            throw createRequestError(
                'Ortak kutular yalnızca ortak konumları kullanabilir',
                409,
                'BOX_VISIBILITY_CONFLICT'
            );
        }
        if (!isPublic && !location.is_public && location.created_by !== ownerUserId) {
            throw new Error('Özel kutu yalnızca size ait özel konumu kullanabilir');
        }
        if (roomId && location.room_id && roomId !== location.room_id) {
            throw new Error('Konum seçilen odada değil');
        }
        roomId ||= location.room_id || null;
    }

    return { roomId, locationId };
}

function getRequestErrorStatus(error) {
    if (Number.isInteger(error?.statusCode)) return error.statusCode;
    return /gerekli|ge(?:ç|c)ersiz|çok uzun|ait değil|seçilen odada değil|kısa kod/i.test(String(error?.message || ''))
        ? 400
        : 500;
}

function sendRequestError(res, error, fallback) {
    return res.status(getRequestErrorStatus(error)).json({
        error: error?.message || fallback,
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.currentUpdatedAt ? { current_updated_at: error.currentUpdatedAt } : {}),
        ...(Number.isInteger(error?.conflictingItemCount)
            ? { conflictingItemCount: error.conflictingItemCount }
            : {})
    });
}

function buildMediaUrl(storedPath) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) return null;
    const filename = normalized.split('/').at(-1);
    return normalized.startsWith('uploads/boxes/thumbnails/')
        ? `/api/boxes/media/thumbnail/${filename}`
        : `/api/boxes/media/photo/${filename}`;
}

function canManageBox(req, box) {
    if (!box) return false;
    if (!box.is_public) return box.created_by === req.user.id;
    return box.created_by === req.user.id || isHouseOwner(req.user.id, req.user.house_key);
}

function serializeBox(row, viewerUserId = null, viewerIsHouseOwner = false) {
    const box = decryptBoxRecord(row);
    const isPublic = box.is_public !== 0;
    const canManage = viewerUserId !== null && (
        box.created_by === viewerUserId ||
        (isPublic && viewerIsHouseOwner)
    );
    const hasLocationVisibilityMarker = Object.prototype.hasOwnProperty.call(box, 'visible_location_id');
    const locationHidden = Boolean(
        hasLocationVisibilityMarker &&
        box.location_id &&
        !box.visible_location_id
    );
    const {
        visible_location_id,
        ...publicBox
    } = box;
    const counts = {};
    for (const field of ['item_count', 'total_item_count', 'visible_item_count', 'hidden_item_count']) {
        if (Object.prototype.hasOwnProperty.call(box, field)) {
            counts[field] = Number(box[field] || 0);
        }
    }
    return {
        ...publicBox,
        ...counts,
        is_public: isPublic,
        location_id: locationHidden ? null : box.location_id,
        location_name: locationHidden ? null : box.location_name,
        private_location_hidden: locationHidden,
        photo_path: buildMediaUrl(box.photo_path),
        thumbnail_path: buildMediaUrl(box.thumbnail_path),
        archived: Boolean(box.archived_at),
        can_edit: canManage,
        can_archive: canManage,
        can_delete: canManage,
        created_by_current_user: viewerUserId !== null && box.created_by === viewerUserId
    };
}

function serializeBoxItem(row, viewerUserId) {
    const item = decryptItemRecord(row);
    const locationHidden = Boolean(item.location_id && !item.visible_location_id);
    delete item.visible_location_id;
    const buildItemMediaUrl = (storedPath) => {
        const normalized = normalizeStoredPath(storedPath);
        if (!normalized) return null;
        const filename = normalized.split('/').at(-1);
        return normalized.startsWith('uploads/thumbnails/')
            ? `/api/items/media/thumbnail/${filename}`
            : `/api/items/media/photo/${filename}`;
    };

    return {
        ...item,
        location_id: locationHidden ? null : item.location_id,
        location_name: locationHidden ? null : item.location_name,
        private_location_hidden: locationHidden,
        photo_path: buildItemMediaUrl(item.photo_path),
        thumbnail_path: buildItemMediaUrl(item.thumbnail_path),
        can_edit: item.user_id === viewerUserId,
        can_delete: item.user_id === viewerUserId
    };
}

function activitySafeBoxId(boxId) {
    if (!boxId) return null;
    const box = db.prepare('SELECT id, is_public FROM boxes WHERE id = ? LIMIT 1').get(boxId);
    return box?.is_public ? box.id : null;
}

function recordSharedBoxActivity(req, box, action, metadata = null) {
    if (!box?.is_public) return;
    recordItemActivity(db, {
        houseKey: req.user.house_key,
        actorUserId: req.user.id,
        action,
        metadata: {
            box_id: Number(box.id),
            ...(metadata || {})
        }
    });
}

async function processBoxPhoto(buffer) {
    await validateUploadedImageBuffer(buffer, { fieldLabel: 'Kutu fotoğrafı' });
    const fileId = `${Date.now()}-${crypto.randomUUID()}`;
    const filename = `${fileId}.webp`;
    const thumbnailFilename = `${fileId}_thumb.webp`;
    const outputPath = join(boxUploadsDir, filename);
    const thumbnailPath = join(boxThumbnailsDir, thumbnailFilename);

    try {
        const optimized = await sharp(buffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .withMetadata(false)
            .toBuffer();
        const thumbnail = await sharp(buffer)
            .resize(320, 240, { fit: 'cover', position: 'center' })
            .webp({ quality: 72 })
            .withMetadata(false)
            .toBuffer();

        writePrivateFile(outputPath, encryptBufferForStorage(optimized, { purpose: BOX_PHOTO_PURPOSE }));
        writePrivateFile(thumbnailPath, encryptBufferForStorage(thumbnail, { purpose: BOX_THUMBNAIL_PURPOSE }));
        return {
            photoPath: `uploads/boxes/${filename}`,
            thumbnailPath: `uploads/boxes/thumbnails/${thumbnailFilename}`
        };
    } finally {
        if (Buffer.isBuffer(buffer)) buffer.fill(0);
    }
}

function deleteStoredBoxFile(storedPath) {
    const resolved = resolveStoredMediaPath(storedPath, {
        repoRoot,
        mediaRoot: boxUploadsDir,
        allowedPrefixes: ['uploads/boxes', 'uploads/boxes/thumbnails']
    });
    if (!resolved || !fs.existsSync(resolved)) return;
    try {
        fs.unlinkSync(resolved);
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            console.warn('[Boxes] Stored media cleanup failed:', error.message);
        }
    }
}

function normalizeItemIds(rawIds) {
    if (!Array.isArray(rawIds)) throw new Error('Eşya listesi geçersiz');
    const ids = [...new Set(rawIds.map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isInteger(value) && value > 0))];
    if (!ids.length) throw new Error('En az bir eşya seçin');
    if (ids.length > MAX_BOX_ITEM_IDS) throw new Error(`Tek seferde en fazla ${MAX_BOX_ITEM_IDS} eşya taşınabilir`);
    return ids;
}

function recordBoxMove(req, itemId, fromBoxId, toBoxId, reason = 'assignment') {
    recordItemActivity(db, {
        houseKey: req.user.house_key,
        itemId,
        actorUserId: req.user.id,
        action: 'item.box_moved',
        metadata: {
            from_box_id: activitySafeBoxId(fromBoxId),
            to_box_id: activitySafeBoxId(toBoxId),
            reason
        }
    });
}

router.use(authenticateToken);
router.use(requireActiveHouse);

router.get('/media/:type/:filename', async (req, res) => {
    try {
        const { type, filename } = req.params;
        if (!MEDIA_FILE_REGEX.test(filename) || !['photo', 'thumbnail'].includes(type)) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }
        const column = type === 'thumbnail' ? 'thumbnail_path' : 'photo_path';
        const prefix = type === 'thumbnail' ? 'uploads/boxes/thumbnails' : 'uploads/boxes';
        const storedPath = `${prefix}/${filename}`;
        const exists = db.prepare(`
            SELECT id
            FROM boxes
            WHERE house_key = ?
              AND ${column} = ?
              AND (is_public = 1 OR created_by = ?)
            LIMIT 1
        `).get(req.user.house_key, storedPath, req.user.id);
        if (!exists) return res.status(404).json({ error: 'Medya bulunamadı' });

        const resolved = resolveStoredMediaPath(storedPath, {
            repoRoot,
            mediaRoot: boxUploadsDir,
            allowedPrefixes: ['uploads/boxes', 'uploads/boxes/thumbnails']
        });
        if (!resolved) return res.status(404).json({ error: 'Medya bulunamadı' });

        const encrypted = await readPrivateFileWithinLimit(resolved, {
            maxBytes: MAX_MEDIA_READ_BYTES
        });
        let decrypted;
        try {
            decrypted = decryptBufferFromStorage(encrypted, {
                purpose: type === 'thumbnail' ? BOX_THUMBNAIL_PURPOSE : BOX_PHOTO_PURPOSE
            });
        } finally {
            if (Buffer.isBuffer(encrypted)) encrypted.fill(0);
        }

        res.set({
            'Cache-Control': 'private, no-store, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Vary': 'Cookie'
        });
        return res.type('image/webp').send(decrypted);
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'EINVAL') {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }
        if (error?.statusCode === 413 || error?.code === 'FILE_TOO_LARGE') {
            return res.status(413).json({ error: 'Medya dosyası güvenli sınırı aşıyor' });
        }
        console.error('Box media error:', error);
        return res.status(500).json({ error: 'Medya yüklenemedi' });
    }
});

router.get('/', (req, res) => {
    try {
        const archived = String(req.query.archived || 'active');
        const roomId = normalizePositiveId(req.query.room_id, 'Oda');
        const locationId = normalizePositiveId(req.query.location_id, 'Konum');
        const occupancy = String(req.query.occupancy || '');
        if (locationId && !db.prepare(`
            SELECT id
            FROM locations
            WHERE id = ?
              AND house_key = ?
              AND (is_public = 1 OR created_by = ?)
        `).get(locationId, req.user.house_key, req.user.id)) {
            throw new Error('Konum bu eve ait değil veya erişiminiz yok');
        }
        let query = `
            SELECT boxes.*, rooms.name AS room_name, locations.name AS location_name,
                   locations.id AS visible_location_id,
                   users.username AS created_by_name,
                   COUNT(items.id) AS total_item_count,
                   SUM(CASE WHEN items.id IS NOT NULL AND (items.is_public = 1 OR items.user_id = ?) THEN 1 ELSE 0 END) AS visible_item_count
            FROM boxes
            LEFT JOIN rooms ON rooms.id = boxes.room_id AND rooms.house_key = boxes.house_key
            LEFT JOIN locations
              ON locations.id = boxes.location_id
             AND locations.house_key = boxes.house_key
             AND (
                    locations.is_public = 1
                    OR (boxes.is_public = 0 AND locations.created_by = boxes.created_by)
             )
            LEFT JOIN users ON users.id = boxes.created_by
            LEFT JOIN items ON items.box_id = boxes.id AND items.house_key = boxes.house_key
            WHERE boxes.house_key = ?
              AND (boxes.is_public = 1 OR boxes.created_by = ?)
        `;
        const params = [req.user.id, req.user.house_key, req.user.id];
        if (archived === 'only') query += ' AND boxes.archived_at IS NOT NULL';
        else if (archived !== 'include') query += ' AND boxes.archived_at IS NULL';
        if (roomId) { query += ' AND boxes.room_id = ?'; params.push(roomId); }
        if (locationId) { query += ' AND boxes.location_id = ?'; params.push(locationId); }
        query += ' GROUP BY boxes.id';
        if (occupancy === 'empty') query += ' HAVING total_item_count = 0';
        if (occupancy === 'nonempty') query += ' HAVING total_item_count > 0';

        const viewerIsHouseOwner = isHouseOwner(req.user.id, req.user.house_key);
        let boxes = sortByName(db.prepare(query).all(...params).map((row) => serializeBox({
            ...row,
            item_count: row.visible_item_count,
            hidden_item_count: Number(row.total_item_count || 0) - Number(row.visible_item_count || 0)
        }, req.user.id, viewerIsHouseOwner)));
        const search = String(req.query.search || '').trim().toLocaleLowerCase();
        if (search) {
            boxes = boxes.filter((box) => [box.name, box.code, box.note, box.room_name, box.location_name]
                .some((value) => String(value || '').toLocaleLowerCase().includes(search)));
        }
        res.json({ boxes });
    } catch (error) {
        console.error('Get boxes error:', error);
        sendRequestError(res, error, 'Kutular yüklenemedi');
    }
});

router.get('/:id', (req, res) => {
    try {
        const box = db.prepare(`
            SELECT boxes.*, rooms.name AS room_name, locations.name AS location_name,
                   locations.id AS visible_location_id,
                   users.username AS created_by_name
            FROM boxes
            LEFT JOIN rooms ON rooms.id = boxes.room_id AND rooms.house_key = boxes.house_key
            LEFT JOIN locations
              ON locations.id = boxes.location_id
             AND locations.house_key = boxes.house_key
             AND (
                    locations.is_public = 1
                    OR (boxes.is_public = 0 AND locations.created_by = boxes.created_by)
             )
            LEFT JOIN users ON users.id = boxes.created_by
            WHERE boxes.id = ? AND boxes.house_key = ?
              AND (boxes.is_public = 1 OR boxes.created_by = ?)
        `).get(req.params.id, req.user.house_key, req.user.id);
        if (!box) return res.status(404).json({ error: 'Kutu bulunamadı' });

        let items = db.prepare(`
            SELECT items.*, categories.name AS category_name, categories.icon AS category_icon,
                   categories.color AS category_color, rooms.name AS room_name,
                   locations.name AS location_name, locations.id AS visible_location_id,
                   users.username
            FROM items
            LEFT JOIN categories ON categories.id = items.category_id AND categories.house_key = items.house_key
            LEFT JOIN rooms ON rooms.id = items.room_id AND rooms.house_key = items.house_key
            LEFT JOIN locations
              ON locations.id = items.location_id
             AND locations.house_key = items.house_key
             AND (locations.is_public = 1 OR locations.created_by = ?)
            LEFT JOIN users ON users.id = items.user_id
            WHERE items.box_id = ? AND items.house_key = ?
              AND (items.is_public = 1 OR items.user_id = ?)
            ORDER BY items.updated_at DESC, items.id DESC
        `).all(req.user.id, req.params.id, req.user.house_key, req.user.id)
            .map((row) => serializeBoxItem(row, req.user.id));

        const search = String(req.query.search || '').trim().toLocaleLowerCase();
        const categoryId = normalizePositiveId(req.query.category_id, 'Kategori');
        if (search) {
            items = items.filter((item) => [item.name, item.description, item.category_name, item.barcode]
                .some((value) => String(value || '').toLocaleLowerCase().includes(search)));
        }
        if (categoryId) items = items.filter((item) => item.category_id === categoryId);

        const counts = db.prepare(`
            SELECT
                COUNT(*) AS total_count,
                SUM(CASE WHEN is_public = 1 OR user_id = ? THEN 1 ELSE 0 END) AS visible_count
            FROM items
            WHERE box_id = ? AND house_key = ?
        `).get(req.user.id, req.params.id, req.user.house_key);
        const totalCount = Number(counts?.total_count || 0);
        const visibleCount = Number(counts?.visible_count || 0);
        res.json({
            box: {
                ...serializeBox(box, req.user.id, isHouseOwner(req.user.id, req.user.house_key)),
                item_count: items.length,
                filtered_item_count: items.length,
                total_item_count: totalCount,
                visible_item_count: visibleCount,
                hidden_item_count: totalCount - visibleCount
            },
            items
        });
    } catch (error) {
        console.error('Get box detail error:', error);
        sendRequestError(res, error, 'Kutu yüklenemedi');
    }
});

router.post('/', uploadPhoto, async (req, res) => {
    let media = null;
    try {
        const name = normalizeBoxName(req.body.name);
        const code = normalizeBoxCode(req.body.code);
        const note = normalizeOptionalText(req.body.note, 'Not', 1000);
        const isPublic = parseBooleanValue(req.body.is_public, true);
        const { roomId, locationId } = resolvePlacement(req.body, req.user.house_key, {
            isPublic,
            ownerUserId: req.user.id
        });
        const codeLookup = hashLookupToken(code);
        if (db.prepare('SELECT id FROM boxes WHERE house_key = ? AND code_lookup = ?').get(req.user.house_key, codeLookup)) {
            return res.status(409).json({
                error: 'Bu kısa kod başka bir kutuda kullanılıyor',
                code: 'BOX_CODE_DUPLICATE'
            });
        }
        if (req.file) media = await processBoxPhoto(req.file.buffer);

        const result = db.prepare(`
            INSERT INTO boxes (
                name, code, code_lookup, note, is_public, room_id, location_id,
                photo_path, thumbnail_path, created_by, house_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            encryptBoxName(name),
            encryptBoxCode(code),
            codeLookup,
            note ? encryptBoxNote(note) : null,
            isPublic ? 1 : 0,
            roomId,
            locationId,
            media?.photoPath || null,
            media?.thumbnailPath || null,
            req.user.id,
            req.user.house_key
        );
        const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(result.lastInsertRowid);
        recordSharedBoxActivity(req, box, 'box.created');
        res.status(201).json({ message: 'Kutu oluşturuldu', box: serializeBox(box, req.user.id, isHouseOwner(req.user.id, req.user.house_key)) });
    } catch (error) {
        if (media) {
            deleteStoredBoxFile(media.photoPath);
            deleteStoredBoxFile(media.thumbnailPath);
        }
        console.error('Create box error:', error);
        sendRequestError(res, error, 'Kutu oluşturulamadı');
    }
});

router.put('/:id', uploadPhoto, async (req, res) => {
    let newMedia = null;
    try {
        const existing = db.prepare('SELECT * FROM boxes WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);
        if (!existing) return res.status(404).json({ error: 'Kutu bulunamadı' });
        if (!existing.is_public && existing.created_by !== req.user.id) {
            return res.status(404).json({ error: 'Kutu bulunamadı' });
        }
        if (!canManageBox(req, existing)) return res.status(403).json({ error: 'Bu kutuyu yalnızca oluşturan kişi veya ev sahibi düzenleyebilir' });
        const expectedUpdatedAt = String(req.body.expected_updated_at || '').trim();
        if (expectedUpdatedAt && expectedUpdatedAt !== String(existing.updated_at || '')) {
            return res.status(409).json({
                error: 'Kutu başka bir kullanıcı tarafından güncellendi; son halini yükleyip tekrar deneyin',
                code: 'BOX_STALE',
                current_updated_at: existing.updated_at
            });
        }

        const current = decryptBoxRecord(existing);
        const name = req.body.name !== undefined ? normalizeBoxName(req.body.name) : current.name;
        const code = req.body.code !== undefined ? normalizeBoxCode(req.body.code) : current.code;
        const codeLookup = hashLookupToken(code);
        const duplicate = db.prepare('SELECT id FROM boxes WHERE house_key = ? AND code_lookup = ? AND id <> ?')
            .get(req.user.house_key, codeLookup, req.params.id);
        if (duplicate) {
            return res.status(409).json({
                error: 'Bu kısa kod başka bir kutuda kullanılıyor',
                code: 'BOX_CODE_DUPLICATE'
            });
        }
        const note = req.body.note !== undefined
            ? normalizeOptionalText(req.body.note, 'Not', 1000)
            : current.note;
        const isPublic = req.body.is_public !== undefined
            ? parseBooleanValue(req.body.is_public, Boolean(existing.is_public))
            : Boolean(existing.is_public);
        if (Number(isPublic) !== Number(Boolean(existing.is_public)) && existing.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Kutu görünürlüğünü yalnızca kutuyu oluşturan kişi değiştirebilir' });
        }
        if (!isPublic && existing.is_public) {
            const foreignItemCount = db.prepare(`
                SELECT COUNT(*) AS count
                FROM items
                WHERE box_id = ? AND house_key = ? AND user_id <> ?
            `).get(req.params.id, req.user.house_key, req.user.id)?.count || 0;
            if (foreignItemCount > 0) {
                return res.status(409).json({
                    error: 'Başka üyelere ait eşyalar bulunan ortak kutu özel yapılamaz',
                    code: 'BOX_VISIBILITY_CONFLICT',
                    conflictingItemCount: foreignItemCount
                });
            }
        }
        let { roomId, locationId } = resolvePlacement(req.body, req.user.house_key, {
            existing,
            isPublic,
            ownerUserId: existing.created_by
        });

        let photoPath = existing.photo_path;
        let thumbnailPath = existing.thumbnail_path;
        if (req.file) {
            newMedia = await processBoxPhoto(req.file.buffer);
            photoPath = newMedia.photoPath;
            thumbnailPath = newMedia.thumbnailPath;
        } else if (String(req.body.remove_photo || '') === 'true') {
            photoPath = null;
            thumbnailPath = null;
        }

        let placementChanged = existing.room_id !== roomId || existing.location_id !== locationId;
        let affectedItems = [];
        let changedFields = [];
        const nextUpdatedAt = new Date().toISOString();

        const updateBoxTransaction = db.transaction(() => {
            const live = db.prepare('SELECT * FROM boxes WHERE id = ? AND house_key = ?')
                .get(req.params.id, req.user.house_key);
            if (!live) {
                throw createRequestError('Kutu bulunamadı', 404);
            }
            if (!live.is_public && live.created_by !== req.user.id) {
                throw createRequestError('Kutu bulunamadı', 404);
            }
            if (!canManageBox(req, live)) {
                throw createRequestError('Bu kutuyu yalnızca oluşturan kişi veya ev sahibi düzenleyebilir', 403);
            }
            if (String(live.updated_at || '') !== String(existing.updated_at || '')) {
                const staleError = createRequestError(
                    'Kutu başka bir kullanıcı tarafından güncellendi; son halini yükleyip tekrar deneyin',
                    409,
                    'BOX_STALE'
                );
                staleError.currentUpdatedAt = live.updated_at;
                throw staleError;
            }
            if (Number(isPublic) !== Number(Boolean(live.is_public)) && live.created_by !== req.user.id) {
                throw createRequestError('Kutu görünürlüğünü yalnızca kutuyu oluşturan kişi değiştirebilir', 403);
            }
            if (!isPublic && live.is_public) {
                const foreignItemCount = db.prepare(`
                    SELECT COUNT(*) AS count
                    FROM items
                    WHERE box_id = ? AND house_key = ? AND user_id <> ?
                `).get(req.params.id, req.user.house_key, req.user.id)?.count || 0;
                if (foreignItemCount > 0) {
                    const conflict = createRequestError(
                        'Başka üyelere ait eşyalar bulunan ortak kutu özel yapılamaz',
                        409,
                        'BOX_VISIBILITY_CONFLICT'
                    );
                    conflict.conflictingItemCount = foreignItemCount;
                    throw conflict;
                }
            }

            ({ roomId, locationId } = resolvePlacement(req.body, req.user.house_key, {
                existing: live,
                isPublic,
                ownerUserId: live.created_by
            }));
            const liveDuplicate = db.prepare(
                'SELECT id FROM boxes WHERE house_key = ? AND code_lookup = ? AND id <> ?'
            ).get(req.user.house_key, codeLookup, req.params.id);
            if (liveDuplicate) {
                throw createRequestError(
                    'Bu kısa kod başka bir kutuda kullanılıyor',
                    409,
                    'BOX_CODE_DUPLICATE'
                );
            }

            placementChanged = live.room_id !== roomId || live.location_id !== locationId;
            // A shared box is one physical container: every assigned item follows
            // its placement, including items hidden from the box manager. Keep the
            // update atomic and never return those hidden item identifiers.
            affectedItems = placementChanged
                ? db.prepare(`
                    SELECT id
                    FROM items
                    WHERE box_id = ? AND house_key = ?
                `).all(req.params.id, req.user.house_key)
                : [];
            changedFields = [];
            if (name !== current.name) changedFields.push('name');
            if (code !== current.code) changedFields.push('code');
            if ((note || null) !== (current.note || null)) changedFields.push('note');
            if (placementChanged) changedFields.push('room', 'location');
            if (Number(isPublic) !== Number(Boolean(live.is_public))) changedFields.push('visibility');
            if (req.file || String(req.body.remove_photo || '') === 'true') changedFields.push('photo');

            const updateResult = db.prepare(`
                UPDATE boxes
                SET name = ?, code = ?, code_lookup = ?, note = ?, is_public = ?, room_id = ?, location_id = ?,
                    photo_path = ?, thumbnail_path = ?, updated_at = ?
                WHERE id = ? AND house_key = ? AND updated_at IS ?
            `).run(
                encryptBoxName(name),
                encryptBoxCode(code),
                codeLookup,
                note ? encryptBoxNote(note) : null,
                isPublic ? 1 : 0,
                roomId,
                locationId,
                photoPath,
                thumbnailPath,
                nextUpdatedAt,
                req.params.id,
                req.user.house_key,
                live.updated_at
            );
            if (updateResult.changes !== 1) {
                const staleError = createRequestError(
                    'Kutu başka bir kullanıcı tarafından güncellendi; son halini yükleyip tekrar deneyin',
                    409,
                    'BOX_STALE'
                );
                staleError.currentUpdatedAt = db.prepare(
                    'SELECT updated_at FROM boxes WHERE id = ? AND house_key = ?'
                ).get(req.params.id, req.user.house_key)?.updated_at;
                throw staleError;
            }

            if (placementChanged && affectedItems.length) {
                db.prepare(`
                    UPDATE items
                    SET room_id = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE box_id = ? AND house_key = ?
                `).run(roomId, locationId, req.params.id, req.user.house_key);
                for (const item of affectedItems) {
                    recordItemActivity(db, {
                        houseKey: req.user.house_key,
                        itemId: item.id,
                        actorUserId: req.user.id,
                        action: 'item.updated',
                        metadata: {
                            fields: ['room', 'location'],
                            reason: 'box_placement_changed',
                            box_id: isPublic ? Number(req.params.id) : null
                        }
                    });
                }
            }
            recordSharedBoxActivity(req, {
                id: Number(req.params.id),
                is_public: isPublic ? 1 : 0
            }, 'box.updated', { fields: changedFields });
        });
        updateBoxTransaction.immediate();

        if ((newMedia || String(req.body.remove_photo || '') === 'true') && existing.photo_path) {
            deleteStoredBoxFile(existing.photo_path);
            deleteStoredBoxFile(existing.thumbnail_path);
        }
        const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
        res.json({
            message: 'Kutu güncellendi',
            box: serializeBox(box, req.user.id, isHouseOwner(req.user.id, req.user.house_key)),
            placementUpdatedCount: affectedItems.length
        });
    } catch (error) {
        if (newMedia) {
            deleteStoredBoxFile(newMedia.photoPath);
            deleteStoredBoxFile(newMedia.thumbnailPath);
        }
        console.error('Update box error:', error);
        sendRequestError(res, error, 'Kutu güncellenemedi');
    }
});

router.patch('/:id/archive', (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM boxes WHERE id = ? AND house_key = ?')
            .get(req.params.id, req.user.house_key);
        if (!existing) return res.status(404).json({ error: 'Kutu bulunamadı' });
        if (!existing.is_public && existing.created_by !== req.user.id) {
            return res.status(404).json({ error: 'Kutu bulunamadı' });
        }
        if (!canManageBox(req, existing)) return res.status(403).json({ error: 'Bu kutuyu yalnızca oluşturan kişi veya ev sahibi arşivleyebilir' });
        const archived = parseBooleanValue(req.body?.archived, true);
        const nextUpdatedAt = new Date().toISOString();
        db.prepare(`
            UPDATE boxes
            SET archived_at = ${archived ? '?' : 'NULL'}, updated_at = ?
            WHERE id = ?
        `).run(...(archived ? [nextUpdatedAt] : []), nextUpdatedAt, req.params.id);
        recordSharedBoxActivity(req, existing, archived ? 'box.archived' : 'box.restored');
        const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
        res.json({ message: archived ? 'Kutu arşivlendi' : 'Kutu yeniden etkinleştirildi', box: serializeBox(box, req.user.id, isHouseOwner(req.user.id, req.user.house_key)) });
    } catch (error) {
        console.error('Archive box error:', error);
        sendRequestError(res, error, 'Kutu arşiv durumu güncellenemedi');
    }
});

router.post('/:id/items', (req, res) => {
    try {
        const boxId = normalizePositiveId(req.params.id, 'Kutu');
        const box = db.prepare(`
            SELECT id, room_id, location_id, is_public, created_by
            FROM boxes
            WHERE id = ?
              AND house_key = ?
              AND archived_at IS NULL
              AND (is_public = 1 OR created_by = ?)
        `)
            .get(boxId, req.user.house_key, req.user.id);
        if (!box) return res.status(404).json({ error: 'Etkin kutu bulunamadı' });
        const ids = normalizeItemIds(req.body?.item_ids);
        const ownedItems = db.prepare(`
            SELECT id, box_id FROM items
            WHERE house_key = ? AND user_id = ? AND id IN (${ids.map(() => '?').join(',')})
        `).all(req.user.house_key, req.user.id, ...ids);
        if (!ownedItems.length) return res.status(403).json({ error: 'Seçili eşyaları taşıma yetkiniz yok' });

        db.transaction(() => {
            const update = db.prepare(`
                UPDATE items
                SET box_id = ?, room_id = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            for (const item of ownedItems) {
                update.run(
                    boxId,
                    box.room_id ?? null,
                    box.location_id ?? null,
                    item.id
                );
                recordBoxMove(req, item.id, item.box_id, boxId);
            }
        })();
        res.json({
            message: 'Eşyalar kutuya taşındı',
            updatedCount: ownedItems.length,
            skippedCount: ids.length - ownedItems.length
        });
    } catch (error) {
        console.error('Assign box items error:', error);
        sendRequestError(res, error, 'Eşyalar taşınamadı');
    }
});

router.delete('/:id', (req, res) => {
    try {
        const boxId = normalizePositiveId(req.params.id, 'Kutu');
        const box = db.prepare('SELECT * FROM boxes WHERE id = ? AND house_key = ?')
            .get(boxId, req.user.house_key);
        if (!box) return res.status(404).json({ error: 'Kutu bulunamadı' });
        if (!box.is_public && box.created_by !== req.user.id) {
            return res.status(404).json({ error: 'Kutu bulunamadı' });
        }
        if (!canManageBox(req, box)) return res.status(403).json({ error: 'Bu kutuyu yalnızca oluşturan kişi veya ev sahibi silebilir' });
        const items = db.prepare('SELECT id, box_id, user_id FROM items WHERE box_id = ? AND house_key = ?')
            .all(boxId, req.user.house_key);
        if (!box.is_public && items.some((item) => item.user_id !== box.created_by)) {
            return res.status(409).json({
                error: 'Özel kutu başka bir kullanıcıya ait eşya içerdiği için güvenli biçimde silinemedi',
                code: 'BOX_VISIBILITY_CONFLICT'
            });
        }
        const destinationBoxId = normalizePositiveId(req.body?.destination_box_id, 'Hedef kutu');
        const confirmUnassign = parseBooleanValue(req.body?.confirm_unassign, false);

        if (items.length && !destinationBoxId && !confirmUnassign) {
            return res.status(409).json({
                error: 'Dolu kutu silinmeden önce eşyaları başka bir kutuya taşıyın veya kutusuz bırakmayı onaylayın',
                code: 'BOX_NOT_EMPTY',
                itemCount: items.length
            });
        }
        if (destinationBoxId === boxId) return res.status(400).json({ error: 'Hedef kutu silinen kutudan farklı olmalı' });
        let destination = null;
        if (destinationBoxId) {
            destination = db.prepare(`
                SELECT id, room_id, location_id, is_public, created_by
                FROM boxes
                WHERE id = ?
                  AND house_key = ?
                  AND archived_at IS NULL
                  AND (is_public = 1 OR created_by = ?)
            `)
                .get(destinationBoxId, req.user.house_key, req.user.id);
            if (!destination) return res.status(400).json({ error: 'Hedef kutu geçersiz veya arşivlenmiş' });
            if (box.is_public && !destination.is_public) {
                return res.status(409).json({
                    error: 'Ortak kutunun tüm içeriği yalnızca başka bir ortak kutuya taşınabilir',
                    code: 'BOX_DESTINATION_PRIVATE'
                });
            }
        }

        db.transaction(() => {
            if (destination) {
                db.prepare(`
                    UPDATE items
                    SET box_id = ?, room_id = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE box_id = ? AND house_key = ?
                `).run(
                    destination.id,
                    destination.room_id ?? null,
                    destination.location_id ?? null,
                    boxId,
                    req.user.house_key
                );
            } else {
                db.prepare(`
                    UPDATE items
                    SET box_id = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE box_id = ? AND house_key = ?
                `).run(boxId, req.user.house_key);
            }
            for (const item of items) {
                recordBoxMove(req, item.id, boxId, destinationBoxId || null, 'box_deleted');
            }
            recordSharedBoxActivity(req, box, 'box.deleted', {
                moved_item_count: items.length,
                destination_box_id: activitySafeBoxId(destinationBoxId)
            });
            db.prepare('DELETE FROM boxes WHERE id = ?').run(boxId);
        })();
        deleteStoredBoxFile(box.photo_path);
        deleteStoredBoxFile(box.thumbnail_path);
        res.json({ message: 'Kutu silindi', movedCount: items.length, destinationBoxId: destinationBoxId || null });
    } catch (error) {
        console.error('Delete box error:', error);
        sendRequestError(res, error, 'Kutu silinemedi');
    }
});

export default router;
