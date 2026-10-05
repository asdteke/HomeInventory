import path from 'node:path';

export function resolveRuntimePath(configuredPath, fallbackPath) {
    const normalized = String(configuredPath || '').trim();

    if (!normalized) {
        return fallbackPath;
    }

    return path.isAbsolute(normalized)
        ? normalized
        : path.resolve(process.cwd(), normalized);
}

export function getUploadsRoot(repoRoot) {
    return resolveRuntimePath(
        process.env.HOMEINVENTORY_UPLOADS_DIR,
        path.join(repoRoot, 'uploads')
    );
}

export function getDatabasePath(repoRoot) {
    const dataDir = resolveRuntimePath(
        process.env.HOMEINVENTORY_DATA_DIR,
        path.join(repoRoot, 'data')
    );

    return resolveRuntimePath(
        process.env.HOMEINVENTORY_DB_PATH,
        path.join(dataDir, 'inventory.db')
    );
}

// Instance snapshots live next to the database unless BACKUP_DIR points elsewhere.
export function getBackupDir(repoRoot) {
    return resolveRuntimePath(
        process.env.BACKUP_DIR,
        path.join(path.dirname(getDatabasePath(repoRoot)), 'backups')
    );
}
