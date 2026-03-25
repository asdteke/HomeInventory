import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export function normalizeStoredPath(storedPath) {
    if (!storedPath) {
        return null;
    }

    return String(storedPath)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\/+/, '');
}

export function resolveStoredMediaPath(storedPath, {
    repoRoot,
    mediaRoot,
    allowedPrefixes = []
} = {}) {
    const normalized = normalizeStoredPath(storedPath);
    if (!normalized) {
        return null;
    }

    const matchesKnownPrefix = allowedPrefixes.some((prefix) => (
        normalized === prefix || normalized.startsWith(`${prefix}/`)
    ));

    if (!matchesKnownPrefix) {
        return null;
    }

    const resolvedRepoRoot = path.resolve(String(repoRoot || '.'));
    const resolvedMediaRoot = path.resolve(String(mediaRoot || '.'));
    const resolvedPath = path.resolve(resolvedRepoRoot, normalized);
    const relativeToMediaRoot = path.relative(resolvedMediaRoot, resolvedPath);

    if (
        relativeToMediaRoot === '' ||
        relativeToMediaRoot.startsWith('..') ||
        path.isAbsolute(relativeToMediaRoot)
    ) {
        return null;
    }

    return resolvedPath;
}

export function ensurePrivateDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, {
            recursive: true,
            mode: PRIVATE_DIRECTORY_MODE
        });
    }

    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(directoryPath, PRIVATE_DIRECTORY_MODE);
        } catch {
            // Best-effort hardening; some environments manage permissions externally.
        }
    }
}

export function writePrivateFile(filePath, contents, encoding = 'utf8') {
    fs.writeFileSync(filePath, contents, {
        encoding,
        mode: PRIVATE_FILE_MODE
    });

    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(filePath, PRIVATE_FILE_MODE);
        } catch {
            // Best-effort hardening; some environments manage permissions externally.
        }
    }
}
