import { encryptForStorage } from './encryption.js';

export const ACTIVITY_ACTION_PURPOSE = 'inventory.activity.action';
export const ACTIVITY_METADATA_PURPOSE = 'inventory.activity.metadata';

const ALLOWED_ACTIVITY_ACTIONS = new Set([
    'item.created',
    'item.updated',
    'item.deleted',
    'item.borrowed',
    'item.returned',
    'item.bulk_updated',
    'item.bulk_deleted',
    'item.box_moved',
    'item.stock_adjusted',
    'item.attachment_added',
    'item.attachment_deleted',
    'box.created',
    'box.updated',
    'box.archived',
    'box.restored',
    'box.deleted'
]);

function safeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return null;
    }

    const safe = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(key)) {
            continue;
        }
        if (value === null || value === undefined) {
            safe[key] = value;
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            safe[key] = value;
        } else if (Array.isArray(value)) {
            safe[key] = value
                .filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
                .slice(0, 20);
        }
    }

    const serialized = JSON.stringify(safe);
    return serialized.length <= 2000
        ? encryptForStorage(serialized, { purpose: ACTIVITY_METADATA_PURPOSE })
        : null;
}

export function recordItemActivity(db, { houseKey, itemId = null, actorUserId = null, action, metadata = null }) {
    try {
        if (!houseKey || !ALLOWED_ACTIVITY_ACTIONS.has(action)) {
            return;
        }

        db.prepare(`
            INSERT INTO item_activity (house_key, item_id, actor_user_id, action, metadata_json)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            houseKey,
            itemId || null,
            actorUserId || null,
            encryptForStorage(action, { purpose: ACTIVITY_ACTION_PURPOSE }),
            safeMetadata(metadata)
        );
    } catch (error) {
        console.warn('[ActivityLog] Could not record item activity:', error.message);
    }
}
