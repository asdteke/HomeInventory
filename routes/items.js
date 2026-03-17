import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const MEDIA_FILE_REGEX = /^[A-Za-z0-9._-]+\.webp$/;

// Ensure uploads directories exist
const uploadsDir = join(__dirname, '..', 'uploads');
const thumbnailsDir = join(__dirname, '..', 'uploads', 'thumbnails');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
}

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

/**
 * Görüntü optimizasyonu - Sharp ile işleme
 * - Max 1200px resize (aspect ratio korunur)
 * - WebP formatına dönüştürme (kalite 80)
 * - EXIF metadata temizleme
 * - 200x200 thumbnail oluşturma
 */
async function processImage(buffer, originalName) {
    // Original file names can leak personal/device data, so store randomized names only.
    const fileId = `${Date.now()}-${crypto.randomUUID()}`;
    const filename = `${fileId}.webp`;
    const thumbnailFilename = `${fileId}_thumb.webp`;

    const outputPath = join(uploadsDir, filename);
    const thumbnailPath = join(thumbnailsDir, thumbnailFilename);

    try {
        // Ana görsel: Max 1200px, WebP, kalite 80, EXIF kaldır
        await sharp(buffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .withMetadata(false)  // EXIF/metadata kaldır (güvenlik)
            .toFile(outputPath);

        // Thumbnail: 200x200, WebP, kalite 70
        await sharp(buffer)
            .resize(200, 200, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 70 })
            .withMetadata(false)
            .toFile(thumbnailPath);

        console.log(`[ImageOptimizer] Processed: ${filename}`);

        return {
            filename,
            thumbnailFilename,
            path: `uploads/${filename}`,
            thumbnailPath: `uploads/thumbnails/${thumbnailFilename}`
        };
    } catch (err) {
        console.error('[ImageOptimizer] Error:', err.message);
        throw err;
    }
}

function normalizeStoredPath(storedPath) {
    if (!storedPath) {
        return null;
    }

    return String(storedPath)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\/+/, '');
}

function resolveStoredPath(storedPath) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) {
        return null;
    }

    return join(__dirname, '..', normalized);
}

function buildMediaUrl(storedPath) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) {
        return null;
    }

    const parts = normalized.split('/');
    const filename = parts.at(-1);
    const type = parts.includes('thumbnails') ? 'thumbnail' : 'photo';
    return `/api/items/media/${type}/${filename}`;
}

function serializeItem(item) {
    if (!item) {
        return item;
    }

    return {
        ...item,
        photo_path: buildMediaUrl(item.photo_path),
        thumbnail_path: buildMediaUrl(item.thumbnail_path)
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

    const candidates = type === 'thumbnail'
        ? [`uploads/thumbnails/${filename}`, `/uploads/thumbnails/${filename}`]
        : [`uploads/${filename}`, `/uploads/${filename}`];

    const column = type === 'thumbnail' ? 'thumbnail_path' : 'photo_path';
    const query = `
        SELECT id, ${column} as media_path
        FROM items
        WHERE house_key = ? AND ${column} IN (?, ?)
        LIMIT 1
    `;

    return db.prepare(query).get(houseKey, candidates[0], candidates[1]);
}

router.use(authenticateToken);

router.get('/media/:type/:filename', (req, res) => {
    try {
        const { type, filename } = req.params;

        if (!['photo', 'thumbnail'].includes(type)) {
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

        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.sendFile(mediaPath);
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

        if (search) { query += ' AND items.name LIKE ?'; params.push(`%${search}%`); }
        if (category_id) { query += ' AND items.category_id = ?'; params.push(category_id); }
        if (room_id) { query += ' AND items.room_id = ?'; params.push(room_id); }
        if (location_id) { query += ' AND items.location_id = ?'; params.push(location_id); }
        if (barcode) { query += ' AND items.barcode = ?'; params.push(barcode); }

        query += ' ORDER BY items.updated_at DESC';
        const items = db.prepare(query).all(...params).map(serializeItem);
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
            WHERE items.barcode = ? AND items.house_key = ?
        `).get(req.params.code, req.user.house_key);

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
router.post('/', upload.single('photo'), async (req, res) => {
    try {
        const { name, description, quantity, category_id, room_id, location_id, is_public, barcode } = req.body;
        const houseKey = req.user.house_key;

        // Görsel işleme
        let photoPath = null;
        let thumbnailPath = null;

        if (req.file) {
            const processed = await processImage(req.file.buffer, req.file.originalname);
            photoPath = processed.path;
            thumbnailPath = processed.thumbnailPath;
        }

        const result = db.prepare(`
            INSERT INTO items (name, description, quantity, photo_path, thumbnail_path, barcode, category_id, room_id, location_id, is_public, user_id, house_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name, description || null, parseInt(quantity) || 1, photoPath, thumbnailPath, barcode || null,
            category_id || null, room_id || null, location_id || null,
            is_public !== undefined ? (is_public === 'true' || is_public === true ? 1 : 0) : 1,
            req.user.id, houseKey
        );

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ message: 'Eşya eklendi', item: serializeItem(item) });
    } catch (err) {
        console.error('Create item error:', err);
        res.status(500).json({ error: 'Eşya eklenirken hata oluştu' });
    }
});

// Update item (any house member can update)
router.put('/:id', upload.single('photo'), async (req, res) => {
    try {
        const { name, description, quantity, category_id, room_id, location_id, is_public, barcode } = req.body;
        const itemId = req.params.id;

        // Check if item belongs to same house (any member can edit)
        const existing = db.prepare('SELECT * FROM items WHERE id = ? AND house_key = ?')
            .get(itemId, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Eşya bulunamadı veya yetkiniz yok' });
        }

        // Görsel işleme
        let photoPath = existing.photo_path;
        let thumbnailPath = existing.thumbnail_path;

        if (req.file) {
            // Eski görselleri sil (opsiyonel - yer tasarrufu)
            deleteStoredFile(existing.photo_path);
            deleteStoredFile(existing.thumbnail_path);

            const processed = await processImage(req.file.buffer, req.file.originalname);
            photoPath = processed.path;
            thumbnailPath = processed.thumbnailPath;
        }

        db.prepare(`
            UPDATE items SET name = ?, description = ?, quantity = ?, photo_path = ?, thumbnail_path = ?, barcode = ?,
            category_id = ?, room_id = ?, location_id = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name || existing.name, description !== undefined ? description : existing.description,
            parseInt(quantity) || existing.quantity, photoPath, thumbnailPath,
            barcode !== undefined ? (barcode || null) : existing.barcode,
            category_id || existing.category_id, room_id || existing.room_id,
            location_id || existing.location_id,
            is_public !== undefined ? (is_public === 'true' || is_public === true ? 1 : 0) : existing.is_public,
            itemId
        );

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        res.json({ message: 'Eşya güncellendi', item: serializeItem(item) });
    } catch (err) {
        console.error('Update item error:', err);
        res.status(500).json({ error: 'Eşya güncellenirken hata oluştu' });
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
            SELECT rooms.name, COUNT(*) as count FROM items
            LEFT JOIN rooms ON items.room_id = rooms.id
            WHERE items.house_key = ? AND rooms.name IS NOT NULL
            GROUP BY rooms.id ORDER BY count DESC LIMIT 1
        `).get(houseKey);

        const categoryCount = db.prepare(`
            SELECT COUNT(DISTINCT category_id) as count FROM items WHERE house_key = ? AND category_id IS NOT NULL
        `).get(houseKey);

        res.json({
            totalItems: totalItems?.count || 0,
            totalQuantity: totalQuantity?.total || 0,
            topRoom: topRoom?.name || '-',
            topRoomCount: topRoom?.count || 0,
            categoryCount: categoryCount?.count || 0
        });
    } catch (err) {
        res.status(500).json({ error: 'İstatistikler yüklenemedi' });
    }
});

export default router;
