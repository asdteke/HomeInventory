import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-auth-middleware-'));

process.env.SECRET_PROVIDER = 'env';
process.env.JWT_SECRET = 'auth-middleware-test-secret-1234567890';
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'auth-middleware-test-key';
process.env.HOMEINVENTORY_DB_PATH = join(tempDir, 'inventory.db');

const { default: db } = await import('../database.js');
const {
    authenticateToken,
    generateToken,
    resolveAuthenticatedUser
} = await import('../middleware/auth.js');
const {
    encryptEmail,
    encryptHouseName,
    encryptUsername
} = await import('../utils/protectedFields.js');

function resetAuthTables() {
    db.prepare('DELETE FROM user_houses').run();
    db.prepare('DELETE FROM users').run();
}

function insertUser({
    username,
    email,
    role = 'user',
    isBanned = 0,
    houseKey = null,
    activeHouseKey = null
}) {
    const result = db.prepare(`
        INSERT INTO users (
            username,
            email,
            password_hash,
            role,
            is_banned,
            house_key,
            active_house_key,
            is_verified
        )
        VALUES (?, ?, 'test-password-hash', ?, ?, ?, ?, 1)
    `).run(
        encryptUsername(username),
        encryptEmail(email),
        role,
        isBanned,
        houseKey,
        activeHouseKey
    );

    return Number(result.lastInsertRowid);
}

function addMembership(userId, houseKey) {
    db.prepare(`
        INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
        VALUES (?, ?, ?, 1)
    `).run(userId, houseKey, encryptHouseName('Evim'));
}

function createMockResponse() {
    return {
        statusCode: null,
        body: null,
        clearedCookies: [],
        clearCookie(name, options) {
            this.clearedCookies.push({ name, options });
            return this;
        },
        status(code) {
            this.statusCode = code;
            return {
                json: (payload) => {
                    this.body = payload;
                    return payload;
                }
            };
        }
    };
}

process.on('exit', () => {
    try {
        db.close();
    } catch {
        // Database may already be closed during shutdown.
    }

    rmSync(tempDir, { recursive: true, force: true });
});

test('resolveAuthenticatedUser repairs stale house pointers from live memberships', () => {
    resetAuthTables();

    const userId = insertUser({
        username: 'alice',
        email: 'alice@example.com',
        houseKey: 'missing-house',
        activeHouseKey: 'missing-house'
    });
    addMembership(userId, 'house-a');

    const user = resolveAuthenticatedUser(userId);
    const persisted = db.prepare(`
        SELECT house_key, active_house_key
        FROM users
        WHERE id = ?
    `).get(userId);

    assert.equal(user.username, 'alice');
    assert.equal(user.email, 'alice@example.com');
    assert.equal(user.house_key, 'house-a');
    assert.equal(user.active_house_key, 'house-a');
    assert.equal(persisted.house_key, 'house-a');
    assert.equal(persisted.active_house_key, 'house-a');
});

test('authenticateToken trusts live database role over stale JWT role claims', () => {
    resetAuthTables();

    const userId = insertUser({
        username: 'bob',
        email: 'bob@example.com',
        role: 'user',
        houseKey: 'house-b',
        activeHouseKey: 'house-b'
    });
    addMembership(userId, 'house-b');

    const token = generateToken({
        id: userId,
        username: 'bob',
        email: 'bob@example.com',
        house_key: 'house-b',
        active_house_key: 'house-b',
        role: 'admin'
    });

    const req = {
        cookies: { token },
        headers: {}
    };
    const res = createMockResponse();
    let nextCalled = false;

    authenticateToken(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.user.id, userId);
    assert.equal(req.user.role, 'user');
    assert.equal(req.user.house_key, 'house-b');
});

test('authenticateToken blocks already-banned users even with a valid JWT cookie', () => {
    resetAuthTables();

    const userId = insertUser({
        username: 'carol',
        email: 'carol@example.com',
        isBanned: 1,
        houseKey: 'house-c',
        activeHouseKey: 'house-c'
    });
    addMembership(userId, 'house-c');

    const token = generateToken({
        id: userId,
        username: 'carol',
        email: 'carol@example.com',
        house_key: 'house-c',
        active_house_key: 'house-c',
        role: 'user'
    });

    const req = {
        cookies: { token },
        headers: {}
    };
    const res = createMockResponse();
    let nextCalled = false;

    authenticateToken(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Hesabınız askıya alınmış. Destek ile iletişime geçin.');
    assert.equal(res.clearedCookies[0]?.name, 'token');
});
