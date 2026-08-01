declare const __APP_SITE_URL__: string | undefined;
declare const __APP_BRAND_KEY__: string | undefined;
declare const __APP_BRAND_NAME__: string | undefined;
declare const __APP_DATA_CONTROLLER_NAME__: string | undefined;
declare const __APP_DATA_CONTROLLER_ADDRESS__: string | undefined;
declare const __APP_DPO_EMAIL__: string | undefined;
declare const __APP_PRIVACY_TRANSFER_DISCLOSURE__: string | undefined;
declare const __APP_PRIVACY_COMPLAINT_AUTHORITY__: string | undefined;
declare const __APP_SUPPORT_EMAIL__: string | undefined;
declare const __APP_VERSION__: string | undefined;
declare const __APP_ASSET_VERSION__: string | undefined;
declare const __APP_QR_LOGO_PATH__: string | undefined;
declare const __APP_BRAND_LOGO_SYMBOL_LIGHT__: string | undefined;

function resolveSiteUrl(): string {
    if (typeof __APP_SITE_URL__ === 'string' && __APP_SITE_URL__.trim()) {
        return __APP_SITE_URL__.trim();
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    return 'http://localhost:5173';
}

function resolveSiteHost(siteUrl: string): string {
    try {
        return new URL(siteUrl).hostname.replace(/^www\./, '');
    } catch {
        return 'localhost';
    }
}

function isIpAddress(siteHost: string): boolean {
    const host = String(siteHost || '').trim().replace(/^\[|\]$/g, '');
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || (
        host.includes(':') && /^[0-9a-f:]+$/i.test(host)
    );
}

function isLocalOrIpHost(siteHost: string): boolean {
    const host = String(siteHost || '').trim().toLocaleLowerCase('en-US');
    return !host || host === 'localhost' || host.endsWith('.localhost') || isIpAddress(host);
}

function deriveBrandName(siteHost: string): string {
    if (isLocalOrIpHost(siteHost)) {
        return 'HomeInventory';
    }

    const [label] = siteHost.split('.');
    const normalized = label.replace(/[-_]+/g, ' ').trim();
    if (!normalized) {
        return 'HomeInventory';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeBrandKey(value: any): string {
    const normalized = String(value || '')
        .trim()
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/g, '');

    return normalized || 'homeinventory';
}

export const SITE_URL = resolveSiteUrl();
const SITE_HOST = resolveSiteHost(SITE_URL);
const FALLBACK_APP_VERSION = '2.6.0';
const CONFIGURED_BRAND_KEY = (
    typeof __APP_BRAND_KEY__ === 'string' && __APP_BRAND_KEY__.trim()
        ? normalizeBrandKey(__APP_BRAND_KEY__)
        : ''
);

export const BRAND_NAME = (
    typeof __APP_BRAND_NAME__ === 'string' && __APP_BRAND_NAME__.trim()
        ? __APP_BRAND_NAME__.trim()
        : deriveBrandName(SITE_HOST)
);

export const BRAND_HOST = SITE_HOST;
export const BRAND_KEY = CONFIGURED_BRAND_KEY || 'homeinventory';
export const ASSET_VERSION = (
    typeof __APP_ASSET_VERSION__ === 'string' && __APP_ASSET_VERSION__.trim()
        ? __APP_ASSET_VERSION__.trim()
        : '20260519-pwa-assets'
);
export const QR_LOGO_PATH = (
    typeof __APP_QR_LOGO_PATH__ === 'string' && __APP_QR_LOGO_PATH__.trim()
        ? __APP_QR_LOGO_PATH__.trim()
        : typeof __APP_BRAND_LOGO_SYMBOL_LIGHT__ === 'string' && __APP_BRAND_LOGO_SYMBOL_LIGHT__.trim()
            ? __APP_BRAND_LOGO_SYMBOL_LIGHT__.trim()
            : '/brand/logo-symbol-light.svg'
);

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
    typeof __APP_SUPPORT_EMAIL__ === 'string' && __APP_SUPPORT_EMAIL__.trim()
        ? __APP_SUPPORT_EMAIL__.trim()
        : ''
);

export const PROJECT_REPOSITORY_URL = 'https://github.com/asdteke/HomeInventory';
export const SUPPORT_CONTACT_URL = SUPPORT_EMAIL
    ? `mailto:${SUPPORT_EMAIL}`
    : PROJECT_REPOSITORY_URL;
export const SUPPORT_CONTACT_LABEL = SUPPORT_EMAIL || 'GitHub · asdteke/HomeInventory';

export const APP_VERSION = (
    typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim()
        ? __APP_VERSION__.trim()
        : FALLBACK_APP_VERSION
);
