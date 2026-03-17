import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate a secure 256-bit house key
function generateHouseKey() {
    return crypto.randomBytes(32).toString('hex'); // 64 characters, 256-bit
}

// Create default categories for a new house
function createDefaultCategories(houseKey) {
    const insertCategory = db.prepare('INSERT INTO categories (name, icon, color, house_key) VALUES (?, ?, ?, ?)');
    const defaultCategories = [
        ['Mutfak', '🍳', '#ef4444'],
        ['Elektronik', '💻', '#3b82f6'],
        ['Hobi', '🎨', '#8b5cf6'],
        ['Mobilya', '🛋️', '#f59e0b'],
        ['Giyim', '👕', '#ec4899'],
        ['Kitaplar', '📚', '#10b981'],
        ['Aletler', '🔧', '#6b7280'],
        ['Spor', '⚽', '#14b8a6'],
        ['Diğer', '📦', '#64748b']
    ];

    const insertMany = db.transaction((categories) => {
        for (const cat of categories) {
            insertCategory.run(cat[0], cat[1], cat[2], houseKey);
        }
    });
    insertMany(defaultCategories);
}

// Create default rooms for a new house
function createDefaultRooms(houseKey) {
    const insertRoom = db.prepare('INSERT INTO rooms (name, description, house_key) VALUES (?, ?, ?)');
    const defaultRooms = [
        ['Oturma Odası', 'Ana yaşam alanı'],
        ['Yatak Odası', 'Uyku ve dinlenme alanı'],
        ['Mutfak', 'Yemek hazırlama alanı'],
        ['Banyo', 'Temizlik ve bakım alanı'],
        ['Çalışma Odası', 'Ofis ve çalışma alanı'],
        ['Çocuk Odası', 'Çocuklar için oda'],
        ['Garaj', 'Araç ve depolama alanı'],
        ['Balkon', 'Dış mekan alanı'],
        ['Depo', 'Genel depolama alanı']
    ];

    const insertMany = db.transaction((rooms) => {
        for (const room of rooms) {
            insertRoom.run(room[0], room[1], houseKey);
        }
    });
    insertMany(defaultRooms);
}

// GET /api/houses - Get all houses for current user
router.get('/', authenticateToken, (req, res) => {
    try {
        const houses = db.prepare(`
            SELECT 
                uh.id,
                uh.house_key,
                uh.house_name as name,
                uh.is_owner,
                uh.joined_at,
                (SELECT COUNT(*) FROM user_houses WHERE house_key = uh.house_key) as member_count
            FROM user_houses uh 
            WHERE uh.user_id = ?
            ORDER BY uh.joined_at ASC
        `).all(req.user.id);

        res.json({ houses });
    } catch (err) {
        console.error('Get houses error:', err);
        res.status(500).json({ error: 'Evler yüklenirken hata oluştu' });
    }
});

// POST /api/houses - Create a new house
router.post('/', authenticateToken, (req, res) => {
    try {
        const { name } = req.body;
        const houseName = name || 'Yeni Evim';

        // Generate new house key
        const newHouseKey = generateHouseKey();

        // Add user to new house as owner
        const result = db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)')
            .run(req.user.id, newHouseKey, houseName);

        // Create default categories and rooms for the new house
        createDefaultCategories(newHouseKey);
        createDefaultRooms(newHouseKey);

        // Switch to new house
        db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(newHouseKey, req.user.id);

        // Get the newly created house
        const newHouse = db.prepare('SELECT id, house_key, house_name as name, is_owner FROM user_houses WHERE id = ?').get(result.lastInsertRowid);

        res.json({
            message: 'Yeni ev oluşturuldu!',
            house: newHouse
        });
    } catch (err) {
        console.error('Create house error:', err);
        res.status(500).json({ error: 'Ev oluşturulurken hata oluştu' });
    }
});

// GET /api/houses/key - Get the key for the active house
router.get('/key', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT active_house_key FROM users WHERE id = ?').get(req.user.id);

        if (!user || !user.active_house_key) {
            return res.status(404).json({ error: 'Aktif ev bulunamadı' });
        }

        res.json({ key: user.active_house_key });
    } catch (err) {
        console.error('Get house key error:', err);
        res.status(500).json({ error: 'Ev anahtarı alınırken hata oluştu' });
    }
});

// GET /api/houses/members - Get members of the active house
router.get('/members', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT active_house_key FROM users WHERE id = ?').get(req.user.id);

        if (!user || !user.active_house_key) {
            return res.status(404).json({ error: 'Aktif ev bulunamadı' });
        }

        const members = db.prepare(`
            SELECT 
                u.id,
                u.username,
                uh.is_owner,
                uh.joined_at
            FROM user_houses uh
            JOIN users u ON uh.user_id = u.id
            WHERE uh.house_key = ?
            ORDER BY uh.is_owner DESC, uh.joined_at ASC
        `).all(user.active_house_key);

        res.json({ members });
    } catch (err) {
        console.error('Get members error:', err);
        res.status(500).json({ error: 'Üyeler yüklenirken hata oluştu' });
    }
});

// POST /api/houses/join - Join an existing house
router.post('/join', authenticateToken, (req, res) => {
    try {
        const { key, name } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Ev anahtarı gerekli' });
        }

        // Verify house exists (check if any user has this house_key)
        const existingHouse = db.prepare('SELECT id FROM user_houses WHERE house_key = ?').get(key);
        if (!existingHouse) {
            return res.status(400).json({ error: 'Geçersiz ev anahtarı. Lütfen doğru anahtarı girin.' });
        }

        // Check if already a member
        const alreadyMember = db.prepare('SELECT id FROM user_houses WHERE user_id = ? AND house_key = ?').get(req.user.id, key);
        if (alreadyMember) {
            return res.status(400).json({ error: 'Zaten bu evin üyesisiniz' });
        }

        // Add user to house
        const result = db.prepare('INSERT INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 0)')
            .run(req.user.id, key, name || 'Katıldığım Ev');

        // Get the house info
        const house = db.prepare('SELECT id, house_key, house_name as name, is_owner FROM user_houses WHERE id = ?').get(result.lastInsertRowid);

        res.json({
            message: 'Eve başarıyla katıldınız!',
            house
        });
    } catch (err) {
        console.error('Join house error:', err);
        res.status(500).json({ error: 'Eve katılırken hata oluştu' });
    }
});

// POST /api/houses/switch - Switch to a different house
router.post('/switch', authenticateToken, (req, res) => {
    try {
        const { house_id } = req.body;

        if (!house_id) {
            return res.status(400).json({ error: 'Ev ID gerekli' });
        }

        // Verify user belongs to this house
        const userHouse = db.prepare('SELECT * FROM user_houses WHERE id = ? AND user_id = ?').get(house_id, req.user.id);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        // Update active house
        db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(userHouse.house_key, req.user.id);

        res.json({
            message: 'Ev başarıyla değiştirildi!',
            house: {
                id: userHouse.id,
                name: userHouse.house_name,
                house_key: userHouse.house_key
            }
        });
    } catch (err) {
        console.error('Switch house error:', err);
        res.status(500).json({ error: 'Ev değiştirirken hata oluştu' });
    }
});

// POST /api/houses/:id/leave - Leave a house
router.post('/:id/leave', authenticateToken, (req, res) => {
    try {
        const houseId = parseInt(req.params.id);

        // Get user's houses
        const userHouses = db.prepare('SELECT * FROM user_houses WHERE user_id = ?').all(req.user.id);

        if (userHouses.length <= 1) {
            return res.status(400).json({ error: 'En az bir eve üye olmalısınız. Başka bir eve katıldıktan sonra bu evden ayrılabilirsiniz.' });
        }

        // Find the house to leave
        const houseToLeave = userHouses.find(h => h.id === houseId);
        if (!houseToLeave) {
            return res.status(400).json({ error: 'Bu eve üye değilsiniz' });
        }

        if (houseToLeave.is_owner) {
            // Check if there are other members
            const otherMembers = db.prepare('SELECT COUNT(*) as count FROM user_houses WHERE house_key = ? AND user_id != ?').get(houseToLeave.house_key, req.user.id);
            if (otherMembers.count > 0) {
                return res.status(400).json({ error: 'Ev sahibi olarak evden ayrılamazsınız. Önce sahipliği başka bir üyeye devredin veya diğer üyeleri çıkarın.' });
            }
        }

        // Remove user from house
        db.prepare('DELETE FROM user_houses WHERE id = ?').run(houseId);

        // If this was the active house, switch to another one
        const user = db.prepare('SELECT active_house_key FROM users WHERE id = ?').get(req.user.id);
        if (user.active_house_key === houseToLeave.house_key) {
            const remainingHouse = db.prepare('SELECT house_key FROM user_houses WHERE user_id = ? LIMIT 1').get(req.user.id);
            if (remainingHouse) {
                db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(remainingHouse.house_key, req.user.id);
            }
        }

        res.json({ message: 'Evden başarıyla ayrıldınız' });
    } catch (err) {
        console.error('Leave house error:', err);
        res.status(500).json({ error: 'Evden ayrılırken hata oluştu' });
    }
});

// PUT /api/houses/:id - Update house name
router.put('/:id', authenticateToken, (req, res) => {
    try {
        const houseId = parseInt(req.params.id);
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Ev ismi gerekli' });
        }

        // Verify user belongs to this house
        const userHouse = db.prepare('SELECT * FROM user_houses WHERE id = ? AND user_id = ?').get(houseId, req.user.id);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        // Update house name
        db.prepare('UPDATE user_houses SET house_name = ? WHERE id = ?').run(name, houseId);

        res.json({
            message: 'Ev ismi güncellendi',
            house: {
                id: houseId,
                name: name
            }
        });
    } catch (err) {
        console.error('Update house error:', err);
        res.status(500).json({ error: 'Ev ismi güncellenirken hata oluştu' });
    }
});

export default router;
