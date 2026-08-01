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

const selectVisibleBox = db.prepare(`
    SELECT id
    FROM boxes
    WHERE id = ?
      AND house_key = ?
      AND (is_public = 1 OR created_by = ?)
    LIMIT 1
`);

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

function parseBoxId(value) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeBoxMetadata(metadata, houseKey, viewerUserId) {
    const sanitized = { ...metadata };

    for (const key of ['box_id', 'from_box_id', 'to_box_id']) {
        if (!Object.prototype.hasOwnProperty.call(sanitized, key)) {
            continue;
        }

        const rawValue = sanitized[key];
        if (rawValue === null || rawValue === '') {
            sanitized[key] = null;
            continue;
        }

        delete sanitized[key];
        const boxId = parseBoxId(rawValue);
        if (!boxId) {
            continue;
        }

        const visibleBox = selectVisibleBox.get(boxId, houseKey, viewerUserId);
        if (visibleBox) {
            sanitized[key] = boxId;
        } else {
            sanitized[key.replace(/_id$/, '_hidden')] = true;
        }
    }

    return sanitized;
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
              AND (
                    (
                        item_activity.item_id IS NOT NULL
                        AND items.id IS NOT NULL
                        AND (items.is_public = 1 OR items.user_id = ?)
                    )
                    OR (
                        item_activity.item_id IS NULL
                        AND item_activity.actor_user_id = ?
                    )
              )
            ORDER BY item_activity.created_at DESC, item_activity.id DESC
            LIMIT ?
        `).all(
            req.user.house_key,
            req.user.id,
            req.user.id,
            parseLimit(req.query.limit)
        );

        const activities = rows.map((row) => {
            const itemRecord = row.item_name ? decryptItemRecord({ name: row.item_name }) : null;
            return {
                id: row.id,
                item_id: row.item_id,
                actor_user_id: row.actor_user_id,
                actor_name: row.actor_username ? decryptUsername(row.actor_username) : '',
                item_name: itemRecord?.name || '',
                action: parseAction(row.action),
                metadata: sanitizeBoxMetadata(
                    parseMetadata(row.metadata_json),
                    req.user.house_key,
                    req.user.id
                ),
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
