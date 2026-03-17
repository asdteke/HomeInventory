import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);

// Get all rooms (only from same house)
router.get('/', (req, res) => {
    try {
        const rooms = db.prepare('SELECT * FROM rooms WHERE house_key = ? ORDER BY name')
            .all(req.user.house_key);
        res.json({ rooms });
    } catch (err) {
        console.error('Get rooms error:', err);
        res.status(500).json({ error: 'Odalar yüklenirken hata oluştu' });
    }
});

// Create room (with house_key stamp)
router.post('/', (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Oda adı gerekli' });
        }

        // Check if room name already exists in this house
        const existing = db.prepare('SELECT id FROM rooms WHERE name = ? AND house_key = ?')
            .get(name, req.user.house_key);

        if (existing) {
            return res.status(400).json({ error: 'Bu oda zaten mevcut' });
        }

        const result = db.prepare(
            'INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)'
        ).run(name, description || null, req.user.house_key);

        const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ message: 'Oda eklendi', room });
    } catch (err) {
        console.error('Create room error:', err);
        res.status(500).json({ error: 'Oda eklenirken hata oluştu' });
    }
});

// Update room (must be from same house)
router.put('/:id', (req, res) => {
    try {
        const { name, description } = req.body;
        const roomId = req.params.id;

        const existing = db.prepare('SELECT * FROM rooms WHERE id = ? AND house_key = ?')
            .get(roomId, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Oda bulunamadı' });
        }

        // Check for duplicate name
        if (name && name !== existing.name) {
            const duplicate = db.prepare('SELECT id FROM rooms WHERE name = ? AND house_key = ? AND id != ?')
                .get(name, req.user.house_key, roomId);
            if (duplicate) {
                return res.status(400).json({ error: 'Bu isimde bir oda zaten mevcut' });
            }
        }

        db.prepare(
            'UPDATE rooms SET name = ?, description = ? WHERE id = ?'
        ).run(
            name || existing.name,
            description !== undefined ? description : existing.description,
            roomId
        );

        const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);

        res.json({ message: 'Oda güncellendi', room });
    } catch (err) {
        console.error('Update room error:', err);
        res.status(500).json({ error: 'Oda güncellenirken hata oluştu' });
    }
});

// Delete room (must be from same house)
router.delete('/:id', (req, res) => {
    try {
        const roomId = req.params.id;

        const existing = db.prepare('SELECT * FROM rooms WHERE id = ? AND house_key = ?')
            .get(roomId, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Oda bulunamadı' });
        }

        db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);

        res.json({ message: 'Oda silindi' });
    } catch (err) {
        console.error('Delete room error:', err);
        res.status(500).json({ error: 'Oda silinirken hata oluştu' });
    }
});

export default router;
