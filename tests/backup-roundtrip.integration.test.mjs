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

// Backup confidence: an owner's household export restores into a separate,
// clean installation that shares the encryption key, with every protected
// field intact and still encrypted at rest.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    toHeader() {
        return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
    }

    apply(headers) {
        for (const cookie of headers.getSetCookie?.() || []) {
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
            const { port } = server.address();
            server.close((error) => (error ? reject(error) : resolvePort(port)));
        });
        server.on('error', reject);
    });
}

async function stopServer(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(3000).then(() => child.kill('SIGKILL'))]);
    await exited;
}

async function startCleanServer(t, label) {
    const tempDir = mkdtempSync(join(tmpdir(), `homeinventory-roundtrip-${label}-`));
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
            JWT_SECRET: `roundtrip-${label}-jwt-secret-1234567890`,
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'roundtrip-key',
            HOMEINVENTORY_DATA_DIR: tempDir,
            HOMEINVENTORY_DB_PATH: dbPath,
            HOMEINVENTORY_UPLOADS_DIR: join(tempDir, 'uploads'),
            BACKUP_SCHEDULE: 'off',
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

    for (let attempt = 0; attempt < 150; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited early:\n${logs.join('')}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return { port, dbPath };
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
    if (form) {
        requestBody = new FormData();
        for (const [key, value] of Object.entries(form)) requestBody.append(key, String(value));
    } else if (body !== undefined) {
        headers['content-type'] = 'application/json';
        requestBody = JSON.stringify(body);
    }
    const cookie = jar?.toHeader();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: requestBody });
    jar?.apply(response.headers);
    return { status: response.status, data: await response.json() };
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
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data.user;
}

const PROTECTED_ITEM_COLUMNS = [
    'name',
    'description',
    'barcode',
    'invoice_price',
    'invoice_currency',
    'invoice_date',
    'warranty_start_date',
    'warranty_duration_value',
    'warranty_duration_unit',
    'warranty_expiry_date'
];

function pickComparable(item) {
    return {
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        barcode: item.barcode,
        invoice_price: item.invoice_price,
        invoice_currency: item.invoice_currency,
        invoice_date: item.invoice_date,
        warranty_start_date: item.warranty_start_date,
        warranty_duration_value: item.warranty_duration_value,
        warranty_duration_unit: item.warranty_duration_unit,
        warranty_expiry_date: item.warranty_expiry_date,
        is_public: Boolean(item.is_public),
        category_name: item.category_name,
        room_name: item.room_name,
        location_name: item.location_name
    };
}

function isEncryptedAtRest(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed?.alg === 'aes-256-gcm' && typeof parsed.ciphertext === 'string';
    } catch {
        return false;
    }
}

test('owner export imports into a clean database with data and encrypted fields intact', async (t) => {
    const source = await startCleanServer(t, 'source');
    const sourceJar = new CookieJar();
    await register(source.port, sourceJar, 'roundtripsource');

    const category = await request(source.port, '/api/categories', {
        method: 'POST',
        body: { name: 'Electronics Ünïcødé', icon: '📷', color: '#336699' }
    }, sourceJar);
    assert.equal(category.status, 201);
    const room = await request(source.port, '/api/rooms', {
        method: 'POST',
        body: { name: 'Study corner', description: 'North wall' }
    }, sourceJar);
    assert.equal(room.status, 201);
    const location = await request(source.port, '/api/locations', {
        method: 'POST',
        body: { name: 'Top shelf', room_id: room.data.room.id, is_public: true }
    }, sourceJar);
    assert.equal(location.status, 201);

    const itemFields = [
        {
            name: 'Mirrorless camera',
            description: 'Serial 4471, keep the receipt',
            quantity: 1,
            barcode: '4006381333931',
            invoice_price: '1299.90',
            invoice_currency: 'EUR',
            invoice_date: '2025-03-14',
            warranty_start_date: '2025-03-14',
            warranty_duration_value: '2',
            warranty_duration_unit: 'years',
            category_id: category.data.category.id,
            room_id: room.data.room.id,
            location_id: location.data.location.id,
            is_public: true
        },
        {
            name: 'Spare batteries',
            description: 'AA rechargeable',
            quantity: 8,
            room_id: room.data.room.id,
            is_public: false
        }
    ];
    for (const fields of itemFields) {
        const created = await request(source.port, '/api/items', { method: 'POST', form: fields }, sourceJar);
        assert.equal(created.status, 201, JSON.stringify(created.data));
    }

    const sourceItems = await request(source.port, '/api/items', {}, sourceJar);
    assert.equal(sourceItems.status, 200);
    assert.equal(sourceItems.data.items.length, 2);

    const exported = await request(source.port, '/api/backup/export', {}, sourceJar);
    assert.equal(exported.status, 200);
    assert.equal(exported.data.items.length, 2);

    const target = await startCleanServer(t, 'target');
    const targetJar = new CookieJar();
    await register(target.port, targetJar, 'roundtriptarget');
    const imported = await request(target.port, '/api/backup/import', { method: 'POST', body: exported.data }, targetJar);
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.imported.items, 2);

    const targetItems = await request(target.port, '/api/items', {}, targetJar);
    assert.equal(targetItems.status, 200);
    const byName = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name)).map(pickComparable);
    assert.deepEqual(byName(targetItems.data.items), byName(sourceItems.data.items));
    const camera = targetItems.data.items.find((item) => item.name === 'Mirrorless camera');
    assert.equal(camera.category_name, 'Electronics Ünïcødé');
    assert.equal(camera.room_name, 'Study corner');
    assert.equal(camera.location_name, 'Top shelf');
    assert.equal(camera.barcode, '4006381333931');
    assert.equal(camera.invoice_price, '1299.90');
    assert.equal(camera.invoice_currency, 'EUR');
    assert.equal(camera.invoice_date, '2025-03-14');
    assert.equal(camera.warranty_expiry_date, '2027-03-14');
    const batteries = targetItems.data.items.find((item) => item.name === 'Spare batteries');
    assert.equal(batteries.quantity, 8);
    assert.equal(Boolean(batteries.is_public), false);

    const categories = await request(target.port, '/api/categories', {}, targetJar);
    const restoredCategory = categories.data.categories.find((entry) => entry.name === 'Electronics Ünïcødé');
    assert.ok(restoredCategory);
    assert.equal(restoredCategory.color, '#336699');

    // Imported rows are re-encrypted at rest in the clean database.
    const targetDb = new Database(target.dbPath, { readonly: true });
    t.after(() => targetDb.close());
    const rawItems = targetDb.prepare(`SELECT ${PROTECTED_ITEM_COLUMNS.join(', ')} FROM items`).all();
    assert.equal(rawItems.length, 2);
    for (const row of rawItems) {
        for (const column of PROTECTED_ITEM_COLUMNS) {
            if (row[column] === null || row[column] === undefined || row[column] === '') continue;
            assert.ok(isEncryptedAtRest(row[column]), `items.${column} is encrypted at rest`);
        }
    }
    const rawText = JSON.stringify(rawItems)
        + JSON.stringify(targetDb.prepare('SELECT name FROM categories').all())
        + JSON.stringify(targetDb.prepare('SELECT name, description FROM rooms').all())
        + JSON.stringify(targetDb.prepare('SELECT name FROM locations').all());
    for (const plaintext of ['Mirrorless camera', 'Serial 4471', '4006381333931', '1299.90', 'Electronics', 'Study corner', 'Top shelf']) {
        assert.equal(rawText.includes(plaintext), false, `${plaintext} is not stored in plaintext`);
    }
});
