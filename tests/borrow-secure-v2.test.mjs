import test from 'node:test';
import assert from 'node:assert/strict';

// Set encryption environment variables before importing any protected fields or db utils
process.env.SECRET_PROVIDER = 'env';
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'integration-key';

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

// Helper to build hashes for lookups in the tests
const { buildEmailLookup, buildUsernameLookup, encryptBorrowRequestTarget, encryptBorrowRequestItemLabel } = await import('../utils/protectedFields.js');

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
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-secure-v2-'));
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

async function registerAndLogin(port, username, email, password = 'Stronger!Pass123') {
    const jar = new CookieJar();
    const registerResponse = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username,
            email,
            password,
            mode: 'create',
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true
        }
    }, jar);

    if (registerResponse.status !== 201) {
        console.error("REGISTRATION FAILED:", registerResponse.status, registerResponse.data);
        throw new Error(`Registration failed for ${username}: ${JSON.stringify(registerResponse.data)}`);
    }

    return {
        userId: registerResponse.data.user.id,
        jar,
        houseKey: registerResponse.data.user.house_key
    };
}

test('Default Policy (none) silently discards external requests and registers no borrow_requests record', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userC.userId);

    const policyRow = directDb.prepare('SELECT borrow_request_policy FROM users WHERE id = ?').get(userC.userId);
    assert.equal(policyRow.borrow_request_policy, 'none');

    const res = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Screwdriver'
        }
    }, userA.jar);

    assert.equal(res.status, 201);
    assert.equal(res.data.request.id, -1);
    assert.equal(res.data.request.status, 'pending');
    assert.equal(res.data.request.can_cancel, false);

    const row = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_requests WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(row.count, 0);

    const attempts = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_request_attempts WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(attempts.count, 1);
});

test('Invalid stored policy is treated as none and does not deliver external requests', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1, borrow_request_policy = ? WHERE id = ?')
        .run('unexpected_policy', userC.userId);

    const policyRes = await requestJson(port, '/api/borrow-requests/policy', {}, userC.jar);
    assert.equal(policyRes.status, 200);
    assert.equal(policyRes.data.policy, 'none');

    const res = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Saw'
        }
    }, userA.jar);

    assert.equal(res.status, 201);
    assert.equal(res.data.request.id, -1);
    assert.equal(res.data.request.can_cancel, false);

    const row = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_requests WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(row.count, 0);
});

test('Unverified users cannot send external borrow requests', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userB = await registerAndLogin(port, 'userb', 'userb@example.com');
    directDb.prepare('UPDATE users SET is_verified = 0 WHERE id = ?').run(userB.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userC.userId);

    const res = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Drill'
        }
    }, userB.jar);

    assert.equal(res.status, 403);
    assert.match(res.data.error, /doğrulamış olmalısınız/);

    const attempts = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_request_attempts WHERE initiator_user_id = ?').get(userB.userId);
    assert.equal(attempts.count, 0);
});

test('External direction = offer is strictly blocked with 403 and writes no attempt', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userC.userId);

    // Create a real item owned by User A to bypass item existence validation step
    const itemRes = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Real Hammer',
            quantity: 1
        }
    }, userA.jar);
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.item.id;

    const res = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'offer',
            recipient_identifier: 'userc@example.com',
            item_id: itemId
        }
    }, userA.jar);

    assert.equal(res.status, 403);
    assert.match(res.data.error, /teklif edilemez/);

    const attempts = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_request_attempts WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(attempts.count, 0);
});

test('Everyone policy accepts requests normally and writes to borrow_requests table', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userC.userId);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'everyone' }
    }, userC.jar);

    const reqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Lawn Mower'
        }
    }, userA.jar);

    assert.equal(reqRes.status, 201);
    assert.ok(reqRes.data.request.id > 0);

    const dbRow = directDb.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(reqRes.data.request.id);
    assert.ok(dbRow);
    assert.equal(dbRow.recipient_user_id, userC.userId);

    const itemRes = await requestJson(port, '/api/items', {
        method: 'POST',
        body: {
            name: 'Loanable Lawn Mower',
            quantity: 1
        }
    }, userC.jar);
    assert.equal(itemRes.status, 201);

    const acceptRes = await requestJson(port, `/api/borrow-requests/${reqRes.data.request.id}/accept`, {
        method: 'POST',
        body: {
            item_id: itemRes.data.item.id,
            due_date: '2026-06-15'
        }
    }, userC.jar);
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.request.status, 'accepted');
    assert.equal(acceptRes.data.request.due_date, '2026-06-15');
    assert.equal(acceptRes.data.request.borrow.due_date, '2026-06-15');

    const acceptedDbRow = directDb.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(reqRes.data.request.id);
    const borrowRow = directDb.prepare('SELECT * FROM item_borrows WHERE id = ?').get(acceptedDbRow.borrow_id);
    assert.equal(acceptedDbRow.due_date, '2026-06-15');
    assert.equal(borrowRow.due_date, '2026-06-15');

    const attempts = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_request_attempts WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(attempts.count, 1);

    const secondReqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Garden Shears'
        }
    }, userA.jar);
    assert.equal(secondReqRes.status, 201);
    assert.ok(secondReqRes.data.request.id > 0);

    const attemptsAfterTrustedRequest = directDb.prepare('SELECT COUNT(*) AS count FROM borrow_request_attempts WHERE initiator_user_id = ?').get(userA.userId);
    assert.equal(attemptsAfterTrustedRequest.count, 1);
});

test('Rolling rate limits block request flooding (1 per target per 24 hours)', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userC = await registerAndLogin(port, 'userc', 'userc@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userC.userId);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'everyone' }
    }, userC.jar);

    // Send first request (success)
    const reqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Hammer'
        }
    }, userA.jar);
    assert.equal(reqRes.status, 201);

    // Send second request (blocked by target rate limit)
    const reqRes2 = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userc@example.com',
            requested_item_label: 'Hammer2'
        }
    }, userA.jar);

    assert.equal(reqRes2.status, 400);
    assert.match(reqRes2.data.error, /en fazla 1 dış talep/);
    assert.equal(reqRes2.data.code, 'external_target_daily_limit');
});

test('Rolling rate limits block request flooding (max 5 total external in 24 hours)', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    // Simulate 5 attempts for User A
    for (let i = 0; i < 5; i++) {
        directDb.prepare(`
            INSERT INTO borrow_request_attempts (initiator_user_id, recipient_lookup_type, recipient_lookup_hash)
            VALUES (?, 'email', ?)
        `).run(userA.userId, `hash-${i}`);
    }

    const reqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Wrench'
        }
    }, userA.jar);

    assert.equal(reqRes.status, 400);
    assert.match(reqRes.data.error, /en fazla 5 dış talep/);
    assert.equal(reqRes.data.code, 'external_total_daily_limit');
});

test('30-day rejection lock is enforced', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userD = await registerAndLogin(port, 'userd', 'userd@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userD.userId);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'everyone' }
    }, userD.jar);

    const reqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Bicycle'
        }
    }, userA.jar);
    assert.equal(reqRes.status, 201);
    const reqId = reqRes.data.request.id;

    const rejectRes = await requestJson(port, `/api/borrow-requests/${reqId}/reject`, {
        method: 'POST',
        body: { reason: 'rejected' }
    }, userD.jar);
    assert.equal(rejectRes.status, 200);

    // Clear attempts for User A to bypass rate limits, but the 30-day rejection lock should trigger
    directDb.prepare('DELETE FROM borrow_request_attempts').run();

    const secondReq = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Bicycle'
        }
    }, userA.jar);

    assert.equal(secondReq.status, 400);
    assert.match(secondReq.data.error, /30 gün boyunca yeni talep gönderilemez/);
    assert.equal(secondReq.data.code, 'recent_rejection_lock');
});

test('Rejection with blocked reason adds block, and blocks endpoint displays privacy-preserving user list', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userD = await registerAndLogin(port, 'userd', 'userd@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userD.userId);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'everyone' }
    }, userD.jar);

    const reqRes = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Guitar'
        }
    }, userA.jar);
    assert.equal(reqRes.status, 201);
    const reqId = reqRes.data.request.id;

    const rejectRes = await requestJson(port, `/api/borrow-requests/${reqId}/reject`, {
        method: 'POST',
        body: { reason: 'blocked' }
    }, userD.jar);
    assert.equal(rejectRes.status, 200);
    assert.match(rejectRes.data.message, /engellendi/i);

    const block = directDb.prepare('SELECT * FROM borrow_request_blocks WHERE blocker_user_id = ?').get(userD.userId);
    assert.ok(block);
    assert.equal(block.blocked_user_id, userA.userId);

    const blocksList = await requestJson(port, '/api/borrow-requests/blocks', {}, userD.jar);
    assert.equal(blocksList.status, 200);
    assert.equal(blocksList.data.blocks.length, 1);
    assert.equal(blocksList.data.blocks[0].id, userA.userId);
    assert.equal(blocksList.data.blocks[0].username, 'usera');
    assert.equal(blocksList.data.blocks[0].email, undefined);

    directDb.prepare('DELETE FROM borrow_requests').run();
    directDb.prepare('DELETE FROM borrow_request_attempts').run();

    const thirdReq = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Guitar'
        }
    }, userA.jar);

    assert.equal(thirdReq.status, 201);
    assert.equal(thirdReq.data.request.id, -1);

    const unblockRes = await requestJson(port, `/api/borrow-requests/blocks/${userA.userId}/unblock`, {
        method: 'POST'
    }, userD.jar);
    assert.equal(unblockRes.status, 200);

    const emptyBlocksList = await requestJson(port, '/api/borrow-requests/blocks', {}, userD.jar);
    assert.equal(emptyBlocksList.data.blocks.length, 0);
});

test('house_only policy blocks external requests but allows same-house requests', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userD = await registerAndLogin(port, 'userd', 'userd@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userD.userId);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'house_only' }
    }, userD.jar);

    const resExternal = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Camera'
        }
    }, userA.jar);

    assert.equal(resExternal.status, 201);
    assert.equal(resExternal.data.request.id, -1);

    // Link User A to User D's house key
    directDb.prepare('INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 0)')
        .run(userA.userId, userD.houseKey, 'D-House-Encrypted');
    directDb.prepare('UPDATE users SET house_key = ?, active_house_key = ? WHERE id = ?')
        .run(userD.houseKey, userD.houseKey, userA.userId);

    const resInternal = await requestJson(port, '/api/borrow-requests', {
        method: 'POST',
        body: {
            direction: 'request',
            recipient_identifier: 'userd@example.com',
            requested_item_label: 'Camera'
        }
    }, userA.jar);

    assert.equal(resInternal.status, 201);
    assert.ok(resInternal.data.request.id > 0);

    const dbRow = directDb.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(resInternal.data.request.id);
    assert.ok(dbRow);
    assert.equal(dbRow.recipient_user_id, userD.userId);
});

test('Smart reconciliation correctly processes legacy requests on policy changes', async (t) => {
    const { port, directDb } = await startTestServer(t);
    const userA = await registerAndLogin(port, 'usera', 'usera@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userA.userId);

    const userE = await registerAndLogin(port, 'usere', 'usere@example.com');
    directDb.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userE.userId);

    const recipientEmailHash = buildEmailLookup('usere@example.com');
    directDb.prepare(`
        INSERT INTO borrow_requests (
            direction,
            status,
            initiator_user_id,
            recipient_user_id,
            recipient_lookup_type,
            recipient_lookup_hash,
            recipient_identifier,
            requested_item_label,
            expires_at
        )
        VALUES ('request', 'pending', ?, NULL, 'email', ?, ?, ?, datetime('now', '+14 days'))
    `).run(
        userA.userId,
        recipientEmailHash,
        encryptBorrowRequestTarget('usere@example.com'),
        encryptBorrowRequestItemLabel('Legacy Tool')
    );

    const listNone = await requestJson(port, '/api/borrow-requests', {}, userE.jar);
    assert.equal(listNone.data.requests.length, 0);

    await requestJson(port, '/api/borrow-requests/policy', {
        method: 'POST',
        body: { policy: 'everyone' }
    }, userE.jar);

    const listLinked = await requestJson(port, '/api/borrow-requests', {}, userE.jar);
    assert.equal(listLinked.data.requests.length, 1);
    assert.equal(listLinked.data.requests[0].viewer_role, 'recipient');
    assert.equal(listLinked.data.requests[0].counterparty_display_name, 'usera');
});
