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

export const SITE_URL = resolveSiteUrl();
const SITE_HOST = resolveSiteHost(SITE_URL);
const FALLBACK_APP_VERSION = '2.0.1';

export const BRAND_NAME = (
    typeof __APP_BRAND_NAME__ === 'string' && __APP_BRAND_NAME__.trim()
        ? __APP_BRAND_NAME__.trim()
        : deriveBrandName(SITE_HOST)
);

export const BRAND_HOST = SITE_HOST;
export const BRAND_KEY = (
    BRAND_HOST === 'envanterim.net.tr' ||
    BRAND_HOST === 'www.envanterim.net.tr' ||
    BRAND_NAME.toLocaleLowerCase('tr-TR') === 'envanterim'
) ? 'envanterim' : 'homeinventory';

export const DATA_CONTROLLER_NAME = (
    typeof __APP_DATA_CONTROLLER_NAME__ === 'string' && __APP_DATA_CONTROLLER_NAME__.trim()
        ? __APP_DATA_CONTROLLER_NAME__.trim()
        : ''
);

export const DATA_CONTROLLER_ADDRESS = (
    typeof __APP_DATA_CONTROLLER_ADDRESS__ === 'string' && __APP_DATA_CONTROLLER_ADDRESS__.trim()
        ? __APP_DATA_CONTROLLER_ADDRESS__.trim()
        : ''
);

export const DPO_EMAIL = (
    typeof __APP_DPO_EMAIL__ === 'string' && __APP_DPO_EMAIL__.trim()
        ? __APP_DPO_EMAIL__.trim()
        : ''
);

export const PRIVACY_TRANSFER_DISCLOSURE = (
    typeof __APP_PRIVACY_TRANSFER_DISCLOSURE__ === 'string' && __APP_PRIVACY_TRANSFER_DISCLOSURE__.trim()
        ? __APP_PRIVACY_TRANSFER_DISCLOSURE__.trim()
        : ''
);

export const PRIVACY_COMPLAINT_AUTHORITY = (
    typeof __APP_PRIVACY_COMPLAINT_AUTHORITY__ === 'string' && __APP_PRIVACY_COMPLAINT_AUTHORITY__.trim()
        ? __APP_PRIVACY_COMPLAINT_AUTHORITY__.trim()
        : ''
);

export const SUPPORT_EMAIL = (
    BRAND_KEY === 'envanterim'
        ? 'destek@envanterim.net.tr'
        : typeof __APP_SUPPORT_EMAIL__ === 'string' && __APP_SUPPORT_EMAIL__.trim()
            ? __APP_SUPPORT_EMAIL__.trim()
        : (BRAND_HOST && !/(^|\.)localhost$/.test(BRAND_HOST) ? `support@${BRAND_HOST}` : 'support@example.com')
);

export const APP_VERSION = (
    typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim()
        ? __APP_VERSION__.trim()
        : FALLBACK_APP_VERSION
);
