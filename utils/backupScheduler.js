import {
    BACKUP_INTERVAL_MS,
    createSnapshot,
    listBackups,
    loadBackupSettings,
    pruneBackups,
    readBackupStatus,
    saveBackupSettings,
    writeBackupStatus
} from './instanceBackups.js';
import { formatScopedLog } from './devConsole.js';

// Timer-driven automatic snapshots. One timer at a time, always unref'd so it
// never keeps the process alive, and every failure is logged instead of thrown.

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 60 * 1000;

export class BackupBusyError extends Error {
    constructor() {
        super('A backup is already running');
        this.code = 'BACKUP_BUSY';
    }
}

export function getStartupDelayMs(env = process.env) {
    const parsed = Number.parseInt(String(env.BACKUP_STARTUP_DELAY_SECONDS ?? '').trim(), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed * 1000 : DEFAULT_STARTUP_DELAY_MS;
}

export function createBackupScheduler({
    db,
    backupDir,
    env = process.env,
    logger = console,
    now = () => Date.now()
}) {
    let timer = null;
    let nextRunAt = null;
    let running = null;
    let started = false;

    const log = (level, message) => {
        try {
            logger[level](formatScopedLog('backup', message));
        } catch {
            // Logging must never break the scheduler.
        }
    };

    const getSettings = () => loadBackupSettings(backupDir, env);

    const getLatestSnapshotTime = () => {
        const latest = listBackups(backupDir).find((entry) => entry.kind === 'auto' || entry.kind === 'manual');
        return latest ? Date.parse(latest.createdAt) : null;
    };

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        nextRunAt = null;
    };

    const scheduleIn = (delayMs) => {
        clearTimer();
        const delay = Math.min(Math.max(0, delayMs), MAX_TIMER_DELAY_MS);
        nextRunAt = now() + delay;
        timer = setTimeout(() => {
            timer = null;
            nextRunAt = null;
            runScheduled();
        }, delay);
        timer.unref?.();
    };

    const runBackup = async ({ kind = 'manual' } = {}) => {
        if (running) {
            throw new BackupBusyError();
        }

        const settings = getSettings();
        const startedAt = new Date(now());
        running = (async () => {
            try {
                const entry = await createSnapshot(db, backupDir, { kind, date: startedAt });
                const pruned = pruneBackups(backupDir, settings.keepLast);
                writeBackupStatus(backupDir, {
                    lastRunAt: startedAt.toISOString(),
                    lastResult: 'success',
                    lastKind: kind,
                    lastFile: entry.name,
                    lastSuccessAt: startedAt.toISOString(),
                    lastError: null
                });
                log('log', `Snapshot ${entry.name} written (${entry.size} bytes)${pruned.length ? `, pruned ${pruned.length}` : ''}.`);
                return entry;
            } catch (error) {
                const previous = readBackupStatus(backupDir);
                try {
                    writeBackupStatus(backupDir, {
                        ...previous,
                        lastRunAt: startedAt.toISOString(),
                        lastResult: 'failed',
                        lastKind: kind,
                        lastError: String(error?.message || error).slice(0, 500)
                    });
                } catch {
                    // The directory itself may be the problem; the log line below still records it.
                }
                log('error', `Snapshot failed: ${error?.message || error}`);
                throw error;
            }
        })();

        try {
            return await running;
        } finally {
            running = null;
        }
    };

    async function runScheduled() {
        const settings = getSettings();
        if (settings.schedule === 'off') {
            return;
        }

        const interval = BACKUP_INTERVAL_MS[settings.schedule];
        try {
            await runBackup({ kind: 'auto' });
            scheduleIn(interval);
        } catch (error) {
            if (error instanceof BackupBusyError) {
                scheduleIn(interval);
                return;
            }
            scheduleIn(Math.min(interval, RETRY_AFTER_FAILURE_MS));
        }
    }

    // Work out the next run from the newest snapshot on disk, so restarts do
    // not reset the cadence. Overdue runs happen after a short startup delay.
    const reschedule = ({ startupDelayMs = getStartupDelayMs(env) } = {}) => {
        clearTimer();
        if (!started) {
            return;
        }

        let settings;
        try {
            settings = getSettings();
        } catch (error) {
            log('error', `Could not read backup settings: ${error.message}`);
            return;
        }
        if (settings.schedule === 'off') {
            return;
        }

        const interval = BACKUP_INTERVAL_MS[settings.schedule];
        let latest = null;
        try {
            latest = getLatestSnapshotTime();
        } catch (error) {
            log('error', `Could not list backups: ${error.message}`);
        }
        const dueAt = latest === null ? now() : latest + interval;
        scheduleIn(Math.max(dueAt - now(), startupDelayMs));
    };

    return {
        start(options) {
            started = true;
            reschedule(options);
        },
        stop() {
            started = false;
            clearTimer();
        },
        reschedule,
        runBackup,
        getSettings,
        updateSettings(input) {
            const settings = saveBackupSettings(backupDir, input);
            // An overdue run still waits the startup delay, so a settings
            // change never races an admin's next action.
            reschedule();
            return settings;
        },
        isRunning: () => Boolean(running),
        getNextRunAt: () => (nextRunAt ? new Date(nextRunAt).toISOString() : null),
        getStatus: () => readBackupStatus(backupDir)
    };
}
