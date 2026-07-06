import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import {
    decryptItemRecord,
    decryptUsername
} from '../utils/protectedFields.js';
import { decryptFromStorage } from '../utils/encryption.js';
import { ACTIVITY_ACTION_PURPOSE, ACTIVITY_METADATA_PURPOSE } from '../utils/activityLog.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveHouse);

function parseLimit(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isInteger(parsed)) {
        return 80;
    }

    return Math.min(Math.max(parsed, 1), 200);
}

function parseMetadata(value) {
    try {
        const decrypted = value
            ? decryptFromStorage(value, { purpose: ACTIVITY_METADATA_PURPOSE })
            : '';
        return decrypted ? JSON.parse(decrypted) : {};
    } catch {
        return {};
    }
}

function parseAction(value) {
    try {
        return decryptFromStorage(value, { purpose: ACTIVITY_ACTION_PURPOSE });
    } catch {
        return String(value || '');
    }
}

router.get('/', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT
                item_activity.id,
                item_activity.item_id,
                item_activity.actor_user_id,
                item_activity.action,
                item_activity.metadata_json,
                item_activity.created_at,
                items.name AS item_name,
                users.username AS actor_username
            FROM item_activity
            LEFT JOIN items
              ON items.id = item_activity.item_id
             AND items.house_key = item_activity.house_key
            LEFT JOIN users ON users.id = item_activity.actor_user_id
            WHERE item_activity.house_key = ?
            ORDER BY item_activity.created_at DESC, item_activity.id DESC
            LIMIT ?
        `).all(req.user.house_key, parseLimit(req.query.limit));

        const activities = rows.map((row) => {
            const itemRecord = row.item_name ? decryptItemRecord({ name: row.item_name }) : null;
            return {
                id: row.id,
                item_id: row.item_id,
                actor_user_id: row.actor_user_id,
                actor_name: row.actor_username ? decryptUsername(row.actor_username) : '',
                item_name: itemRecord?.name || '',
                action: parseAction(row.action),
                metadata: parseMetadata(row.metadata_json),
                created_at: row.created_at
            };
        });

        res.json({ activities });
    } catch (err) {
        console.error('Get activity error:', err);
        res.status(500).json({ error: 'Aktivite geçmişi yüklenemedi' });
    }
});

export default router;
