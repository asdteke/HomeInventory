import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import {
    decryptCategoryRecord,
    encryptCategoryName,
    sortByName
} from '../utils/protectedFields.js';

const router = express.Router();

function getDecryptedCategoriesForHouse(houseKey) {
    return sortByName(
        db.prepare('SELECT * FROM categories WHERE house_key = ?')
            .all(houseKey)
            .map(decryptCategoryRecord)
    );
}

// Apply auth to all routes
router.use(authenticateToken);
router.use(requireActiveHouse);

// Get all categories (only from same house)
router.get('/', (req, res) => {
    try {
        const categories = getDecryptedCategoriesForHouse(req.user.house_key);
        res.json({ categories });
    } catch (err) {
        console.error('Get categories error:', err);
        res.status(500).json({ error: 'Kategoriler yüklenirken hata oluştu' });
    }
});

// Create category (with house_key stamp)
router.post('/', (req, res) => {
    try {
        const { name, icon, color } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Kategori adı gerekli' });
        }

        // Check if category name already exists in this house
        const existing = getDecryptedCategoriesForHouse(req.user.house_key)
            .find((category) => category.name === name);

        if (existing) {
            return res.status(400).json({ error: 'Bu kategori zaten mevcut' });
        }

        const result = db.prepare(
            'INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)'
        ).run(encryptCategoryName(name), icon || '📦', color || '#6366f1', req.user.house_key);

        const category = decryptCategoryRecord(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));

        res.status(201).json({ message: 'Kategori eklendi', category });
    } catch (err) {
        console.error('Create category error:', err);
        res.status(500).json({ error: 'Kategori eklenirken hata oluştu' });
    }
});

// Update category (must be from same house)
router.put('/:id', (req, res) => {
    try {
        const { name, icon, color } = req.body;
        const categoryId = req.params.id;

        const existingRow = db.prepare('SELECT * FROM categories WHERE id = ? AND house_key = ?')
            .get(categoryId, req.user.house_key);

        const existing = decryptCategoryRecord(existingRow);

        if (!existing) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        // Check for duplicate name
        if (name && name !== existing.name) {
            const duplicate = getDecryptedCategoriesForHouse(req.user.house_key)
                .find((category) => category.id !== Number(categoryId) && category.name === name);
            if (duplicate) {
                return res.status(400).json({ error: 'Bu isimde bir kategori zaten mevcut' });
            }
        }

        db.prepare(
            'UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?'
        ).run(
            name ? encryptCategoryName(name) : existingRow.name,
            icon || existing.icon,
            color || existing.color,
            categoryId
        );

        const category = decryptCategoryRecord(db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId));

        res.json({ message: 'Kategori güncellendi', category });
    } catch (err) {
        console.error('Update category error:', err);
        res.status(500).json({ error: 'Kategori güncellenirken hata oluştu' });
    }
});

// Delete category (must be from same house)
router.delete('/:id', (req, res) => {
    try {
        const categoryId = req.params.id;

        const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND house_key = ?')
            .get(categoryId, req.user.house_key);

        if (!existing) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);

        res.json({ message: 'Kategori silindi' });
    } catch (err) {
        console.error('Delete category error:', err);
        res.status(500).json({ error: 'Kategori silinirken hata oluştu' });
    }
});

export default router;
