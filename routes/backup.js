import express from 'express';
import rateLimit from 'express-rate-limit';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeWarrantyDetails } from '../utils/warrantyValidation.js';
import {
    buildBarcodeLookup,
    decryptCategoryRecord,
    decryptItemRecord,
    decryptLocationRecord,
    decryptRoomRecord,
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

const backupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla yedekleme isteği. Lütfen daha sonra tekrar deneyin.' }
});

function buildNameMap(records) {
    const map = new Map();

    for (const record of records) {
        if (record?.name && !map.has(record.name)) {
            map.set(record.name, record);
        }
    }

    return map;
}

// GET /api/backup/export - Export all data for current house
router.get('/export', authenticateToken, backupRateLimiter, (req, res) => {
    try {
        const user = db.prepare('SELECT active_house_key, house_key FROM users WHERE id = ?').get(req.user.id);
        const houseKey = user.active_house_key || user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        // Get all items for this house
        const items = db.prepare(`
            SELECT 
                i.id, i.name, i.description, i.quantity, i.barcode,
                i.invoice_price, i.invoice_currency, i.invoice_date,
                i.warranty_start_date, i.warranty_duration_value, i.warranty_duration_unit, i.warranty_expiry_date,
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

        const exportData = {
            version: '1.2',
            exportDate: new Date().toISOString(),
            items,
            categories,
            rooms,
            locations
        };

        res.json(exportData);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Yedekleme oluşturulurken hata oluştu' });
    }
});

// POST /api/backup/import - Import data to current house
router.post('/import', authenticateToken, backupRateLimiter, (req, res) => {
    try {
        const user = db.prepare('SELECT active_house_key, house_key FROM users WHERE id = ?').get(req.user.id);
        const houseKey = user.active_house_key || user.house_key;

        if (!houseKey) {
            return res.status(400).json({ error: 'Aktif ev bulunamadı' });
        }

        const { items, categories, rooms, locations } = req.body;

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

        // Map to store old_id -> new_id for foreign key references
        const categoryMap = {};
        const roomMap = {};
        const locationMap = {};

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

            // Import categories
            if (categories && Array.isArray(categories)) {
                const insertCategory = db.prepare('INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)');
                for (const cat of categories) {
                    // Check if category already exists
                    const existing = existingCategoriesByName.get(cat.name);
                    if (existing) {
                        categoryMap[cat.id] = existing.id;
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
                    }
                }
            }

            // Import items
            const insertItem = db.prepare(`
                INSERT INTO items (
                    name, description, quantity, barcode, invoice_price, invoice_currency, invoice_date,
                    warranty_start_date, warranty_duration_value, warranty_duration_unit, warranty_expiry_date,
                    barcode_lookup, category_id, room_id, location_id, user_id, house_key
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    const loc = existingLocationsByName.get(item.location_name);
                    if (loc) locationId = loc.id;
                }

                insertItem.run(
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
                    req.user.id,
                    houseKey
                        ];
                    })()
                );
                importedItems++;
            }
        });

        importAll();

        res.json({
            message: 'Yedek başarıyla içe aktarıldı',
            imported: {
                items: importedItems,
                categories: importedCategories,
                rooms: importedRooms,
                locations: importedLocations
            }
        });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: 'Yedek içe aktarılırken hata oluştu: ' + err.message });
    }
});

export default router;
