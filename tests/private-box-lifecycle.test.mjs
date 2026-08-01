import test from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-private-box-lifecycle-'));
const uploadsDir = join(tempDir, 'uploads');
process.env.NODE_ENV = 'test';
process.env.HOMEINVENTORY_DB_PATH = join(tempDir, 'inventory.db');
process.env.HOMEINVENTORY_DATA_DIR = tempDir;
process.env.HOMEINVENTORY_UPLOADS_DIR = uploadsDir;
process.env.SECRET_PROVIDER = 'env';
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'private-box-lifecycle-test-key';

const { default: db } = await import('../database.js');
const {
    deletePrivateBoxMediaFiles,
    removeOwnedPrivateBoxes
} = await import('../utils/privateBoxLifecycle.js');
const { kickHouseMember } = await import('../utils/houseMembership.js');

function createUser(username, houseKey) {
    return Number(db.prepare(`
        INSERT INTO users (
            username,
            email,
            password_hash,
            house_key,
            active_house_key
        )
        VALUES (?, ?, 'hash', ?, ?)
    `).run(username, `${username}@example.com`, houseKey, houseKey).lastInsertRowid);
}

function createBox({
    ownerUserId,
    houseKey,
    name,
    code,
    isPublic,
    roomId,
    locationId,
    photoPath = null,
    thumbnailPath = null
}) {
    return Number(db.prepare(`
        INSERT INTO boxes (
            name,
            code,
            code_lookup,
            is_public,
            room_id,
            location_id,
            photo_path,
            thumbnail_path,
            created_by,
            house_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        name,
        code,
        code.toLocaleLowerCase('en-US'),
        isPublic ? 1 : 0,
        roomId,
        locationId,
        photoPath,
        thumbnailPath,
        ownerUserId,
        houseKey
    ).lastInsertRowid);
}

function createItem({
    ownerUserId,
    houseKey,
    name,
    roomId,
    locationId,
    boxId
}) {
    return Number(db.prepare(`
        INSERT INTO items (
            name,
            user_id,
            house_key,
            room_id,
            location_id,
            box_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, ownerUserId, houseKey, roomId, locationId, boxId).lastInsertRowid);
}

test('private boxes are removed transactionally while shared boxes and item records survive', (t) => {
    t.after(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    const houseKey = 'a'.repeat(64);
    const ownerId = createUser('lifecycle-owner', houseKey);
    const departingUserId = createUser('lifecycle-member', houseKey);
    db.prepare(`
        INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, 'Lifecycle house', 1), (?, ?, 'Lifecycle house', 0)
    `).run(ownerId, houseKey, departingUserId, houseKey);

    const roomId = Number(db.prepare(`
        INSERT INTO rooms (name, house_key)
        VALUES ('Storage', ?)
    `).run(houseKey).lastInsertRowid);
    const privateLocationId = Number(db.prepare(`
        INSERT INTO locations (name, room_id, created_by, is_public, house_key)
        VALUES ('Private shelf', ?, ?, 0, ?)
    `).run(roomId, departingUserId, houseKey).lastInsertRowid);

    const photoPath = 'uploads/boxes/lifecycle.webp';
    const thumbnailPath = 'uploads/boxes/thumbnails/lifecycle_thumb.webp';
    mkdirSync(join(uploadsDir, 'boxes', 'thumbnails'), { recursive: true });
    writeFileSync(join(uploadsDir, 'boxes', 'lifecycle.webp'), 'photo');
    writeFileSync(join(uploadsDir, 'boxes', 'thumbnails', 'lifecycle_thumb.webp'), 'thumb');

    const privateBoxId = createBox({
        ownerUserId: departingUserId,
        houseKey,
        name: 'Private records',
        code: 'PRIVATE-1',
        isPublic: false,
        roomId,
        locationId: privateLocationId,
        photoPath,
        thumbnailPath
    });
    const sharedBoxId = createBox({
        ownerUserId: departingUserId,
        houseKey,
        name: 'Shared supplies',
        code: 'SHARED-1',
        isPublic: true,
        roomId,
        locationId: null
    });

    const departingItemId = createItem({
        ownerUserId: departingUserId,
        houseKey,
        name: 'Private document',
        roomId,
        locationId: privateLocationId,
        boxId: privateBoxId
    });
    const anomalousForeignItemId = createItem({
        ownerUserId: ownerId,
        houseKey,
        name: 'Foreign item reference',
        roomId,
        locationId: null,
        boxId: privateBoxId
    });
    const sharedItemId = createItem({
        ownerUserId: departingUserId,
        houseKey,
        name: 'Shared item',
        roomId,
        locationId: null,
        boxId: sharedBoxId
    });

    const cleanup = db.transaction(() => removeOwnedPrivateBoxes({
        ownerUserId: departingUserId,
        houseKey
    }))();

    assert.deepEqual(
        {
            deletedBoxCount: cleanup.deletedBoxCount,
            unassignedOwnedItemCount: cleanup.unassignedOwnedItemCount,
            releasedForeignItemCount: cleanup.releasedForeignItemCount
        },
        {
            deletedBoxCount: 1,
            unassignedOwnedItemCount: 1,
            releasedForeignItemCount: 1
        }
    );
    assert.equal(db.prepare('SELECT id FROM boxes WHERE id = ?').get(privateBoxId), undefined);
    assert.equal(db.prepare('SELECT created_by FROM boxes WHERE id = ?').get(sharedBoxId).created_by, departingUserId);

    const departingItem = db.prepare(`
        SELECT box_id, room_id, location_id
        FROM items
        WHERE id = ?
    `).get(departingItemId);
    assert.deepEqual(departingItem, {
        box_id: null,
        room_id: roomId,
        location_id: privateLocationId
    });
    assert.equal(db.prepare('SELECT box_id FROM items WHERE id = ?').get(anomalousForeignItemId).box_id, null);
    assert.equal(db.prepare('SELECT box_id FROM items WHERE id = ?').get(sharedItemId).box_id, sharedBoxId);

    assert.equal(existsSync(join(uploadsDir, 'boxes', 'lifecycle.webp')), true);
    assert.equal(existsSync(join(uploadsDir, 'boxes', 'thumbnails', 'lifecycle_thumb.webp')), true);
    const mediaCleanup = deletePrivateBoxMediaFiles(cleanup.mediaPaths);
    assert.deepEqual(mediaCleanup, {
        deletedCount: 2,
        missingCount: 0,
        rejectedCount: 0,
        failures: []
    });
    assert.equal(existsSync(join(uploadsDir, 'boxes', 'lifecycle.webp')), false);
    assert.equal(existsSync(join(uploadsDir, 'boxes', 'thumbnails', 'lifecycle_thumb.webp')), false);

    const kickedUserId = createUser('lifecycle-kicked', houseKey);
    db.prepare(`
        INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, 'Lifecycle house', 0)
    `).run(kickedUserId, houseKey);
    const kickedPublicLocationId = Number(db.prepare(`
        INSERT INTO locations (name, room_id, created_by, is_public, house_key)
        VALUES ('Kicked shared shelf', ?, ?, 1, ?)
    `).run(roomId, kickedUserId, houseKey).lastInsertRowid);
    const kickedPrivateBoxId = createBox({
        ownerUserId: kickedUserId,
        houseKey,
        name: 'Kicked private box',
        code: 'PRIVATE-2',
        isPublic: false,
        roomId,
        locationId: null
    });
    const kickedSharedBoxId = createBox({
        ownerUserId: kickedUserId,
        houseKey,
        name: 'Kicked shared box',
        code: 'SHARED-2',
        isPublic: true,
        roomId,
        locationId: kickedPublicLocationId
    });
    const kickedItemId = createItem({
        ownerUserId: kickedUserId,
        houseKey,
        name: 'Kicked member item',
        roomId,
        locationId: null,
        boxId: kickedPrivateBoxId
    });

    const kickResult = kickHouseMember({
        actorUserId: ownerId,
        houseKey,
        memberId: kickedUserId
    });

    assert.equal(kickResult.privateBoxCleanup.deletedBoxCount, 1);
    assert.equal(
        db.prepare('SELECT id FROM user_houses WHERE user_id = ? AND house_key = ?')
            .get(kickedUserId, houseKey),
        undefined
    );
    assert.equal(db.prepare('SELECT id FROM boxes WHERE id = ?').get(kickedPrivateBoxId), undefined);
    assert.equal(db.prepare('SELECT created_by FROM boxes WHERE id = ?').get(kickedSharedBoxId).created_by, kickedUserId);
    assert.equal(kickResult.transferredPublicLocationCount, 1);
    assert.equal(
        db.prepare('SELECT created_by FROM locations WHERE id = ?').get(kickedPublicLocationId).created_by,
        ownerId
    );
    assert.deepEqual(
        db.prepare('SELECT box_id, room_id FROM items WHERE id = ?').get(kickedItemId),
        { box_id: null, room_id: roomId }
    );

    const deletedAccountUserId = createUser('lifecycle-deleted', houseKey);
    db.prepare(`
        INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, 'Lifecycle house', 0)
    `).run(deletedAccountUserId, houseKey);
    const deletedAccountPrivateBoxId = createBox({
        ownerUserId: deletedAccountUserId,
        houseKey,
        name: 'Deleted account private box',
        code: 'PRIVATE-3',
        isPublic: false,
        roomId,
        locationId: null
    });
    const deletedAccountSharedBoxId = createBox({
        ownerUserId: deletedAccountUserId,
        houseKey,
        name: 'Deleted account shared box',
        code: 'SHARED-3',
        isPublic: true,
        roomId,
        locationId: null
    });
    const survivingForeignItemId = createItem({
        ownerUserId: ownerId,
        houseKey,
        name: 'Surviving foreign item',
        roomId,
        locationId: null,
        boxId: deletedAccountPrivateBoxId
    });
    const deletedOwnedItemId = createItem({
        ownerUserId: deletedAccountUserId,
        houseKey,
        name: 'Deleted account item',
        roomId,
        locationId: null,
        boxId: deletedAccountSharedBoxId
    });

    const deletedAccountCleanup = db.transaction(() => {
        const lifecycleCleanup = removeOwnedPrivateBoxes({
            ownerUserId: deletedAccountUserId
        });
        db.prepare('DELETE FROM users WHERE id = ?').run(deletedAccountUserId);
        return lifecycleCleanup;
    })();

    assert.equal(deletedAccountCleanup.deletedBoxCount, 1);
    assert.equal(db.prepare('SELECT id FROM boxes WHERE id = ?').get(deletedAccountPrivateBoxId), undefined);
    assert.equal(
        db.prepare('SELECT created_by FROM boxes WHERE id = ?').get(deletedAccountSharedBoxId).created_by,
        null
    );
    assert.equal(db.prepare('SELECT id FROM items WHERE id = ?').get(deletedOwnedItemId), undefined);
    assert.equal(db.prepare('SELECT box_id FROM items WHERE id = ?').get(survivingForeignItemId).box_id, null);
});
