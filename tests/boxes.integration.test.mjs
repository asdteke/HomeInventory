import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
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

async function request(port, path, { method = 'GET', body, form } = {}, jar = null) {
    const headers = {};
    let requestBody;
    if (body !== undefined) {
        headers['content-type'] = 'application/json';
        requestBody = JSON.stringify(body);
    } else if (form) {
        requestBody = new FormData();
        for (const [key, value] of Object.entries(form)) requestBody.append(key, String(value));
    }
    const cookie = jar?.toHeader();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: requestBody });
    jar?.apply(response.headers);
    return { status: response.status, data: await response.json() };
}

async function startServer(t) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-boxes-'));
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
            JWT_SECRET: 'integration-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'integration-key',
            HOMEINVENTORY_DB_PATH: dbPath,
            HOMEINVENTORY_DATA_DIR: tempDir,
            HOMEINVENTORY_UPLOADS_DIR: join(tempDir, 'uploads'),
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
    t.after(async () => {
        await stopServer(child);
        rmSync(tempDir, { recursive: true, force: true });
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited early:\n${logs.join('')}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return { port, tempDir };
        } catch {
            // Still starting.
        }
        await sleep(100);
    }
    throw new Error(`Server did not start:\n${logs.join('')}`);
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
}

test('box lifecycle guards contents, keeps house scope, and preserves item placement', async (t) => {
    const { port, tempDir } = await startServer(t);
    const owner = new CookieJar();
    const outsider = new CookieJar();
    await register(port, owner, 'boxowner');
    await register(port, outsider, 'boxoutsider');

    const room = await request(port, '/api/rooms', {
        method: 'POST',
        body: { name: 'Storage', description: 'House storage' }
    }, owner);
    assert.equal(room.status, 201);
    const location = await request(port, '/api/locations', {
        method: 'POST',
        body: { name: 'Top shelf', room_id: room.data.room.id, is_public: true }
    }, owner);
    assert.equal(location.status, 201);
    const destinationRoom = await request(port, '/api/rooms', {
        method: 'POST',
        body: { name: 'Office', description: 'Daily equipment' }
    }, owner);
    assert.equal(destinationRoom.status, 201);
    const destinationLocation = await request(port, '/api/locations', {
        method: 'POST',
        body: { name: 'Top shelf', room_id: destinationRoom.data.room.id, is_public: true }
    }, owner);
    assert.equal(destinationLocation.status, 201);
    const movedRoom = await request(port, '/api/rooms', {
        method: 'POST',
        body: { name: 'Garage', description: 'Moved storage' }
    }, owner);
    assert.equal(movedRoom.status, 201);
    const movedLocation = await request(port, '/api/locations', {
        method: 'POST',
        body: { name: 'Wall rack', room_id: movedRoom.data.room.id, is_public: true }
    }, owner);
    assert.equal(movedLocation.status, 201);

    const sourceBox = await request(port, '/api/boxes', {
        method: 'POST',
        body: {
            name: 'Winter cables',
            code: 'WB-01',
            note: 'Adapters and spare cables',
            room_id: room.data.room.id,
            location_id: location.data.location.id
        }
    }, owner);
    assert.equal(sourceBox.status, 201);
    assert.equal(sourceBox.data.box.code, 'WB-01');

    const photoBuffer = await sharp({
        create: {
            width: 8,
            height: 8,
            channels: 4,
            background: { r: 48, g: 108, b: 82, alpha: 1 }
        }
    }).png().toBuffer();
    const photoForm = new FormData();
    photoForm.append('photo', new Blob([photoBuffer], { type: 'image/png' }), 'box.png');
    const photoUpload = await fetch(`http://127.0.0.1:${port}/api/boxes/${sourceBox.data.box.id}`, {
        method: 'PUT',
        headers: { cookie: owner.toHeader() },
        body: photoForm
    });
    assert.equal(photoUpload.status, 200);
    const photoUploadData = await photoUpload.json();
    assert.match(photoUploadData.box.photo_path, /^\/api\/boxes\/media\/photo\/.+\.webp$/);
    assert.match(photoUploadData.box.thumbnail_path, /^\/api\/boxes\/media\/thumbnail\/.+_thumb\.webp$/);

    for (const mediaPath of [photoUploadData.box.photo_path, photoUploadData.box.thumbnail_path]) {
        const media = await fetch(`http://127.0.0.1:${port}${mediaPath}`, {
            headers: { cookie: owner.toHeader() }
        });
        assert.equal(media.status, 200);
        assert.match(media.headers.get('content-type') || '', /^image\/webp/);
        const mediaBuffer = Buffer.from(await media.arrayBuffer());
        assert.equal(mediaBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(mediaBuffer.subarray(8, 12).toString('ascii'), 'WEBP');
    }

    const thumbnailFilename = photoUploadData.box.thumbnail_path.split('/').at(-1);
    const storedThumbnailPath = join(tempDir, 'uploads', 'boxes', 'thumbnails', thumbnailFilename);
    const encryptedThumbnail = readFileSync(storedThumbnailPath);
    assert.notEqual(encryptedThumbnail.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(JSON.parse(encryptedThumbnail.toString('utf8')).alg, 'aes-256-gcm');

    unlinkSync(storedThumbnailPath);
    const missingThumbnail = await fetch(
        `http://127.0.0.1:${port}${photoUploadData.box.thumbnail_path}`,
        { headers: { cookie: owner.toHeader() } }
    );
    assert.equal(missingThumbnail.status, 404);

    const healthAfterMediaRead = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthAfterMediaRead.status, 200);

    const duplicate = await request(port, '/api/boxes', {
        method: 'POST',
        body: { name: 'Duplicate', code: 'wb-01' }
    }, owner);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, 'BOX_CODE_DUPLICATE');

    const destinationBox = await request(port, '/api/boxes', {
        method: 'POST',
        body: {
            name: 'Daily cables',
            code: 'DB-02',
            room_id: destinationRoom.data.room.id,
            location_id: destinationLocation.data.location.id
        }
    }, owner);
    assert.equal(destinationBox.status, 201);

    const duplicateUpdate = await request(port, `/api/boxes/${destinationBox.data.box.id}`, {
        method: 'PUT',
        form: { code: 'wb-01' }
    }, owner);
    assert.equal(duplicateUpdate.status, 409);
    assert.equal(duplicateUpdate.data.code, 'BOX_CODE_DUPLICATE');

    const item = await request(port, '/api/items', {
        method: 'POST',
        form: {
            name: 'USB-C adapter',
            quantity: 1,
            is_public: true,
            room_id: destinationRoom.data.room.id,
            location_id: destinationLocation.data.location.id,
            box_id: sourceBox.data.box.id
        }
    }, owner);
    assert.equal(item.status, 201);
    assert.equal(item.data.item.box_id, sourceBox.data.box.id);
    assert.equal(item.data.item.box_code, 'WB-01');
    assert.equal(item.data.item.room_id, room.data.room.id);
    assert.equal(item.data.item.location_id, location.data.location.id);

    const secondItem = await request(port, '/api/items', {
        method: 'POST',
        form: {
            name: 'HDMI adapter',
            quantity: 1,
            is_public: true,
            room_id: destinationRoom.data.room.id,
            location_id: destinationLocation.data.location.id
        }
    }, owner);
    assert.equal(secondItem.status, 201);

    const assignExisting = await request(port, `/api/boxes/${sourceBox.data.box.id}/items`, {
        method: 'POST',
        body: { item_ids: [secondItem.data.item.id] }
    }, owner);
    assert.equal(assignExisting.status, 200);
    assert.equal(assignExisting.data.updatedCount, 1);
    const assignedSecondItem = await request(port, `/api/items/${secondItem.data.item.id}`, {}, owner);
    assert.equal(assignedSecondItem.data.item.box_id, sourceBox.data.box.id);
    assert.equal(assignedSecondItem.data.item.room_id, room.data.room.id);
    assert.equal(assignedSecondItem.data.item.location_id, location.data.location.id);

    const unassignSecondItem = await request(port, `/api/items/${secondItem.data.item.id}`, {
        method: 'PUT',
        form: { box_id: '' }
    }, owner);
    assert.equal(unassignSecondItem.status, 200);
    assert.equal(unassignSecondItem.data.item.box_id, null);
    assert.equal(unassignSecondItem.data.item.room_id, room.data.room.id);
    assert.equal(unassignSecondItem.data.item.location_id, location.data.location.id);

    const updateSecondItemIntoBox = await request(port, `/api/items/${secondItem.data.item.id}`, {
        method: 'PUT',
        form: {
            box_id: sourceBox.data.box.id,
            room_id: destinationRoom.data.room.id,
            location_id: destinationLocation.data.location.id
        }
    }, owner);
    assert.equal(updateSecondItemIntoBox.status, 200);
    assert.equal(updateSecondItemIntoBox.data.item.box_id, sourceBox.data.box.id);
    assert.equal(updateSecondItemIntoBox.data.item.room_id, room.data.room.id);
    assert.equal(updateSecondItemIntoBox.data.item.location_id, location.data.location.id);

    const detail = await request(port, `/api/boxes/${sourceBox.data.box.id}?search=adapter`, {}, owner);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.items.length, 2);
    assert.equal(detail.data.box.total_item_count, 2);

    const outsiderDetail = await request(port, `/api/boxes/${sourceBox.data.box.id}`, {}, outsider);
    assert.equal(outsiderDetail.status, 404);

    const moveSourceBox = await request(port, `/api/boxes/${sourceBox.data.box.id}`, {
        method: 'PUT',
        form: {
            room_id: movedRoom.data.room.id,
            location_id: movedLocation.data.location.id
        }
    }, owner);
    assert.equal(moveSourceBox.status, 200);
    assert.equal(moveSourceBox.data.placementUpdatedCount, 2);
    for (const itemId of [item.data.item.id, secondItem.data.item.id]) {
        const movedWithBox = await request(port, `/api/items/${itemId}`, {}, owner);
        assert.equal(movedWithBox.data.item.room_id, movedRoom.data.room.id);
        assert.equal(movedWithBox.data.item.location_id, movedLocation.data.location.id);
    }

    const bulkToDestination = await request(port, '/api/items/bulk', {
        method: 'POST',
        body: {
            action: 'update',
            item_ids: [item.data.item.id],
            payload: {
                box_id: destinationBox.data.box.id,
                room_id: room.data.room.id,
                location_id: location.data.location.id
            }
        }
    }, owner);
    assert.equal(bulkToDestination.status, 200);
    const bulkMovedItem = await request(port, `/api/items/${item.data.item.id}`, {}, owner);
    assert.equal(bulkMovedItem.data.item.box_id, destinationBox.data.box.id);
    assert.equal(bulkMovedItem.data.item.room_id, destinationRoom.data.room.id);
    assert.equal(bulkMovedItem.data.item.location_id, destinationLocation.data.location.id);

    const bulkUnassign = await request(port, '/api/items/bulk', {
        method: 'POST',
        body: {
            action: 'update',
            item_ids: [item.data.item.id],
            payload: { box_id: '' }
        }
    }, owner);
    assert.equal(bulkUnassign.status, 200);
    const unassignedItem = await request(port, `/api/items/${item.data.item.id}`, {}, owner);
    assert.equal(unassignedItem.data.item.box_id, null);
    assert.equal(unassignedItem.data.item.room_id, destinationRoom.data.room.id);
    assert.equal(unassignedItem.data.item.location_id, destinationLocation.data.location.id);

    const reassignToSource = await request(port, `/api/boxes/${sourceBox.data.box.id}/items`, {
        method: 'POST',
        body: { item_ids: [item.data.item.id] }
    }, owner);
    assert.equal(reassignToSource.status, 200);
    const reassignedItem = await request(port, `/api/items/${item.data.item.id}`, {}, owner);
    assert.equal(reassignedItem.data.item.room_id, movedRoom.data.room.id);
    assert.equal(reassignedItem.data.item.location_id, movedLocation.data.location.id);

    const guardedDelete = await request(port, `/api/boxes/${sourceBox.data.box.id}`, {
        method: 'DELETE',
        body: {}
    }, owner);
    assert.equal(guardedDelete.status, 409);
    assert.equal(guardedDelete.data.code, 'BOX_NOT_EMPTY');

    const movedDelete = await request(port, `/api/boxes/${sourceBox.data.box.id}`, {
        method: 'DELETE',
        body: { destination_box_id: destinationBox.data.box.id }
    }, owner);
    assert.equal(movedDelete.status, 200);
    assert.equal(movedDelete.data.movedCount, 2);

    const movedItem = await request(port, `/api/items/${item.data.item.id}`, {}, owner);
    assert.equal(movedItem.status, 200);
    assert.equal(movedItem.data.item.box_id, destinationBox.data.box.id);
    assert.equal(movedItem.data.item.room_id, destinationRoom.data.room.id);
    assert.equal(movedItem.data.item.location_id, destinationLocation.data.location.id);
    const movedSecondItem = await request(port, `/api/items/${secondItem.data.item.id}`, {}, owner);
    assert.equal(movedSecondItem.data.item.box_id, destinationBox.data.box.id);
    assert.equal(movedSecondItem.data.item.room_id, destinationRoom.data.room.id);
    assert.equal(movedSecondItem.data.item.location_id, destinationLocation.data.location.id);

    const archived = await request(port, `/api/boxes/${destinationBox.data.box.id}/archive`, {
        method: 'PATCH',
        body: { archived: true }
    }, owner);
    assert.equal(archived.status, 200);
    assert.equal(archived.data.box.archived, true);

    const archivedAssignment = await request(port, `/api/boxes/${destinationBox.data.box.id}/items`, {
        method: 'POST',
        body: { item_ids: [item.data.item.id] }
    }, owner);
    assert.equal(archivedAssignment.status, 404);

    const backup = await request(port, '/api/backup/export-full', {}, owner);
    assert.equal(backup.status, 200);
    assert.equal(backup.data.version, '1.6-full');
    assert.equal(backup.data.boxes.length, 1);
    assert.equal(backup.data.items.length, 2);
    assert.ok(backup.data.items.every((backupItem) => backupItem.box_code === 'DB-02'));
    const backedUpTopShelves = backup.data.locations.filter(
        (backedUpLocation) => backedUpLocation.name === 'Top shelf'
    );
    assert.equal(backedUpTopShelves.length, 2);
    assert.equal(new Set(backedUpTopShelves.map((backedUpLocation) => backedUpLocation.room_id)).size, 2);

    const restored = await request(port, '/api/backup/import', {
        method: 'POST',
        body: backup.data
    }, outsider);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.imported.boxes, 1);
    assert.equal(restored.data.imported.items, 2);
    assert.equal(restored.data.imported.locations, 3);

    const restoredBoxes = await request(port, '/api/boxes?archived=include', {}, outsider);
    assert.equal(restoredBoxes.status, 200);
    assert.equal(restoredBoxes.data.boxes[0].code, 'DB-02');
    assert.equal(restoredBoxes.data.boxes[0].archived, true);
    const restoredLocations = await request(port, '/api/locations', {}, outsider);
    assert.equal(restoredLocations.status, 200);
    const restoredTopShelves = restoredLocations.data.locations.filter(
        (restoredLocation) => restoredLocation.name === 'Top shelf'
    );
    assert.equal(restoredTopShelves.length, 2);
    assert.equal(new Set(restoredTopShelves.map((restoredLocation) => restoredLocation.room_id)).size, 2);
    const restoredBoxLocation = restoredTopShelves.find(
        (restoredLocation) => restoredLocation.id === restoredBoxes.data.boxes[0].location_id
    );
    assert.ok(restoredBoxLocation);
    assert.equal(restoredBoxLocation.room_id, restoredBoxes.data.boxes[0].room_id);

    const restoredItems = await request(port, '/api/items', {}, outsider);
    assert.equal(restoredItems.status, 200);
    assert.equal(restoredItems.data.items.length, 2);
    assert.ok(restoredItems.data.items.every((restoredItem) => restoredItem.box_code === 'DB-02'));
    assert.ok(restoredItems.data.items.every((restoredItem) =>
        restoredItem.room_name === 'Office' && restoredItem.location_name === 'Top shelf'
    ));
});
