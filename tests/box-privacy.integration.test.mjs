import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    toHeader() {
        return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    apply(headers) {
        const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
        for (const cookie of cookies) {
            const [pair] = cookie.split(';', 1);
            const [name, value = ''] = pair.split('=');
            if (value) this.cookies.set(name.trim(), value.trim());
            else this.cookies.delete(name.trim());
        }
    }
}

async function getFreePort() {
    return await new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => error ? reject(error) : resolvePort(address.port));
        });
        server.on('error', reject);
    });
}

async function stopServer(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        sleep(2000).then(() => child.exitCode === null && child.kill('SIGKILL'))
    ]);
}

async function request(port, path, { method = 'GET', body, form, photo } = {}, jar = null) {
    const headers = {};
    let requestBody;
    if (body !== undefined) {
        headers['content-type'] = 'application/json';
        requestBody = JSON.stringify(body);
    } else if (form || photo) {
        requestBody = new FormData();
        for (const [key, value] of Object.entries(form || {})) {
            requestBody.append(key, String(value));
        }
        if (photo) {
            requestBody.append(
                photo.field || 'photo',
                new Blob([photo.buffer], { type: photo.mimeType || 'image/png' }),
                photo.filename || 'photo.png'
            );
        }
    }
    const cookie = jar?.toHeader();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: requestBody
    });
    jar?.apply(response.headers);
    const contentType = response.headers.get('content-type') || '';
    return {
        status: response.status,
        headers: response.headers,
        data: contentType.includes('application/json')
            ? await response.json()
            : Buffer.from(await response.arrayBuffer())
    };
}

async function startServer(t, {
    itemCommitDelayMs = 0,
    backupMediaFailAfter = ''
} = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-box-privacy-'));
    const dbPath = join(tempDir, 'inventory.db');
    const port = await getFreePort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            SITE_URL: `http://127.0.0.1:${port}`,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: 'box-privacy-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'box-privacy-key',
            HOMEINVENTORY_DB_PATH: dbPath,
            HOMEINVENTORY_DATA_DIR: tempDir,
            HOMEINVENTORY_UPLOADS_DIR: join(tempDir, 'uploads'),
            HOMEINVENTORY_TEST_ITEM_COMMIT_DELAY_MS: String(itemCommitDelayMs),
            HOMEINVENTORY_TEST_BACKUP_MEDIA_FAIL_AFTER: String(backupMediaFailAfter),
            GOOGLE_CLIENT_ID: 'google-client-id-test',
            GOOGLE_CLIENT_SECRET: 'google-client-secret-test',
            RESEND_API_KEY: '',
            SUPPORT_EMAIL: 'support@example.com'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));

    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited early:\n${logs.join('')}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) {
                const directDb = new Database(dbPath);
                t.after(async () => {
                    directDb.close();
                    await stopServer(child);
                    rmSync(tempDir, { recursive: true, force: true });
                });
                return { port, tempDir, directDb };
            }
        } catch {
            // Server is still starting.
        }
        await sleep(100);
    }
    await stopServer(child);
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Server did not start:\n${logs.join('')}`);
}

async function waitForNewWebp(directory, existingNames) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const candidate = readdirSync(directory)
            .find((name) => name.endsWith('.webp') && !existingNames.has(name));
        if (candidate) return candidate;
        await sleep(10);
    }
    throw new Error('Timed out waiting for staged item media.');
}

function listFilesRecursively(rootDirectory) {
    if (!existsSync(rootDirectory)) return [];
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) visit(absolutePath);
            else if (entry.isFile()) files.push(absolutePath);
        }
    };
    visit(rootDirectory);
    return files.sort();
}

async function register(port, jar, username) {
    const response = await request(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username,
            email: `${username}@example.com`,
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, jar);
    assert.equal(response.status, 201);
    return response.data.user;
}

function joinHouse(directDb, ownerId, memberId) {
    const house = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);
    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(memberId, house.house_key, house.house_name);
    directDb.prepare(`
        UPDATE users
        SET house_key = ?, active_house_key = ?
        WHERE id = ?
    `).run(house.house_key, house.house_key, memberId);
    return house;
}

async function createRoom(port, jar, name) {
    const response = await request(port, '/api/rooms', {
        method: 'POST',
        body: { name, description: `${name} description` }
    }, jar);
    assert.equal(response.status, 201);
    return response.data.room;
}

async function createLocation(port, jar, { name, roomId, isPublic }) {
    const response = await request(port, '/api/locations', {
        method: 'POST',
        body: { name, room_id: roomId, is_public: isPublic }
    }, jar);
    assert.equal(response.status, 201);
    return response.data.location;
}

async function createBox(port, jar, fields) {
    const response = await request(port, '/api/boxes', {
        method: 'POST',
        body: fields
    }, jar);
    assert.equal(response.status, 201);
    return response.data.box;
}

async function createItem(port, jar, fields, photo = null) {
    const response = await request(port, '/api/items', {
        method: 'POST',
        form: fields,
        photo
    }, jar);
    assert.equal(response.status, 201);
    return response.data.item;
}

test('shared and private boxes preserve ownership, counts, placement privacy, and safe whole-box actions', async (t) => {
    const { port, directDb } = await startServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const owner = await register(port, ownerJar, 'boxprivacyowner');
    const member = await register(port, memberJar, 'boxprivacymember');
    const house = joinHouse(directDb, owner.id, member.id);
    const refreshedMember = await request(port, '/api/auth/me', {}, memberJar);
    assert.equal(refreshedMember.status, 200);
    assert.equal(refreshedMember.data.user.house_key, house.house_key);

    const schemaColumn = directDb.prepare(`PRAGMA table_info(boxes)`).all()
        .find((column) => column.name === 'is_public');
    assert.ok(schemaColumn);
    assert.equal(schemaColumn.notnull, 1);
    assert.equal(String(schemaColumn.dflt_value), '1');

    const storageRoom = await createRoom(port, ownerJar, 'Storage');
    const garageRoom = await createRoom(port, ownerJar, 'Garage');
    const secretRoom = await createRoom(port, ownerJar, 'Private records');
    const sharedShelf = await createLocation(port, ownerJar, {
        name: 'Shared shelf',
        roomId: storageRoom.id,
        isPublic: true
    });
    const garageShelf = await createLocation(port, ownerJar, {
        name: 'Garage shelf',
        roomId: garageRoom.id,
        isPublic: true
    });
    const ownerPrivateShelf = await createLocation(port, ownerJar, {
        name: 'Owner private shelf',
        roomId: storageRoom.id,
        isPublic: false
    });
    const memberPrivateShelf = await createLocation(port, memberJar, {
        name: 'Member private shelf',
        roomId: storageRoom.id,
        isPublic: false
    });
    const memberSecretShelf = await createLocation(port, memberJar, {
        name: 'Member secret shelf',
        roomId: secretRoom.id,
        isPublic: false
    });
    const memberMovingShelf = await createLocation(port, memberJar, {
        name: 'Member moving shelf',
        roomId: storageRoom.id,
        isPublic: true
    });
    const memberMovingBox = await createBox(port, memberJar, {
        name: 'Member moving box',
        code: 'MOVE-WITH-LOCATION',
        is_public: true,
        room_id: storageRoom.id,
        location_id: memberMovingShelf.id
    });
    const memberMovingItem = await createItem(port, memberJar, {
        name: 'Member moving item',
        quantity: 1,
        is_public: true,
        box_id: memberMovingBox.id
    });
    const movedLocation = await request(port, `/api/locations/${memberMovingShelf.id}`, {
        method: 'PUT',
        body: { room_id: garageRoom.id }
    }, memberJar);
    assert.equal(movedLocation.status, 200);
    assert.equal(movedLocation.data.location.room_id, garageRoom.id);
    assert.equal(
        directDb.prepare('SELECT room_id FROM boxes WHERE id = ?').get(memberMovingBox.id).room_id,
        garageRoom.id
    );
    assert.equal(
        directDb.prepare('SELECT room_id FROM items WHERE id = ?').get(memberMovingItem.id).room_id,
        garageRoom.id
    );

    const memberGuardShelf = await createLocation(port, memberJar, {
        name: 'Member guarded shelf',
        roomId: storageRoom.id,
        isPublic: true
    });
    await createItem(port, ownerJar, {
        name: 'Owner item on member shelf',
        quantity: 1,
        is_public: true,
        room_id: storageRoom.id,
        location_id: memberGuardShelf.id
    });
    const guardedPrivateLocation = await request(port, `/api/locations/${memberGuardShelf.id}`, {
        method: 'PUT',
        body: { is_public: false }
    }, memberJar);
    assert.equal(guardedPrivateLocation.status, 409);
    assert.equal(guardedPrivateLocation.data.code, 'LOCATION_VISIBILITY_CONFLICT');
    assert.equal(guardedPrivateLocation.data.conflictingItemCount, 1);

    const invalidSharedLocation = await request(port, '/api/boxes', {
        method: 'POST',
        body: {
            name: 'Invalid shared place',
            code: 'INVALID-PLACE',
            is_public: true,
            room_id: storageRoom.id,
            location_id: ownerPrivateShelf.id
        }
    }, ownerJar);
    assert.equal(invalidSharedLocation.status, 409);
    assert.equal(invalidSharedLocation.data.code, 'BOX_VISIBILITY_CONFLICT');

    const sharedBox = await createBox(port, ownerJar, {
        name: 'Household cables',
        code: 'SHARED-01',
        is_public: true,
        room_id: storageRoom.id,
        location_id: sharedShelf.id
    });
    const ownerPrivateBox = await createBox(port, ownerJar, {
        name: 'Owner documents',
        code: 'OWNER-PRIVATE',
        is_public: false,
        room_id: storageRoom.id,
        location_id: ownerPrivateShelf.id
    });
    const memberPrivateBox = await createBox(port, memberJar, {
        name: 'Member keepsakes',
        code: 'MEMBER-PRIVATE',
        is_public: false,
        room_id: storageRoom.id,
        location_id: memberPrivateShelf.id
    });

    const memberLocations = await request(port, '/api/locations', {}, ownerJar);
    assert.equal(memberLocations.status, 200);
    assert.equal(
        memberLocations.data.locations.some((location) => location.id === memberPrivateShelf.id),
        false
    );
    const forbiddenPrivateLocationItem = await request(port, '/api/items', {
        method: 'POST',
        form: {
            name: 'Location probe',
            quantity: 1,
            is_public: true,
            room_id: storageRoom.id,
            location_id: memberPrivateShelf.id
        }
    }, ownerJar);
    assert.equal(forbiddenPrivateLocationItem.status, 400);

    const png = await sharp({
        create: {
            width: 12,
            height: 12,
            channels: 4,
            background: { r: 38, g: 96, b: 72, alpha: 1 }
        }
    }).png().toBuffer();
    const privatePhoto = await request(port, `/api/boxes/${memberPrivateBox.id}`, {
        method: 'PUT',
        form: {},
        photo: { buffer: png, filename: 'private-box.png' }
    }, memberJar);
    assert.equal(privatePhoto.status, 200);
    const privatePhotoPath = privatePhoto.data.box.photo_path;

    const ownerBoxes = await request(port, '/api/boxes?archived=include', {}, ownerJar);
    assert.equal(ownerBoxes.status, 200);
    assert.equal(ownerBoxes.data.boxes.some((box) => box.id === sharedBox.id), true);
    assert.equal(ownerBoxes.data.boxes.some((box) => box.id === memberPrivateBox.id), false);
    const hiddenPrivateDetail = await request(port, `/api/boxes/${memberPrivateBox.id}`, {}, ownerJar);
    assert.equal(hiddenPrivateDetail.status, 404);
    const hiddenPrivateMedia = await request(port, privatePhotoPath, {}, ownerJar);
    assert.equal(hiddenPrivateMedia.status, 404);
    const visiblePrivateMedia = await request(port, privatePhotoPath, {}, memberJar);
    assert.equal(visiblePrivateMedia.status, 200);
    assert.match(visiblePrivateMedia.headers.get('content-type') || '', /^image\/webp/);

    const ownerSharedItem = await createItem(port, ownerJar, {
        name: 'Shared adapter',
        quantity: 1,
        is_public: true,
        box_id: sharedBox.id
    });
    const memberPrivateItem = await createItem(port, memberJar, {
        name: 'Private member cable',
        quantity: 1,
        is_public: false,
        box_id: sharedBox.id
    });

    const ownerDetail = await request(port, `/api/boxes/${sharedBox.id}`, {}, ownerJar);
    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.data.box.total_item_count, 2);
    assert.equal(ownerDetail.data.box.visible_item_count, 1);
    assert.equal(ownerDetail.data.box.hidden_item_count, 1);
    assert.deepEqual(ownerDetail.data.items.map((item) => item.id), [ownerSharedItem.id]);

    const householdOwnerBackup = await request(port, '/api/backup/export', {}, ownerJar);
    assert.equal(householdOwnerBackup.status, 200);
    assert.equal(
        householdOwnerBackup.data.boxes.some((box) => box.id === memberPrivateBox.id),
        true
    );
    assert.equal(
        householdOwnerBackup.data.items.some((item) => item.id === memberPrivateItem.id),
        true
    );
    assert.equal(
        householdOwnerBackup.data.locations.some((location) => location.id === memberPrivateShelf.id),
        true
    );

    const memberDetail = await request(port, `/api/boxes/${sharedBox.id}`, {}, memberJar);
    assert.equal(memberDetail.status, 200);
    assert.equal(memberDetail.data.box.total_item_count, 2);
    assert.equal(memberDetail.data.box.visible_item_count, 2);
    assert.equal(memberDetail.data.box.hidden_item_count, 0);
    assert.equal(memberDetail.data.items.some((item) => item.id === memberPrivateItem.id), true);

    const ownerBoxList = await request(port, '/api/boxes?occupancy=nonempty', {}, ownerJar);
    const listedShared = ownerBoxList.data.boxes.find((box) => box.id === sharedBox.id);
    assert.equal(listedShared.total_item_count, 2);
    assert.equal(listedShared.visible_item_count, 1);
    assert.equal(listedShared.hidden_item_count, 1);
    const ownerEmptyList = await request(port, '/api/boxes?occupancy=empty', {}, ownerJar);
    assert.equal(ownerEmptyList.data.boxes.some((box) => box.id === sharedBox.id), false);

    const memberMetadataEdit = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'PUT',
        body: { note: 'Member cannot overwrite shared metadata' }
    }, memberJar);
    assert.equal(memberMetadataEdit.status, 403);

    const movedSharedBox = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'PUT',
        body: {
            room_id: garageRoom.id,
            location_id: garageShelf.id,
            expected_updated_at: sharedBox.updated_at
        }
    }, ownerJar);
    assert.equal(movedSharedBox.status, 200);
    assert.equal(movedSharedBox.data.placementUpdatedCount, 2);
    const movedRows = directDb.prepare(`
        SELECT id, room_id, location_id
        FROM items
        WHERE id IN (?, ?)
        ORDER BY id
    `).all(ownerSharedItem.id, memberPrivateItem.id);
    assert.equal(movedRows.every((item) =>
        item.room_id === garageRoom.id && item.location_id === garageShelf.id
    ), true);

    const staleOverwrite = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'PUT',
        body: {
            note: 'Stale overwrite',
            expected_updated_at: sharedBox.updated_at
        }
    }, ownerJar);
    assert.equal(staleOverwrite.status, 409);
    assert.equal(staleOverwrite.data.code, 'BOX_STALE');

    const publicItemInPrivateBox = await createItem(port, memberJar, {
        name: 'Shared diary cover',
        quantity: 1,
        is_public: true,
        box_id: memberPrivateBox.id
    });
    const publicItemAtPrivateLocation = await createItem(port, memberJar, {
        name: 'Shared item at a private shelf',
        quantity: 1,
        is_public: true,
        room_id: secretRoom.id,
        location_id: memberSecretShelf.id,
        barcode: 'PRIVATE-LOCATION-001'
    });
    const ownerItems = await request(port, '/api/items', {}, ownerJar);
    const redactedItem = ownerItems.data.items.find((item) => item.id === publicItemInPrivateBox.id);
    assert.ok(redactedItem);
    assert.equal(redactedItem.private_placement, true);
    assert.equal(redactedItem.box_id, null);
    assert.equal(redactedItem.box_name, null);
    assert.equal(redactedItem.box_code, null);
    assert.equal(redactedItem.room_id, null);
    assert.equal(redactedItem.location_id, null);
    const redactedPrivateLocationItem = ownerItems.data.items.find(
        (item) => item.id === publicItemAtPrivateLocation.id
    );
    assert.ok(redactedPrivateLocationItem);
    assert.equal(redactedPrivateLocationItem.private_placement, false);
    assert.equal(redactedPrivateLocationItem.private_location_hidden, true);
    assert.equal(redactedPrivateLocationItem.room_id, null);
    assert.equal(redactedPrivateLocationItem.room_name, null);
    assert.equal(redactedPrivateLocationItem.location_id, null);
    assert.equal(redactedPrivateLocationItem.location_name, null);

    const privateLocationDetail = await request(
        port,
        `/api/items/${publicItemAtPrivateLocation.id}`,
        {},
        ownerJar
    );
    assert.equal(privateLocationDetail.status, 200);
    assert.equal(privateLocationDetail.data.item.room_id, null);
    assert.equal(privateLocationDetail.data.item.location_id, null);
    const privateLocationBarcode = await request(
        port,
        '/api/items/barcode/PRIVATE-LOCATION-001',
        {},
        ownerJar
    );
    assert.equal(privateLocationBarcode.status, 200);
    assert.equal(privateLocationBarcode.data.item.room_name, null);
    assert.equal(privateLocationBarcode.data.item.location_name, null);
    const privateLocationSearch = await request(
        port,
        '/api/items?search=private%20shelf',
        {},
        ownerJar
    );
    assert.equal(privateLocationSearch.status, 200);
    const privateLocationSearchItem = privateLocationSearch.data.items.find(
        (item) => item.id === publicItemAtPrivateLocation.id
    );
    assert.ok(privateLocationSearchItem);
    assert.equal(privateLocationSearchItem.room_name, null);
    const ownerItemOptions = await request(port, '/api/items/options', {}, ownerJar);
    assert.equal(ownerItemOptions.status, 200);
    assert.equal(
        ownerItemOptions.data.items.find((item) => item.id === publicItemAtPrivateLocation.id).room_name,
        ''
    );
    const privateRoomProbe = await request(
        port,
        `/api/items?room_id=${secretRoom.id}`,
        {},
        ownerJar
    );
    assert.equal(privateRoomProbe.status, 200);
    assert.equal(
        privateRoomProbe.data.items.some((item) => item.id === publicItemAtPrivateLocation.id),
        false
    );
    const ownerRoomStats = await request(port, '/api/items/stats/summary', {}, ownerJar);
    assert.equal(ownerRoomStats.status, 200);
    assert.equal(ownerRoomStats.data.roomsInUse, 2);
    assert.notEqual(ownerRoomStats.data.topRoom, 'Private records');

    const privatePlacementProbe = await request(
        port,
        `/api/items?room_id=${storageRoom.id}&location_id=${memberPrivateShelf.id}`,
        {},
        ownerJar
    );
    assert.equal(privatePlacementProbe.status, 400);

    const forbiddenPrivateAssignment = await request(port, `/api/items/${ownerSharedItem.id}`, {
        method: 'PUT',
        form: { box_id: memberPrivateBox.id }
    }, ownerJar);
    assert.equal(forbiddenPrivateAssignment.status, 400);
    const forbiddenBulkPrivateBox = await request(port, '/api/items/bulk', {
        method: 'POST',
        body: {
            action: 'update',
            item_ids: [ownerSharedItem.id],
            payload: { box_id: memberPrivateBox.id }
        }
    }, ownerJar);
    assert.equal(forbiddenBulkPrivateBox.status, 400);
    const forbiddenBulkPrivateLocation = await request(port, '/api/items/bulk', {
        method: 'POST',
        body: {
            action: 'update',
            item_ids: [ownerSharedItem.id],
            payload: { location_id: memberPrivateShelf.id }
        }
    }, ownerJar);
    assert.equal(forbiddenBulkPrivateLocation.status, 409);
    assert.equal(forbiddenBulkPrivateLocation.data.code, 'BOX_PLACEMENT_CONFLICT');
    assert.equal(forbiddenBulkPrivateLocation.data.conflictingItemCount, 1);

    const visibilityConflict = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'PUT',
        body: { is_public: false }
    }, ownerJar);
    assert.equal(visibilityConflict.status, 409);
    assert.equal(visibilityConflict.data.code, 'BOX_VISIBILITY_CONFLICT');
    assert.equal(visibilityConflict.data.conflictingItemCount, 1);

    const privateLocationConflict = await request(port, `/api/boxes/${ownerPrivateBox.id}`, {
        method: 'PUT',
        body: { is_public: true }
    }, ownerJar);
    assert.equal(privateLocationConflict.status, 409);
    assert.equal(privateLocationConflict.data.code, 'BOX_VISIBILITY_CONFLICT');
    const privateToShared = await request(port, `/api/boxes/${ownerPrivateBox.id}`, {
        method: 'PUT',
        body: {
            is_public: true,
            location_id: sharedShelf.id,
            room_id: storageRoom.id
        }
    }, ownerJar);
    assert.equal(privateToShared.status, 200);
    assert.equal(privateToShared.data.box.is_public, true);

    const privateDestination = await createBox(port, ownerJar, {
        name: 'Owner private destination',
        code: 'OWNER-DEST',
        is_public: false,
        room_id: storageRoom.id,
        location_id: ownerPrivateShelf.id
    });
    const privateDestinationDelete = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'DELETE',
        body: { destination_box_id: privateDestination.id }
    }, ownerJar);
    assert.equal(privateDestinationDelete.status, 409);
    assert.equal(privateDestinationDelete.data.code, 'BOX_DESTINATION_PRIVATE');

    const archiveBox = await createBox(port, ownerJar, {
        name: 'Archived reference',
        code: 'ARCHIVE-REF',
        is_public: true,
        room_id: storageRoom.id,
        location_id: sharedShelf.id
    });
    const archivedItem = await createItem(port, ownerJar, {
        name: 'Archived box item',
        quantity: 1,
        is_public: true,
        box_id: archiveBox.id
    });
    const archiveResponse = await request(port, `/api/boxes/${archiveBox.id}/archive`, {
        method: 'PATCH',
        body: { archived: true }
    }, ownerJar);
    assert.equal(archiveResponse.status, 200);
    const editInsideArchivedBox = await request(port, `/api/items/${archivedItem.id}`, {
        method: 'PUT',
        form: { quantity: 2 }
    }, ownerJar);
    assert.equal(editInsideArchivedBox.status, 200);
    assert.equal(editInsideArchivedBox.data.item.box_id, archiveBox.id);
    const unboxedItem = await createItem(port, ownerJar, {
        name: 'Cannot enter archive',
        quantity: 1,
        is_public: true
    });
    const enterArchivedBox = await request(port, `/api/items/${unboxedItem.id}`, {
        method: 'PUT',
        form: { box_id: archiveBox.id }
    }, ownerJar);
    assert.equal(enterArchivedBox.status, 400);

    const guardedDelete = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'DELETE',
        body: {}
    }, ownerJar);
    assert.equal(guardedDelete.status, 409);
    assert.equal(guardedDelete.data.code, 'BOX_NOT_EMPTY');
    assert.equal(guardedDelete.data.itemCount, 2);

    const unassignedDelete = await request(port, `/api/boxes/${sharedBox.id}`, {
        method: 'DELETE',
        body: { confirm_unassign: true }
    }, ownerJar);
    assert.equal(unassignedDelete.status, 200);
    assert.equal(unassignedDelete.data.movedCount, 2);
    const hiddenItemAfterDelete = directDb.prepare('SELECT box_id FROM items WHERE id = ?')
        .get(memberPrivateItem.id);
    assert.equal(hiddenItemAfterDelete.box_id, null);

    const activity = await request(port, '/api/activity', {}, ownerJar);
    assert.equal(activity.status, 200);
    assert.equal(
        activity.data.activities.some((entry) =>
            entry.action === 'box.created' && entry.metadata.box_id === memberPrivateBox.id
        ),
        false
    );
    assert.equal(
        activity.data.activities.some((entry) => entry.action === 'box.deleted'),
        true
    );
});

test('photo item commits revalidate live box access and preserve existing media on stale updates', async (t) => {
    const { port, tempDir, directDb } = await startServer(t, { itemCommitDelayMs: 1000 });
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const owner = await register(port, ownerJar, 'itemraceowner');
    const member = await register(port, memberJar, 'itemracemember');
    joinHouse(directDb, owner.id, member.id);
    assert.equal((await request(port, '/api/auth/me', {}, memberJar)).status, 200);

    const storageRoom = await createRoom(port, ownerJar, 'Race storage');
    const garageRoom = await createRoom(port, ownerJar, 'Race garage');
    const storageShelf = await createLocation(port, memberJar, {
        name: 'Race shelf',
        roomId: storageRoom.id,
        isPublic: true
    });
    const garageShelf = await createLocation(port, memberJar, {
        name: 'Race garage shelf',
        roomId: garageRoom.id,
        isPublic: true
    });
    const memberBox = await createBox(port, memberJar, {
        name: 'Member race box',
        code: 'RACE-BOX',
        is_public: true,
        room_id: storageRoom.id,
        location_id: storageShelf.id
    });
    const png = await sharp({
        create: {
            width: 18,
            height: 18,
            channels: 4,
            background: { r: 65, g: 118, b: 92, alpha: 1 }
        }
    }).png().toBuffer();
    const uploadsRoot = join(tempDir, 'uploads');

    const beforeCreateMedia = new Set(readdirSync(uploadsRoot));
    const pendingCreate = request(port, '/api/items', {
        method: 'POST',
        form: {
            name: 'Blocked race item',
            quantity: 1,
            is_public: true,
            box_id: memberBox.id
        },
        photo: {
            buffer: Buffer.from(png),
            filename: 'blocked-race.png'
        }
    }, ownerJar);
    const stagedCreateName = await waitForNewWebp(uploadsRoot, beforeCreateMedia);
    const makePrivate = await request(port, `/api/boxes/${memberBox.id}`, {
        method: 'PUT',
        body: { is_public: false }
    }, memberJar);
    assert.equal(makePrivate.status, 200);

    const blockedCreate = await pendingCreate;
    assert.equal(blockedCreate.status, 400);
    assert.equal(directDb.prepare('SELECT COUNT(*) AS count FROM items').get().count, 0);
    assert.equal(existsSync(join(uploadsRoot, stagedCreateName)), false);

    const makeShared = await request(port, `/api/boxes/${memberBox.id}`, {
        method: 'PUT',
        body: { is_public: true }
    }, memberJar);
    assert.equal(makeShared.status, 200);
    const existingItem = await createItem(port, ownerJar, {
        name: 'Existing race item',
        quantity: 1,
        is_public: true,
        box_id: memberBox.id
    }, {
        buffer: Buffer.from(png),
        filename: 'existing-race.png'
    });
    assert.ok(existingItem.photo_path);
    const existingStoredMedia = directDb.prepare(`
        SELECT photo_path, thumbnail_path
        FROM items
        WHERE id = ?
    `).get(existingItem.id);
    assert.ok(existingStoredMedia.photo_path);
    assert.ok(existingStoredMedia.thumbnail_path);
    assert.equal(existsSync(join(tempDir, existingStoredMedia.photo_path)), true);

    const beforeUpdateMedia = new Set(readdirSync(uploadsRoot));
    const pendingUpdate = request(port, `/api/items/${existingItem.id}`, {
        method: 'PUT',
        form: { name: 'Stale overwrite attempt' },
        photo: {
            buffer: Buffer.from(png),
            filename: 'stale-race.png'
        }
    }, ownerJar);
    const stagedUpdateName = await waitForNewWebp(uploadsRoot, beforeUpdateMedia);
    const moveBox = await request(port, `/api/boxes/${memberBox.id}`, {
        method: 'PUT',
        body: {
            room_id: garageRoom.id,
            location_id: garageShelf.id
        }
    }, memberJar);
    assert.equal(moveBox.status, 200);

    const staleUpdate = await pendingUpdate;
    assert.equal(staleUpdate.status, 409);
    assert.equal(staleUpdate.data.code, 'ITEM_STALE');
    const liveItem = directDb.prepare(`
        SELECT photo_path, thumbnail_path, room_id, location_id, box_id
        FROM items
        WHERE id = ?
    `).get(existingItem.id);
    assert.equal(liveItem.photo_path, existingStoredMedia.photo_path);
    assert.equal(liveItem.thumbnail_path, existingStoredMedia.thumbnail_path);
    assert.equal(liveItem.room_id, garageRoom.id);
    assert.equal(liveItem.location_id, garageShelf.id);
    assert.equal(liveItem.box_id, memberBox.id);
    assert.equal(existsSync(join(tempDir, existingStoredMedia.photo_path)), true);
    assert.equal(existsSync(join(uploadsRoot, stagedUpdateName)), false);
});

test('box privacy survives standard/full backups and missing media entries never leave broken paths', async (t) => {
    const { port, tempDir, directDb } = await startServer(t);
    const sourceJar = new CookieJar();
    const restoreJar = new CookieJar();
    const source = await register(port, sourceJar, 'boxbackupsource');
    const restoreUser = await register(port, restoreJar, 'boxbackuprestore');
    assert.notEqual(source.house_key, restoreUser.house_key);

    const room = await createRoom(port, sourceJar, 'Archive');
    const location = await createLocation(port, sourceJar, {
        name: 'Private cabinet',
        roomId: room.id,
        isPublic: false
    });
    const privateBox = await createBox(port, sourceJar, {
        name: 'Private archive box',
        code: 'BACKUP-PRIVATE',
        is_public: false,
        room_id: room.id,
        location_id: location.id
    });

    const png = await sharp({
        create: {
            width: 14,
            height: 14,
            channels: 4,
            background: { r: 86, g: 60, b: 112, alpha: 1 }
        }
    }).png().toBuffer();
    const boxPhoto = await request(port, `/api/boxes/${privateBox.id}`, {
        method: 'PUT',
        form: {},
        photo: { buffer: Buffer.from(png), filename: 'backup-box.png' }
    }, sourceJar);
    assert.equal(boxPhoto.status, 200);
    const item = await createItem(port, sourceJar, {
        name: 'Backup camera',
        quantity: 1,
        is_public: true,
        box_id: privateBox.id
    }, {
        buffer: Buffer.from(png),
        filename: 'backup-item.png'
    });

    const standardBackup = await request(port, '/api/backup/export', {}, sourceJar);
    assert.equal(standardBackup.status, 200);
    assert.equal(standardBackup.data.boxes[0].is_public, 0);
    assert.equal(
        standardBackup.data.items.find((entry) => entry.id === item.id).username,
        'boxbackupsource'
    );
    assert.equal(standardBackup.data.boxes[0].created_by_name, 'boxbackupsource');
    const standardReimport = await request(port, '/api/backup/import', {
        method: 'POST',
        body: standardBackup.data
    }, sourceJar);
    assert.equal(standardReimport.status, 200);
    assert.equal(standardReimport.data.imported.items, 0);
    assert.equal(standardReimport.data.skipped.items, 1);

    const fullBackup = await request(port, '/api/backup/export-full', {}, sourceJar);
    assert.equal(fullBackup.status, 200);
    const backedUpBox = fullBackup.data.boxes.find((box) => box.id === privateBox.id);
    const backedUpItem = fullBackup.data.items.find((entry) => entry.id === item.id);
    assert.equal(backedUpBox.is_public, 0);
    assert.ok(backedUpBox.photo_path);
    assert.ok(backedUpBox.thumbnail_path);
    assert.ok(backedUpItem.photo_path);
    assert.ok(backedUpItem.thumbnail_path);

    const removedPaths = new Set([
        backedUpBox.thumbnail_path,
        backedUpItem.thumbnail_path
    ]);
    const partialBackup = {
        ...fullBackup.data,
        media: fullBackup.data.media.filter((entry) => !removedPaths.has(entry.path))
    };
    assert.ok(partialBackup.media.length > 0);

    const restored = await request(port, '/api/backup/import', {
        method: 'POST',
        body: partialBackup
    }, restoreJar);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.imported.boxes, 1);
    assert.equal(restored.data.imported.items, 1);

    const restoreHouse = directDb.prepare(`
        SELECT house_key
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(restoreUser.id);
    const restoredBox = directDb.prepare(`
        SELECT id, is_public, created_by, photo_path, thumbnail_path
        FROM boxes
        WHERE house_key = ? AND code_lookup IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
    `).get(restoreHouse.house_key);
    assert.equal(restoredBox.is_public, 0);
    assert.equal(restoredBox.created_by, restoreUser.id);
    assert.ok(restoredBox.photo_path);
    assert.notEqual(restoredBox.photo_path, backedUpBox.photo_path);
    assert.equal(restoredBox.thumbnail_path, null);

    const restoredItem = directDb.prepare(`
        SELECT id, user_id, box_id, photo_path, thumbnail_path
        FROM items
        WHERE house_key = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(restoreHouse.house_key);
    assert.equal(restoredItem.user_id, restoreUser.id);
    assert.equal(restoredItem.box_id, restoredBox.id);
    assert.ok(restoredItem.photo_path);
    assert.notEqual(restoredItem.photo_path, backedUpItem.photo_path);
    assert.equal(restoredItem.thumbnail_path, null);

    assert.equal(existsSync(join(tempDir, backedUpBox.photo_path)), true);
    assert.equal(existsSync(join(tempDir, restoredBox.photo_path)), true);
    assert.equal(existsSync(join(tempDir, backedUpItem.photo_path)), true);
    assert.equal(existsSync(join(tempDir, restoredItem.photo_path)), true);

    const deleteRestoredItem = await request(port, `/api/items/${restoredItem.id}`, {
        method: 'DELETE'
    }, restoreJar);
    assert.equal(deleteRestoredItem.status, 200);
    assert.equal(existsSync(join(tempDir, restoredItem.photo_path)), false);
    assert.equal(existsSync(join(tempDir, backedUpItem.photo_path)), true);

    const deleteRestoredBox = await request(port, `/api/boxes/${restoredBox.id}`, {
        method: 'DELETE',
        body: { confirm_unassign: true }
    }, restoreJar);
    assert.equal(deleteRestoredBox.status, 200);
    assert.equal(existsSync(join(tempDir, restoredBox.photo_path)), false);
    assert.equal(existsSync(join(tempDir, backedUpBox.photo_path)), true);

    const sourceItemMedia = await request(
        port,
        `/api/items/media/photo/${backedUpItem.photo_path.split('/').at(-1)}`,
        {},
        sourceJar
    );
    assert.equal(sourceItemMedia.status, 200);
    const sourceBoxMedia = await request(
        port,
        `/api/boxes/media/photo/${backedUpBox.photo_path.split('/').at(-1)}`,
        {},
        sourceJar
    );
    assert.equal(sourceBoxMedia.status, 200);
});

test('backup item dedupe keeps owner, visibility, box, and supplied media distinctions', async (t) => {
    const { port, directDb } = await startServer(t);
    const sourceJar = new CookieJar();
    const targetJar = new CookieJar();
    const memberJar = new CookieJar();
    await register(port, sourceJar, 'backupdedupsource');
    const targetOwner = await register(port, targetJar, 'backupdeduptarget');
    const targetMember = await register(port, memberJar, 'backupdedupmember');
    const targetHouse = joinHouse(directDb, targetOwner.id, targetMember.id);

    const importItems = async (items, extra = {}) => request(port, '/api/backup/import', {
        method: 'POST',
        body: {
            version: '1.6',
            items,
            categories: [],
            rooms: [],
            locations: [],
            boxes: [],
            borrows: [],
            ...extra
        }
    }, targetJar);

    await createItem(port, targetJar, {
        name: 'Owner-sensitive twin',
        quantity: 1,
        is_public: false
    });
    const ownerDistinctImport = await importItems([{
        id: 9001,
        name: 'Owner-sensitive twin',
        quantity: 1,
        is_public: false,
        username: 'backupdedupmember'
    }]);
    assert.equal(ownerDistinctImport.status, 200);
    assert.equal(ownerDistinctImport.data.imported.items, 1);
    assert.equal(directDb.prepare(`
        SELECT user_id
        FROM items
        WHERE house_key = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(targetHouse.house_key).user_id, targetMember.id);

    await createItem(port, targetJar, {
        name: 'Visibility-sensitive twin',
        quantity: 1,
        is_public: true
    });
    const visibilityDistinctImport = await importItems([{
        id: 9002,
        name: 'Visibility-sensitive twin',
        quantity: 1,
        is_public: false
    }]);
    assert.equal(visibilityDistinctImport.status, 200);
    assert.equal(visibilityDistinctImport.data.imported.items, 1);
    assert.equal(directDb.prepare(`
        SELECT is_public
        FROM items
        WHERE house_key = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(targetHouse.house_key).is_public, 0);

    const firstBox = await createBox(port, targetJar, {
        name: 'First dedupe box',
        code: 'DEDUPE-A',
        is_public: true
    });
    const secondBox = await createBox(port, targetJar, {
        name: 'Second dedupe box',
        code: 'DEDUPE-B',
        is_public: true
    });
    await createItem(port, targetJar, {
        name: 'Box-sensitive twin',
        quantity: 1,
        is_public: true,
        box_id: firstBox.id
    });
    const boxDistinctImport = await importItems([{
        id: 9003,
        name: 'Box-sensitive twin',
        quantity: 1,
        is_public: true,
        box_code: secondBox.code
    }]);
    assert.equal(boxDistinctImport.status, 200);
    assert.equal(boxDistinctImport.data.imported.items, 1);
    assert.equal(directDb.prepare(`
        SELECT box_id
        FROM items
        WHERE house_key = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(targetHouse.house_key).box_id, secondBox.id);

    const redPng = await sharp({
        create: {
            width: 12,
            height: 12,
            channels: 4,
            background: { r: 190, g: 30, b: 30, alpha: 1 }
        }
    }).png().toBuffer();
    const bluePng = await sharp({
        create: {
            width: 12,
            height: 12,
            channels: 4,
            background: { r: 30, g: 60, b: 190, alpha: 1 }
        }
    }).png().toBuffer();
    await createItem(port, targetJar, {
        name: 'Media-sensitive twin',
        quantity: 1,
        is_public: true
    }, {
        buffer: Buffer.from(redPng),
        filename: 'target-red.png'
    });
    await createItem(port, sourceJar, {
        name: 'Media-sensitive twin',
        quantity: 1,
        is_public: true
    }, {
        buffer: Buffer.from(bluePng),
        filename: 'source-blue.png'
    });

    const sourceFullBackup = await request(port, '/api/backup/export-full', {}, sourceJar);
    assert.equal(sourceFullBackup.status, 200);
    const mediaDistinctImport = await request(port, '/api/backup/import', {
        method: 'POST',
        body: sourceFullBackup.data
    }, targetJar);
    assert.equal(mediaDistinctImport.status, 200);
    assert.equal(mediaDistinctImport.data.imported.items, 1);

    const targetItems = await request(port, '/api/items', {}, targetJar);
    assert.equal(targetItems.status, 200);
    const mediaTwins = targetItems.data.items.filter((item) => item.name === 'Media-sensitive twin');
    assert.equal(mediaTwins.length, 2);
    assert.notEqual(mediaTwins[0].photo_path, mediaTwins[1].photo_path);
});

test('backup restore preserves same-name private locations for different household members', async (t) => {
    const { port, directDb } = await startServer(t);
    const sourceOwnerJar = new CookieJar();
    const sourceMemberJar = new CookieJar();
    const targetOwnerJar = new CookieJar();
    const sourceOwner = await register(port, sourceOwnerJar, 'backuplocationsourceowner');
    const sourceMember = await register(port, sourceMemberJar, 'backuplocationsourcemember');
    joinHouse(directDb, sourceOwner.id, sourceMember.id);

    const sourceRoom = await createRoom(port, sourceOwnerJar, 'Shared archive room');
    const sourceOwnerLocation = await createLocation(port, sourceOwnerJar, {
        name: 'Private shelf',
        roomId: sourceRoom.id,
        isPublic: false
    });
    const sourceMemberLocation = await createLocation(port, sourceMemberJar, {
        name: 'Private shelf',
        roomId: sourceRoom.id,
        isPublic: false
    });
    const sourceOwnerItem = await createItem(port, sourceOwnerJar, {
        name: 'Owner private archive item',
        quantity: 1,
        is_public: false,
        room_id: sourceRoom.id,
        location_id: sourceOwnerLocation.id
    });
    const sourceMemberItem = await createItem(port, sourceMemberJar, {
        name: 'Member private archive item',
        quantity: 1,
        is_public: false,
        room_id: sourceRoom.id,
        location_id: sourceMemberLocation.id
    });

    const standardBackup = await request(port, '/api/backup/export', {}, sourceOwnerJar);
    const fullBackup = await request(port, '/api/backup/export-full', {}, sourceOwnerJar);
    assert.equal(standardBackup.status, 200);
    assert.equal(fullBackup.status, 200);
    for (const backup of [standardBackup.data, fullBackup.data]) {
        const ownerItem = backup.items.find((item) => item.id === sourceOwnerItem.id);
        const memberItem = backup.items.find((item) => item.id === sourceMemberItem.id);
        for (const item of [ownerItem, memberItem]) {
            assert.equal(Object.hasOwn(item, 'category_id'), true);
            assert.equal(item.room_id, sourceRoom.id);
            assert.ok(item.location_id);
        }
        assert.equal(ownerItem.location_id, sourceOwnerLocation.id);
        assert.equal(memberItem.location_id, sourceMemberLocation.id);
    }

    const targetOwner = await register(port, targetOwnerJar, 'backuplocationtargetowner');
    const targetHouse = joinHouse(directDb, targetOwner.id, sourceOwner.id);
    joinHouse(directDb, targetOwner.id, sourceMember.id);

    const restored = await request(port, '/api/backup/import', {
        method: 'POST',
        body: standardBackup.data
    }, targetOwnerJar);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.imported.locations, 2);
    assert.equal(restored.data.imported.items, 2);

    const restoredLocations = directDb.prepare(`
        SELECT id, room_id, created_by
        FROM locations
        WHERE house_key = ?
        ORDER BY created_by
    `).all(targetHouse.house_key);
    assert.equal(restoredLocations.length, 2);
    assert.equal(restoredLocations[0].room_id, restoredLocations[1].room_id);
    const restoredLocationByOwner = new Map(
        restoredLocations.map((location) => [location.created_by, location.id])
    );

    const restoredItems = directDb.prepare(`
        SELECT user_id, room_id, location_id
        FROM items
        WHERE house_key = ?
        ORDER BY user_id
    `).all(targetHouse.house_key);
    assert.equal(restoredItems.length, 2);
    for (const item of restoredItems) {
        assert.equal(item.location_id, restoredLocationByOwner.get(item.user_id));
        assert.equal(item.room_id, restoredLocations[0].room_id);
    }
});

test('backup media staging failure rolls back new files before any database import', async (t) => {
    const { port, tempDir, directDb } = await startServer(t, {
        backupMediaFailAfter: 1
    });
    const sourceJar = new CookieJar();
    const targetJar = new CookieJar();
    await register(port, sourceJar, 'backuprollbacksource');
    const target = await register(port, targetJar, 'backuprollbacktarget');

    const sourceBox = await createBox(port, sourceJar, {
        name: 'Rollback source box',
        code: 'ROLLBACK-SOURCE',
        is_public: true
    });
    const png = await sharp({
        create: {
            width: 10,
            height: 10,
            channels: 4,
            background: { r: 42, g: 118, b: 91, alpha: 1 }
        }
    }).png().toBuffer();
    const boxPhoto = await request(port, `/api/boxes/${sourceBox.id}`, {
        method: 'PUT',
        form: {},
        photo: { buffer: Buffer.from(png), filename: 'rollback-box.png' }
    }, sourceJar);
    assert.equal(boxPhoto.status, 200);
    await createItem(port, sourceJar, {
        name: 'Rollback source item',
        quantity: 1,
        is_public: true,
        box_id: sourceBox.id
    }, {
        buffer: Buffer.from(png),
        filename: 'rollback-item.png'
    });

    const backup = await request(port, '/api/backup/export-full', {}, sourceJar);
    assert.equal(backup.status, 200);
    assert.ok(backup.data.media.length > 1);
    const uploadsDirectory = join(tempDir, 'uploads');
    const filesBeforeImport = listFilesRecursively(uploadsDirectory);
    const rollbackTables = [
        'items',
        'categories',
        'rooms',
        'locations',
        'boxes',
        'item_borrows',
        'item_attachments'
    ];
    const countsBeforeImport = Object.fromEntries(
        rollbackTables.map((table) => [
            table,
            directDb.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE house_key = ?`)
                .get(target.house_key).count
        ])
    );

    const failedImport = await request(port, '/api/backup/import', {
        method: 'POST',
        body: backup.data
    }, targetJar);
    assert.equal(failedImport.status, 500);
    assert.deepEqual(listFilesRecursively(uploadsDirectory), filesBeforeImport);

    for (const table of rollbackTables) {
        const count = directDb.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE house_key = ?`)
            .get(target.house_key).count;
        assert.equal(count, countsBeforeImport[table], `${table} should remain unchanged`);
    }
});
