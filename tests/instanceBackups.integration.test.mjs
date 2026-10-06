import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';

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

async function startServer(t, tempDir, extraEnv = {}) {
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
            JWT_SECRET: 'instance-backup-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'instance-backup-key',
            HOMEINVENTORY_DATA_DIR: tempDir,
            HOMEINVENTORY_DB_PATH: join(tempDir, 'inventory.db'),
            HOMEINVENTORY_UPLOADS_DIR: join(tempDir, 'uploads'),
            BACKUP_STARTUP_DELAY_SECONDS: '3600',
            BACKUP_UPLOAD_MAX_MB: '2',
            GOOGLE_CLIENT_ID: 'google-client-id-test',
            GOOGLE_CLIENT_SECRET: 'google-client-secret-test',
            RESEND_API_KEY: '',
            SUPPORT_EMAIL: 'support@example.com',
            ...extraEnv
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    t.after(() => stopServer(child));

    for (let attempt = 0; attempt < 150; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited early:\n${logs.join('')}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return { port, child, logs };
        } catch {
            // Server is still starting.
        }
        await sleep(100);
    }
    throw new Error(`Server did not start:\n${logs.join('')}`);
}

async function request(port, path, { method = 'GET', body, raw, contentType } = {}, jar = null) {
    const headers = {};
    let requestBody;
    if (raw !== undefined) {
        headers['content-type'] = contentType || 'application/octet-stream';
        requestBody = raw;
    } else if (body !== undefined) {
        headers['content-type'] = 'application/json';
        requestBody = JSON.stringify(body);
    }
    const cookie = jar?.toHeader();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: requestBody });
    jar?.apply(response.headers);
    const type = response.headers.get('content-type') || '';
    return {
        status: response.status,
        headers: response.headers,
        data: type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
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
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data.user;
}

async function login(port, jar, username) {
    const response = await request(port, '/api/auth/login', {
        method: 'POST',
        body: { username, password: 'Stronger!Pass123' }
    }, jar);
    assert.equal(response.status, 200, JSON.stringify(response.data));
}

function promoteToAdmin(dbPath, userId) {
    const db = new Database(dbPath);
    try {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
    } finally {
        db.close();
    }
}

async function roomNames(port, jar) {
    const response = await request(port, '/api/rooms', {}, jar);
    assert.equal(response.status, 200);
    return response.data.rooms.map((room) => room.name).filter((name) => ['Kitchen', 'Garage'].includes(name)).sort();
}

test('instance backups are admin-only and restore is staged, verified and applied on restart', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-instance-backups-'));
    t.after(() => rmSync(tempDir, { recursive: true, force: true }));
    const dbPath = join(tempDir, 'inventory.db');
    const backupDir = join(tempDir, 'backups');

    const first = await startServer(t, tempDir);
    const port = first.port;
    const adminJar = new CookieJar();
    const userJar = new CookieJar();
    const admin = await register(port, adminJar, 'backupadmin');
    await register(port, userJar, 'backupmember');
    promoteToAdmin(dbPath, admin.id);

    // Access control: anonymous 401, regular users 403 on every endpoint.
    assert.equal((await request(port, '/api/admin/backups')).status, 401);
    for (const [method, path, extra] of [
        ['GET', '/api/admin/backups'],
        ['POST', '/api/admin/backups'],
        ['PUT', '/api/admin/backups/settings', { body: { schedule: 'off', keepLast: 1 } }],
        ['POST', '/api/admin/backups/upload', { raw: Buffer.from('SQLite format 3\0') }],
        ['GET', '/api/admin/backups/homeinventory-20260101T000000000Z-manual.db/download'],
        ['POST', '/api/admin/backups/homeinventory-20260101T000000000Z-manual.db/restore', { body: { confirm: 'x' } }],
        ['DELETE', '/api/admin/backups/homeinventory-20260101T000000000Z-manual.db'],
        ['DELETE', '/api/admin/backups/restore/pending']
    ]) {
        const response = await request(port, path, { method, ...extra }, userJar);
        assert.equal(response.status, 403, `${method} ${path}`);
    }

    const overview = await request(port, '/api/admin/backups', {}, adminJar);
    assert.equal(overview.status, 200);
    assert.deepEqual(overview.data.settings, { schedule: 'daily', keepLast: 7, source: 'default' });
    assert.deepEqual(overview.data.backups, []);
    assert.ok(overview.data.nextRunAt, 'daily schedule is armed by default');
    assert.equal(overview.data.pendingRestore, null);

    const badSettings = await request(port, '/api/admin/backups/settings', { method: 'PUT', body: { schedule: 'hourly', keepLast: 3 } }, adminJar);
    assert.equal(badSettings.status, 400);
    const settings = await request(port, '/api/admin/backups/settings', { method: 'PUT', body: { schedule: 'weekly', keepLast: 3 } }, adminJar);
    assert.equal(settings.status, 200);
    assert.deepEqual(settings.data.settings, { schedule: 'weekly', keepLast: 3, source: 'admin' });

    // Snapshot with only the Kitchen room, then add a Garage room afterwards.
    assert.equal((await request(port, '/api/rooms', { method: 'POST', body: { name: 'Kitchen' } }, adminJar)).status, 201);
    const created = await request(port, '/api/admin/backups', { method: 'POST' }, adminJar);
    assert.equal(created.status, 201);
    const snapshotName = created.data.backup.name;
    assert.match(snapshotName, /^homeinventory-\d{8}T\d{9}Z-manual\.db$/);
    assert.equal(statSync(join(backupDir, snapshotName)).mode & 0o777, 0o600);
    assert.equal(statSync(backupDir).mode & 0o777, 0o700);
    assert.equal(created.data.overview.status.lastResult, 'success');
    assert.equal((await request(port, '/api/rooms', { method: 'POST', body: { name: 'Garage' } }, adminJar)).status, 201);

    const download = await request(port, `/api/admin/backups/${snapshotName}/download`, {}, adminJar);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.match(download.headers.get('content-disposition') || '', new RegExp(snapshotName));
    assert.equal(download.data.subarray(0, 16).toString('latin1'), 'SQLite format 3\0');

    assert.equal((await request(port, '/api/admin/backups/..%2Finventory.db/download', {}, adminJar)).status, 404);
    assert.equal((await request(port, '/api/admin/backups/inventory.db/download', {}, adminJar)).status, 404);

    // Uploads are validated before they are listed.
    const garbage = await request(port, '/api/admin/backups/upload', { method: 'POST', raw: Buffer.from('definitely not sqlite'.repeat(10)) }, adminJar);
    assert.equal(garbage.status, 400);
    assert.equal(garbage.data.code, 'NOT_SQLITE');
    const foreignPath = join(tempDir, 'foreign.db');
    const foreign = new Database(foreignPath);
    foreign.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
    foreign.close();
    const foreignUpload = await request(port, '/api/admin/backups/upload', { method: 'POST', raw: readFileSync(foreignPath) }, adminJar);
    assert.equal(foreignUpload.status, 400);
    assert.equal(foreignUpload.data.code, 'NOT_HOMEINVENTORY');
    const corrupt = Buffer.from(download.data);
    for (let offset = 4096; offset < corrupt.length; offset += 5) corrupt[offset] ^= 0x5a;
    const corruptUpload = await request(port, '/api/admin/backups/upload', { method: 'POST', raw: corrupt }, adminJar);
    assert.equal(corruptUpload.status, 400);
    assert.equal(corruptUpload.data.code, 'CORRUPT');
    const oversized = await request(port, '/api/admin/backups/upload', { method: 'POST', raw: Buffer.alloc(3 * 1024 * 1024, 1) }, adminJar);
    assert.equal(oversized.status, 413);
    const uploaded = await request(port, '/api/admin/backups/upload', { method: 'POST', raw: download.data }, adminJar);
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.data.backup.kind, 'upload');
    assert.equal(uploaded.data.info.users, 2);
    const listed = await request(port, '/api/admin/backups', {}, adminJar);
    assert.deepEqual(listed.data.backups.map((entry) => entry.kind).sort(), ['manual', 'upload']);

    // Restore needs the exact confirmation and only stages the file.
    const unconfirmed = await request(port, `/api/admin/backups/${uploaded.data.backup.name}/restore`, { method: 'POST', body: {} }, adminJar);
    assert.equal(unconfirmed.status, 400);
    assert.equal(unconfirmed.data.code, 'CONFIRMATION_REQUIRED');
    const staged = await request(port, `/api/admin/backups/${uploaded.data.backup.name}/restore`, {
        method: 'POST',
        body: { confirm: uploaded.data.backup.name }
    }, adminJar);
    assert.equal(staged.status, 200);
    assert.equal(staged.data.restartRequired, true);
    assert.equal(staged.data.pendingRestore.source, uploaded.data.backup.name);
    assert.deepEqual(await roomNames(port, adminJar), ['Garage', 'Kitchen']);

    const cancelled = await request(port, '/api/admin/backups/restore/pending', { method: 'DELETE' }, adminJar);
    assert.equal(cancelled.data.cancelled, true);
    assert.equal(cancelled.data.overview.pendingRestore, null);
    const restaged = await request(port, `/api/admin/backups/${snapshotName}/restore`, {
        method: 'POST',
        body: { confirm: snapshotName }
    }, adminJar);
    assert.equal(restaged.status, 200);

    await stopServer(first.child);
    const second = await startServer(t, tempDir);
    const relogJar = new CookieJar();
    await login(second.port, relogJar, 'backupadmin');
    assert.deepEqual(await roomNames(second.port, relogJar), ['Kitchen']);

    const afterRestore = await request(second.port, '/api/admin/backups', {}, relogJar);
    assert.equal(afterRestore.status, 200);
    assert.equal(afterRestore.data.pendingRestore, null);
    assert.equal(afterRestore.data.lastRestore.status, 'applied');
    assert.equal(afterRestore.data.lastRestore.source, snapshotName);
    const safety = afterRestore.data.backups.find((entry) => entry.kind === 'prerestore');
    assert.ok(safety);
    assert.equal(afterRestore.data.lastRestore.safetySnapshot, safety.name);
    // Settings live beside the backups, so the restore did not reset them.
    assert.equal(afterRestore.data.settings.schedule, 'weekly');

    // Room names are encrypted at rest, so compare counts: the safety
    // snapshot still holds the Garage room that the restore rolled back.
    const countRooms = (filePath) => {
        const db = new Database(filePath, { readonly: true });
        try {
            return db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count;
        } finally {
            db.close();
        }
    };
    assert.equal(countRooms(join(backupDir, safety.name)), countRooms(dbPath) + 1);
    assert.equal(statSync(join(backupDir, safety.name)).mode & 0o777, 0o600);

    const deleted = await request(second.port, `/api/admin/backups/${uploaded.data.backup.name}`, { method: 'DELETE' }, relogJar);
    assert.equal(deleted.status, 200);
    assert.equal(existsSync(join(backupDir, uploaded.data.backup.name)), false);
    assert.equal((await request(second.port, `/api/admin/backups/${uploaded.data.backup.name}`, { method: 'DELETE' }, relogJar)).status, 404);
});
