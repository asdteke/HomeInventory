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
