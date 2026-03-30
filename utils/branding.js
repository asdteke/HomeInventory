const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    ''
).trim();

function deriveBrandName() {
    try {
        const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
        if (!host || /(^|\.)localhost$/.test(host)) {
            return 'Inventory';
        }

        if (host === 'envanterim.net.tr') {
            return 'Envanterim';
        }

        const [label] = host.split('.');
        const normalized = label.replace(/[-_]+/g, ' ').trim();
        if (!normalized) {
            return 'Inventory';
        }

        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    } catch {
        return 'Inventory';
    }
}

function deriveSupportEmail() {
    try {
        const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
        if (host && !/(^|\.)localhost$/.test(host)) {
            return `support@${host}`;
        }
    } catch {
        // Ignore invalid URL input and fall back to generic placeholder.
    }

    return 'support@example.com';
}

export const BRAND_HOST = (() => {
    try {
        return new URL(SITE_URL).hostname.replace(/^www\./, '');
    } catch {
        return 'localhost';
    }
})();

export const BRAND_NAME = String(process.env.APP_BRAND_NAME || deriveBrandName()).trim() || deriveBrandName();
export const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || deriveSupportEmail()).trim() || deriveSupportEmail();
export const DEFAULT_FROM = String(process.env.EMAIL_FROM || `${BRAND_NAME} <${SUPPORT_EMAIL}>`).trim();
