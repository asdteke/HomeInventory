function resolveSiteUrl() {
    if (typeof __APP_SITE_URL__ === 'string' && __APP_SITE_URL__.trim()) {
        return __APP_SITE_URL__.trim();
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    return 'http://localhost:5173';
}

function resolveSiteHost(siteUrl) {
    try {
        return new URL(siteUrl).hostname.replace(/^www\./, '');
    } catch {
        return 'localhost';
    }
}

function deriveBrandName(siteHost) {
    if (!siteHost || /(^|\.)localhost$/.test(siteHost)) {
        return 'Inventory';
    }

    if (siteHost === 'envanterim.net.tr') {
        return 'Envanterim';
    }

    const [label] = siteHost.split('.');
    const normalized = label.replace(/[-_]+/g, ' ').trim();
    if (!normalized) {
        return 'Inventory';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const SITE_URL = resolveSiteUrl();
const SITE_HOST = resolveSiteHost(SITE_URL);

export const BRAND_NAME = (
    typeof __APP_BRAND_NAME__ === 'string' && __APP_BRAND_NAME__.trim()
        ? __APP_BRAND_NAME__.trim()
        : deriveBrandName(SITE_HOST)
);

export const BRAND_HOST = SITE_HOST;

export const SUPPORT_EMAIL = (
    typeof __APP_SUPPORT_EMAIL__ === 'string' && __APP_SUPPORT_EMAIL__.trim()
        ? __APP_SUPPORT_EMAIL__.trim()
        : (BRAND_HOST && !/(^|\.)localhost$/.test(BRAND_HOST) ? `support@${BRAND_HOST}` : 'support@example.com')
);
