const DEFAULT_INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

function sanitizeBaseUrl(value) {
    if (!value) return '';
    return String(value).trim().replace(/\/+$/, '');
}

function toAbsoluteUrl(baseUrl, value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!baseUrl) return null;
    return `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export function getIndexNowConfig() {
    const key = (process.env.INDEXNOW_KEY || '').trim();
    const baseUrl = sanitizeBaseUrl(
        process.env.INDEXNOW_BASE_URL || process.env.SITE_URL || 'https://homeinventory.local'
    );
    const endpoint = (process.env.INDEXNOW_ENDPOINT || DEFAULT_INDEXNOW_ENDPOINT).trim();

    if (!key) {
        return {
            enabled: false,
            reason: 'INDEXNOW_KEY is not configured',
            key: '',
            baseUrl,
            endpoint,
            host: '',
            keyLocation: ''
        };
    }

    const keyLocation = (process.env.INDEXNOW_KEY_LOCATION || `${baseUrl}/${key}.txt`).trim();
    const host = new URL(baseUrl).hostname;

    return {
        enabled: true,
        reason: '',
        key,
        baseUrl,
        endpoint,
        host,
        keyLocation
    };
}

export function buildDefaultIndexNowUrls(baseUrl) {
    const root = sanitizeBaseUrl(baseUrl || process.env.INDEXNOW_BASE_URL || 'https://homeinventory.local');
    return [`${root}/`, `${root}/landing`, `${root}/login`, `${root}/register`, `${root}/sitemap.xml`];
}

export async function submitIndexNowUrls(urls) {
    const config = getIndexNowConfig();
    if (!config.enabled) {
        throw new Error(config.reason || 'IndexNow is not configured');
    }

    const normalizedUrls = [...new Set(
        (Array.isArray(urls) ? urls : [])
            .map((url) => toAbsoluteUrl(config.baseUrl, url))
            .filter(Boolean)
    )];

    if (!normalizedUrls.length) {
        throw new Error('No valid URLs provided for IndexNow submission');
    }

    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            host: config.host,
            key: config.key,
            keyLocation: config.keyLocation,
            urlList: normalizedUrls
        })
    });

    const rawBody = await response.text();
    let parsedBody = null;
    try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
        parsedBody = rawBody || null;
    }

    if (!response.ok) {
        const detail = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody || {});
        throw new Error(`IndexNow request failed (${response.status}): ${detail}`);
    }

    return {
        success: true,
        status: response.status,
        submitted: normalizedUrls.length,
        endpoint: config.endpoint,
        response: parsedBody
    };
}

