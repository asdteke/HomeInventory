import axios from 'axios';

// In-memory SWR (Stale-While-Revalidate) Cache for GET requests
const cache: Record<string, { data: any; timestamp: number }> = {};

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
    if (cached) {
        onUpdate(cached.data);
    }

    try {
        const response = await axios.get(url);
        const freshData = response.data;

        const isDifferent = !cached || JSON.stringify(cached.data) !== JSON.stringify(freshData);

        cache[url] = {
            data: freshData,
            timestamp: Date.now()
        };

        if (isDifferent) {
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
        for (const key in cache) {
            delete cache[key];
        }
        return;
    }

    const regex = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;
    for (const key in cache) {
        if (regex.test(key)) {
            delete cache[key];
        }
    }
}
