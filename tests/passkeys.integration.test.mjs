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
import { SoftAuthenticator } from './helpers/softAuthenticator.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Stronger!Pass123';

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    toHeader() {
        return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
    }

    applySetCookie(headers) {
        for (const cookie of headers.getSetCookie?.() || []) {
            const [pair] = cookie.split(';', 1);
            const [name, value = ''] = pair.split('=');
            if (value.trim()) {
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
            const { port } = server.address();
            server.close((error) => (error ? reject(error) : resolvePort(port)));
        });
        server.on('error', reject);
    });
}

async function startServer(t, envOverrides = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-passkeys-'));
    const dbPath = join(tempDir, 'inventory.db');
    const port = await getFreePort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            SITE_URL: `http://localhost:${port}`,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: 'passkey-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'passkey-key',
            HOMEINVENTORY_DB_PATH: dbPath,
            RESEND_API_KEY: '',
            SUPPORT_EMAIL: 'support@example.com',
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
        }
        rmSync(tempDir, { recursive: true, force: true });
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early:\n${logs.join('')}`);
        }
        try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
        } catch {}
        await sleep(100);
    }

    const directDb = new Database(dbPath);
    t.after(() => directDb.close());
    const origin = `http://localhost:${port}`;

    async function call(path, { method = 'GET', body, jar, headers = {} } = {}) {
        const requestHeaders = { origin, ...headers };
        if (body !== undefined) requestHeaders['content-type'] = 'application/json';
        const cookie = jar?.toHeader();
        if (cookie) requestHeaders.cookie = cookie;
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        jar?.applySetCookie(response.headers);
        const text = await response.text();
        return { status: response.status, data: text ? JSON.parse(text) : {} };
    }

    return { call, directDb, origin };
}

async function registerUser(call, username) {
    const jar = new CookieJar();
    const response = await call('/api/auth/register', {
        method: 'POST',
        jar,
        body: {
            username,
            email: `${username}@example.com`,
            password: PASSWORD,
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return { jar, user: response.data.user };
}

async function addPasskey(call, jar, authenticator, origin, name = 'Laptop') {
    const options = await call('/api/auth/passkeys/register/options', { method: 'POST', jar, body: { password: PASSWORD } });
    assert.equal(options.status, 200, JSON.stringify(options.data));
    const credential = authenticator.create(options.data.options, origin);
    return await call('/api/auth/passkeys/register/verify', {
        method: 'POST',
        jar,
        body: { challengeId: options.data.challengeId, response: credential, name }
    });
}

async function signInWithPasskey(call, authenticator, origin, assertionOptions = {}) {
    const jar = new CookieJar();
    const options = await call('/api/auth/passkeys/login/options', { method: 'POST', jar, body: {} });
    assert.equal(options.status, 200, JSON.stringify(options.data));
    const assertion = authenticator.get(options.data.options, origin, assertionOptions);
    const result = await call('/api/auth/passkeys/login/verify', {
        method: 'POST',
        jar,
        body: { challengeId: options.data.challengeId, response: assertion }
    });
    return { jar, result, challengeId: options.data.challengeId, assertion };
}

test('passkeys can be added, used to sign in, renamed and removed', async (t) => {
    const { call, directDb, origin } = await startServer(t);
    const { jar, user } = await registerUser(call, 'passkeyowner');
    const authenticator = new SoftAuthenticator();

    const config = await call('/api/auth/passkeys/config');
    assert.deepEqual(config.data, { enabled: true, available: true, reason: null });

    const noPassword = await call('/api/auth/passkeys/register/options', { method: 'POST', jar, body: {} });
    assert.equal(noPassword.status, 400);
    const wrongPassword = await call('/api/auth/passkeys/register/options', { method: 'POST', jar, body: { password: 'nope' } });
    assert.equal(wrongPassword.status, 401);

    const added = await addPasskey(call, jar, authenticator, origin);
    assert.equal(added.status, 201, JSON.stringify(added.data));
    assert.equal(added.data.passkeys.length, 1);
    assert.equal(added.data.passkeys[0].name, 'Laptop');
    assert.equal(added.data.passkeys[0].usableHere, true);
    assert.equal(added.data.passkeys[0].credentialId, undefined);

    const stored = directDb.prepare('SELECT name, rp_id FROM user_passkeys WHERE user_id = ?').get(user.id);
    assert.equal(stored.rp_id, 'localhost');
    assert.notEqual(stored.name, 'Laptop', 'passkey names are stored encrypted');

    const { jar: passkeyJar, result, challengeId, assertion } = await signInWithPasskey(call, authenticator, origin);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.user.id, user.id);
    const me = await call('/api/auth/me', { jar: passkeyJar });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.id, user.id);

    const replay = await call('/api/auth/passkeys/login/verify', {
        method: 'POST',
        body: { challengeId, response: assertion }
    });
    assert.equal(replay.status, 400, 'a challenge can be used only once');

    const cloned = await signInWithPasskey(call, authenticator, origin, { counter: 1 });
    assert.equal(cloned.result.status, 401, 'a sign counter that does not grow is rejected');

    const passkeyId = added.data.passkeys[0].id;
    const renamed = await call(`/api/auth/passkeys/${passkeyId}`, { method: 'PATCH', jar, body: { name: '  iPhone  ' } });
    assert.equal(renamed.data.passkeys[0].name, 'iPhone');

    const { jar: otherJar } = await registerUser(call, 'otheruser');
    const foreignDelete = await call(`/api/auth/passkeys/${passkeyId}`, { method: 'DELETE', jar: otherJar, body: { password: PASSWORD } });
    assert.equal(foreignDelete.status, 404);

    const deleteWithoutPassword = await call(`/api/auth/passkeys/${passkeyId}`, { method: 'DELETE', jar, body: {} });
    assert.equal(deleteWithoutPassword.status, 400);
    const deleted = await call(`/api/auth/passkeys/${passkeyId}`, { method: 'DELETE', jar, body: { password: PASSWORD } });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.data.passkeys, []);

    const afterDelete = await signInWithPasskey(call, authenticator, origin);
    assert.equal(afterDelete.result.status, 401);
});

test('passkey sign-in is refused for banned users and for other origins', async (t) => {
    const { call, directDb, origin } = await startServer(t);
    const { jar, user } = await registerUser(call, 'banneduser');
    const authenticator = new SoftAuthenticator();
    assert.equal((await addPasskey(call, jar, authenticator, origin)).status, 201);

    const wrongOrigin = await signInWithPasskey(call, authenticator, 'http://localhost:1');
    assert.equal(wrongOrigin.result.status, 401, 'client data from another origin is rejected');

    directDb.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(user.id);
    const banned = await signInWithPasskey(call, authenticator, origin);
    assert.equal(banned.result.status, 403);
    assert.equal(banned.jar.cookies.get('token'), undefined);
});

test('passkeys without user verification are rejected', async (t) => {
    const { call, origin } = await startServer(t);
    const { jar } = await registerUser(call, 'nouvuser');
    const added = await addPasskey(call, jar, new SoftAuthenticator({ userVerification: false }), origin);
    assert.equal(added.status, 400);
});

test('passkey endpoints are unavailable on IP addresses and when disabled', async (t) => {
    const { call } = await startServer(t);
    const ipConfig = await call('/api/auth/passkeys/config', { headers: { origin: 'https://192.168.1.20:8443' } });
    assert.deepEqual(ipConfig.data, { enabled: true, available: false, reason: 'ip_address' });
    const ipOptions = await call('/api/auth/passkeys/login/options', { method: 'POST', body: {}, headers: { origin: 'https://192.168.1.20:8443' } });
    assert.equal(ipOptions.status, 400);
    assert.equal(ipOptions.data.reason, 'ip_address');
});

test('PASSKEYS_ENABLED=false turns passkeys off', async (t) => {
    const { call } = await startServer(t, { PASSKEYS_ENABLED: 'false' });
    const config = await call('/api/auth/passkeys/config');
    assert.deepEqual(config.data, { enabled: false, available: false, reason: 'disabled' });
});
