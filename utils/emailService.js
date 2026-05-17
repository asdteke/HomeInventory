import { Resend } from 'resend';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError } from './logger.js';
import { BRAND_HOST, BRAND_NAME, DEFAULT_FROM, SUPPORT_EMAIL } from './branding.js';

// Resend API istemcisi - lazy initialization (dotenv yüklendikten sonra çalışır)
let resend = null;
function getResendClient() {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

const PUBLIC_BASE_URL = String(
    process.env.SITE_URL ||
    process.env.INDEXNOW_BASE_URL ||
    'http://localhost:3001'
).trim().replace(/\/+$/, '');
const IS_ENVANTERIM_EMAIL_BRAND = (
    BRAND_HOST === 'envanterim.net.tr' ||
    BRAND_NAME.trim().toLocaleLowerCase('tr-TR') === 'envanterim'
);
const EMAIL_LANGUAGE_ENV = process.env.APP_EMAIL_LANGUAGE ||
    process.env.EMAIL_LANGUAGE ||
    (IS_ENVANTERIM_EMAIL_BRAND ? 'tr' : 'en');
const EMAIL_FALLBACK_LANGUAGE = 'en';
const EMAIL_LANG_PATTERN = /^[A-Za-z0-9-]{2,20}$/;
const TEMPLATE_TOKEN_PATTERN = /\{\{([A-Za-z0-9_]+)\}\}/g;
const SAFE_LITERAL_TEMPLATE_TOKENS = new Set(['brandName', 'supportEmail', 'siteHost']);
const LOCALE_CACHE = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EMAIL_LOCALES_DIR = resolve(__dirname, '../client/public/locales');
const AVAILABLE_EMAIL_LANGUAGES = new Set(
    readdirSync(EMAIL_LOCALES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
);
const DEFAULT_EMAIL_COPY = {
    verification: {
        subject: `🏠 ${BRAND_NAME} - 📧 Email Verification Required`,
        headerTitle: `Welcome to ${BRAND_NAME}`,
        headerSubtitle: 'Create a new account or join an existing house',
        greeting: `Welcome to ${BRAND_NAME} 👋`,
        intro: 'Please verify your email address to activate your account.',
        verifyPrompt: 'Email verification required',
        verifyButton: 'Verify my account',
        warningTitle: 'Security note:',
        warningBody: 'This email only verifies your address. House access details are shown after verification in the app.',
        houseKeyLabel: 'House Key',
        houseKeyNote: 'Keep this key secure. You can share it with family members to join your house.',
        featuresTitle: 'What you can do next',
        features: [
            'Invite family members with your house key',
            'Join an existing house',
            'Create your own house',
            'You can belong to multiple houses and switch between them.'
        ],
        fallback: 'If the button does not work, copy and paste this link into your browser:',
        support: 'Need help? Contact',
        footer: `© 2026 ${BRAND_NAME}`
    },
    welcome: {
        subject: `🏠 Welcome to ${BRAND_NAME}`,
        headerTitle: `Welcome to ${BRAND_NAME}`,
        headerSubtitle: 'Your account is ready',
        greeting: 'Welcome! 👋',
        intro: 'Your account has been created successfully. House access details are available after you sign in.',
        houseKeyLabel: 'House Key',
        houseKeyNote: 'House keys are not sent by email. You can view and share them inside the app.',
        featuresTitle: 'What you can do next',
        features: [
            'Add and categorize your items',
            'Invite family members',
            'Track home inventory securely',
            'Switch between multiple houses when needed'
        ],
        support: 'Need help? Contact',
        footer: `© 2026 ${BRAND_NAME}`
    },
    houseJoinRequest: {
        subject: '🏠 New house join request',
        greeting: 'House access update',
        bodyLine1Template: '{{username}} requested to join "{{house}}".',
        bodyLine2: 'Please review the request in the app.'
    },
    houseJoinDecision: {
        subjectTemplate: '🏠 House request {{statusLabel}}',
        greeting: 'House access update',
        bodyLine1Template: 'Your request for "{{house}}" was {{statusLabel}}.',
        bodyLine2: 'You can open the app to see your latest access status.',
        statusLabels: {
            approved: 'approved',
            rejected: 'rejected',
            updated: 'updated'
        }
    },
    houseKick: {
        subject: '🏠 House access removed',
        greeting: 'House access update',
        bodyLine1Template: 'Your access to "{{house}}" has been removed.',
        bodyLine2: 'You can join another house from the app at any time.'
    },
    passwordReset: {
        subject: `🔐 ${BRAND_NAME} Password Reset`,
        headerTitle: '🔐 Reset your password',
        greeting: 'Password reset request',
        intro: 'Use the button below to reset your password securely.',
        buttonLabel: 'Reset my password',
        warningTitle: 'Important:',
        warningBody: 'This link expires in 15 minutes. If you did not request this, you can ignore this email.',
        fallback: 'If the button does not work, copy and paste this link into your browser:',
        footer: `© 2026 ${BRAND_NAME}`
    },
    testEmail: {
        subject: `🧪 ${BRAND_NAME} Test Email`,
        headerTitle: '🧪 Test Email',
        successTitle: 'Email system is working',
        successBody: `If you received this email, ${BRAND_NAME} email delivery is configured correctly.`,
        sentAtLabel: 'Sent at',
        senderLabel: 'Sender',
        serviceLabel: 'Service',
        footer: `© 2026 ${BRAND_NAME}`
    },
    adminEmail: {
        sentBy: `This email was sent by ${BRAND_NAME}.`,
        footer: `© 2026 ${BRAND_NAME} - ${SUPPORT_EMAIL}`
    }
};

function normalizeEmailLanguage(rawLanguage) {
    const language = String(rawLanguage || '').trim();
    if (!EMAIL_LANG_PATTERN.test(language)) {
        return EMAIL_FALLBACK_LANGUAGE;
    }

    if (!AVAILABLE_EMAIL_LANGUAGES.has(language)) {
        return EMAIL_FALLBACK_LANGUAGE;
    }

    return language;
}

function extractTemplateTokens(template) {
    return new Set(
        Array.from(String(template || '').matchAll(TEMPLATE_TOKEN_PATTERN), (match) => match[1])
    );
}

function templateMatchesRequirements(template, { required = [], allowed = [], oneOf = [] } = {}) {
    const tokens = extractTemplateTokens(template);

    if (required.some((token) => !tokens.has(token))) {
        return false;
    }

    if (oneOf.length > 0 && !oneOf.some((token) => tokens.has(token))) {
        return false;
    }

    if (allowed.length > 0 && Array.from(tokens).some((token) => !allowed.includes(token))) {
        return false;
    }

    return true;
}

function fallbackEmailCopyValue(baseSection, defaultSection, key) {
    return baseSection?.[key] ?? defaultSection?.[key];
}

function hasTemplateTokens(template) {
    return extractTemplateTokens(template).size > 0;
}

function isSafeLiteralString(value) {
    if (typeof value !== 'string' || String(value).trim() === '') {
        return false;
    }

    const templateLikeMatches = Array.from(String(value).matchAll(/\{\{[^}]+\}\}/g), (match) => match[0]);
    const strictTokenMatches = Array.from(String(value).matchAll(TEMPLATE_TOKEN_PATTERN), (match) => match[0]);

    if (templateLikeMatches.length !== strictTokenMatches.length) {
        return false;
    }

    const tokens = extractTemplateTokens(value);
    return Array.from(tokens).every((token) => SAFE_LITERAL_TEMPLATE_TOKENS.has(token));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function getSiteHost() {
    try {
        return new URL(PUBLIC_BASE_URL).hostname.replace(/^www\./, '');
    } catch {
        return 'localhost';
    }
}

const EMAIL_BRAND_KEY = IS_ENVANTERIM_EMAIL_BRAND ? 'envanterim' : 'homeinventory';

const EMAIL_BRAND_THEMES = {
    envanterim: {
        key: 'envanterim',
        name: 'Envanterim',
        logoPath: '/brand/envanterim-logo-full-dark.svg',
        logoWidth: 168,
        logoMobileWidth: 148,
        background: '#eef3fb',
        panel: '#ffffff',
        panelMuted: '#f5f8fd',
        border: '#cad6e7',
        borderStrong: '#b0c1d8',
        text: '#13233d',
        textSoft: '#50627f',
        textMuted: '#70809a',
        accent: '#0f4f99',
        accentStrong: '#0b3d79',
        secondary: '#129e9a',
        secondarySoft: '#e2f6f5',
        heroFrom: '#0b3d79',
        heroTo: '#129e9a',
        shadow: 'rgba(19, 35, 61, 0.14)'
    },
    homeinventory: {
        key: 'homeinventory',
        name: 'HomeInventory',
        logoPath: '/brand/logo-full-dark.png',
        logoWidth: 230,
        logoMobileWidth: 198,
        background: '#f6f2e9',
        panel: '#ffffff',
        panelMuted: '#f8f4ec',
        border: '#d6cfc4',
        borderStrong: '#c4bcb0',
        text: '#1c2920',
        textSoft: '#526150',
        textMuted: '#687364',
        accent: '#2d5241',
        accentStrong: '#234434',
        secondary: '#b89968',
        secondarySoft: '#f1e6d5',
        heroFrom: '#1c2920',
        heroTo: '#4a7d64',
        shadow: 'rgba(28, 41, 32, 0.14)'
    }
};

function getEmailBrandTheme() {
    return EMAIL_BRAND_THEMES[EMAIL_BRAND_KEY] || EMAIL_BRAND_THEMES.homeinventory;
}

function buildPublicAssetUrl(path) {
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    return `${PUBLIC_BASE_URL}${normalizedPath}`;
}

function renderEmailShell({
    eyebrow,
    title,
    subtitle,
    preheader,
    bodyHtml,
    footerHtml,
    tone = 'default'
}) {
    const theme = getEmailBrandTheme();
    const logoUrl = buildPublicAssetUrl(theme.logoPath);
    const siteHost = getSiteHost();
    const safePreheader = escapeHtml(preheader || subtitle || title || BRAND_NAME);
    const safeTitle = escapeHtml(title || BRAND_NAME);
    const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';
    const safeEyebrow = eyebrow ? escapeHtml(eyebrow) : '';
    const safeBrandName = escapeHtml(BRAND_NAME);
    const safeSupportEmail = escapeHtml(SUPPORT_EMAIL);
    const safeSiteHost = escapeHtml(siteHost);
    const safeLogoUrl = escapeAttribute(logoUrl);
    const logoWidth = Number(theme.logoWidth || 168);
    const logoMobileWidth = Number(theme.logoMobileWidth || 148);
    const accent = tone === 'security' ? '#bb4257' : theme.accent;
    const accentStrong = tone === 'security' ? '#8d2f3f' : theme.accentStrong;

    return `<!DOCTYPE html>
<html lang="${escapeAttribute(getEmailLanguage())}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${safeTitle}</title>
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        body { margin: 0; padding: 0; width: 100% !important; background: ${theme.background}; color: ${theme.text}; }
        a { color: ${theme.accent}; }
        .email-root { width: 100%; background: ${theme.background}; padding: 34px 16px; }
        .email-card { width: 100%; max-width: 640px; background: ${theme.panel}; border: 1px solid ${theme.border}; border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px ${theme.shadow}; }
        .email-hero { background: linear-gradient(135deg, ${theme.heroFrom} 0%, ${theme.heroTo} 100%); padding: 28px 30px 30px; }
        .brand-row { width: 100%; }
        .brand-mark { width: ${logoWidth}px; max-width: ${logoWidth}px; height: auto; display: block; }
        .eyebrow { display: inline-block; margin: 28px 0 12px; padding: 7px 12px; border: 1px solid rgba(255,255,255,0.24); border-radius: 999px; color: rgba(255,255,255,0.82); font: 700 12px/1.2 Arial, Helvetica, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
        .hero-title { margin: 0; color: #ffffff; font: 800 30px/1.12 Arial, Helvetica, sans-serif; letter-spacing: -0.02em; }
        .hero-subtitle { margin: 12px 0 0; max-width: 500px; color: rgba(255,255,255,0.84); font: 500 15px/1.6 Arial, Helvetica, sans-serif; }
        .email-content { padding: 32px 30px 26px; font: 400 15px/1.72 Arial, Helvetica, sans-serif; color: ${theme.textSoft}; }
        .email-content p { margin: 0 0 16px; }
        .email-content h2, .email-content h3 { color: ${theme.text}; margin: 0 0 12px; }
        .button-wrap { text-align: center; padding: 8px 0 20px; }
        .button { display: inline-block; background: linear-gradient(135deg, ${accent} 0%, ${accentStrong} 100%); color: #ffffff !important; text-decoration: none; border-radius: 14px; padding: 14px 24px; min-width: 190px; font: 800 15px/1 Arial, Helvetica, sans-serif; box-shadow: 0 14px 30px ${theme.shadow}; }
        .info-card { background: ${theme.panelMuted}; border: 1px solid ${theme.border}; border-radius: 18px; padding: 18px 20px; margin: 22px 0; }
        .label { color: ${theme.textMuted}; font: 800 11px/1.3 Arial, Helvetica, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
        .code-value { display: block; margin-top: 8px; color: ${theme.text}; font: 800 22px/1.2 Arial, Helvetica, sans-serif; letter-spacing: 0.08em; word-break: break-all; }
        .note { margin-top: 8px; color: ${theme.textMuted}; font: 500 13px/1.6 Arial, Helvetica, sans-serif; }
        .feature-list { padding: 0; margin: 14px 0 2px; list-style: none; }
        .feature-list li { margin: 0 0 10px; padding: 12px 14px; border: 1px solid ${theme.border}; border-radius: 14px; background: ${theme.panel}; color: ${theme.textSoft}; }
        .feature-list span { color: ${theme.secondary}; font-weight: 900; margin-right: 8px; }
        .notice { border: 1px solid ${theme.borderStrong}; background: ${theme.secondarySoft}; border-radius: 16px; padding: 15px 17px; margin: 20px 0; color: ${theme.textSoft}; }
        .notice strong { color: ${theme.text}; }
        .fallback-url { word-break: break-all; background: ${theme.panelMuted}; color: ${theme.textMuted}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 12px 14px; font: 500 12px/1.55 Arial, Helvetica, sans-serif; }
        .meta-table { width: 100%; border-collapse: collapse; margin: 18px 0; }
        .meta-table td { padding: 11px 0; border-bottom: 1px solid ${theme.border}; color: ${theme.textSoft}; font: 500 14px/1.5 Arial, Helvetica, sans-serif; }
        .meta-table td:first-child { color: ${theme.textMuted}; width: 38%; }
        .status-pill { display: inline-block; padding: 7px 11px; border-radius: 999px; background: ${theme.secondarySoft}; color: ${theme.accentStrong}; font: 800 12px/1 Arial, Helvetica, sans-serif; }
        .email-footer { padding: 22px 30px 30px; background: ${theme.panelMuted}; border-top: 1px solid ${theme.border}; text-align: center; color: ${theme.textMuted}; font: 500 12px/1.6 Arial, Helvetica, sans-serif; }
        .email-footer p { margin: 0 0 8px; }
        .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; mso-hide: all; }
        @media screen and (max-width: 520px) {
            .email-root { padding: 18px 10px; }
            .email-card { border-radius: 18px; }
            .email-hero, .email-content, .email-footer { padding-left: 20px !important; padding-right: 20px !important; }
            .hero-title { font-size: 25px !important; }
            .brand-mark { width: ${logoMobileWidth}px !important; max-width: ${logoMobileWidth}px !important; }
            .button { display: block !important; min-width: 0 !important; }
        }
    </style>
</head>
<body>
    <div class="preheader">${safePreheader}</div>
    <table role="presentation" class="email-root" cellspacing="0" cellpadding="0" border="0">
        <tr>
            <td align="center">
                <table role="presentation" class="email-card" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td class="email-hero">
                            <table role="presentation" class="brand-row" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="left"><img class="brand-mark" src="${safeLogoUrl}" width="${logoWidth}" alt="${safeBrandName}"></td>
                                </tr>
                            </table>
                            ${safeEyebrow ? `<div class="eyebrow">${safeEyebrow}</div>` : ''}
                            <h1 class="hero-title">${safeTitle}</h1>
                            ${safeSubtitle ? `<p class="hero-subtitle">${safeSubtitle}</p>` : ''}
                        </td>
                    </tr>
                    <tr>
                        <td class="email-content">
                            ${bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td class="email-footer">
                            ${footerHtml || `<p>${safeBrandName}</p><p><a href="mailto:${escapeAttribute(SUPPORT_EMAIL)}">${safeSupportEmail}</a> · ${safeSiteHost}</p>`}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function renderButton(label, url) {
    return `<div class="button-wrap"><a class="button" href="${escapeAttribute(url)}">${escapeHtml(label)}</a></div>`;
}

function renderNotice(title, body) {
    return `<div class="notice"><strong>${escapeHtml(title)}</strong> ${escapeHtml(body)}</div>`;
}

function renderFallbackLink(label, url) {
    return `<p class="note">${escapeHtml(label)}</p><div class="fallback-url">${escapeHtml(url)}</div>`;
}

function renderHouseKeyCard(copy, houseKey) {
    return `<div class="info-card">
        <div class="label">${escapeHtml(copy.houseKeyLabel)}</div>
        <code class="code-value">${escapeHtml(houseKey)}</code>
        <div class="note">${escapeHtml(copy.houseKeyNote)}</div>
    </div>`;
}

function renderFeatureList(title, features = []) {
    return `<h3>${escapeHtml(title)}</h3>
    <ul class="feature-list">
        ${features.map((feature) => `<li><span>✓</span>${escapeHtml(feature)}</li>`).join('')}
    </ul>`;
}

function renderSupportLine(copy) {
    return `<p>${escapeHtml(copy.support)} <a href="mailto:${escapeAttribute(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>`;
}

function renderEmailFooter(copy) {
    const siteHost = getSiteHost();
    return `<p>${escapeHtml(copy?.footer || `© 2026 ${BRAND_NAME}`)}</p>
        <p><a href="mailto:${escapeAttribute(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a> · ${escapeHtml(siteHost)}</p>`;
}

function renderSimpleNotificationEmail({ copy, subjectTitle, lines, statusLabel }) {
    const safeLines = lines.filter(Boolean);
    const bodyHtml = `
        <p>${escapeHtml(copy.greeting)}</p>
        ${statusLabel ? `<p><span class="status-pill">${escapeHtml(statusLabel)}</span></p>` : ''}
        ${safeLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    `;

    return renderEmailShell({
        eyebrow: copy.greeting,
        title: subjectTitle,
        subtitle: '',
        preheader: safeLines[0] || copy.greeting,
        bodyHtml,
        footerHtml: renderEmailFooter({ footer: `© 2026 ${BRAND_NAME}` })
    });
}

export function buildAdminEmailHtml(messageHtml, copy = getAdminEmailCopy()) {
    return renderEmailShell({
        eyebrow: copy.sentBy,
        title: 'Mesaj',
        subtitle: '',
        preheader: copy.sentBy,
        bodyHtml: `<div>${messageHtml}</div>`,
        footerHtml: `<p>${escapeHtml(copy.sentBy)}</p><p>${escapeHtml(copy.footer)}</p>`
    });
}

function readLocaleFile(language) {
    const normalizedLanguage = normalizeEmailLanguage(language);
    const cached = LOCALE_CACHE.get(normalizedLanguage);
    if (cached) {
        return cached;
    }

    const localePath = resolve(EMAIL_LOCALES_DIR, normalizedLanguage, 'translation.json');
    try {
        const parsed = JSON.parse(readFileSync(localePath, 'utf8'));
        LOCALE_CACHE.set(normalizedLanguage, parsed);
        return parsed;
    } catch (error) {
        logError(error, {
            context: 'emailService.readLocaleFile',
            details: { language: normalizedLanguage, localePath }
        });
        return {};
    }
}

function mergeEmailDictionaries(baseDictionary, overrideDictionary) {
    const output = { ...baseDictionary };

    for (const [key, value] of Object.entries(overrideDictionary || {})) {
        if (Array.isArray(value)) {
            output[key] = value;
            continue;
        }

        if (value && typeof value === 'object') {
            output[key] = mergeEmailDictionaries(baseDictionary?.[key] || {}, value);
            continue;
        }

        output[key] = value;
    }

    return output;
}

function sanitizeEmailCopy(sectionName, copy, { defaultSection, baseSection, targetLocale }) {
    const sanitized = { ...copy };
    const fallback = (key) => {
        sanitized[key] = fallbackEmailCopyValue(baseSection, defaultSection, key);
    };
    const fallbackDefault = (key) => {
        sanitized[key] = defaultSection?.[key];
    };
    const ensureLiteral = (key) => {
        if (!isSafeLiteralString(sanitized[key])) {
            fallbackDefault(key);
        }
    };
    const ensureLiteralArray = (key, expectedLength = null) => {
        if (
            !Array.isArray(sanitized[key]) ||
            (expectedLength !== null && sanitized[key].length !== expectedLength) ||
            sanitized[key].some((entry) => !isSafeLiteralString(entry))
        ) {
            fallbackDefault(key);
        }
    };

    if (sectionName === 'verification') {
        ensureLiteralArray('features', defaultSection.features.length);

        if (
            typeof sanitized.fallback !== 'string' ||
            /password reset/i.test(sanitized.fallback) ||
            /şifre sıfırlama/i.test(sanitized.fallback)
        ) {
            fallbackDefault('fallback');
        }

        for (const key of [
            'subject',
            'headerTitle',
            'headerSubtitle',
            'greeting',
            'intro',
            'verifyPrompt',
            'verifyButton',
            'warningTitle',
            'warningBody',
            'houseKeyLabel',
            'houseKeyNote',
            'featuresTitle',
            'fallback',
            'support',
            'footer'
        ]) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'welcome') {
        ensureLiteralArray('features', defaultSection.features.length);

        if (typeof sanitized.intro !== 'string' || /,\s*!\s*(👋)?\s*$/.test(sanitized.intro)) {
            fallbackDefault('intro');
        }

        for (const key of [
            'subject',
            'headerTitle',
            'headerSubtitle',
            'greeting',
            'intro',
            'houseKeyLabel',
            'houseKeyNote',
            'featuresTitle',
            'support',
            'footer'
        ]) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'houseJoinRequest') {
        if (!templateMatchesRequirements(sanitized.bodyLine1Template, {
            required: ['username', 'house'],
            allowed: ['username', 'house']
        })) {
            fallbackDefault('bodyLine1Template');
        }

        for (const key of ['subject', 'greeting', 'bodyLine2']) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'houseJoinDecision') {
        if (!templateMatchesRequirements(sanitized.subjectTemplate, {
            oneOf: ['status', 'statusLabel'],
            allowed: ['status', 'statusLabel']
        })) {
            fallbackDefault('subjectTemplate');
        }

        if (!templateMatchesRequirements(sanitized.bodyLine1Template, {
            required: ['house'],
            oneOf: ['status', 'statusLabel'],
            allowed: ['house', 'status', 'statusLabel']
        })) {
            fallbackDefault('bodyLine1Template');
        }

        if (extractTemplateTokens(sanitized.bodyLine2).size > 0) {
            fallbackDefault('bodyLine2');
        }

        const fallbackStatusLabels = defaultSection.statusLabels;
        if (!sanitized.statusLabels || typeof sanitized.statusLabels !== 'object') {
            sanitized.statusLabels = fallbackStatusLabels;
        } else {
            sanitized.statusLabels = {
                approved: sanitized.statusLabels.approved || fallbackStatusLabels.approved,
                rejected: sanitized.statusLabels.rejected || fallbackStatusLabels.rejected,
                updated: sanitized.statusLabels.updated || fallbackStatusLabels.updated
            };
        }

        if (
            !isSafeLiteralString(sanitized.statusLabels.approved) ||
            !isSafeLiteralString(sanitized.statusLabels.rejected) ||
            !isSafeLiteralString(sanitized.statusLabels.updated)
        ) {
            sanitized.statusLabels = fallbackStatusLabels;
        }

        ensureLiteral('greeting');
        ensureLiteral('bodyLine2');
    }

    if (sectionName === 'houseKick') {
        if (!templateMatchesRequirements(sanitized.bodyLine1Template, {
            required: ['house'],
            allowed: ['house']
        })) {
            fallbackDefault('bodyLine1Template');
        }

        for (const key of ['subject', 'greeting', 'bodyLine2']) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'passwordReset') {
        for (const key of [
            'subject',
            'headerTitle',
            'greeting',
            'intro',
            'buttonLabel',
            'warningTitle',
            'warningBody',
            'fallback',
            'footer'
        ]) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'testEmail') {
        for (const key of [
            'subject',
            'headerTitle',
            'successTitle',
            'successBody',
            'sentAtLabel',
            'senderLabel',
            'serviceLabel',
            'footer'
        ]) {
            ensureLiteral(key);
        }
    }

    if (sectionName === 'adminEmail') {
        for (const key of ['sentBy', 'footer']) {
            ensureLiteral(key);
        }
    }

    return sanitized;
}

export function getEmailLanguage() {
    return normalizeEmailLanguage(EMAIL_LANGUAGE_ENV);
}

export function getAdminEmailCopy(language = EMAIL_LANGUAGE_ENV) {
    return getEmailCopy('adminEmail', language);
}

function getEmailCopy(sectionName, language = EMAIL_LANGUAGE_ENV) {
    const normalizedLanguage = normalizeEmailLanguage(language);
    const baseLocale = readLocaleFile(EMAIL_FALLBACK_LANGUAGE);
    const targetLocale = readLocaleFile(normalizedLanguage);

    const defaultSection = DEFAULT_EMAIL_COPY?.[sectionName] || {};
    const baseSection = mergeEmailDictionaries(defaultSection, baseLocale?.emails?.[sectionName] || {});
    const targetSection = targetLocale?.emails?.[sectionName] || {};
    const mergedSection = mergeEmailDictionaries(baseSection, targetSection);

    return resolveBrandPlaceholders(sanitizeEmailCopy(sectionName, mergedSection, {
        defaultSection,
        baseSection,
        targetLocale
    }));
}

function fillTemplate(template, variables = {}) {
    let result = String(template || '');
    const resolvedVariables = {
        brandName: BRAND_NAME,
        supportEmail: SUPPORT_EMAIL,
        siteHost: getSiteHost(),
        ...variables
    };

    for (const [key, value] of Object.entries(resolvedVariables)) {
        result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
    return result;
}

function resolveBrandPlaceholders(value) {
    if (typeof value === 'string') {
        return fillTemplate(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => resolveBrandPlaceholders(entry));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, resolveBrandPlaceholders(entry)])
        );
    }

    return value;
}

/**
 * E-posta gönderim fonksiyonu
 * @param {Object} options - E-posta seçenekleri
 * @param {string} options.to - Alıcı e-posta adresi
 * @param {string} options.subject - E-posta konusu
 * @param {string} options.html - HTML içerik
 * @param {string} [options.text] - Düz metin içerik (opsiyonel)
 * @param {string} [options.from] - Gönderen (varsayılan: marka destek adresi)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text, from = DEFAULT_FROM }) {
    try {
        // API anahtarı kontrolü
        if (!process.env.RESEND_API_KEY) {
            const errorMsg = 'RESEND_API_KEY ortam değişkeni tanımlı değil!';
            logError(new Error(errorMsg), { context: 'emailService.sendEmail' });
            return {
                success: false,
                error: errorMsg
            };
        }

        console.log(`📧 E-posta gönderiliyor: ${to} - Konu: ${subject}`);

        const client = getResendClient();
        if (!client) {
            throw new Error('Resend istemcisi başlatılamadı');
        }

        const response = await client.emails.send({
            from,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, '') // HTML'den düz metin oluştur
        });

        // Resend API yanıtını kontrol et
        if (response.error) {
            const errorDetails = {
                code: response.error.name,
                message: response.error.message,
                recipient: to,
                subject: subject
            };

            console.error('❌ E-posta gönderilemedi:', errorDetails);
            logError(new Error(response.error.message), {
                context: 'emailService.sendEmail',
                details: errorDetails
            });

            return {
                success: false,
                error: response.error.message,
                details: errorDetails
            };
        }

        console.log(`✅ E-posta başarıyla gönderildi! ID: ${response.data?.id}`);

        return {
            success: true,
            data: response.data
        };

    } catch (error) {
        const errorDetails = {
            message: error.message,
            recipient: to,
            subject: subject,
            stack: error.stack
        };

        console.error('❌ E-posta gönderim hatası:', errorDetails);
        logError(error, {
            context: 'emailService.sendEmail',
            details: errorDetails
        });

        return {
            success: false,
            error: error.message,
            details: errorDetails
        };
    }
}

/**
 * E-posta doğrulama maili gönder (Hoş Geldin + Doğrulama)
 * @param {string} email - Kullanıcı e-posta adresi
 * @param {string} _houseKey - Geriye uyumluluk için tutulur; doğrulama e-postasında gönderilmez.
 * @param {string} verificationToken - Doğrulama token'ı
 */
export async function sendVerificationEmail(email, _houseKey, verificationToken) {
    const verificationUrl = `${PUBLIC_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;
    const copy = getEmailCopy('verification');
    const bodyHtml = `
        <p>${escapeHtml(copy.intro)}</p>
        ${renderButton(copy.verifyButton, verificationUrl)}
        ${renderNotice(copy.warningTitle, copy.warningBody)}
        ${renderFallbackLink(copy.fallback, verificationUrl)}
        ${renderSupportLine(copy)}
    `;

    const html = renderEmailShell({
        eyebrow: copy.greeting,
        title: copy.verifyPrompt,
        subtitle: copy.headerSubtitle,
        preheader: copy.intro,
        bodyHtml,
        footerHtml: renderEmailFooter(copy)
    });

    return sendEmail({
        to: email,
        subject: copy.subject,
        html
    });
}

/**
 * Hoş geldiniz e-postası gönder (doğrulama gerektirmeyen kullanıcılar için)
 * @param {string} email - Kullanıcı e-posta adresi
 * @param {string} houseKey - Ev anahtarı
 */
export async function sendWelcomeEmail(email, houseKey) {
    const copy = getEmailCopy('welcome');
    const bodyHtml = `
        <p>${escapeHtml(copy.intro)}</p>
        ${renderFeatureList(copy.featuresTitle, copy.features)}
        ${renderSupportLine(copy)}
    `;
    const html = renderEmailShell({
        eyebrow: copy.greeting,
        title: copy.headerTitle,
        subtitle: copy.headerSubtitle,
        preheader: copy.intro,
        bodyHtml,
        footerHtml: renderEmailFooter(copy)
    });

    return sendEmail({
        to: email,
        subject: copy.subject,
        html
    });
}

export async function sendHouseJoinRequestNotification({ to, requesterUsername, requestedHouseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(requestedHouseName || 'bir ev').trim();
    const safeRequesterUsername = String(requesterUsername || 'Bir kullanici').trim();

    const copy = getEmailCopy('houseJoinRequest');
    const bodyLine1 = fillTemplate(copy.bodyLine1Template, {
        username: safeRequesterUsername,
        house: safeHouseName
    });
    const bodyLine2 = fillTemplate(copy.bodyLine2, {
        username: safeRequesterUsername,
        house: safeHouseName
    });

    return sendEmail({
        to,
        subject: copy.subject,
        html: renderSimpleNotificationEmail({
            copy,
            subjectTitle: copy.subject,
            lines: [bodyLine1, bodyLine2]
        })
    });
}

export async function sendHouseJoinRequestDecisionNotification({ to, status, requestedHouseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(requestedHouseName || 'ev').trim();
    const statusKey = status === 'approved'
        ? 'approved'
        : status === 'rejected'
            ? 'rejected'
            : 'updated';
    const copy = getEmailCopy('houseJoinDecision');
    const statusLabel = copy?.statusLabels?.[statusKey] || DEFAULT_EMAIL_COPY.houseJoinDecision.statusLabels[statusKey];
    const bodyLine1 = fillTemplate(copy.bodyLine1Template, {
        house: safeHouseName,
        status: statusLabel,
        statusLabel
    });
    const bodyLine2 = fillTemplate(copy.bodyLine2, {
        house: safeHouseName,
        status: statusLabel,
        statusLabel
    });

    return sendEmail({
        to,
        subject: fillTemplate(copy.subjectTemplate, { status: statusLabel, statusLabel }),
        html: renderSimpleNotificationEmail({
            copy,
            subjectTitle: copy.greeting,
            statusLabel,
            lines: [bodyLine1, bodyLine2]
        })
    });
}

export async function sendHouseKickNotification({ to, houseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(houseName || 'ev').trim();

    const copy = getEmailCopy('houseKick');
    const bodyLine1 = fillTemplate(copy.bodyLine1Template, { house: safeHouseName });
    const bodyLine2 = fillTemplate(copy.bodyLine2, { house: safeHouseName });

    return sendEmail({
        to,
        subject: copy.subject,
        html: renderSimpleNotificationEmail({
            copy,
            subjectTitle: copy.subject,
            lines: [bodyLine1, bodyLine2]
        })
    });
}

/**
 * Şifre sıfırlama e-postası gönder
 * @param {Object} options
 * @param {string} options.email - Kullanıcı e-posta adresi
 * @param {string} options.resetUrl - Sıfırlama linki
 */
export async function sendPasswordResetEmail({ email, resetUrl }) {
    const copy = getEmailCopy('passwordReset');
    const bodyHtml = `
        <p>${escapeHtml(copy.greeting)}</p>
        <p>${escapeHtml(copy.intro)}</p>
        ${renderButton(copy.buttonLabel, resetUrl)}
        ${renderNotice(copy.warningTitle, copy.warningBody)}
        ${renderFallbackLink(copy.fallback, resetUrl)}
    `;
    const html = renderEmailShell({
        eyebrow: copy.greeting,
        title: copy.headerTitle,
        subtitle: copy.intro,
        preheader: copy.warningBody,
        bodyHtml,
        footerHtml: renderEmailFooter(copy),
        tone: 'security'
    });

    return sendEmail({
        to: email,
        subject: copy.subject,
        html
    });
}

export async function sendTestEmail(to) {
    const language = getEmailLanguage();
    const copy = getEmailCopy('testEmail', language);
    const sentAt = new Date().toLocaleString(language);
    const bodyHtml = `
        <div class="info-card">
            <div class="label">${escapeHtml(copy.successTitle)}</div>
            <p style="margin-top: 10px;">${escapeHtml(copy.successBody)}</p>
        </div>
        <table role="presentation" class="meta-table" cellspacing="0" cellpadding="0" border="0">
            <tr><td>${escapeHtml(copy.sentAtLabel)}</td><td>${escapeHtml(sentAt)}</td></tr>
            <tr><td>${escapeHtml(copy.senderLabel)}</td><td>${escapeHtml(DEFAULT_FROM)}</td></tr>
            <tr><td>${escapeHtml(copy.serviceLabel)}</td><td>Resend API</td></tr>
        </table>
    `;

    return sendEmail({
        to,
        subject: copy.subject,
        html: renderEmailShell({
            eyebrow: copy.successTitle,
            title: copy.headerTitle,
            subtitle: '',
            preheader: copy.successBody,
            bodyHtml,
            footerHtml: renderEmailFooter(copy)
        })
    });
}

export default {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendTestEmail
};
