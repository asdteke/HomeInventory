import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import {
    decryptLocationRecord,
    encryptLocationName,
    sortByName
} from '../utils/protectedFields.js';

const router = express.Router();
const selectScopedRoom = db.prepare('SELECT id FROM rooms WHERE id = ? AND house_key = ? LIMIT 1');

function parseBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeRoomIdForHouse(value, houseKey) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return null;
    }

    const roomId = Number.parseInt(normalized, 10);
    if (!Number.isInteger(roomId) || roomId <= 0) {
        throw new Error('Oda geçersiz');
    }

    if (!selectScopedRoom.get(roomId, houseKey)) {
        throw new Error('Oda bu eve ait değil');
    }

    return roomId;
}

function getRequestErrorStatus(error) {
    return /ge(?:ç|c)ersiz|gerekli|ait değil/i.test(String(error?.message || '')) ? 400 : 500;
}

// Apply auth to all routes
router.use(authenticateToken);
router.use(requireActiveHouse);

// Get locations (only from same house)
router.get('/', (req, res) => {
    try {
        const { room_id } = req.query;

        let query = `
            SELECT locations.*, users.username as created_by_name, rooms.name as room_name
            FROM locations
            LEFT JOIN users ON locations.created_by = users.id
            LEFT JOIN rooms ON locations.room_id = rooms.id AND rooms.house_key = locations.house_key
            WHERE locations.house_key = ?
              AND (locations.is_public = 1 OR locations.created_by = ?)
        `;
        const params = [req.user.house_key, req.user.id];

        if (room_id) {
            query += ' AND locations.room_id = ?';
            params.push(room_id);
        }

        const locations = sortByName(db.prepare(query).all(...params).map(decryptLocationRecord));
        res.json({ locations });
    } catch (err) {
        console.error('Get locations error:', err);
        res.status(500).json({ error: 'Konumlar yüklenirken hata oluştu' });
    }
});

// Create location (with house_key stamp)
router.post('/', (req, res) => {
    try {
        const { name, room_id, is_public } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Konum adı gerekli' });
        }

        const scopedRoomId = normalizeRoomIdForHouse(room_id, req.user.house_key);

        const result = db.prepare(
            'INSERT INTO locations (name, room_id, created_by, is_public, house_key) VALUES (?, ?, ?, ?, ?)'
        ).run(encryptLocationName(name), scopedRoomId, req.user.id, parseBoolean(is_public) ? 1 : 0, req.user.house_key);

        const location = decryptLocationRecord(db.prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid));

        res.status(201).json({ message: 'Konum eklendi', location });
    } catch (err) {
        console.error('Create location error:', err);
        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Konum eklenirken hata oluştu' });
    }
});

// Update location (only creator can update, must be from same house)
router.put('/:id', (req, res) => {
    try {
        const { name, room_id, is_public } = req.body;
        const locationId = req.params.id;

        const existingRow = db.prepare(
            'SELECT * FROM locations WHERE id = ? AND created_by = ? AND house_key = ?'
        ).get(locationId, req.user.id, req.user.house_key);

        const existing = decryptLocationRecord(existingRow);

        if (!existing) {
            return res.status(404).json({ error: 'Konum bulunamadı veya yetkiniz yok' });
        }

        const scopedRoomId = room_id !== undefined
            ? normalizeRoomIdForHouse(room_id, req.user.house_key)
            : existing.room_id;
        const requestedVisibility = is_public !== undefined
            ? (parseBoolean(is_public) ? 1 : 0)
            : existing.is_public;

        if (existing.is_public && !requestedVisibility) {
            const sharedBox = db.prepare(`
                SELECT id
                FROM boxes
                WHERE location_id = ? AND house_key = ? AND is_public = 1
                LIMIT 1
            `).get(locationId, req.user.house_key);
            if (sharedBox) {
                return res.status(409).json({
                    error: 'Paylaşılan bir kutunun kullandığı konum kişisel yapılamaz',
                    code: 'LOCATION_USED_BY_SHARED_BOX'
                });
            }
            const foreignItemCount = Number(db.prepare(`
                SELECT COUNT(*) AS count
                FROM items
                WHERE house_key = ?
                  AND user_id <> ?
                  AND (
                      location_id = ?
                      OR box_id IN (
                          SELECT id
                          FROM boxes
                          WHERE house_key = ? AND location_id = ?
                      )
                  )
            `).get(
                req.user.house_key,
                existing.created_by,
                locationId,
                req.user.house_key,
                locationId
            )?.count || 0);
            if (foreignItemCount > 0) {
                return res.status(409).json({
                    error: 'Başka bir üyeye ait eşyanın kullandığı konum kişisel yapılamaz',
                    code: 'LOCATION_VISIBILITY_CONFLICT',
                    conflictingItemCount: foreignItemCount
                });
            }
        }

        const roomChanged = Number(existing.room_id || 0) !== Number(scopedRoomId || 0);
        const updateLocation = db.transaction(() => {
            db.prepare(
                'UPDATE locations SET name = ?, room_id = ?, is_public = ? WHERE id = ? AND house_key = ?'
            ).run(
                name ? encryptLocationName(name) : existingRow.name,
                scopedRoomId,
                requestedVisibility,
                locationId,
                req.user.house_key
            );

            if (!roomChanged) {
                return;
            }

            db.prepare(`
                UPDATE boxes
                SET room_id = ?, updated_at = ?
                WHERE location_id = ? AND house_key = ?
            `).run(scopedRoomId, new Date().toISOString(), locationId, req.user.house_key);
            db.prepare(`
                UPDATE items
                SET room_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE house_key = ?
                  AND (
                      location_id = ?
                      OR box_id IN (
                          SELECT id
                          FROM boxes
                          WHERE house_key = ? AND location_id = ?
                      )
                  )
            `).run(
                scopedRoomId,
                req.user.house_key,
                locationId,
                req.user.house_key,
                locationId
            );
        });
        updateLocation.immediate();

        const location = decryptLocationRecord(db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId));
        res.json({ message: 'Konum güncellendi', location });
    } catch (err) {
        console.error('Update location error:', err);
        res.status(getRequestErrorStatus(err)).json({ error: err.message || 'Konum güncellenirken hata oluştu' });
    }
});

// Delete location (only creator can delete, must be from same house)
router.delete('/:id', (req, res) => {
    try {
        const locationId = req.params.id;

        const existing = db.prepare(
            'SELECT * FROM locations WHERE id = ? AND created_by = ? AND house_key = ?'
        ).get(locationId, req.user.id, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Konum bulunamadı veya yetkiniz yok' });
        }

        db.prepare('DELETE FROM locations WHERE id = ?').run(locationId);
        res.json({ message: 'Konum silindi' });
    } catch (err) {
        console.error('Delete location error:', err);
        res.status(500).json({ error: 'Konum silinirken hata oluştu' });
    }
});

export default router;
