import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import {
    decryptRoomRecord,
    encryptRoomDescription,
    encryptRoomName,
    sortByName
} from '../utils/protectedFields.js';

const router = express.Router();

function getDecryptedRoomsForHouse(houseKey) {
    return sortByName(
        db.prepare('SELECT * FROM rooms WHERE house_key = ?')
            .all(houseKey)
            .map(decryptRoomRecord)
    );
}

// Apply auth to all routes
router.use(authenticateToken);
router.use(requireActiveHouse);

// Get all rooms (only from same house)
router.get('/', (req, res) => {
    try {
        const rooms = getDecryptedRoomsForHouse(req.user.house_key);
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
        const existing = getDecryptedRoomsForHouse(req.user.house_key)
            .find((room) => room.name === name);

        if (existing) {
            return res.status(400).json({ error: 'Bu oda zaten mevcut' });
        }

        const result = db.prepare(
            'INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)'
        ).run(encryptRoomName(name), description ? encryptRoomDescription(description) : null, req.user.house_key);

        const room = decryptRoomRecord(db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid));

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

        const existingRow = db.prepare('SELECT * FROM rooms WHERE id = ? AND house_key = ?')
            .get(roomId, req.user.house_key);

        const existing = decryptRoomRecord(existingRow);

        if (!existing) {
            return res.status(404).json({ error: 'Oda bulunamadı' });
        }

        // Check for duplicate name
        if (name && name !== existing.name) {
            const duplicate = getDecryptedRoomsForHouse(req.user.house_key)
                .find((room) => room.id !== Number(roomId) && room.name === name);
            if (duplicate) {
                return res.status(400).json({ error: 'Bu isimde bir oda zaten mevcut' });
            }
        }

        db.prepare(
            'UPDATE rooms SET name = ?, description = ? WHERE id = ?'
        ).run(
            name ? encryptRoomName(name) : existingRow.name,
            description !== undefined ? (description ? encryptRoomDescription(description) : description) : existingRow.description,
            roomId
        );

        const room = decryptRoomRecord(db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId));

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
