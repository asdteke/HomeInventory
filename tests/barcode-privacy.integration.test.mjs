import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    toHeader() {
        return [...this.cookies.entries()]
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    apply(headers) {
        const setCookies = typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : [];

        for (const cookie of setCookies) {
            const [pair] = cookie.split(';', 1);
            const [name, value = ''] = pair.split('=');
            if (value) {
                this.cookies.set(name.trim(), value.trim());
            } else {
                this.cookies.delete(name.trim());
            }
        }
    }
}

async function getFreePort() {
    return await new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolvePort(address.port);
            });
        });
        server.on('error', reject);
    });
}

async function stopServer(child) {
    if (child.exitCode !== null) {
        return;
    }

    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        sleep(2000).then(() => {
            if (child.exitCode === null) {
                child.kill('SIGKILL');
            }
        })
    ]);
}

async function startServer(t) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-barcode-privacy-'));
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
        if (child.exitCode !== null) {
            throw new Error(`Server exited early:\n${logs.join('')}`);
        }

        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) {
                return { port, dbPath };
            }
        } catch {
            // Server is still starting.
        }

        await sleep(100);
    }

    throw new Error(`Server did not start:\n${logs.join('')}`);
}

async function request(port, path, { method = 'GET', body, form } = {}, jar = null) {
    const headers = {};
    let requestBody;

    if (body !== undefined) {
        headers['content-type'] = 'application/json';
        requestBody = JSON.stringify(body);
    } else if (form) {
        requestBody = new FormData();
        for (const [key, value] of Object.entries(form)) {
            if (value !== undefined && value !== null) {
                requestBody.append(key, String(value));
            }
        }
    }

    const cookie = jar?.toHeader();
    if (cookie) {
        headers.cookie = cookie;
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: requestBody
    });
    jar?.apply(response.headers);

    return {
        status: response.status,
        data: await response.json()
    };
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

async function createItem(port, jar, fields) {
    const response = await request(port, '/api/items', {
        method: 'POST',
        form: {
            quantity: 1,
            ...fields
        }
    }, jar);

    assert.equal(response.status, 201);
    return response.data.item;
}

test('local barcode results respect item and private placement visibility', async (t) => {
    const { port, dbPath } = await startServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const owner = await register(port, ownerJar, 'barcodeowner');
    const member = await register(port, memberJar, 'barcodemember');

    const directDb = new Database(dbPath);
    t.after(() => directDb.close());

    const ownerHouse = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ?
        LIMIT 1
    `).get(owner.id);
    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(member.id, ownerHouse.house_key, ownerHouse.house_name);
    directDb.prepare(`
        UPDATE users
        SET house_key = ?, active_house_key = ?
        WHERE id = ?
    `).run(ownerHouse.house_key, ownerHouse.house_key, member.id);

    const refreshedMember = await request(port, '/api/auth/me', {}, memberJar);
    assert.equal(refreshedMember.status, 200);

    const room = await request(port, '/api/rooms', {
        method: 'POST',
        body: {
            name: 'Private barcode room',
            description: 'Placement should not be exposed by barcode lookup'
        }
    }, memberJar);
    assert.equal(room.status, 201);

    const privateLocation = await request(port, '/api/locations', {
        method: 'POST',
        body: {
            name: 'Private barcode shelf',
            room_id: room.data.room.id,
            is_public: false
        }
    }, memberJar);
    assert.equal(privateLocation.status, 201);

    const privateBox = await request(port, '/api/boxes', {
        method: 'POST',
        body: {
            name: 'Private barcode box',
            code: 'BAR-PRIVATE',
            room_id: room.data.room.id,
            location_id: privateLocation.data.location.id,
            is_public: false
        }
    }, memberJar);
    assert.equal(privateBox.status, 201);

    const sharedBarcode = '8690000000108';
    const publicItem = await createItem(port, memberJar, {
        name: 'Visible barcode item',
        barcode: sharedBarcode,
        is_public: true,
        room_id: room.data.room.id,
        location_id: privateLocation.data.location.id,
        box_id: privateBox.data.box.id
    });
    const privateItem = await createItem(port, memberJar, {
        name: 'Secret barcode item',
        barcode: sharedBarcode,
        is_public: false
    });

    const ownerLookup = await request(port, `/api/barcode/${sharedBarcode}`, {}, ownerJar);
    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.data.source, 'Yerel Veritabanı');
    assert.equal(ownerLookup.data.name, 'Visible barcode item');
    assert.equal(ownerLookup.data.existingItem.id, publicItem.id);
    assert.notEqual(ownerLookup.data.existingItem.id, privateItem.id);
    assert.equal(ownerLookup.data.existingItem.box_id, null);
    assert.equal(ownerLookup.data.existingItem.room_id, null);
    assert.equal(ownerLookup.data.existingItem.location_id, null);
    assert.equal(ownerLookup.data.existingItem.private_placement, true);
    assert.equal(JSON.stringify(ownerLookup.data).includes('Secret barcode item'), false);
    assert.equal(JSON.stringify(ownerLookup.data).includes('Private barcode box'), false);
    assert.equal(JSON.stringify(ownerLookup.data).includes('Private barcode shelf'), false);

    const memberLookup = await request(port, `/api/barcode/${sharedBarcode}`, {}, memberJar);
    assert.equal(memberLookup.status, 200);
    assert.equal(memberLookup.data.existingItem.id, privateItem.id);
    assert.equal(memberLookup.data.name, 'Secret barcode item');

    const privateLocationBarcode = '8690000000115';
    const publicItemAtPrivateLocation = await createItem(port, memberJar, {
        name: 'Visible item at private location',
        barcode: privateLocationBarcode,
        is_public: true,
        room_id: room.data.room.id,
        location_id: privateLocation.data.location.id
    });

    const ownerLocationLookup = await request(
        port,
        `/api/barcode/${privateLocationBarcode}`,
        {},
        ownerJar
    );
    assert.equal(ownerLocationLookup.status, 200);
    assert.equal(ownerLocationLookup.data.existingItem.id, publicItemAtPrivateLocation.id);
    assert.equal(ownerLocationLookup.data.existingItem.box_id, null);
    assert.equal(ownerLocationLookup.data.existingItem.room_id, null);
    assert.equal(ownerLocationLookup.data.existingItem.location_id, null);
    assert.equal(ownerLocationLookup.data.existingItem.private_placement, true);

    const memberLocationLookup = await request(
        port,
        `/api/barcode/${privateLocationBarcode}`,
        {},
        memberJar
    );
    assert.equal(memberLocationLookup.status, 200);
    assert.equal(memberLocationLookup.data.existingItem.room_id, room.data.room.id);
    assert.equal(
        memberLocationLookup.data.existingItem.location_id,
        privateLocation.data.location.id
    );
    assert.equal(memberLocationLookup.data.existingItem.private_placement, false);
});
