const SITE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    ''
).trim();
const DEFAULT_BRAND_NAME = 'HomeInventory';

function isIpAddress(siteHost) {
    const host = String(siteHost || '').trim().replace(/^\[|\]$/g, '');
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || (
        host.includes(':') && /^[0-9a-f:]+$/i.test(host)
    );
}

function isLocalOrIpHost(siteHost) {
    const host = String(siteHost || '').trim().toLocaleLowerCase('en-US');
    return !host || host === 'localhost' || host.endsWith('.localhost') || isIpAddress(host);
}

// Runtime branding is intentionally deployment-driven in the v2 release line.
function deriveBrandName() {
    try {
        const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
        if (isLocalOrIpHost(host)) {
            return DEFAULT_BRAND_NAME;
        }

        const [label] = host.split('.');
        const normalized = label.replace(/[-_]+/g, ' ').trim();
        if (!normalized) {
            return DEFAULT_BRAND_NAME;
        }

        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    } catch {
        return DEFAULT_BRAND_NAME;
    }
}

function deriveSupportEmail() {
    try {
        const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
        if (!isLocalOrIpHost(host)) {
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

// Values copied verbatim from .env.example are not real operator details.
const TEMPLATE_PLACEHOLDER_PATTERN = /your-domain|@example\.(?:com|org|net)\b|^Your Company\b|Example Street|^Your competent data protection|^EU-hosted infrastructure;/i;

function configuredValue(value) {
    const text = String(value || '').trim();
    return TEMPLATE_PLACEHOLDER_PATTERN.test(text) ? '' : text;
}

export const BRAND_NAME = String(process.env.APP_BRAND_NAME || deriveBrandName()).trim() || deriveBrandName();
export const BRAND_KEY = String(process.env.APP_BRAND_KEY || 'homeinventory')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '') || 'homeinventory';
export const DATA_CONTROLLER_NAME = configuredValue(process.env.APP_DATA_CONTROLLER_NAME);
export const DATA_CONTROLLER_ADDRESS = configuredValue(process.env.APP_DATA_CONTROLLER_ADDRESS);
export const DPO_EMAIL = configuredValue(process.env.APP_DPO_EMAIL);
export const PRIVACY_TRANSFER_DISCLOSURE = configuredValue(process.env.APP_PRIVACY_TRANSFER_DISCLOSURE);
export const PRIVACY_COMPLAINT_AUTHORITY = configuredValue(process.env.APP_PRIVACY_COMPLAINT_AUTHORITY);
export const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || deriveSupportEmail()).trim() || deriveSupportEmail();
export const DEFAULT_FROM = String(process.env.EMAIL_FROM || `${BRAND_NAME} <${SUPPORT_EMAIL}>`).trim();

function extractEmailAddress(value) {
    const trimmed = String(value || '').trim();
    const angleMatch = trimmed.match(/<([^<>]+)>/);
    return String(angleMatch?.[1] || trimmed).trim().toLowerCase();
}

function isPlaceholderSender(email) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return true;
    }

    return /(^|@)(example\.com|your-domain\.com)$/i.test(email) ||
        /@example\./i.test(email) ||
        /your-domain/i.test(email);
}

export function getEmailDeliveryStatus() {
    const apiKeyConfigured = Boolean(String(process.env.RESEND_API_KEY || '').trim());
    const fromAddress = extractEmailAddress(DEFAULT_FROM);
    const senderConfigured = !isPlaceholderSender(fromAddress);
    const configured = apiKeyConfigured && senderConfigured;

    let message = 'Email delivery is ready.';
    if (!apiKeyConfigured) {
        message = 'RESEND_API_KEY is not set.';
    } else if (!senderConfigured) {
        message = 'EMAIL_FROM must use a verified Resend sender address or domain.';
    }

    return {
        configured,
        apiKeyConfigured,
        senderConfigured,
        from: DEFAULT_FROM,
        fromAddress,
        service: 'Resend API',
        message
    };
}
