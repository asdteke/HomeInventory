import { readFileSync } from 'node:fs';

// Admin-only "new version available" check for self-hosted installs.
// Nothing is requested at startup: the first request happens when an admin
// opens the admin panel, and the answer is cached in memory. UPDATE_CHECK=false
// disables the outbound request entirely (the desktop launcher sets it because
// it ships its own updater).

export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/asdteke/HomeInventory/releases/latest';
const RELEASE_PAGE_BASE_URL = 'https://github.com/asdteke/HomeInventory/releases';

export const UPDATE_CHECK_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// Failed lookups (offline, rate limited) are retried sooner, but not on every page view.
export const UPDATE_CHECK_FAILURE_TTL_MS = 30 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 5000;

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const APP_VERSION = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

export function parseVersion(value) {
    const match = String(value ?? '').trim().match(SEMVER_PATTERN);
    if (!match) {
        return null;
    }

    return {
        version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}${match[4] ? `-${match[4]}` : ''}`,
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] ? match[4].split('.') : []
    };
}

function comparePrereleaseIdentifiers(left, right) {
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
        return Math.sign(Number(left) - Number(right));
    }
    if (leftNumeric !== rightNumeric) {
        return leftNumeric ? -1 : 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
}

// Semantic Versioning 2.0.0 precedence: returns -1, 0 or 1, or null when either
// side is not a valid version.
export function compareVersions(left, right) {
    const a = typeof left === 'string' ? parseVersion(left) : left;
    const b = typeof right === 'string' ? parseVersion(right) : right;
    if (!a || !b) {
        return null;
    }

    for (let index = 0; index < 3; index += 1) {
        if (a.core[index] !== b.core[index]) {
            return a.core[index] < b.core[index] ? -1 : 1;
        }
    }

    // A version without a pre-release tag ranks above one with it (2.8.0 > 2.8.0-rc.1).
    if (!a.prerelease.length || !b.prerelease.length) {
        return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
    }

    const length = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        if (a.prerelease[index] === undefined) return -1;
        if (b.prerelease[index] === undefined) return 1;
        const result = comparePrereleaseIdentifiers(a.prerelease[index], b.prerelease[index]);
        if (result !== 0) {
            return result;
        }
    }
    return 0;
}

export function isUpdateCheckEnabled(env = process.env) {
    const value = String(env.UPDATE_CHECK ?? '').trim().toLowerCase();
    return !['false', '0', 'no', 'off', 'disabled'].includes(value);
}

function buildStatus(currentVersion, overrides = {}) {
    return {
        status: 'unknown',
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        updateAvailable: false,
        checkedAt: null,
        ...overrides
    };
}

export function createUpdateChecker({
    currentVersion = APP_VERSION,
    env = process.env,
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
    timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
    logger = console
} = {}) {
    let cached = null;
    let cachedUntil = 0;
    let inFlight = null;

    async function fetchLatestRelease() {
        const response = await fetchImpl(LATEST_RELEASE_API_URL, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': `HomeInventory/${currentVersion}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
            throw new Error(`GitHub responded with HTTP ${response.status}`);
        }

        const release = await response.json();
        // /releases/latest already skips drafts and pre-releases; double-check anyway.
        if (!release || release.draft || release.prerelease) {
            throw new Error('Latest release is a draft or pre-release');
        }

        const latest = parseVersion(release.tag_name);
        if (!latest || latest.prerelease.length) {
            throw new Error('Latest release tag is not a stable version');
        }

        return { ...latest, tag: String(release.tag_name).trim() };
    }

    async function refresh() {
        const checkedAt = new Date(now()).toISOString();
        try {
            const latest = await fetchLatestRelease();
            const current = parseVersion(currentVersion);
            const comparison = current ? compareVersions(current, latest) : null;
            cached = buildStatus(currentVersion, {
                status: 'ok',
                latestVersion: latest.version,
                // Built from the tag rather than taken from the response, so the
                // admin panel only ever links to this repository's release page.
                releaseUrl: `${RELEASE_PAGE_BASE_URL}/tag/${encodeURIComponent(latest.tag)}`,
                updateAvailable: comparison === -1,
                checkedAt
            });
            cachedUntil = now() + UPDATE_CHECK_CACHE_TTL_MS;
        } catch (error) {
            logger?.warn?.(`[UpdateCheck] Could not check for a newer release: ${error?.message || error}`);
            cached = buildStatus(currentVersion, { checkedAt });
            cachedUntil = now() + UPDATE_CHECK_FAILURE_TTL_MS;
        }
        return cached;
    }

    async function getStatus() {
        if (!isUpdateCheckEnabled(env)) {
            return buildStatus(currentVersion, { status: 'disabled' });
        }

        if (cached && now() < cachedUntil) {
            return cached;
        }

        // Concurrent admin requests share one outbound call.
        if (!inFlight) {
            inFlight = refresh().finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    }

    return { getStatus };
}

export const updateChecker = createUpdateChecker();
