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

const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
const TEST_ENCRYPTION_KEY_ID = 'integration-key';

process.env.SECRET_PROVIDER = 'env';
process.env.APP_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.APP_ENCRYPTION_KEY_ID = TEST_ENCRYPTION_KEY_ID;

const { recordItemActivity } = await import('../utils/activityLog.js');

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
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-activity-privacy-'));
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
            APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
            APP_ENCRYPTION_KEY_ID: TEST_ENCRYPTION_KEY_ID,
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
            requestBody.append(key, String(value));
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

async function createBox(port, jar, fields) {
    const response = await request(port, '/api/boxes', {
        method: 'POST',
        body: fields
    }, jar);

    assert.equal(response.status, 201);
    return response.data.box;
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

function findByMarker(activities, marker) {
    return activities.find((entry) => entry.metadata?.test_marker === marker);
}

test('activity feed hides private items and private box identifiers from house members', async (t) => {
    const { port, dbPath } = await startServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const owner = await register(port, ownerJar, 'activityowner');
    const member = await register(port, memberJar, 'activitymember');

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
    assert.equal(refreshedMember.data.user.house_key, ownerHouse.house_key);

    const sharedBox = await createBox(port, ownerJar, {
        name: 'Shared activity box',
        code: 'ACT-SHARED',
        is_public: true
    });
    const privateBox = await createBox(port, ownerJar, {
        name: 'Private activity box',
        code: 'ACT-PRIVATE',
        is_public: false
    });
    const publicItem = await createItem(port, ownerJar, {
        name: 'Shared activity item',
        is_public: true
    });
    const privateItem = await createItem(port, ownerJar, {
        name: 'Private activity item',
        is_public: false
    });

    recordItemActivity(directDb, {
        houseKey: ownerHouse.house_key,
        itemId: publicItem.id,
        actorUserId: owner.id,
        action: 'item.box_moved',
        metadata: {
            test_marker: 'public-box-move',
            from_box_id: privateBox.id,
            to_box_id: sharedBox.id
        }
    });
    recordItemActivity(directDb, {
        houseKey: ownerHouse.house_key,
        itemId: privateItem.id,
        actorUserId: owner.id,
        action: 'item.updated',
        metadata: { test_marker: 'private-live-item' }
    });
    recordItemActivity(directDb, {
        houseKey: ownerHouse.house_key,
        actorUserId: owner.id,
        action: 'item.deleted',
        metadata: {
            test_marker: 'owner-null-item',
            item_id: privateItem.id
        }
    });
    recordItemActivity(directDb, {
        houseKey: ownerHouse.house_key,
        actorUserId: member.id,
        action: 'item.deleted',
        metadata: { test_marker: 'member-null-item' }
    });

    const boxActions = [
        'box.created',
        'box.updated',
        'box.archived',
        'box.restored',
        'box.deleted'
    ];
    for (const action of boxActions) {
        recordItemActivity(directDb, {
            houseKey: ownerHouse.house_key,
            actorUserId: owner.id,
            action,
            metadata: {
                test_marker: `owner-${action}`,
                box_id: action === 'box.deleted' ? 987654321 : sharedBox.id
            }
        });
    }

    const memberFeed = await request(port, '/api/activity?limit=200', {}, memberJar);
    assert.equal(memberFeed.status, 200);

    const memberMove = findByMarker(memberFeed.data.activities, 'public-box-move');
    assert.ok(memberMove);
    assert.equal(memberMove.item_name, 'Shared activity item');
    assert.equal(memberMove.metadata.from_box_id, undefined);
    assert.equal(memberMove.metadata.from_box_hidden, true);
    assert.equal(memberMove.metadata.to_box_id, sharedBox.id);
    assert.equal(findByMarker(memberFeed.data.activities, 'private-live-item'), undefined);
    assert.equal(findByMarker(memberFeed.data.activities, 'owner-null-item'), undefined);
    assert.equal(findByMarker(memberFeed.data.activities, 'member-null-item')?.action, 'item.deleted');
    assert.equal(
        memberFeed.data.activities.some((entry) => entry.item_name === 'Private activity item'),
        false
    );
    for (const action of boxActions) {
        assert.equal(findByMarker(memberFeed.data.activities, `owner-${action}`), undefined);
    }

    const ownerFeed = await request(port, '/api/activity?limit=200', {}, ownerJar);
    assert.equal(ownerFeed.status, 200);

    const ownerMove = findByMarker(ownerFeed.data.activities, 'public-box-move');
    assert.ok(ownerMove);
    assert.equal(ownerMove.metadata.from_box_id, privateBox.id);
    assert.equal(ownerMove.metadata.from_box_hidden, undefined);
    assert.equal(ownerMove.metadata.to_box_id, sharedBox.id);

    const ownerPrivateItem = findByMarker(ownerFeed.data.activities, 'private-live-item');
    assert.ok(ownerPrivateItem);
    assert.equal(ownerPrivateItem.item_name, 'Private activity item');
    assert.ok(findByMarker(ownerFeed.data.activities, 'owner-null-item'));
    assert.equal(findByMarker(ownerFeed.data.activities, 'member-null-item'), undefined);

    for (const action of boxActions) {
        assert.equal(findByMarker(ownerFeed.data.activities, `owner-${action}`)?.action, action);
    }

    const deletedBoxEvent = findByMarker(ownerFeed.data.activities, 'owner-box.deleted');
    assert.equal(deletedBoxEvent.metadata.box_id, undefined);
    assert.equal(deletedBoxEvent.metadata.box_hidden, true);
});
