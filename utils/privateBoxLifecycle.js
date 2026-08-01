import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../database.js';
import { resolveStoredMediaPath } from './mediaStorage.js';
import { getUploadsRoot } from './runtimePaths.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const boxUploadsRoot = join(getUploadsRoot(repoRoot), 'boxes');
const BOX_MEDIA_PREFIXES = ['uploads/boxes', 'uploads/boxes/thumbnails'];

function normalizeOwnerUserId(value) {
    const userId = Number.parseInt(String(value), 10);
    if (!Number.isInteger(userId) || userId <= 0) {
        throw new TypeError('A valid private-box owner user id is required');
    }
    return userId;
}

/**
 * Removes private boxes owned by a user before their house membership or account
 * disappears. Call this from the same database transaction as the lifecycle
 * mutation so a failed membership/account deletion also restores the boxes.
 *
 * Only box_id is cleared proactively. Item rows and their room/location values
 * are preserved. The boxes foreign key is ON DELETE SET NULL, which also safely
 * releases any anomalous foreign-owned item reference without deleting the item.
 */
export function removeOwnedPrivateBoxes({ ownerUserId, houseKey = null }) {
    const userId = normalizeOwnerUserId(ownerUserId);
    const normalizedHouseKey = houseKey === null || houseKey === undefined
        ? null
        : String(houseKey).trim();

    if (houseKey !== null && houseKey !== undefined && !normalizedHouseKey) {
        throw new TypeError('A non-empty house key is required when scoping private-box cleanup');
    }

    const houseClause = normalizedHouseKey ? ' AND house_key = ?' : '';
    const scopeParams = normalizedHouseKey ? [userId, normalizedHouseKey] : [userId];
    const privateBoxes = db.prepare(`
        SELECT id, photo_path, thumbnail_path
        FROM boxes
        WHERE created_by = ?
          AND is_public = 0
          ${houseClause}
    `).all(...scopeParams);

    if (privateBoxes.length === 0) {
        return {
            deletedBoxCount: 0,
            unassignedOwnedItemCount: 0,
            releasedForeignItemCount: 0,
            mediaPaths: []
        };
    }

    const ownedItemResult = db.prepare(`
        UPDATE items
        SET box_id = NULL
        WHERE user_id = ?
          AND box_id IN (
              SELECT id
              FROM boxes
              WHERE created_by = ?
                AND is_public = 0
                ${houseClause}
          )
    `).run(userId, ...scopeParams);

    const foreignItemCount = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM items
        WHERE user_id != ?
          AND box_id IN (
              SELECT id
              FROM boxes
              WHERE created_by = ?
                AND is_public = 0
                ${houseClause}
          )
    `).get(userId, ...scopeParams)?.count || 0);

    const deleteResult = db.prepare(`
        DELETE FROM boxes
        WHERE created_by = ?
          AND is_public = 0
          ${houseClause}
    `).run(...scopeParams);

    return {
        deletedBoxCount: Number(deleteResult.changes || 0),
        unassignedOwnedItemCount: Number(ownedItemResult.changes || 0),
        releasedForeignItemCount: foreignItemCount,
        mediaPaths: [...new Set(privateBoxes.flatMap((box) => ([
            box.photo_path,
            box.thumbnail_path
        ])).filter(Boolean))]
    };
}

/**
 * Best-effort post-commit cleanup. Database authorization is already removed
 * before this runs, so a filesystem failure can leave an inert file but cannot
 * make a deleted private box accessible through the media endpoint.
 */
export function deletePrivateBoxMediaFiles(mediaPaths = []) {
    const result = {
        deletedCount: 0,
        missingCount: 0,
        rejectedCount: 0,
        failures: []
    };

    for (const storedPath of [...new Set(mediaPaths.filter(Boolean))]) {
        const resolvedPath = resolveStoredMediaPath(storedPath, {
            repoRoot,
            mediaRoot: boxUploadsRoot,
            allowedPrefixes: BOX_MEDIA_PREFIXES
        });

        if (!resolvedPath) {
            result.rejectedCount += 1;
            continue;
        }

        try {
            fs.unlinkSync(resolvedPath);
            result.deletedCount += 1;
        } catch (error) {
            if (error?.code === 'ENOENT') {
                result.missingCount += 1;
                continue;
            }

            result.failures.push({
                storedPath,
                code: String(error?.code || 'UNKNOWN')
            });
        }
    }

    return result;
}
