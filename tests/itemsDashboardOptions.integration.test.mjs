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

    set(name, value) {
        if (!value) {
            this.cookies.delete(name);
            return;
        }

        this.cookies.set(name, value);
    }

    toHeader() {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    applySetCookie(headers) {
        const setCookies = typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : [];

        for (const cookie of setCookies) {
            const [pair] = cookie.split(';', 1);
            const [name, value = ''] = pair.split('=');
            this.set(name.trim(), value.trim());
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

async function waitForServer(port, child, serverLogs = []) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) {
            const logs = serverLogs.join('').trim();
            const details = logs ? `\n\nServer output:\n${logs}` : '';
            throw new Error(`Server exited before becoming healthy (code ${child.exitCode}).${details}`);
        }

        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server is still starting.
        }

        await sleep(100);
    }

    throw new Error('Server did not become healthy in time.');
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

async function requestJson(port, path, { method = 'GET', body, redirect = 'follow' } = {}, jar = null) {
    const headers = {};

    if (body !== undefined) {
        headers['content-type'] = 'application/json';
    }

    if (jar) {
        const cookieHeader = jar.toHeader();
        if (cookieHeader) {
            headers.cookie = cookieHeader;
        }
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect
    });

    jar?.applySetCookie(response.headers);

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? JSON.parse(text || '{}')
        : text;

    return {
        status: response.status,
        headers: response.headers,
        data
    };
}

async function requestForm(port, path, fields, jar = null) {
    const headers = {};

    if (jar) {
        const cookieHeader = jar.toHeader();
        if (cookieHeader) {
            headers.cookie = cookieHeader;
        }
    }

    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
            formData.append(key, String(value));
        }
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers,
        body: formData
    });

    jar?.applySetCookie(response.headers);

    return {
        status: response.status,
        data: await response.json()
    };
}

async function startTestServer(t) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-items-'));
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
            GOOGLE_CLIENT_ID: 'google-client-id-test',
            GOOGLE_CLIENT_SECRET: 'google-client-secret-test',
            RESEND_API_KEY: '',
            SUPPORT_EMAIL: 'support@example.com'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const serverLogs = [];
    child.stdout.on('data', (chunk) => serverLogs.push(String(chunk)));
    child.stderr.on('data', (chunk) => serverLogs.push(String(chunk)));

    t.after(async () => {
        await stopServer(child);
        rmSync(tempDir, { recursive: true, force: true });
    });

    await waitForServer(port, child, serverLogs);

    return { port, dbPath };
}

function isoDateAfter(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function registerUser(port, jar, username, email) {
    const response = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username,
            email,
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
    const response = await requestForm(port, '/api/items', {
        quantity: 1,
        is_public: true,
        min_quantity: 0,
        ...fields
    }, jar);

    assert.equal(response.status, 201);
    return response.data.item;
}

test('dashboard summary and item options return compact, scoped inventory data', async (t) => {
    const { port } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const outsiderJar = new CookieJar();

    await registerUser(port, ownerJar, 'summaryowner', 'summaryowner@example.com');
    await registerUser(port, outsiderJar, 'summaryoutsider', 'summaryoutsider@example.com');

    const expiringSoon = await createItem(port, ownerJar, {
        name: 'Expiring Coffee',
        quantity: 2,
        expiry_date: isoDateAfter(7)
    });
    const lowStock = await createItem(port, ownerJar, {
        name: 'Low Stock Batteries',
        quantity: 1,
        min_quantity: 5
    });
    const listedLowStock = await createItem(port, ownerJar, {
        name: 'Already Listed Soap',
        quantity: 1,
        min_quantity: 4
    });
    const expiredPrivate = await createItem(port, ownerJar, {
        name: 'Private Expired Document Box',
        quantity: 1,
        is_public: false,
        expiry_date: '2020-01-01'
    });
    await createItem(port, outsiderJar, {
        name: 'Outsider Item',
        quantity: 99
    });

    const maintenance = await requestJson(port, '/api/maintenance', {
        method: 'POST',
        body: {
            item_id: expiringSoon.id,
            task_name: 'Change filter',
            next_due_date: '2020-01-01'
        }
    }, ownerJar);
    assert.equal(maintenance.status, 201);

    const shopping = await requestJson(port, '/api/shopping', {
        method: 'POST',
        body: {
            item_id: listedLowStock.id,
            item_name: listedLowStock.name,
            quantity: 3
        }
    }, ownerJar);
    assert.equal(shopping.status, 201);

    const summary = await requestJson(port, '/api/items/dashboard-summary', {}, ownerJar);
    assert.equal(summary.status, 200);
    assert.equal(summary.data.totalItems, 4);
    assert.equal(summary.data.totalQuantity, 5);
    assert.equal(summary.data.sharedItemsCount, 3);
    assert.equal(summary.data.borrowedItemsCount, 0);
    assert.equal(summary.data.stats.totalItems, 4);
    assert.equal(summary.data.recentItems.length, 4);
    assert.deepEqual(
        summary.data.recentItems.map((item) => item.name),
        [
            'Private Expired Document Box',
            'Already Listed Soap',
            'Low Stock Batteries',
            'Expiring Coffee'
        ]
    );
    assert.deepEqual(summary.data.alerts.expiredItemIds, [expiredPrivate.id]);
    assert.deepEqual(summary.data.alerts.closeToExpiryItemIds, [expiringSoon.id]);
    assert.deepEqual(summary.data.alerts.lowStockItemIds, [lowStock.id]);
    assert.deepEqual(summary.data.alerts.overdueMaintenanceTaskIds, [maintenance.data.task.id]);

    const options = await requestJson(port, '/api/items/options', {}, ownerJar);
    assert.equal(options.status, 200);
    assert.deepEqual(
        options.data.items.map((item) => item.name),
        [
            'Private Expired Document Box',
            'Already Listed Soap',
            'Low Stock Batteries',
            'Expiring Coffee'
        ]
    );
    assert.deepEqual(
        Object.keys(options.data.items[0]).sort(),
        ['id', 'min_quantity', 'name', 'quantity', 'room_name']
    );
    assert.equal(options.data.items.some((item) => item.name === 'Outsider Item'), false);
});

test('dashboard summary, maintenance, and shopping preserve private item visibility for house members', async (t) => {
    const { port, dbPath } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();

    const owner = await registerUser(port, ownerJar, 'memberowner', 'memberowner@example.com');
    const member = await registerUser(port, memberJar, 'memberviewer', 'memberviewer@example.com');

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

    const refreshedMember = await requestJson(port, '/api/auth/me', {}, memberJar);
    assert.equal(refreshedMember.status, 200);
    assert.equal(refreshedMember.data.user.house_key, ownerHouse.house_key);

    const publicLowStock = await createItem(port, ownerJar, {
        name: 'Shared Batteries',
        quantity: 1,
        min_quantity: 4,
        is_public: true
    });
    const privateExpiredLowStock = await createItem(port, ownerJar, {
        name: 'Private Medicine Box',
        quantity: 1,
        min_quantity: 5,
        is_public: false,
        expiry_date: '2020-01-01'
    });

    const maintenance = await requestJson(port, '/api/maintenance', {
        method: 'POST',
        body: {
            item_id: privateExpiredLowStock.id,
            task_name: 'Private item service',
            next_due_date: '2020-01-01'
        }
    }, ownerJar);
    assert.equal(maintenance.status, 201);

    const memberMaintenanceCreate = await requestJson(port, '/api/maintenance', {
        method: 'POST',
        body: {
            item_id: privateExpiredLowStock.id,
            task_name: 'Member should not see private item',
            next_due_date: '2020-01-01'
        }
    }, memberJar);
    assert.equal(memberMaintenanceCreate.status, 400);

    const memberSummary = await requestJson(port, '/api/items/dashboard-summary', {}, memberJar);
    assert.equal(memberSummary.status, 200);
    assert.equal(memberSummary.data.stats.totalItems, 1);
    assert.equal(memberSummary.data.stats.totalQuantity, publicLowStock.quantity);
    assert.deepEqual(memberSummary.data.recentItems.map((item) => item.name), ['Shared Batteries']);
    assert.deepEqual(memberSummary.data.alerts.lowStockItemIds, [publicLowStock.id]);
    assert.deepEqual(memberSummary.data.alerts.expiredItemIds, []);
    assert.deepEqual(memberSummary.data.alerts.overdueMaintenanceTaskIds, []);

    const ownerSummary = await requestJson(port, '/api/items/dashboard-summary', {}, ownerJar);
    assert.equal(ownerSummary.status, 200);
    assert.deepEqual(ownerSummary.data.alerts.expiredItemIds, [privateExpiredLowStock.id]);
    assert.deepEqual(ownerSummary.data.alerts.overdueMaintenanceTaskIds, [maintenance.data.task.id]);

    const memberMaintenance = await requestJson(port, '/api/maintenance', {}, memberJar);
    assert.equal(memberMaintenance.status, 200);
    assert.equal(
        memberMaintenance.data.tasks.some((task) => task.item_id === privateExpiredLowStock.id),
        false
    );

    const memberPerformPrivateMaintenance = await requestJson(port, `/api/maintenance/${maintenance.data.task.id}/perform`, {
        method: 'POST'
    }, memberJar);
    assert.equal(memberPerformPrivateMaintenance.status, 404);

    const memberOptions = await requestJson(port, '/api/items/options', {}, memberJar);
    assert.equal(memberOptions.status, 200);
    assert.deepEqual(memberOptions.data.items.map((item) => item.name), ['Shared Batteries']);

    const ownerPrivateShoppingAdd = await requestJson(port, '/api/shopping', {
        method: 'POST',
        body: {
            item_id: privateExpiredLowStock.id,
            quantity: 2
        }
    }, ownerJar);
    assert.equal(ownerPrivateShoppingAdd.status, 201);

    const memberPrivateShoppingAdd = await requestJson(port, '/api/shopping', {
        method: 'POST',
        body: {
            item_id: privateExpiredLowStock.id,
            quantity: 1
        }
    }, memberJar);
    assert.equal(memberPrivateShoppingAdd.status, 400);

    const memberShopping = await requestJson(port, '/api/shopping', {}, memberJar);
    assert.equal(memberShopping.status, 200);
    assert.equal(
        memberShopping.data.items.some((item) => item.id === ownerPrivateShoppingAdd.data.item.id),
        false
    );
    assert.equal(
        memberShopping.data.suggestions.some((suggestion) => suggestion.item_name === 'Private Medicine Box'),
        false
    );

    const memberCompletePrivateShopping = await requestJson(port, `/api/shopping/${ownerPrivateShoppingAdd.data.item.id}`, {
        method: 'PUT',
        body: {
            is_completed: true
        }
    }, memberJar);
    assert.equal(memberCompletePrivateShopping.status, 404);

    const memberDeletePrivateShopping = await requestJson(port, `/api/shopping/${ownerPrivateShoppingAdd.data.item.id}`, {
        method: 'DELETE'
    }, memberJar);
    assert.equal(memberDeletePrivateShopping.status, 404);
});
