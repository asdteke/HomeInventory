const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    ''
).trim();

// Runtime branding is intentionally deployment-driven in the v2 release line.
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
const IS_ENVANTERIM_BRAND = BRAND_HOST === 'envanterim.net.tr' || BRAND_NAME.trim().toLocaleLowerCase('tr-TR') === 'envanterim';
export const DATA_CONTROLLER_NAME = String(process.env.APP_DATA_CONTROLLER_NAME || '').trim();
export const DATA_CONTROLLER_ADDRESS = String(process.env.APP_DATA_CONTROLLER_ADDRESS || '').trim();
export const DPO_EMAIL = String(process.env.APP_DPO_EMAIL || '').trim();
export const PRIVACY_TRANSFER_DISCLOSURE = String(process.env.APP_PRIVACY_TRANSFER_DISCLOSURE || '').trim();
export const PRIVACY_COMPLAINT_AUTHORITY = String(process.env.APP_PRIVACY_COMPLAINT_AUTHORITY || '').trim();
export const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || (IS_ENVANTERIM_BRAND ? 'destek@envanterim.net.tr' : deriveSupportEmail())).trim() || deriveSupportEmail();
export const DEFAULT_FROM = String(process.env.EMAIL_FROM || `${BRAND_NAME} <${SUPPORT_EMAIL}>`).trim();
