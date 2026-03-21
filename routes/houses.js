import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
    decryptHouseRecord,
    decryptUsername,
    encryptCategoryName,
    encryptHouseName,
    encryptRoomDescription,
    encryptRoomName
} from '../utils/protectedFields.js';
import {
    approveJoinRequest,
    createJoinRequest,
    getHouseOwners,
    getUserHouseList,
    isHouseOwner,
    kickHouseMember,
    listPendingJoinRequestsForHouse,
    listPendingJoinRequestsForUser,
    rejectJoinRequest,
    syncUserHousePointers
} from '../utils/houseMembership.js';
import {
    sendHouseJoinRequestDecisionNotification,
    sendHouseKickNotification,
    sendHouseJoinRequestNotification
} from '../utils/emailService.js';

const router = express.Router();

function generateHouseKey() {
    return crypto.randomBytes(32).toString('hex');
}

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
        for (const category of categories) {
            insertCategory.run(encryptCategoryName(category[0]), category[1], category[2], houseKey);
        }
    });

    insertMany(defaultCategories);
}

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
            insertRoom.run(encryptRoomName(room[0]), encryptRoomDescription(room[1]), houseKey);
        }
    });

    insertMany(defaultRooms);
}

function fireAndForget(task, label) {
    Promise.resolve()
        .then(task)
        .catch((error) => console.error(label, error));
}

function notifyOwnersAboutJoinRequest(houseKey, requesterUsername, requestedHouseName) {
    if (!process.env.RESEND_API_KEY) {
        return;
    }

    const ownerEmails = getHouseOwners(houseKey)
        .map((owner) => owner.email)
        .filter(Boolean);

    if (ownerEmails.length === 0) {
        return;
    }

    fireAndForget(
        () => sendHouseJoinRequestNotification({
            to: ownerEmails,
            requesterUsername,
            requestedHouseName
        }),
        'House join request owner notification error:'
    );
}

function notifyRequesterAboutDecision(email, status, requestedHouseName) {
    if (!process.env.RESEND_API_KEY || !email) {
        return;
    }

    fireAndForget(
        () => sendHouseJoinRequestDecisionNotification({
            to: email,
            status,
            requestedHouseName
        }),
        'House join request decision notification error:'
    );
}

function notifyMemberAboutKick(email, houseName) {
    if (!process.env.RESEND_API_KEY || !email) {
        return;
    }

    fireAndForget(
        () => sendHouseKickNotification({
            to: email,
            houseName
        }),
        'House kick notification error:'
    );
}

router.get('/', authenticateToken, (req, res) => {
    try {
        syncUserHousePointers(req.user.id);

        res.json({
            houses: getUserHouseList(req.user.id),
            pendingRequests: listPendingJoinRequestsForUser(req.user.id)
        });
    } catch (error) {
        console.error('Get houses error:', error);
        res.status(500).json({ error: 'Evler yüklenirken hata oluştu' });
    }
});

router.post('/', authenticateToken, (req, res) => {
    try {
        const { name } = req.body;
        const houseName = String(name || '').trim() || 'Yeni Evim';
        const newHouseKey = generateHouseKey();

        const result = db.prepare(`
            INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
            VALUES (?, ?, ?, 1)
        `).run(req.user.id, newHouseKey, encryptHouseName(houseName));

        createDefaultCategories(newHouseKey);
        createDefaultRooms(newHouseKey);

        db.prepare(`
            UPDATE users
            SET house_key = COALESCE(house_key, ?), active_house_key = ?
            WHERE id = ?
        `).run(newHouseKey, newHouseKey, req.user.id);

        const newHouse = decryptHouseRecord(
            db.prepare('SELECT id, house_key, house_name as name, is_owner FROM user_houses WHERE id = ?').get(result.lastInsertRowid)
        );

        res.json({
            message: 'Yeni ev oluşturuldu!',
            house: newHouse
        });
    } catch (error) {
        console.error('Create house error:', error);
        res.status(500).json({ error: 'Ev oluşturulurken hata oluştu' });
    }
});

router.get('/key', authenticateToken, (req, res) => {
    try {
        const user = syncUserHousePointers(req.user.id);

        if (!user?.active_house_key) {
            return res.status(404).json({ error: 'Aktif ev bulunamadı' });
        }

        res.json({ key: user.active_house_key });
    } catch (error) {
        console.error('Get house key error:', error);
        res.status(500).json({ error: 'Ev anahtarı alınırken hata oluştu' });
    }
});

router.get('/members', authenticateToken, (req, res) => {
    try {
        const user = syncUserHousePointers(req.user.id);

        if (!user?.active_house_key) {
            return res.status(404).json({ error: 'Aktif ev bulunamadı' });
        }

        const members = db.prepare(`
            SELECT
                u.id,
                u.username,
                uh.is_owner,
                uh.joined_at
            FROM user_houses uh
            JOIN users u ON u.id = uh.user_id
            WHERE uh.house_key = ?
            ORDER BY uh.is_owner DESC, uh.joined_at ASC, uh.id ASC
        `).all(user.active_house_key).map((member) => ({
            ...member,
            username: decryptUsername(member.username)
        }));

        res.json({
            members,
            pendingRequests: listPendingJoinRequestsForHouse(user.active_house_key),
            viewerCanManageMembers: isHouseOwner(req.user.id, user.active_house_key)
        });
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({ error: 'Üyeler yüklenirken hata oluştu' });
    }
});

router.post('/join', authenticateToken, (req, res) => {
    try {
        const { key, name } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Ev anahtarı gerekli' });
        }

        const { request } = createJoinRequest({
            requesterUserId: req.user.id,
            houseKey: String(key).trim(),
            requestedHouseName: name
        });

        notifyOwnersAboutJoinRequest(request.house_key, req.user.username, request.requested_house_name);

        res.json({
            message: 'Katilim isteginiz gonderildi',
            request
        });
    } catch (error) {
        console.error('Join house error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Eve katılırken hata oluştu' });
    }
});

router.post('/requests/:requestId/approve', authenticateToken, (req, res) => {
    try {
        const requestId = Number.parseInt(req.params.requestId, 10);
        if (!Number.isInteger(requestId)) {
            return res.status(400).json({ error: 'Geçersiz istek kimliği' });
        }

        const result = approveJoinRequest({
            requestId,
            actorUserId: req.user.id
        });

        notifyRequesterAboutDecision(result.requester.email, 'approved', result.request.requested_house_name);

        res.json({
            message: 'Katilim istegi onaylandi',
            request: result.request
        });
    } catch (error) {
        console.error('Approve join request error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Katilim istegi onaylanamadi' });
    }
});

router.post('/requests/:requestId/reject', authenticateToken, (req, res) => {
    try {
        const requestId = Number.parseInt(req.params.requestId, 10);
        if (!Number.isInteger(requestId)) {
            return res.status(400).json({ error: 'Geçersiz istek kimliği' });
        }

        const result = rejectJoinRequest({
            requestId,
            actorUserId: req.user.id
        });

        notifyRequesterAboutDecision(result.requester.email, 'rejected', result.request.requested_house_name);

        res.json({
            message: 'Katilim istegi reddedildi',
            request: result.request
        });
    } catch (error) {
        console.error('Reject join request error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Katilim istegi reddedilemedi' });
    }
});

router.post('/members/:memberId/kick', authenticateToken, (req, res) => {
    try {
        const memberId = Number.parseInt(req.params.memberId, 10);
        if (!Number.isInteger(memberId)) {
            return res.status(400).json({ error: 'Geçersiz üye kimliği' });
        }

        const user = syncUserHousePointers(req.user.id);
        if (!user?.active_house_key) {
            return res.status(404).json({ error: 'Aktif ev bulunamadı' });
        }

        const result = kickHouseMember({
            actorUserId: req.user.id,
            houseKey: user.active_house_key,
            memberId
        });

        notifyMemberAboutKick(result.member.email, result.house?.name);

        res.json({
            message: 'Uye evden cikarildi'
        });
    } catch (error) {
        console.error('Kick member error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Uye evden cikarilamadi' });
    }
});

router.post('/switch', authenticateToken, (req, res) => {
    try {
        const { house_id } = req.body;

        if (!house_id) {
            return res.status(400).json({ error: 'Ev ID gerekli' });
        }

        const userHouse = db.prepare('SELECT * FROM user_houses WHERE id = ? AND user_id = ?').get(house_id, req.user.id);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        db.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(userHouse.house_key, req.user.id);
        syncUserHousePointers(req.user.id);

        res.json({
            message: 'Ev başarıyla değiştirildi!',
            house: {
                id: userHouse.id,
                name: decryptHouseRecord(userHouse).house_name,
                house_key: userHouse.house_key
            }
        });
    } catch (error) {
        console.error('Switch house error:', error);
        res.status(500).json({ error: 'Ev değiştirirken hata oluştu' });
    }
});

router.post('/:id/leave', authenticateToken, (req, res) => {
    try {
        const houseId = Number.parseInt(req.params.id, 10);
        const userHouses = db.prepare('SELECT * FROM user_houses WHERE user_id = ?').all(req.user.id);

        if (userHouses.length <= 1) {
            return res.status(400).json({ error: 'En az bir eve üye olmalısınız. Başka bir eve katıldıktan sonra bu evden ayrılabilirsiniz.' });
        }

        const houseToLeave = userHouses.find((house) => house.id === houseId);
        if (!houseToLeave) {
            return res.status(400).json({ error: 'Bu eve üye değilsiniz' });
        }

        if (houseToLeave.is_owner) {
            const otherMembers = db.prepare(`
                SELECT COUNT(*) as count
                FROM user_houses
                WHERE house_key = ? AND user_id != ?
            `).get(houseToLeave.house_key, req.user.id);

            if (otherMembers.count > 0) {
                return res.status(400).json({ error: 'Ev sahibi olarak evden ayrılamazsınız. Önce sahipliği başka bir üyeye devredin veya diğer üyeleri çıkarın.' });
            }
        }

        db.prepare('DELETE FROM user_houses WHERE id = ?').run(houseId);
        syncUserHousePointers(req.user.id);

        res.json({ message: 'Evden başarıyla ayrıldınız' });
    } catch (error) {
        console.error('Leave house error:', error);
        res.status(500).json({ error: 'Evden ayrılırken hata oluştu' });
    }
});

router.put('/:id', authenticateToken, (req, res) => {
    try {
        const houseId = Number.parseInt(req.params.id, 10);
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Ev ismi gerekli' });
        }

        const userHouse = db.prepare('SELECT * FROM user_houses WHERE id = ? AND user_id = ?').get(houseId, req.user.id);
        if (!userHouse) {
            return res.status(403).json({ error: 'Bu eve erişim izniniz yok' });
        }

        db.prepare('UPDATE user_houses SET house_name = ? WHERE id = ?').run(encryptHouseName(name), houseId);

        res.json({
            message: 'Ev ismi güncellendi',
            house: {
                id: houseId,
                name
            }
        });
    } catch (error) {
        console.error('Update house error:', error);
        res.status(500).json({ error: 'Ev ismi güncellenirken hata oluştu' });
    }
});

export default router;
