import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../database.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { getBackupDir } from '../utils/runtimePaths.js';
import { verifyBackupEncryptionKey } from '../utils/backupKeyCheck.js';
import { BackupBusyError, createBackupScheduler } from '../utils/backupScheduler.js';
import {
    BACKUP_SCHEDULES,
    BackupValidationError,
    MAX_BACKUP_KEEP,
    cancelPendingRestore,
    ensureBackupDir,
    getEnvBackupDefaults,
    getLastRestoreResult,
    getPendingRestore,
    importBackupFile,
    listBackups,
    resolveBackupFile,
    stageRestore,
    validateBackupSettings
} from '../utils/instanceBackups.js';

// Admin-only instance backups: scheduled SQLite snapshots, download, upload
// and staged restore. Restores are applied on the next server start.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backupDir = getBackupDir(join(__dirname, '..'));
const DEFAULT_UPLOAD_LIMIT_MB = 512;

function getUploadLimitBytes() {
    const parsed = Number.parseInt(String(process.env.BACKUP_UPLOAD_MAX_MB || '').trim(), 10);
    const megabytes = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_LIMIT_MB;
    return megabytes * 1024 * 1024;
}

export const instanceBackupScheduler = createBackupScheduler({ db, backupDir });

export function startInstanceBackupScheduler() {
    try {
        instanceBackupScheduler.start();
    } catch (error) {
        console.error('[backup] Scheduler could not start:', error.message);
    }
}

const router = express.Router();

const backupActionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => String(req.user?.id || req.ip),
    message: { error: 'Too many backup actions. Please wait a few minutes.', code: 'BACKUP_RATE_LIMITED' }
});

router.use(authenticateToken, requireAdmin);

function saveAdminLog(action, details, adminId) {
    try {
        db.prepare(`
            INSERT INTO admin_logs (type, action, details, admin_id, target_id)
            VALUES (?, ?, ?, ?, ?)
        `).run('backup', action, JSON.stringify(details || {}), adminId, null);
    } catch (error) {
        console.error('[backup] Admin log write failed:', error.message);
    }
}

function sendValidationError(res, error) {
    const status = error.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ error: error.message, code: error.code });
}

function buildOverview() {
    const settings = instanceBackupScheduler.getSettings();
    const envDefaults = getEnvBackupDefaults();
    return {
        settings,
        envDefaults: { schedule: envDefaults.schedule, keepLast: envDefaults.keepLast },
        schedules: BACKUP_SCHEDULES,
        maxKeep: MAX_BACKUP_KEEP,
        directory: backupDir,
        status: instanceBackupScheduler.getStatus(),
        running: instanceBackupScheduler.isRunning(),
        nextRunAt: instanceBackupScheduler.getNextRunAt(),
        backups: listBackups(backupDir),
        pendingRestore: getPendingRestore(backupDir),
        lastRestore: getLastRestoreResult(backupDir),
        uploadLimitBytes: getUploadLimitBytes()
    };
}

router.get('/', (req, res) => {
    try {
        return res.json(buildOverview());
    } catch (error) {
        console.error('[backup] Overview failed:', error.message);
        return res.status(500).json({ error: 'Backup overview could not be loaded', code: 'BACKUP_OVERVIEW_FAILED' });
    }
});

router.put('/settings', backupActionLimiter, (req, res) => {
    const settings = validateBackupSettings(req.body);
    if (!settings) {
        return res.status(400).json({ error: 'Invalid backup settings', code: 'INVALID_SETTINGS' });
    }

    try {
        const saved = instanceBackupScheduler.updateSettings(settings);
        saveAdminLog('instance_backup_settings', saved, req.user.id);
        return res.json(buildOverview());
    } catch (error) {
        console.error('[backup] Settings save failed:', error.message);
        return res.status(500).json({ error: 'Backup settings could not be saved', code: 'BACKUP_SETTINGS_FAILED' });
    }
});

router.post('/', backupActionLimiter, async (req, res) => {
    try {
        const entry = await instanceBackupScheduler.runBackup({ kind: 'manual' });
        saveAdminLog('instance_backup_created', { name: entry.name, size: entry.size }, req.user.id);
        return res.status(201).json({ backup: entry, overview: buildOverview() });
    } catch (error) {
        if (error instanceof BackupBusyError) {
            return res.status(409).json({ error: error.message, code: error.code });
        }
        return res.status(500).json({ error: 'Backup failed', code: 'BACKUP_FAILED' });
    }
});

router.post('/upload', backupActionLimiter, async (req, res) => {
    const limit = getUploadLimitBytes();
    const declaredLength = Number.parseInt(String(req.headers['content-length'] || ''), 10);
    if (Number.isInteger(declaredLength) && declaredLength > limit) {
        return res.status(413).json({ error: 'Backup file is too large', code: 'BACKUP_TOO_LARGE' });
    }

    try {
        ensureBackupDir(backupDir);
    } catch (error) {
        return res.status(500).json({ error: 'Backup directory is not writable', code: 'BACKUP_DIR_FAILED' });
    }

    const tempPath = join(backupDir, `.upload-${crypto.randomBytes(8).toString('hex')}.partial`);
    let received = 0;
    const sizeGuard = new Transform({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > limit) {
                const error = new Error('Backup file is too large');
                error.code = 'BACKUP_TOO_LARGE';
                callback(error);
                return;
            }
            callback(null, chunk);
        }
    });

    try {
        await pipeline(req, sizeGuard, fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }));
        if (received === 0) {
            throw new BackupValidationError('NOT_SQLITE', 'Uploaded file is empty');
        }
        const { entry, info } = importBackupFile(backupDir, tempPath, { verifyKey: verifyBackupEncryptionKey });
        saveAdminLog('instance_backup_uploaded', { name: entry.name, size: entry.size }, req.user.id);
        return res.status(201).json({ backup: entry, info, overview: buildOverview() });
    } catch (error) {
        fs.rmSync(tempPath, { force: true });
        if (error?.code === 'BACKUP_TOO_LARGE') {
            // Stop reading the rest of an oversized body.
            res.set('Connection', 'close');
            return res.status(413).json({ error: error.message, code: error.code });
        }
        if (error instanceof BackupValidationError) {
            return sendValidationError(res, error);
        }
        console.error('[backup] Upload failed:', error.message);
        return res.status(500).json({ error: 'Backup upload failed', code: 'BACKUP_UPLOAD_FAILED' });
    }
});

router.get('/:name/download', (req, res) => {
    const filePath = resolveBackupFile(backupDir, req.params.name);
    if (!filePath) {
        return res.status(404).json({ error: 'Backup not found', code: 'NOT_FOUND' });
    }

    saveAdminLog('instance_backup_downloaded', { name: req.params.name }, req.user.id);
    res.setHeader('Cache-Control', 'no-store');
    return res.download(filePath, req.params.name, {
        headers: { 'Content-Type': 'application/vnd.sqlite3' }
    });
});

router.delete('/restore/pending', backupActionLimiter, (req, res) => {
    const cancelled = cancelPendingRestore(backupDir);
    if (cancelled) {
        saveAdminLog('instance_backup_restore_cancelled', {}, req.user.id);
    }
    return res.json({ cancelled, overview: buildOverview() });
});

router.post('/:name/restore', backupActionLimiter, (req, res) => {
    const { name } = req.params;
    if (req.body?.confirm !== name) {
        return res.status(400).json({ error: 'Restore confirmation does not match the selected backup', code: 'CONFIRMATION_REQUIRED' });
    }

    try {
        const pending = stageRestore(backupDir, name, {
            verifyKey: verifyBackupEncryptionKey,
            requestedBy: req.user.username || null
        });
        saveAdminLog('instance_backup_restore_staged', { name }, req.user.id);
        return res.json({ pendingRestore: pending, restartRequired: true, overview: buildOverview() });
    } catch (error) {
        if (error instanceof BackupValidationError) {
            return sendValidationError(res, error);
        }
        console.error('[backup] Restore staging failed:', error.message);
        return res.status(500).json({ error: 'Restore could not be prepared', code: 'RESTORE_STAGE_FAILED' });
    }
});

router.delete('/:name', backupActionLimiter, (req, res) => {
    const filePath = resolveBackupFile(backupDir, req.params.name);
    if (!filePath) {
        return res.status(404).json({ error: 'Backup not found', code: 'NOT_FOUND' });
    }

    try {
        fs.unlinkSync(filePath);
        saveAdminLog('instance_backup_deleted', { name: req.params.name }, req.user.id);
        return res.json({ deleted: req.params.name, overview: buildOverview() });
    } catch (error) {
        console.error('[backup] Delete failed:', error.message);
        return res.status(500).json({ error: 'Backup could not be deleted', code: 'BACKUP_DELETE_FAILED' });
    }
});

export default router;
