import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formatScopedLog } from './devConsole.js';

// Instance-level SQLite snapshots: file naming, retention, validation and the
// staged restore that is applied at the next startup before the shared db
// handle is opened. Nothing here imports database.js so it can run first.

export const BACKUP_FILE_PATTERN = /^homeinventory-(\d{8}T\d{9}Z)-(auto|manual|upload|prerestore)\.db$/;
export const BACKUP_SCHEDULES = ['off', 'daily', 'weekly'];
export const BACKUP_INTERVAL_MS = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000
};
export const DEFAULT_BACKUP_SCHEDULE = 'daily';
export const DEFAULT_BACKUP_KEEP = 7;
export const MAX_BACKUP_KEEP = 365;
export const PRERESTORE_KEEP = 3;
export const REQUIRED_TABLES = ['users', 'user_houses', 'items', 'rooms', 'categories', 'locations'];

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');
const PENDING_RESTORE_FILE = '.restore-pending.db';
const PENDING_RESTORE_MARKER = '.restore-pending.json';
const LAST_RESTORE_FILE = 'restore-last.json';
const SETTINGS_FILE = 'backup-settings.json';
const STATUS_FILE = 'backup-status.json';
const HASH_CHUNK_BYTES = 1024 * 1024;

export class BackupValidationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'BackupValidationError';
        this.code = code;
    }
}

function log(level, message) {
    const line = formatScopedLog('backup', message);
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export function formatBackupTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

export function buildBackupFileName(kind, date = new Date()) {
    return `homeinventory-${formatBackupTimestamp(date)}-${kind}.db`;
}

export function parseBackupFileName(name) {
    const match = BACKUP_FILE_PATTERN.exec(String(name || ''));
    if (!match) {
        return null;
    }

    const stamp = match[1];
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T`
        + `${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.${stamp.slice(15, 18)}Z`;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) {
        return null;
    }

    return { name: match[0], kind: match[2], createdAt };
}

export function ensureBackupDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        // mkdir honours the umask; make the private mode explicit.
        fs.chmodSync(dir, 0o700);
    }
}

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function writeJsonFile(filePath, value) {
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
}

function removeFileQuietly(filePath) {
    try {
        fs.rmSync(filePath, { force: true });
    } catch {
        // Best effort cleanup only.
    }
}

export function listBackups(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }

    const entries = [];
    for (const name of fs.readdirSync(dir)) {
        const parsed = parseBackupFileName(name);
        if (!parsed) {
            continue;
        }

        try {
            const stat = fs.lstatSync(path.join(dir, name));
            if (!stat.isFile()) {
                continue;
            }
            entries.push({
                name,
                kind: parsed.kind,
                createdAt: parsed.createdAt.toISOString(),
                size: stat.size
            });
        } catch {
            // File vanished while listing.
        }
    }

    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}

export function resolveBackupFile(dir, name) {
    if (!parseBackupFileName(name)) {
        return null;
    }

    const filePath = path.join(dir, name);
    try {
        return fs.lstatSync(filePath).isFile() ? filePath : null;
    } catch {
        return null;
    }
}

// Retention only ever touches files that match our own naming pattern.
// Automatic snapshots follow keepLast; safety snapshots keep a short tail;
// manual and uploaded files are left for an admin to remove deliberately.
export function pruneBackups(dir, keepLast) {
    const limits = { auto: Math.max(1, Number(keepLast) || DEFAULT_BACKUP_KEEP), prerestore: PRERESTORE_KEEP };
    const seen = { auto: 0, prerestore: 0 };
    const removed = [];

    for (const entry of listBackups(dir)) {
        if (!(entry.kind in limits)) {
            continue;
        }

        seen[entry.kind] += 1;
        if (seen[entry.kind] > limits[entry.kind]) {
            try {
                fs.unlinkSync(path.join(dir, entry.name));
                removed.push(entry.name);
            } catch (error) {
                log('warn', `Could not prune ${entry.name}: ${error.message}`);
            }
        }
    }

    return removed;
}

function parseKeep(value) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_BACKUP_KEEP) {
        return null;
    }
    return parsed;
}

function parseSchedule(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return BACKUP_SCHEDULES.includes(normalized) ? normalized : null;
}

export function getEnvBackupDefaults(env = process.env) {
    const schedule = parseSchedule(env.BACKUP_SCHEDULE);
    const keepLast = parseKeep(env.BACKUP_KEEP);
    return {
        schedule: schedule || DEFAULT_BACKUP_SCHEDULE,
        keepLast: keepLast || DEFAULT_BACKUP_KEEP,
        fromEnv: Boolean(schedule || keepLast)
    };
}

export function loadBackupSettings(dir, env = process.env) {
    const defaults = getEnvBackupDefaults(env);
    const stored = readJsonFile(path.join(dir, SETTINGS_FILE));
    const storedSchedule = parseSchedule(stored?.schedule);
    const storedKeep = parseKeep(stored?.keepLast);

    if (storedSchedule && storedKeep) {
        return { schedule: storedSchedule, keepLast: storedKeep, source: 'admin' };
    }

    return {
        schedule: defaults.schedule,
        keepLast: defaults.keepLast,
        source: defaults.fromEnv ? 'env' : 'default'
    };
}

export function validateBackupSettings(input) {
    const schedule = parseSchedule(input?.schedule);
    const keepLast = parseKeep(input?.keepLast);
    if (!schedule || !keepLast) {
        return null;
    }
    return { schedule, keepLast };
}

export function saveBackupSettings(dir, input) {
    const settings = validateBackupSettings(input);
    if (!settings) {
        throw new BackupValidationError('INVALID_SETTINGS', 'Invalid backup settings');
    }

    ensureBackupDir(dir);
    writeJsonFile(path.join(dir, SETTINGS_FILE), { ...settings, updatedAt: new Date().toISOString() });
    return { ...settings, source: 'admin' };
}

export function readBackupStatus(dir) {
    return readJsonFile(path.join(dir, STATUS_FILE)) || {};
}

export function writeBackupStatus(dir, status) {
    ensureBackupDir(dir);
    writeJsonFile(path.join(dir, STATUS_FILE), status);
}

export function hashFileSync(filePath) {
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(HASH_CHUNK_BYTES);
    const fd = fs.openSync(filePath, 'r');
    try {
        let bytesRead;
        while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest('hex');
}

function readHeader(filePath) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(100);
        const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
        return header.subarray(0, bytesRead);
    } finally {
        fs.closeSync(fd);
    }
}

// A copied WAL-mode database without its -wal file is complete but still
// flags WAL in its header. Switching bytes 18/19 to rollback mode lets it be
// opened read-only without creating side files. Only used on our own copies.
export function normalizeJournalHeader(filePath) {
    const header = readHeader(filePath);
    if (header.length < 20 || !header.subarray(0, 16).equals(SQLITE_HEADER)) {
        return;
    }
    if (header[18] === 2 || header[19] === 2) {
        const fd = fs.openSync(filePath, 'r+');
        try {
            fs.writeSync(fd, Buffer.from([1, 1]), 0, 2, 18);
        } finally {
            fs.closeSync(fd);
        }
    }
}

// Validate that a file is an intact HomeInventory SQLite database. When a
// verifyKey callback is given it receives the open read-only handle and must
// throw if encrypted fields cannot be read with the configured keyring.
export function inspectBackupFile(filePath, { verifyKey } = {}) {
    let header;
    try {
        header = readHeader(filePath);
    } catch {
        throw new BackupValidationError('NOT_FOUND', 'Backup file could not be read');
    }

    if (header.length < 100 || !header.subarray(0, 16).equals(SQLITE_HEADER)) {
        throw new BackupValidationError('NOT_SQLITE', 'File is not an SQLite database');
    }

    let backupDb;
    try {
        backupDb = new Database(filePath, { readonly: true, fileMustExist: true });
    } catch (error) {
        throw new BackupValidationError('CORRUPT', `Database could not be opened: ${error.message}`);
    }

    try {
        try {
            backupDb.pragma('trusted_schema = OFF');
        } catch {
            // Older SQLite builds ignore this pragma.
        }

        let integrity;
        try {
            integrity = backupDb.pragma('integrity_check', { simple: false })
                .map((row) => row.integrity_check);
        } catch (error) {
            throw new BackupValidationError('CORRUPT', `Integrity check failed: ${error.message}`);
        }
        if (integrity.length !== 1 || integrity[0] !== 'ok') {
            throw new BackupValidationError('CORRUPT', `Integrity check failed: ${integrity.slice(0, 3).join('; ')}`);
        }

        const tables = new Set(backupDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
            .map((row) => row.name));
        const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
        if (missing.length > 0) {
            throw new BackupValidationError('NOT_HOMEINVENTORY', `Not a HomeInventory database (missing: ${missing.join(', ')})`);
        }

        if (verifyKey) {
            try {
                verifyKey(backupDb);
            } catch (error) {
                throw new BackupValidationError('KEY_MISMATCH', `Encrypted fields cannot be read with the configured key: ${error.message}`);
            }
        }

        return {
            users: backupDb.prepare('SELECT COUNT(*) AS count FROM users').get().count,
            items: backupDb.prepare('SELECT COUNT(*) AS count FROM items').get().count
        };
    } finally {
        backupDb.close();
    }
}

// Consistent online snapshot through SQLite's backup API. The file is written
// under a dot-prefixed temporary name and only renamed into the listed
// pattern once complete, so pruning and listing never see partial files.
export async function createSnapshot(db, dir, { kind = 'manual', date = new Date() } = {}) {
    ensureBackupDir(dir);
    let name = buildBackupFileName(kind, date);
    let finalPath = path.join(dir, name);
    let offset = 1;
    while (fs.existsSync(finalPath)) {
        name = buildBackupFileName(kind, new Date(date.getTime() + offset));
        finalPath = path.join(dir, name);
        offset += 1;
    }
    const partialPath = path.join(dir, `.${name}.partial`);

    try {
        fs.closeSync(fs.openSync(partialPath, 'wx', 0o600));
        await db.backup(partialPath);

        const snapshotDb = new Database(partialPath, { fileMustExist: true });
        try {
            snapshotDb.pragma('journal_mode = DELETE');
            const quick = snapshotDb.pragma('quick_check', { simple: true });
            if (quick !== 'ok') {
                throw new Error(`Snapshot check failed: ${quick}`);
            }
        } finally {
            snapshotDb.close();
        }

        fs.chmodSync(partialPath, 0o600);
        fs.renameSync(partialPath, finalPath);
    } catch (error) {
        removeFileQuietly(partialPath);
        removeFileQuietly(`${partialPath}-journal`);
        throw error;
    }

    const stat = fs.statSync(finalPath);
    return {
        name,
        kind,
        createdAt: parseBackupFileName(name).createdAt.toISOString(),
        size: stat.size
    };
}

// Copy an uploaded or listed file into the backup directory under a temporary
// name, normalise its header and validate it before it gets a listed name.
export function importBackupFile(dir, tempPath, { verifyKey, date = new Date() } = {}) {
    normalizeJournalHeader(tempPath);
    const info = inspectBackupFile(tempPath, { verifyKey });
    const name = buildBackupFileName('upload', date);
    const finalPath = path.join(dir, name);
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, finalPath);
    const stat = fs.statSync(finalPath);
    return {
        entry: { name, kind: 'upload', createdAt: parseBackupFileName(name).createdAt.toISOString(), size: stat.size },
        info
    };
}

export function getPendingRestore(dir) {
    const marker = readJsonFile(path.join(dir, PENDING_RESTORE_MARKER));
    if (!marker || !fs.existsSync(path.join(dir, PENDING_RESTORE_FILE))) {
        return null;
    }
    return marker;
}

export function getLastRestoreResult(dir) {
    return readJsonFile(path.join(dir, LAST_RESTORE_FILE));
}

export function cancelPendingRestore(dir) {
    const existed = Boolean(getPendingRestore(dir));
    removeFileQuietly(path.join(dir, PENDING_RESTORE_MARKER));
    removeFileQuietly(path.join(dir, PENDING_RESTORE_FILE));
    return existed;
}

// Stage a listed backup for restore. The live database is untouched; the
// copy is applied by applyStagedRestore() on the next start. The marker is
// written last and acts as the commit point.
export function stageRestore(dir, sourceName, { verifyKey, requestedBy = null } = {}) {
    const sourcePath = resolveBackupFile(dir, sourceName);
    if (!sourcePath) {
        throw new BackupValidationError('NOT_FOUND', 'Backup not found');
    }

    cancelPendingRestore(dir);
    const pendingPath = path.join(dir, PENDING_RESTORE_FILE);
    const partialPath = `${pendingPath}.partial`;

    try {
        fs.copyFileSync(sourcePath, partialPath);
        fs.chmodSync(partialPath, 0o600);
        normalizeJournalHeader(partialPath);
        const info = inspectBackupFile(partialPath, { verifyKey });
        fs.renameSync(partialPath, pendingPath);

        const marker = {
            source: sourceName,
            stagedAt: new Date().toISOString(),
            requestedBy,
            sha256: hashFileSync(pendingPath),
            size: fs.statSync(pendingPath).size,
            users: info.users,
            items: info.items
        };
        writeJsonFile(path.join(dir, PENDING_RESTORE_MARKER), marker);
        return marker;
    } catch (error) {
        removeFileQuietly(partialPath);
        removeFileQuietly(pendingPath);
        throw error;
    }
}

function recordRestoreResult(dir, result) {
    try {
        writeJsonFile(path.join(dir, LAST_RESTORE_FILE), result);
    } catch (error) {
        log('error', `Could not record restore result: ${error.message}`);
    }
}

// Runs synchronously at startup, before database.js opens the live database.
// Order: verify staged copy -> safety snapshot of the current database ->
// swap files. Any failure leaves the current database in place.
export function applyStagedRestore({ databasePath, backupDir, verifyKey } = {}) {
    const marker = getPendingRestore(backupDir);
    if (!marker) {
        return null;
    }

    const pendingPath = path.join(backupDir, PENDING_RESTORE_FILE);
    const base = { source: marker.source, stagedAt: marker.stagedAt, requestedBy: marker.requestedBy ?? null };
    const fail = (code, message) => {
        log('error', `Staged restore of ${marker.source} was not applied: ${message}`);
        cancelPendingRestore(backupDir);
        const result = { ...base, status: 'failed', code, error: message, finishedAt: new Date().toISOString() };
        recordRestoreResult(backupDir, result);
        return result;
    };

    try {
        if (hashFileSync(pendingPath) !== marker.sha256) {
            return fail('CHECKSUM_MISMATCH', 'staged file changed after it was verified');
        }
        inspectBackupFile(pendingPath, { verifyKey });
    } catch (error) {
        return fail(error.code || 'CORRUPT', error.message);
    }

    let safetySnapshot = null;
    if (fs.existsSync(databasePath)) {
        const name = buildBackupFileName('prerestore');
        const safetyPath = path.join(backupDir, name);
        try {
            const currentDb = new Database(databasePath, { fileMustExist: true });
            try {
                currentDb.prepare('VACUUM INTO ?').run(safetyPath);
            } finally {
                currentDb.close();
            }
            fs.chmodSync(safetyPath, 0o600);
            safetySnapshot = name;
        } catch (error) {
            removeFileQuietly(safetyPath);
            return fail('SAFETY_SNAPSHOT_FAILED', `safety snapshot of the current database failed: ${error.message}`);
        }
    }

    const swapPath = `${databasePath}.restore-tmp`;
    try {
        fs.copyFileSync(pendingPath, swapPath);
        fs.chmodSync(swapPath, 0o600);
        // A stale WAL from the previous database must never be replayed
        // onto the restored file. The close above already checkpointed it.
        removeFileQuietly(`${databasePath}-wal`);
        removeFileQuietly(`${databasePath}-shm`);
        removeFileQuietly(`${databasePath}-journal`);
        fs.renameSync(swapPath, databasePath);
    } catch (error) {
        removeFileQuietly(swapPath);
        return fail('SWAP_FAILED', `database file could not be replaced: ${error.message}`);
    }

    cancelPendingRestore(backupDir);
    try {
        pruneBackups(backupDir, Number.MAX_SAFE_INTEGER);
    } catch {
        // Retention is advisory here.
    }
    const result = { ...base, status: 'applied', safetySnapshot, finishedAt: new Date().toISOString() };
    recordRestoreResult(backupDir, result);
    log('info', `Restored database from ${marker.source}. Previous database saved as ${safetySnapshot || '(none)'}.`);
    return result;
}
