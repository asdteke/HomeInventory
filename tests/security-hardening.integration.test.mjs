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

    get(name) {
        return this.cookies.get(name);
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
        new Promise((resolve) => child.once('exit', resolve)),
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

async function startTestServer(t) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-security-'));
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

    const directDb = new Database(dbPath);
    t.after(() => {
        directDb.close();
    });

    return {
        port,
        directDb,
        serverLogs
    };
}

test('google oauth flow issues a state cookie and rejects mismatched callbacks', async (t) => {
    const { port } = await startTestServer(t);
    const jar = new CookieJar();

    const startResponse = await requestJson(port, '/api/auth/google', { redirect: 'manual' }, jar);
    assert.equal(startResponse.status, 302);
    assert.ok(jar.get('google_oauth_state'));

    const redirectLocation = startResponse.headers.get('location') || '';
    assert.match(redirectLocation, /^https:\/\/accounts\.google\.com\//);
    assert.match(redirectLocation, /[?&]state=/);

    const callbackResponse = await requestJson(
        port,
        '/api/auth/google/callback?state=wrong-state&code=fake-code',
        { redirect: 'manual' },
        jar
    );

    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.get('location'), '/login');
    assert.equal(jar.get('google_oauth_state'), undefined);
});

test('shared-house backups are limited to the house owner', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();

    const registerOwner = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'owneruser',
            email: 'owner@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, ownerJar);
    assert.equal(registerOwner.status, 201);

    const registerMember = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'memberuser',
            email: 'member@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, memberJar);
    assert.equal(registerMember.status, 201);

    const ownerId = registerOwner.data.user.id;
    const memberId = registerMember.data.user.id;
    const ownerHouse = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);

    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(memberId, ownerHouse.house_key, ownerHouse.house_name);
    directDb.prepare('UPDATE users SET active_house_key = ? WHERE id = ?').run(ownerHouse.house_key, memberId);

    const memberExport = await requestJson(port, '/api/backup/export', {}, memberJar);
    assert.equal(memberExport.status, 403);
    assert.match(memberExport.data.error, /yalnızca ev sahibi/i);

    const ownerExport = await requestJson(port, '/api/backup/export', {}, ownerJar);
    assert.equal(ownerExport.status, 200);
    assert.equal(ownerExport.data.version, '1.3');
});

test('login attempts lock the account after repeated failures', async (t) => {
    const { port, directDb } = await startTestServer(t);

    const registerResponse = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'lockuser',
            email: 'lockuser@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    });
    assert.equal(registerResponse.status, 201);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        await requestJson(port, '/api/auth/login', {
            method: 'POST',
            body: {
                username: 'lockuser',
                password: 'wrong-password'
            }
        });
    }

    const lockedLogin = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'lockuser',
            password: 'Stronger!Pass123'
        }
    });

    assert.equal(lockedLogin.status, 429);
    assert.match(lockedLogin.data.error, /çok fazla başarısız giriş denemesi/i);

    const loginState = directDb.prepare(`
        SELECT failed_login_count, login_locked_until
        FROM users
        WHERE id = ?
    `).get(registerResponse.data.user.id);

    assert.ok(loginState.failed_login_count >= 10);
    assert.ok(loginState.login_locked_until);
});

test('authenticated session checks refresh stale last activity', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const jar = new CookieJar();

    const registerResponse = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'activityuser',
            email: 'activityuser@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, jar);
    assert.equal(registerResponse.status, 201);

    const staleTimestamp = '2026-04-25 12:00:00';
    directDb.prepare('UPDATE users SET last_login = ? WHERE id = ?')
        .run(staleTimestamp, registerResponse.data.user.id);

    const meResponse = await requestJson(port, '/api/auth/me', {}, jar);
    assert.equal(meResponse.status, 200);

    const refreshed = directDb.prepare('SELECT last_login FROM users WHERE id = ?')
        .get(registerResponse.data.user.id);
    assert.notEqual(refreshed.last_login, staleTimestamp);
    assert.ok(
        Date.parse(`${refreshed.last_login.replace(' ', 'T')}Z`)
            > Date.parse(`${staleTimestamp.replace(' ', 'T')}Z`)
    );
});

test('shared-house members cannot close another member borrowing record', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();

    const registerOwner = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'borrowowner',
            email: 'borrowowner@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, ownerJar);
    assert.equal(registerOwner.status, 201);

    const registerMember = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'borrowmember',
            email: 'borrowmember@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, memberJar);
    assert.equal(registerMember.status, 201);

    const ownerId = registerOwner.data.user.id;
    const memberId = registerMember.data.user.id;
    const ownerHouse = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);

    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(memberId, ownerHouse.house_key, ownerHouse.house_name);
    directDb.prepare(`
        UPDATE users
        SET house_key = ?, active_house_key = ?
        WHERE id = ?
    `).run(ownerHouse.house_key, ownerHouse.house_key, memberId);

    const createItem = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Shared borrowed item',
            quantity: 1
        }
    }, ownerJar);
    assert.equal(createItem.status, 201);

    const lendItem = await requestJson(port, `/api/items/${createItem.data.item.id}/borrow`, {
        method: 'POST',
        body: {
            borrower_type: 'external',
            borrower_name: 'Dis Kisi',
            borrower_contact: '5551234567',
            note: 'Secret note'
        }
    }, ownerJar);
    assert.equal(lendItem.status, 201);

    const unauthorizedReturn = await requestJson(port, `/api/items/${createItem.data.item.id}/return`, {
        method: 'POST',
        body: {
            return_note: 'Yetkisiz iade'
        }
    }, memberJar);
    assert.equal(unauthorizedReturn.status, 403);
    assert.match(unauthorizedReturn.data.error, /yalnızca eşyayı veren kişi veya sahibi/i);

    const borrowState = directDb.prepare(`
        SELECT returned_at, returned_by_user_id
        FROM item_borrows
        WHERE item_id = ?
        LIMIT 1
    `).get(createItem.data.item.id);

    assert.equal(borrowState.returned_at, null);
    assert.equal(borrowState.returned_by_user_id, null);
});

test('same-house member loans require borrower acceptance before becoming active', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const borrowerJar = new CookieJar();

    const registerOwner = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'loanowner',
            email: 'loanowner@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, ownerJar);
    assert.equal(registerOwner.status, 201);

    const registerBorrower = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'loanborrower',
            email: 'loanborrower@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, borrowerJar);
    assert.equal(registerBorrower.status, 201);

    const ownerId = registerOwner.data.user.id;
    const borrowerId = registerBorrower.data.user.id;
    const ownerHouse = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);

    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(borrowerId, ownerHouse.house_key, ownerHouse.house_name);
    directDb.prepare(`
        UPDATE users
        SET house_key = ?, active_house_key = ?
        WHERE id = ?
    `).run(ownerHouse.house_key, ownerHouse.house_key, borrowerId);

    const createItem = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Two party approval item',
            quantity: 1
        }
    }, ownerJar);
    assert.equal(createItem.status, 201);

    const lendToMember = await requestJson(port, `/api/items/${createItem.data.item.id}/borrow`, {
        method: 'POST',
        body: {
            borrower_type: 'member',
            borrower_user_id: borrowerId,
            note: 'Needs approval first'
        }
    }, ownerJar);
    assert.equal(lendToMember.status, 202);
    assert.equal(lendToMember.data.request.status, 'pending');

    const activeBeforeApproval = directDb.prepare(`
        SELECT id
        FROM item_borrows
        WHERE item_id = ? AND returned_at IS NULL
    `).get(createItem.data.item.id);
    assert.equal(activeBeforeApproval, undefined);

    const pendingRequest = directDb.prepare(`
        SELECT id, status, direction, initiator_user_id, recipient_user_id, borrow_id
        FROM borrow_requests
        WHERE item_id = ?
        LIMIT 1
    `).get(createItem.data.item.id);
    assert.equal(pendingRequest.status, 'pending');
    assert.equal(pendingRequest.direction, 'offer');
    assert.equal(pendingRequest.initiator_user_id, ownerId);
    assert.equal(pendingRequest.recipient_user_id, borrowerId);
    assert.equal(pendingRequest.borrow_id, null);

    const acceptOffer = await requestJson(port, `/api/borrow-requests/${pendingRequest.id}/accept`, {
        method: 'POST'
    }, borrowerJar);
    assert.equal(acceptOffer.status, 200);
    assert.equal(acceptOffer.data.request.status, 'accepted');

    const activeAfterApproval = directDb.prepare(`
        SELECT borrower_type, borrower_user_id, lent_by_user_id
        FROM item_borrows
        WHERE item_id = ? AND returned_at IS NULL
        LIMIT 1
    `).get(createItem.data.item.id);
    assert.equal(activeAfterApproval.borrower_type, 'member');
    assert.equal(activeAfterApproval.borrower_user_id, borrowerId);
    assert.equal(activeAfterApproval.lent_by_user_id, ownerId);

    const borrowerOverview = await requestJson(port, '/api/borrow-requests', {
        method: 'GET'
    }, borrowerJar);
    assert.equal(borrowerOverview.status, 200);
    assert.equal(borrowerOverview.data.activeBorrows.length, 1);
    assert.equal(borrowerOverview.data.activeBorrows[0].role, 'borrower');
    assert.equal(borrowerOverview.data.activeBorrows[0].can_mark_returned, true);

    const borrowerReturn = await requestJson(port, `/api/borrow-requests/active-borrows/${borrowerOverview.data.activeBorrows[0].id}/return`, {
        method: 'POST',
        body: {
            return_note: 'Teslim ettim'
        }
    }, borrowerJar);
    assert.equal(borrowerReturn.status, 200);
    assert.match(borrowerReturn.data.message, /teslim bildirimi/i);
    assert.equal(borrowerReturn.data.borrow.returned_at, null);
    assert.ok(borrowerReturn.data.borrow.return_requested_at);
    assert.equal(borrowerReturn.data.borrow.can_mark_returned, false);

    const pendingAfterBorrowerAction = directDb.prepare(`
        SELECT returned_at, returned_by_user_id, return_requested_at, return_requested_by_user_id
        FROM item_borrows
        WHERE item_id = ?
        LIMIT 1
    `).get(createItem.data.item.id);
    assert.equal(pendingAfterBorrowerAction.returned_at, null);
    assert.equal(pendingAfterBorrowerAction.returned_by_user_id, null);
    assert.ok(pendingAfterBorrowerAction.return_requested_at);
    assert.equal(pendingAfterBorrowerAction.return_requested_by_user_id, borrowerId);

    const ownerOverviewAfterDelivery = await requestJson(port, '/api/borrow-requests', {
        method: 'GET'
    }, ownerJar);
    assert.equal(ownerOverviewAfterDelivery.status, 200);
    assert.equal(ownerOverviewAfterDelivery.data.activeBorrows.length, 1);
    assert.ok(ownerOverviewAfterDelivery.data.activeBorrows[0].return_requested_at);
    assert.equal(ownerOverviewAfterDelivery.data.activeBorrows[0].can_mark_returned, true);

    const ownerConfirmReturn = await requestJson(port, `/api/borrow-requests/active-borrows/${borrowerOverview.data.activeBorrows[0].id}/return`, {
        method: 'POST',
        body: {
            return_note: 'Teslim aldım'
        }
    }, ownerJar);
    assert.equal(ownerConfirmReturn.status, 200);
    assert.match(ownerConfirmReturn.data.message, /teslim alındı/i);
    assert.ok(ownerConfirmReturn.data.borrow.returned_at);

    const returnedAfterOwnerConfirmation = directDb.prepare(`
        SELECT returned_at, returned_by_user_id, return_requested_at, return_requested_by_user_id
        FROM item_borrows
        WHERE item_id = ?
        LIMIT 1
    `).get(createItem.data.item.id);
    assert.ok(returnedAfterOwnerConfirmation.returned_at);
    assert.equal(returnedAfterOwnerConfirmation.returned_by_user_id, ownerId);
    assert.ok(returnedAfterOwnerConfirmation.return_requested_at);
    assert.equal(returnedAfterOwnerConfirmation.return_requested_by_user_id, borrowerId);
});

test('private items are owner-only and visibility changes are owner-only', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();

    const registerOwner = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'privacyowner',
            email: 'privacyowner@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, ownerJar);
    assert.equal(registerOwner.status, 201);

    const registerMember = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'privacymember',
            email: 'privacymember@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, memberJar);
    assert.equal(registerMember.status, 201);

    const ownerId = registerOwner.data.user.id;
    const memberId = registerMember.data.user.id;
    const ownerHouse = directDb.prepare(`
        SELECT house_key, house_name
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);

    directDb.prepare(`
        INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 0)
    `).run(memberId, ownerHouse.house_key, ownerHouse.house_name);
    directDb.prepare(`
        UPDATE users
        SET house_key = ?, active_house_key = ?
        WHERE id = ?
    `).run(ownerHouse.house_key, ownerHouse.house_key, memberId);

    const privateItem = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Owner private item',
            quantity: 1,
            is_public: false
        }
    }, ownerJar);
    assert.equal(privateItem.status, 201);
    assert.equal(privateItem.data.item.is_public, 0);
    assert.equal(privateItem.data.item.can_manage_visibility, true);

    const memberList = await requestJson(port, '/api/items', {}, memberJar);
    assert.equal(memberList.status, 200);
    assert.equal(memberList.data.items.some((item) => item.id === privateItem.data.item.id), false);

    const memberReadPrivate = await requestJson(port, `/api/items/${privateItem.data.item.id}`, {}, memberJar);
    assert.equal(memberReadPrivate.status, 404);

    const sharedItem = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Owner shared item',
            quantity: 1,
            is_public: true
        }
    }, ownerJar);
    assert.equal(sharedItem.status, 201);

    const memberReadShared = await requestJson(port, `/api/items/${sharedItem.data.item.id}`, {}, memberJar);
    assert.equal(memberReadShared.status, 200);
    assert.equal(memberReadShared.data.item.can_manage_visibility, false);

    const memberRenameShared = await requestJson(port, `/api/items/${sharedItem.data.item.id}`, {
        method: 'PUT',
        body: {
            name: 'Member edited shared item'
        }
    }, memberJar);
    assert.equal(memberRenameShared.status, 200);
    assert.equal(memberRenameShared.data.item.is_public, 1);

    const memberHideShared = await requestJson(port, `/api/items/${sharedItem.data.item.id}`, {
        method: 'PUT',
        body: {
            name: 'Member edited shared item',
            is_public: false
        }
    }, memberJar);
    assert.equal(memberHideShared.status, 403);
    assert.match(memberHideShared.data.error, /yalnızca eşyayı ekleyen kişi/i);

    const ownerHideShared = await requestJson(port, `/api/items/${sharedItem.data.item.id}`, {
        method: 'PUT',
        body: {
            name: 'Owner hidden shared item',
            is_public: false
        }
    }, ownerJar);
    assert.equal(ownerHideShared.status, 200);
    assert.equal(ownerHideShared.data.item.is_public, 0);
});

test('cross-house references are rejected and corrupted joins do not leak foreign names', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const ownerJar = new CookieJar();
    const outsiderJar = new CookieJar();

    const registerOwner = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'tenantowner',
            email: 'tenantowner@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, ownerJar);
    assert.equal(registerOwner.status, 201);

    const registerOutsider = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'tenantoutsider',
            email: 'tenantoutsider@example.com',
            password: 'Stronger!Pass123',
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, outsiderJar);
    assert.equal(registerOutsider.status, 201);

    const ownerId = registerOwner.data.user.id;
    const outsiderId = registerOutsider.data.user.id;
    const ownerHouse = directDb.prepare(`
        SELECT house_key
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(ownerId);
    const outsiderHouse = directDb.prepare(`
        SELECT house_key
        FROM user_houses
        WHERE user_id = ? AND is_owner = 1
        LIMIT 1
    `).get(outsiderId);
    const foreignCategory = directDb.prepare(`
        SELECT id
        FROM categories
        WHERE house_key = ?
        LIMIT 1
    `).get(outsiderHouse.house_key);
    const foreignRoom = directDb.prepare(`
        SELECT id
        FROM rooms
        WHERE house_key = ?
        LIMIT 1
    `).get(outsiderHouse.house_key);

    const createItemWithForeignCategory = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Cross reference item',
            category_id: foreignCategory.id
        }
    }, ownerJar);
    assert.equal(createItemWithForeignCategory.status, 400);
    assert.match(createItemWithForeignCategory.data.error, /kategori bu eve ait değil/i);

    const createLocationWithForeignRoom = await requestJson(port, '/api/locations', {
        method: 'POST',
        body: {
            name: 'Cross reference location',
            room_id: foreignRoom.id
        }
    }, ownerJar);
    assert.equal(createLocationWithForeignRoom.status, 400);
    assert.match(createLocationWithForeignRoom.data.error, /oda bu eve ait değil/i);

    const safeItem = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Safe item',
            quantity: 1
        }
    }, ownerJar);
    assert.equal(safeItem.status, 201);

    directDb.prepare(`
        UPDATE items
        SET category_id = ?
        WHERE id = ? AND house_key = ?
    `).run(foreignCategory.id, safeItem.data.item.id, ownerHouse.house_key);

    const readCorruptedItem = await requestJson(port, `/api/items/${safeItem.data.item.id}`, {}, ownerJar);
    assert.equal(readCorruptedItem.status, 200);
    assert.equal(readCorruptedItem.data.item.category_name, null);
});
