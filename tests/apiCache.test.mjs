import test from 'node:test';
import assert from 'node:assert/strict';
import axios from '../client/node_modules/axios/index.js';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, resolve, reject };
}

test('fetchWithCache preserves a newer in-flight request when an invalidated request settles', async () => {
    const apiCache = await import('../client/src/utils/apiCache.ts');
    apiCache.invalidateCache();

    const originalGet = axios.get;
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const calls = [];

    axios.get = (url) => {
        calls.push(url);
        if (calls.length === 1) {
            return firstRequest.promise;
        }
        if (calls.length === 2) {
            return secondRequest.promise;
        }
        throw new Error(`Unexpected duplicate request for ${url}`);
    };

    try {
        const firstUpdates = [];
        const firstFetch = apiCache.fetchWithCache('/api/demo', (data) => {
            firstUpdates.push(data);
        });

        apiCache.invalidateCache('/api/demo');

        const secondUpdates = [];
        const secondFetch = apiCache.fetchWithCache('/api/demo', (data) => {
            secondUpdates.push(data);
        });

        firstRequest.resolve({ data: { version: 'stale' } });
        await firstFetch;

        const thirdUpdates = [];
        const thirdFetch = apiCache.fetchWithCache('/api/demo', (data) => {
            thirdUpdates.push(data);
        });

        assert.equal(calls.length, 2);

        secondRequest.resolve({ data: { version: 'fresh' } });
        await Promise.all([secondFetch, thirdFetch]);

        assert.deepEqual(firstUpdates, []);
        assert.deepEqual(secondUpdates, [{ version: 'fresh' }]);
        assert.deepEqual(thirdUpdates, [{ version: 'fresh' }]);
        assert.deepEqual(apiCache.getCachedData('/api/demo'), { version: 'fresh' });
    } finally {
        axios.get = originalGet;
        apiCache.invalidateCache();
    }
});

test('invalidateCache applies global regular expressions to every matching URL', async () => {
    const apiCache = await import('../client/src/utils/apiCache.ts');
    apiCache.invalidateCache();

    const originalGet = axios.get;
    axios.get = async (url) => ({ data: { url } });

    try {
        await apiCache.fetchWithCache('/api/items?page=1', () => {});
        await apiCache.fetchWithCache('/api/items?page=2', () => {});

        apiCache.invalidateCache(/^\/api\/items/g);

        assert.equal(apiCache.hasCache('/api/items?page=1'), false);
        assert.equal(apiCache.hasCache('/api/items?page=2'), false);
    } finally {
        axios.get = originalGet;
        apiCache.invalidateCache();
    }
});
