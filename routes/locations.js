import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);

// Get locations (only from same house)
router.get('/', (req, res) => {
    try {
        const { room_id } = req.query;

        let query = `
            SELECT locations.*, users.username as created_by_name, rooms.name as room_name
            FROM locations
            LEFT JOIN users ON locations.created_by = users.id
            LEFT JOIN rooms ON locations.room_id = rooms.id
            WHERE locations.house_key = ?
        `;
        const params = [req.user.house_key];

        if (room_id) {
            query += ' AND locations.room_id = ?';
            params.push(room_id);
        }

        query += ' ORDER BY locations.name';

        const locations = db.prepare(query).all(...params);
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

        const result = db.prepare(
            'INSERT INTO locations (name, room_id, created_by, is_public, house_key) VALUES (?, ?, ?, ?, ?)'
        ).run(name, room_id || null, req.user.id, is_public ? 1 : 0, req.user.house_key);

        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ message: 'Konum eklendi', location });
    } catch (err) {
        console.error('Create location error:', err);
        res.status(500).json({ error: 'Konum eklenirken hata oluştu' });
    }
});

// Update location (only creator can update, must be from same house)
router.put('/:id', (req, res) => {
    try {
        const { name, room_id, is_public } = req.body;
        const locationId = req.params.id;

        const existing = db.prepare(
            'SELECT * FROM locations WHERE id = ? AND created_by = ? AND house_key = ?'
        ).get(locationId, req.user.id, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Konum bulunamadı veya yetkiniz yok' });
        }

        db.prepare(
            'UPDATE locations SET name = ?, room_id = ?, is_public = ? WHERE id = ?'
        ).run(
            name || existing.name,
            room_id !== undefined ? room_id : existing.room_id,
            is_public !== undefined ? (is_public ? 1 : 0) : existing.is_public,
            locationId
        );

        const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
        res.json({ message: 'Konum güncellendi', location });
    } catch (err) {
        console.error('Update location error:', err);
        res.status(500).json({ error: 'Konum güncellenirken hata oluştu' });
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
