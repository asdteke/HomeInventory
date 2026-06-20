import axios from 'axios';

// In-memory SWR (Stale-While-Revalidate) Cache for GET requests
const cache: Record<string, { data: any; timestamp: number }> = {};
const inFlightRequests: Record<string, Promise<any>> = {};
const cacheVersions: Record<string, number> = {};

function regexMatches(regex: RegExp, value: string): boolean {
    regex.lastIndex = 0;
    return regex.test(value);
}

/**
 * Checks if a URL is currently cached.
 */
export function hasCache(url: string): boolean {
    return !!cache[url];
}

/**
 * Retrieves the cached data for a URL if present.
 */
export function getCachedData(url: string): any | null {
    return cache[url]?.data || null;
}

/**
 * Fetches data with SWR cache:
 * 1. Invokes the `onUpdate` callback immediately if a cached version exists.
 * 2. Fetches fresh data from the server in the background.
 * 3. Compares the fresh data with the cache.
 * 4. Updates the cache and calls `onUpdate` again if the data is different or was missing.
 */
export async function fetchWithCache(
    url: string,
    onUpdate: (data: any) => void,
    onError?: (err: any) => void
): Promise<any> {
    const cached = cache[url];
    const requestVersion = cacheVersions[url] || 0;
    if (cached) {
        onUpdate(cached.data);
    }

    if (!inFlightRequests[url]) {
        const request = axios.get(url)
            .then((response) => response.data)
            .finally(() => {
                if (inFlightRequests[url] === request) {
                    delete inFlightRequests[url];
                }
            });
        inFlightRequests[url] = request;
    }

    try {
        const freshData = await inFlightRequests[url];
        if ((cacheVersions[url] || 0) !== requestVersion) {
            return freshData;
        }

        const latestCached = cache[url];

        const isDifferent = !latestCached || JSON.stringify(latestCached.data) !== JSON.stringify(freshData);

        cache[url] = {
            data: freshData,
            timestamp: Date.now()
        };

        if (isDifferent || !cached) {
            onUpdate(freshData);
        }

        return freshData;
    } catch (error) {
        if (onError) {
            onError(error);
        }
        throw error;
    }
}

/**
 * Invalidates cache entries matching the specified pattern or clears all entries.
 */
export function invalidateCache(urlPattern?: string | RegExp): void {
    if (!urlPattern) {
        const keys = new Set([
            ...Object.keys(cache),
            ...Object.keys(inFlightRequests),
            ...Object.keys(cacheVersions)
        ]);
        for (const key in cache) {
            delete cache[key];
        }
        for (const key in inFlightRequests) {
            delete inFlightRequests[key];
        }
        for (const key of keys) {
            cacheVersions[key] = (cacheVersions[key] || 0) + 1;
        }
        return;
    }

    const regex = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;
    for (const key in cache) {
        if (regexMatches(regex, key)) {
            delete cache[key];
            cacheVersions[key] = (cacheVersions[key] || 0) + 1;
        }
    }
    for (const key in inFlightRequests) {
        if (regexMatches(regex, key)) {
            delete inFlightRequests[key];
            cacheVersions[key] = (cacheVersions[key] || 0) + 1;
        }
    }
}
