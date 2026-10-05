import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';

process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'instance-backup-test';

const {
    BACKUP_FILE_PATTERN,
    applyStagedRestore,
    buildBackupFileName,
    createSnapshot,
    getPendingRestore,
    inspectBackupFile,
    listBackups,
    loadBackupSettings,
    pruneBackups,
    saveBackupSettings,
    stageRestore
} = await import('../utils/instanceBackups.js');
const { createBackupScheduler } = await import('../utils/backupScheduler.js');
const { verifyBackupEncryptionKey } = await import('../utils/backupKeyCheck.js');
const { encryptUsername, encryptEmail } = await import('../utils/protectedFields.js');

const quietLogger = { log() {}, warn() {}, error() {} };

function makeTempDir(t) {
    const dir = mkdtempSync(join(tmpdir(), 'homeinventory-instance-backup-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function createHomeInventoryDb(filePath, { rooms = [], username = 'owner' } = {}) {
    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT);
        CREATE TABLE user_houses (id INTEGER PRIMARY KEY, user_id INTEGER, house_key TEXT);
        CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT);
    `);
    db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
        .run(encryptUsername(username), encryptEmail(`${username}@example.com`));
    const insertRoom = db.prepare('INSERT INTO rooms (name) VALUES (?)');
    for (const room of rooms) {
        insertRoom.run(room);
    }
    return db;
}

function roomNames(filePath) {
    const db = new Database(filePath, { readonly: true });
    try {
        return db.prepare('SELECT name FROM rooms ORDER BY id').all().map((row) => row.name);
    } finally {
        db.close();
    }
}

test('createSnapshot writes a private, self-contained, consistent copy', async (t) => {
    const root = makeTempDir(t);
    const live = createHomeInventoryDb(join(root, 'inventory.db'), { rooms: ['Kitchen'] });
    t.after(() => live.close());
    const backupDir = join(root, 'backups');

    const entry = await createSnapshot(live, backupDir, { kind: 'manual' });

    assert.match(entry.name, BACKUP_FILE_PATTERN);
    assert.equal(entry.kind, 'manual');
    assert.equal(statSync(backupDir).mode & 0o777, 0o700);
    const snapshotPath = join(backupDir, entry.name);
    assert.equal(statSync(snapshotPath).mode & 0o777, 0o600);
    assert.equal(entry.size, statSync(snapshotPath).size);
    // Rollback journal header bytes: usable without a -wal side file.
    const header = readFileSync(snapshotPath).subarray(0, 20);
    assert.equal(header[18], 1);
    assert.deepEqual(roomNames(snapshotPath), ['Kitchen']);
    assert.deepEqual(inspectBackupFile(snapshotPath, { verifyKey: verifyBackupEncryptionKey }), { users: 1, items: 0 });
    assert.deepEqual(readdirSync(backupDir), [entry.name]);
});

test('pruneBackups keeps the newest automatic snapshots and ignores foreign files', async (t) => {
    const dir = makeTempDir(t);
    const base = Date.UTC(2026, 0, 1);
    const autos = [];
    for (let day = 0; day < 6; day += 1) {
        const name = buildBackupFileName('auto', new Date(base + day * 86400000));
        writeFileSync(join(dir, name), 'x');
        autos.push(name);
    }
    const prerestores = [];
    for (let day = 0; day < 5; day += 1) {
        const name = buildBackupFileName('prerestore', new Date(base + day * 86400000 + 1000));
        writeFileSync(join(dir, name), 'x');
        prerestores.push(name);
    }
    const manual = buildBackupFileName('manual', new Date(base));
    const upload = buildBackupFileName('upload', new Date(base));
    const foreign = ['inventory.db', 'homeinventory-latest.db', 'homeinventory-20260101T000000000Z-auto.db.bak', 'notes.txt'];
    for (const name of [manual, upload, ...foreign]) {
        writeFileSync(join(dir, name), 'x');
    }

    const removed = pruneBackups(dir, 2);

    assert.deepEqual(removed.sort(), [...autos.slice(0, 4), ...prerestores.slice(0, 2)].sort());
    const remaining = readdirSync(dir).sort();
    assert.deepEqual(remaining, [...autos.slice(4), ...prerestores.slice(2), manual, upload, ...foreign].sort());
    assert.deepEqual(listBackups(dir).filter((entry) => entry.kind === 'auto').map((entry) => entry.name), autos.slice(4).reverse());
});

test('inspectBackupFile rejects non-database, corrupt, foreign and wrong-key files', async (t) => {
    const dir = makeTempDir(t);

    const textPath = join(dir, 'text.db');
    writeFileSync(textPath, 'not a database at all, just some text that is long enough '.repeat(4));
    assert.throws(() => inspectBackupFile(textPath), { code: 'NOT_SQLITE' });

    const emptyPath = join(dir, 'empty.db');
    writeFileSync(emptyPath, '');
    assert.throws(() => inspectBackupFile(emptyPath), { code: 'NOT_SQLITE' });

    const goodPath = join(dir, 'good.db');
    const good = createHomeInventoryDb(goodPath, { rooms: Array.from({ length: 400 }, (_, i) => `Room ${i} ${'x'.repeat(50)}`) });
    good.pragma('journal_mode = DELETE');
    good.close();
    const bytes = readFileSync(goodPath);
    const corruptPath = join(dir, 'corrupt.db');
    const corrupt = Buffer.from(bytes);
    // Keep the header intact but scramble the b-tree pages behind it.
    for (let offset = 4096; offset < corrupt.length; offset += 7) {
        corrupt[offset] ^= 0xa5;
    }
    writeFileSync(corruptPath, corrupt);
    assert.throws(() => inspectBackupFile(corruptPath), { code: 'CORRUPT' });

    const truncatedPath = join(dir, 'truncated.db');
    writeFileSync(truncatedPath, bytes.subarray(0, Math.floor(bytes.length / 2)));
    assert.throws(() => inspectBackupFile(truncatedPath), { code: 'CORRUPT' });

    const foreignPath = join(dir, 'foreign.db');
    const foreign = new Database(foreignPath);
    foreign.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
    foreign.close();
    assert.throws(() => inspectBackupFile(foreignPath), { code: 'NOT_HOMEINVENTORY' });

    const otherKeyPath = join(dir, 'other-key.db');
    const otherKey = createHomeInventoryDb(otherKeyPath);
    otherKey.prepare('UPDATE users SET username = ?').run(JSON.stringify({
        v: 1, alg: 'aes-256-gcm', kid: 'some-other-key', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA', ciphertext: 'AAAA'
    }));
    otherKey.close();
    assert.throws(() => inspectBackupFile(otherKeyPath, { verifyKey: verifyBackupEncryptionKey }), { code: 'KEY_MISMATCH' });
    assert.deepEqual(inspectBackupFile(otherKeyPath), { users: 1, items: 0 });
});

test('a staged restore is applied at startup after a safety snapshot of the current database', async (t) => {
    const root = makeTempDir(t);
    const databasePath = join(root, 'inventory.db');
    const backupDir = join(root, 'backups');
    const live = createHomeInventoryDb(databasePath, { rooms: ['Kitchen'] });
    const snapshot = await createSnapshot(live, backupDir, { kind: 'manual' });
    live.prepare('INSERT INTO rooms (name) VALUES (?)').run('Garage');

    const marker = stageRestore(backupDir, snapshot.name, { verifyKey: verifyBackupEncryptionKey, requestedBy: 'admin' });
    assert.equal(marker.source, snapshot.name);
    assert.equal(marker.users, 1);
    assert.ok(getPendingRestore(backupDir));
    // Staging never touches the live database.
    assert.deepEqual(live.prepare('SELECT name FROM rooms ORDER BY id').all().map((row) => row.name), ['Kitchen', 'Garage']);
    live.close();
    // Simulate a WAL left over from an unclean stop; it must not be replayed.
    writeFileSync(`${databasePath}-wal`, Buffer.alloc(0));

    const result = applyStagedRestore({ databasePath, backupDir, verifyKey: verifyBackupEncryptionKey });

    assert.equal(result.status, 'applied');
    assert.equal(result.source, snapshot.name);
    assert.match(result.safetySnapshot, /-prerestore\.db$/);
    assert.deepEqual(roomNames(databasePath), ['Kitchen']);
    assert.deepEqual(roomNames(join(backupDir, result.safetySnapshot)), ['Kitchen', 'Garage']);
    assert.equal(statSync(join(backupDir, result.safetySnapshot)).mode & 0o777, 0o600);
    assert.equal(getPendingRestore(backupDir), null);
    assert.equal(existsSync(join(backupDir, '.restore-pending.db')), false);
    const lastRestore = JSON.parse(readFileSync(join(backupDir, 'restore-last.json'), 'utf8'));
    assert.equal(lastRestore.status, 'applied');
    assert.equal(lastRestore.requestedBy, 'admin');

    // Nothing staged: startup is a no-op.
    assert.equal(applyStagedRestore({ databasePath, backupDir }), null);
});

test('a tampered or invalid staged restore is refused and the current database is kept', async (t) => {
    const root = makeTempDir(t);
    const databasePath = join(root, 'inventory.db');
    const backupDir = join(root, 'backups');
    const live = createHomeInventoryDb(databasePath, { rooms: ['Kitchen'] });
    const snapshot = await createSnapshot(live, backupDir, { kind: 'manual' });
    live.prepare('INSERT INTO rooms (name) VALUES (?)').run('Garage');
    live.close();

    stageRestore(backupDir, snapshot.name);
    writeFileSync(join(backupDir, '.restore-pending.db'), 'replaced after verification');

    const result = applyStagedRestore({ databasePath, backupDir });
    assert.equal(result.status, 'failed');
    assert.equal(result.code, 'CHECKSUM_MISMATCH');
    assert.deepEqual(roomNames(databasePath), ['Kitchen', 'Garage']);
    assert.equal(getPendingRestore(backupDir), null);
    assert.equal(listBackups(backupDir).some((entry) => entry.kind === 'prerestore'), false);

    const garbageName = buildBackupFileName('upload');
    writeFileSync(join(backupDir, garbageName), 'garbage');
    assert.throws(() => stageRestore(backupDir, garbageName), { code: 'NOT_SQLITE' });
    assert.throws(() => stageRestore(backupDir, '../inventory.db'), { code: 'NOT_FOUND' });
    assert.equal(getPendingRestore(backupDir), null);
});

test('settings fall back to env defaults and validate admin overrides', (t) => {
    const dir = makeTempDir(t);
    assert.deepEqual(loadBackupSettings(dir, {}), { schedule: 'daily', keepLast: 7, source: 'default' });
    assert.deepEqual(loadBackupSettings(dir, { BACKUP_SCHEDULE: 'weekly', BACKUP_KEEP: '4' }), { schedule: 'weekly', keepLast: 4, source: 'env' });
    assert.deepEqual(loadBackupSettings(dir, { BACKUP_SCHEDULE: 'hourly', BACKUP_KEEP: '-1' }), { schedule: 'daily', keepLast: 7, source: 'default' });
    assert.throws(() => saveBackupSettings(dir, { schedule: 'hourly', keepLast: 3 }), { code: 'INVALID_SETTINGS' });
    saveBackupSettings(dir, { schedule: 'off', keepLast: 3 });
    assert.deepEqual(loadBackupSettings(dir, { BACKUP_SCHEDULE: 'weekly' }), { schedule: 'off', keepLast: 3, source: 'admin' });
});

test('scheduler runs an overdue backup after the startup delay, prunes, and respects off', async (t) => {
    const root = makeTempDir(t);
    const live = createHomeInventoryDb(join(root, 'inventory.db'));
    t.after(() => live.close());
    const backupDir = join(root, 'backups');
    const env = { BACKUP_KEEP: '2' };
    const scheduler = createBackupScheduler({ db: live, backupDir, env, logger: quietLogger });
    t.after(() => scheduler.stop());

    // Two older automatic snapshots: the next run must prune one of them.
    const old = Date.now() - 3 * 86400000;
    await createSnapshot(live, backupDir, { kind: 'auto', date: new Date(old) });
    await createSnapshot(live, backupDir, { kind: 'auto', date: new Date(old + 1000) });

    scheduler.start({ startupDelayMs: 20 });
    assert.ok(scheduler.getNextRunAt());
    for (let attempt = 0; attempt < 100 && !scheduler.getStatus().lastSuccessAt; attempt += 1) {
        await sleep(20);
    }
    for (let attempt = 0; attempt < 50 && scheduler.isRunning(); attempt += 1) {
        await sleep(20);
    }

    const autos = listBackups(backupDir).filter((entry) => entry.kind === 'auto');
    assert.equal(autos.length, 2);
    assert.ok(Date.parse(autos[0].createdAt) > Date.now() - 60000);
    assert.equal(scheduler.getStatus().lastResult, 'success');
    // Next run is a full day after the fresh snapshot.
    const nextRunAt = Date.parse(scheduler.getNextRunAt());
    assert.ok(nextRunAt > Date.now() + 23 * 3600000);

    // A recent snapshot is not overdue: the timer waits for the interval.
    scheduler.start({ startupDelayMs: 0 });
    assert.ok(Date.parse(scheduler.getNextRunAt()) > Date.now() + 23 * 3600000);

    scheduler.updateSettings({ schedule: 'off', keepLast: 2 });
    assert.equal(scheduler.getNextRunAt(), null);

    await assert.doesNotReject(scheduler.runBackup({ kind: 'manual' }));
    const concurrent = [scheduler.runBackup(), scheduler.runBackup()];
    const outcomes = await Promise.allSettled(concurrent);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.code === 'BACKUP_BUSY').length, 1);
});

test('scheduler failures are recorded and never throw out of the timer', async (t) => {
    const root = makeTempDir(t);
    const backupDir = join(root, 'backups');
    const brokenDb = { backup: async () => { throw new Error('disk full'); } };
    const errors = [];
    const scheduler = createBackupScheduler({
        db: brokenDb,
        backupDir,
        env: {},
        logger: { ...quietLogger, error: (line) => errors.push(line) }
    });
    t.after(() => scheduler.stop());

    scheduler.start({ startupDelayMs: 0 });
    for (let attempt = 0; attempt < 100 && !scheduler.getStatus().lastResult; attempt += 1) {
        await sleep(10);
    }

    assert.equal(scheduler.getStatus().lastResult, 'failed');
    assert.match(scheduler.getStatus().lastError, /disk full/);
    assert.ok(errors.some((line) => line.includes('disk full')));
    assert.deepEqual(listBackups(backupDir), []);
    assert.deepEqual(readdirSync(backupDir).filter((name) => name.includes('partial')), []);
    // Retries within the hour instead of waiting a whole interval.
    assert.ok(Date.parse(scheduler.getNextRunAt()) <= Date.now() + 3600000);
});
