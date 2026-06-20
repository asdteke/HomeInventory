import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { decryptItemName } from '../utils/protectedFields.js';

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);
router.use(requireActiveHouse);

function visibleItemCondition(alias = 'items') {
    return `(${alias}.is_public = 1 OR ${alias}.user_id = ?)`;
}

function visibleShoppingItemCondition(itemAlias = 'items', shoppingAlias = 'sl') {
    return `(${shoppingAlias}.item_id IS NULL OR ${visibleItemCondition(itemAlias)})`;
}

// GET /api/shopping - Fetch shopping list (active and completed) + suggested low stock items
router.get('/', (req, res) => {
    try {
        const houseKey = req.user.house_key;

        // 1. Fetch current shopping list items
        const shoppingList = db.prepare(`
            SELECT sl.*, items.photo_path, items.thumbnail_path
            FROM shopping_list sl
            LEFT JOIN items ON sl.item_id = items.id
            WHERE sl.house_key = ?
              AND ${visibleShoppingItemCondition('items', 'sl')}
            ORDER BY sl.created_at DESC
        `).all(houseKey, req.user.id);

        // 2. Fetch all inventory items that are low stock
        const lowStockItems = db.prepare(`
            SELECT id, name, quantity, min_quantity
            FROM items
            WHERE house_key = ?
              AND ${visibleItemCondition('items')}
              AND min_quantity > 0
              AND quantity < min_quantity
        `).all(houseKey, req.user.id);

        // Identify which item_ids are already in the active shopping list
        const activeShoppingItemIds = new Set(
            shoppingList
                .filter(item => item.is_completed === 0 && item.item_id !== null)
                .map(item => item.item_id)
        );

        // Map low stock items to suggestions if not already active in list
        const suggestions = lowStockItems
            .filter(item => !activeShoppingItemIds.has(item.id))
            .map(item => ({
                item_id: item.id,
                item_name: decryptItemName(item.name),
                current_quantity: item.quantity,
                min_quantity: item.min_quantity,
                suggested_quantity: Math.max(1, item.min_quantity - item.quantity)
            }));

        res.json({
            items: shoppingList,
            suggestions
        });
    } catch (err) {
        console.error('Get shopping list error:', err);
        res.status(500).json({ error: 'Alışveriş listesi yüklenirken hata oluştu' });
    }
});

// POST /api/shopping - Add a shopping item (manual or linked to inventory item)
router.post('/', (req, res) => {
    try {
        const { item_id, item_name, quantity } = req.body;

        let resolvedItemName = item_name;
        let linkedItemId = item_id || null;

        if (linkedItemId) {
            const item = db.prepare(`
                SELECT id, name
                FROM items
                WHERE id = ? AND house_key = ? AND ${visibleItemCondition('items')}
            `).get(linkedItemId, req.user.house_key, req.user.id);
            if (!item) {
                return res.status(400).json({ error: 'Geçersiz eşya veya eşyaya erişim yetkiniz yok' });
            }
            if (!resolvedItemName) {
                resolvedItemName = decryptItemName(item.name);
            }
        }

        if (!resolvedItemName || !resolvedItemName.trim()) {
            return res.status(400).json({ error: 'Ürün adı gerekli' });
        }
        if (resolvedItemName.length > 255) {
            return res.status(400).json({ error: 'Ürün adı en fazla 255 karakter olabilir' });
        }

        const qty = Math.max(1, parseInt(quantity, 10) || 1);

        // Check if this active item is already on the list (merge quantities if active)
        const existing = db.prepare(`
            SELECT id, quantity FROM shopping_list
            WHERE house_key = ? AND is_completed = 0 AND (
                (item_id IS NOT NULL AND item_id = ?) OR
                (item_id IS NULL AND LOWER(item_name) = LOWER(?))
            )
            LIMIT 1
        `).get(req.user.house_key, linkedItemId, resolvedItemName.trim());

        if (existing) {
            db.prepare('UPDATE shopping_list SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND house_key = ?')
                .run(existing.quantity + qty, existing.id, req.user.house_key);
            const updated = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(existing.id);
            return res.json({ message: 'Ürün miktarı güncellendi', item: updated });
        }

        const result = db.prepare(`
            INSERT INTO shopping_list (item_id, item_name, quantity, is_completed, house_key, created_by)
            VALUES (?, ?, ?, 0, ?, ?)
        `).run(linkedItemId, resolvedItemName.trim(), qty, req.user.house_key, req.user.id);

        const newItem = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ message: 'Ürün listeye eklendi', item: newItem });
    } catch (err) {
        console.error('Create shopping item error:', err);
        res.status(500).json({ error: 'Ürün eklenirken hata oluştu' });
    }
});

// POST /api/shopping/add-low-stock - Bulk add all currently low-stock items to active list
router.post('/add-low-stock', (req, res) => {
    try {
        const houseKey = req.user.house_key;

        // Fetch low stock items
        const lowStockItems = db.prepare(`
            SELECT id, name, quantity, min_quantity
            FROM items
            WHERE house_key = ?
              AND ${visibleItemCondition('items')}
              AND min_quantity > 0
              AND quantity < min_quantity
        `).all(houseKey, req.user.id);

        // Identify already active item IDs
        const activeShoppingItemIds = new Set(
            db.prepare('SELECT item_id FROM shopping_list WHERE house_key = ? AND is_completed = 0 AND item_id IS NOT NULL')
                .all(houseKey)
                .map(row => row.item_id)
        );

        // Filter out already listed items
        const itemsToAdd = lowStockItems.filter(item => !activeShoppingItemIds.has(item.id));

        if (itemsToAdd.length === 0) {
            return res.json({ message: 'Eklenecek azalan stoklu ürün bulunamadı', addedCount: 0 });
        }

        const insertStmt = db.prepare(`
            INSERT INTO shopping_list (item_id, item_name, quantity, is_completed, house_key, created_by)
            VALUES (?, ?, ?, 0, ?, ?)
        `);

        // Run as transaction for safety and performance
        const runTransaction = db.transaction((items) => {
            let count = 0;
            for (const item of items) {
                const name = decryptItemName(item.name);
                const suggestedQty = Math.max(1, item.min_quantity - item.quantity);
                insertStmt.run(item.id, name, suggestedQty, houseKey, req.user.id);
                count++;
            }
            return count;
        });

        const addedCount = runTransaction(itemsToAdd);
        res.json({ message: `${addedCount} ürün alışveriş listesine eklendi`, addedCount });
    } catch (err) {
        console.error('Bulk add low stock error:', err);
        res.status(500).json({ error: 'Azalan stoklar eklenirken hata oluştu' });
    }
});

// PUT /api/shopping/:id - Update quantity or toggle completed status
router.put('/:id', (req, res) => {
    try {
        const itemId = req.params.id;
        const { quantity, is_completed } = req.body;

        // Ensure shopping item belongs to user house
        const existing = db.prepare(`
            SELECT sl.*
            FROM shopping_list sl
            LEFT JOIN items ON sl.item_id = items.id
            WHERE sl.id = ? AND sl.house_key = ?
              AND ${visibleShoppingItemCondition('items', 'sl')}
        `).get(itemId, req.user.house_key, req.user.id);

        if (!existing) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        let newQty = existing.quantity;
        if (quantity !== undefined) {
            newQty = Math.max(1, parseInt(quantity, 10) || 1);
        }

        let completedStatus = existing.is_completed;
        if (is_completed !== undefined) {
            completedStatus = is_completed ? 1 : 0;
        }

        const updateShoppingItem = db.transaction(() => {
            db.prepare(`
                UPDATE shopping_list
                SET quantity = ?, is_completed = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND house_key = ?
            `).run(newQty, completedStatus, itemId, req.user.house_key);

            if (existing.item_id) {
                let inventoryDelta = 0;

                if (existing.is_completed === 0 && completedStatus === 1) {
                    inventoryDelta = newQty;
                } else if (existing.is_completed === 1 && completedStatus === 0) {
                    inventoryDelta = -existing.quantity;
                } else if (existing.is_completed === 1 && completedStatus === 1 && newQty !== existing.quantity) {
                    inventoryDelta = newQty - existing.quantity;
                }

                if (inventoryDelta > 0) {
                    db.prepare(`
                        UPDATE items
                        SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND house_key = ?
                    `).run(inventoryDelta, existing.item_id, req.user.house_key);
                } else if (inventoryDelta < 0) {
                    db.prepare(`
                        UPDATE items
                        SET quantity = MAX(1, quantity + ?), updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND house_key = ?
                    `).run(inventoryDelta, existing.item_id, req.user.house_key);
                }
            }
        });

        updateShoppingItem();

        const updated = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(itemId);
        res.json({ message: 'Alışveriş listesi güncellendi', item: updated });
    } catch (err) {
        console.error('Update shopping item error:', err);
        res.status(500).json({ error: 'Ürün güncellenirken hata oluştu' });
    }
});

// DELETE /api/shopping/:id - Remove shopping list entry
router.delete('/:id', (req, res) => {
    try {
        const itemId = req.params.id;

        // Ensure shopping item belongs to user house
        const existing = db.prepare(`
            SELECT sl.id
            FROM shopping_list sl
            LEFT JOIN items ON sl.item_id = items.id
            WHERE sl.id = ? AND sl.house_key = ?
              AND ${visibleShoppingItemCondition('items', 'sl')}
        `).get(itemId, req.user.house_key, req.user.id);

        if (!existing) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        db.prepare('DELETE FROM shopping_list WHERE id = ? AND house_key = ?').run(itemId, req.user.house_key);
        res.json({ message: 'Ürün alışveriş listesinden silindi' });
    } catch (err) {
        console.error('Delete shopping item error:', err);
        res.status(500).json({ error: 'Ürün silinirken hata oluştu' });
    }
});

export default router;
