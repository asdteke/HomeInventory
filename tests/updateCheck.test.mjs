import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';

import {
    APP_VERSION,
    LATEST_RELEASE_API_URL,
    UPDATE_CHECK_CACHE_TTL_MS,
    UPDATE_CHECK_FAILURE_TTL_MS,
    compareVersions,
    createUpdateChecker,
    isUpdateCheckEnabled,
    parseVersion
} from '../utils/updateCheck.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const silentLogger = { warn() {} };

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

function createFakeFetch(handler) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return handler(calls.length, url, options);
    };
    return { fetchImpl, calls };
}

test('compareVersions follows semantic versioning precedence', () => {
    assert.equal(compareVersions('2.7.4', '2.8.0'), -1);
    assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
    assert.equal(compareVersions('v2.8.0', '2.8.0'), 0);
    assert.equal(compareVersions('2.8.0-rc.1', '2.8.0'), -1);
    assert.equal(compareVersions('2.8.0-rc.2', '2.8.0-rc.10'), -1);
    assert.equal(compareVersions('2.8.0-alpha', '2.8.0-alpha.1'), -1);
    assert.equal(compareVersions('2.8.0-alpha.beta', '2.8.0-beta'), -1);
    assert.equal(compareVersions('2.8.0-1', '2.8.0-alpha'), -1);
    assert.equal(compareVersions('2.8.0+build.5', '2.8.0'), 0);
    assert.equal(compareVersions('10.0.0', '9.99.99'), 1);
    assert.equal(compareVersions('2.8', '2.8.0'), null);
    assert.equal(compareVersions('latest', '2.8.0'), null);
    assert.equal(parseVersion('v3.1.4').version, '3.1.4');
    assert.equal(parseVersion('3.1.4-beta.2').prerelease.join('.'), 'beta.2');
});

test('UPDATE_CHECK opt-out values are recognized', () => {
    assert.equal(isUpdateCheckEnabled({}), true);
    assert.equal(isUpdateCheckEnabled({ UPDATE_CHECK: 'true' }), true);
    for (const value of ['false', 'FALSE', '0', 'no', 'off', ' disabled ']) {
        assert.equal(isUpdateCheckEnabled({ UPDATE_CHECK: value }), false, value);
    }
});

test('update checker reports a newer stable release with an identifying User-Agent', async () => {
    const { fetchImpl, calls } = createFakeFetch(() => jsonResponse({
        tag_name: 'v2.9.0',
        draft: false,
        prerelease: false,
        html_url: 'https://evil.example/not-used'
    }));
    const checker = createUpdateChecker({ currentVersion: '2.8.0', env: {}, fetchImpl, logger: silentLogger });

    const status = await checker.getStatus();
    assert.equal(status.status, 'ok');
    assert.equal(status.currentVersion, '2.8.0');
    assert.equal(status.latestVersion, '2.9.0');
    assert.equal(status.updateAvailable, true);
    assert.equal(status.releaseUrl, 'https://github.com/asdteke/HomeInventory/releases/tag/v2.9.0');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, LATEST_RELEASE_API_URL);
    assert.equal(calls[0].options.headers['User-Agent'], 'HomeInventory/2.8.0');
    assert.ok(calls[0].options.signal, 'requests carry a timeout signal');
});

test('update checker does not offer older, equal, draft or pre-release versions', async () => {
    const cases = [
        [{ tag_name: '2.8.0', draft: false, prerelease: false }, 'ok', false],
        [{ tag_name: 'v2.7.9', draft: false, prerelease: false }, 'ok', false],
        [{ tag_name: 'v3.0.0', draft: true, prerelease: false }, 'unknown', false],
        [{ tag_name: 'v3.0.0-rc.1', draft: false, prerelease: true }, 'unknown', false],
        [{ tag_name: 'v3.0.0-rc.1', draft: false, prerelease: false }, 'unknown', false],
        [{ tag_name: 'nightly', draft: false, prerelease: false }, 'unknown', false]
    ];

    for (const [release, expectedStatus, expectedUpdate] of cases) {
        const { fetchImpl } = createFakeFetch(() => jsonResponse(release));
        const checker = createUpdateChecker({ currentVersion: '2.8.0', env: {}, fetchImpl, logger: silentLogger });
        const status = await checker.getStatus();
        assert.equal(status.status, expectedStatus, release.tag_name);
        assert.equal(status.updateAvailable, expectedUpdate, release.tag_name);
    }
});

test('update checker caches results for 12 hours and shares concurrent lookups', async () => {
    let clock = 1_000_000;
    const { fetchImpl, calls } = createFakeFetch((callNumber) => jsonResponse({
        tag_name: callNumber === 1 ? 'v2.9.0' : 'v2.9.1',
        draft: false,
        prerelease: false
    }));
    const checker = createUpdateChecker({
        currentVersion: '2.8.0',
        env: {},
        fetchImpl,
        now: () => clock,
        logger: silentLogger
    });

    const [first, second] = await Promise.all([checker.getStatus(), checker.getStatus()]);
    assert.equal(calls.length, 1);
    assert.equal(first.latestVersion, '2.9.0');
    assert.equal(second.latestVersion, '2.9.0');

    clock += UPDATE_CHECK_CACHE_TTL_MS - 1;
    assert.equal((await checker.getStatus()).latestVersion, '2.9.0');
    assert.equal(calls.length, 1);

    clock += 2;
    assert.equal((await checker.getStatus()).latestVersion, '2.9.1');
    assert.equal(calls.length, 2);
});

test('update checker reports unknown when offline and retries after a short delay', async () => {
    let clock = 0;
    let online = false;
    const { fetchImpl, calls } = createFakeFetch(() => {
        if (!online) {
            throw new TypeError('fetch failed');
        }
        return jsonResponse({ tag_name: 'v9.0.0', draft: false, prerelease: false });
    });
    const checker = createUpdateChecker({ currentVersion: '2.8.0', env: {}, fetchImpl, now: () => clock, logger: silentLogger });

    const offline = await checker.getStatus();
    assert.equal(offline.status, 'unknown');
    assert.equal(offline.updateAvailable, false);
    assert.equal(offline.currentVersion, '2.8.0');

    online = true;
    await checker.getStatus();
    assert.equal(calls.length, 1, 'failures are cached too');

    clock += UPDATE_CHECK_FAILURE_TTL_MS + 1;
    const recovered = await checker.getStatus();
    assert.equal(recovered.status, 'ok');
    assert.equal(recovered.updateAvailable, true);

    const rateLimited = createUpdateChecker({
        currentVersion: '2.8.0',
        env: {},
        fetchImpl: async () => jsonResponse({ message: 'API rate limit exceeded' }, 403),
        logger: silentLogger
    });
    assert.equal((await rateLimited.getStatus()).status, 'unknown');
});

test('UPDATE_CHECK=false never makes an outbound request', async () => {
    const { fetchImpl, calls } = createFakeFetch(() => {
        throw new Error('must not be called');
    });
    const checker = createUpdateChecker({ currentVersion: '2.8.0', env: { UPDATE_CHECK: 'false' }, fetchImpl, logger: silentLogger });

    const status = await checker.getStatus();
    assert.equal(status.status, 'disabled');
    assert.equal(status.updateAvailable, false);
    assert.equal(status.currentVersion, '2.8.0');
    assert.equal(calls.length, 0);
});

test('APP_VERSION matches package.json', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(APP_VERSION, pkg.version);
});

// ---------------------------------------------------------------------------
// Endpoint: GET /api/admin/update-status
// ---------------------------------------------------------------------------

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

async function startServer(t, envOverrides = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-update-check-'));
    const dbPath = join(tempDir, 'inventory.db');
    const counterPath = join(tempDir, 'github-calls.txt');
    // Replaces fetch inside the server process so no real request reaches GitHub.
    // Each call returns a higher patch version, which makes caching observable.
    const preloadPath = join(tempDir, 'mock-github.mjs');
    writeFileSync(counterPath, '0');
    writeFileSync(preloadPath, `
import { readFileSync, writeFileSync } from 'node:fs';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.github.com/')) {
        const calls = Number(readFileSync(${JSON.stringify(counterPath)}, 'utf8')) + 1;
        writeFileSync(${JSON.stringify(counterPath)}, String(calls));
        return new Response(JSON.stringify({ tag_name: 'v99.0.' + calls, draft: false, prerelease: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }
    return realFetch(url, options);
};
`);

    const port = await getFreePort();
    const child = spawn(process.execPath, ['--import', pathToFileURL(preloadPath).href, 'server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            SITE_URL: `http://127.0.0.1:${port}`,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: 'update-check-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'update-check-key',
            HOMEINVENTORY_DB_PATH: dbPath,
            RESEND_API_KEY: '',
            UPDATE_CHECK: '',
            ...envOverrides
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));

    t.after(async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await Promise.race([new Promise((done) => child.once('exit', done)), sleep(2000)]);
            if (child.exitCode === null) child.kill('SIGKILL');
        }
        rmSync(tempDir, { recursive: true, force: true });
    });

    for (let attempt = 0; ; attempt += 1) {
        if (child.exitCode !== null || attempt >= 100) {
            throw new Error(`Server did not start.\n${logs.join('')}`);
        }
        try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
        } catch {
            // Still starting.
        }
        await sleep(100);
    }

    const directDb = new Database(dbPath);
    t.after(() => directDb.close());

    return {
        port,
        directDb,
        githubCalls: () => Number(readFileSync(counterPath, 'utf8'))
    };
}

async function request(port, path, { method = 'GET', body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const tokenCookie = (response.headers.getSetCookie?.() || [])
        .map((value) => value.split(';', 1)[0])
        .find((value) => value.startsWith('token='));
    return {
        status: response.status,
        data: (response.headers.get('content-type') || '').includes('application/json') ? JSON.parse(text || '{}') : text,
        cookie: tokenCookie
    };
}

async function registerUser(port, name) {
    const response = await request(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: name,
            email: `${name}@example.com`,
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    assert.ok(response.cookie, 'registration signs the user in');
    return { id: response.data.user.id, cookie: response.cookie };
}

test('update-status endpoint is admin-only and contacts GitHub lazily, once', async (t) => {
    const { port, directDb, githubCalls } = await startServer(t);

    const anonymous = await request(port, '/api/admin/update-status');
    assert.equal(anonymous.status, 401);

    const member = await registerUser(port, 'updatemember');
    const forbidden = await request(port, '/api/admin/update-status', { cookie: member.cookie });
    assert.equal(forbidden.status, 403);
    assert.equal(githubCalls(), 0, 'nothing is fetched before an admin asks');

    const admin = await registerUser(port, 'updateadmin');
    directDb.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);

    const first = await request(port, '/api/admin/update-status', { cookie: admin.cookie });
    assert.equal(first.status, 200);
    assert.equal(first.data.status, 'ok');
    assert.equal(first.data.currentVersion, APP_VERSION);
    assert.equal(first.data.latestVersion, '99.0.1');
    assert.equal(first.data.updateAvailable, true);
    assert.equal(first.data.releaseUrl, 'https://github.com/asdteke/HomeInventory/releases/tag/v99.0.1');

    const second = await request(port, '/api/admin/update-status', { cookie: admin.cookie });
    assert.equal(second.data.latestVersion, '99.0.1', 'served from the in-memory cache');
    assert.equal(githubCalls(), 1);
});

test('update-status endpoint skips GitHub entirely when UPDATE_CHECK=false', async (t) => {
    const { port, directDb, githubCalls } = await startServer(t, { UPDATE_CHECK: 'false' });

    const admin = await registerUser(port, 'optoutadmin');
    directDb.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);

    const response = await request(port, '/api/admin/update-status', { cookie: admin.cookie });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'disabled');
    assert.equal(response.data.updateAvailable, false);
    assert.equal(githubCalls(), 0);
});
