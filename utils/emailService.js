import { Resend } from 'resend';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError } from './logger.js';

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
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@homeinventory.local';
// Varsayılan gönderen bilgisi
const DEFAULT_FROM = `HomeInventory Team <${SUPPORT_EMAIL}>`;
const EMAIL_LANGUAGE_ENV = process.env.APP_EMAIL_LANGUAGE || process.env.EMAIL_LANGUAGE || 'en';
const EMAIL_FALLBACK_LANGUAGE = 'en';
const EMAIL_LANG_PATTERN = /^[A-Za-z0-9-]{2,20}$/;
const TEMPLATE_TOKEN_PATTERN = /\{\{([A-Za-z0-9_]+)\}\}/g;
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
        subject: '🏠 HomeInventory - 📧 Email Verification Required',
        headerTitle: 'Welcome to HomeInventory',
        headerSubtitle: 'Create a new account or join an existing house',
        greeting: 'Welcome to HomeInventory 👋',
        intro: 'Please verify your email address to activate your account.',
        verifyPrompt: 'Email verification required',
        verifyButton: 'Verify my account',
        warningTitle: 'Important:',
        warningBody: 'Check your spam/junk folder if you cannot find this email.',
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
        footer: '© 2026 HomeInventory'
    },
    welcome: {
        subject: '🏠 Welcome to HomeInventory',
        headerTitle: 'Welcome to HomeInventory',
        headerSubtitle: 'Your account is ready',
        greeting: 'Welcome! 👋',
        intro: 'Your account has been created successfully.',
        houseKeyLabel: 'House Key',
        houseKeyNote: 'Use this key to invite trusted members to your house.',
        featuresTitle: 'What you can do next',
        features: [
            'Add and categorize your items',
            'Invite family members',
            'Track home inventory securely',
            'Switch between multiple houses when needed'
        ],
        support: 'Need help? Contact',
        footer: '© 2026 HomeInventory'
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
        subject: '🔐 HomeInventory Password Reset',
        headerTitle: '🔐 Reset your password',
        greeting: 'Password reset request',
        intro: 'Use the button below to reset your password securely.',
        buttonLabel: 'Reset my password',
        warningTitle: 'Important:',
        warningBody: 'This link expires in 15 minutes. If you did not request this, you can ignore this email.',
        fallback: 'If the button does not work, copy and paste this link into your browser:',
        footer: '© 2026 HomeInventory'
    },
    testEmail: {
        subject: '🧪 HomeInventory Test Email',
        headerTitle: '🧪 Test Email',
        successTitle: 'Email system is working',
        successBody: 'If you received this email, HomeInventory email delivery is configured correctly.',
        sentAtLabel: 'Sent at',
        senderLabel: 'Sender',
        serviceLabel: 'Service',
        footer: '© 2026 HomeInventory'
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
    return typeof value === 'string' && String(value).trim() !== '' && !hasTemplateTokens(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
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

        const localizedPasswordResetFallback = targetLocale?.emails?.passwordReset?.fallback;
        if (
            typeof sanitized.fallback !== 'string' ||
            sanitized.fallback === localizedPasswordResetFallback ||
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

    return sanitized;
}

export function getEmailLanguage() {
    return normalizeEmailLanguage(EMAIL_LANGUAGE_ENV);
}

function getEmailCopy(sectionName, language = EMAIL_LANGUAGE_ENV) {
    const normalizedLanguage = normalizeEmailLanguage(language);
    const baseLocale = readLocaleFile(EMAIL_FALLBACK_LANGUAGE);
    const targetLocale = readLocaleFile(normalizedLanguage);

    const defaultSection = DEFAULT_EMAIL_COPY?.[sectionName] || {};
    const baseSection = mergeEmailDictionaries(defaultSection, baseLocale?.emails?.[sectionName] || {});
    const targetSection = targetLocale?.emails?.[sectionName] || {};
    const mergedSection = mergeEmailDictionaries(baseSection, targetSection);

    return sanitizeEmailCopy(sectionName, mergedSection, {
        defaultSection,
        baseSection,
        targetLocale
    });
}

function fillTemplate(template, variables = {}) {
    let result = String(template || '');
    for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
    return result;
}

/**
 * E-posta gönderim fonksiyonu
 * @param {Object} options - E-posta seçenekleri
 * @param {string} options.to - Alıcı e-posta adresi
 * @param {string} options.subject - E-posta konusu
 * @param {string} options.html - HTML içerik
 * @param {string} [options.text] - Düz metin içerik (opsiyonel)
 * @param {string} [options.from] - Gönderen (varsayılan: HomeInventory Team)
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
 * @param {string} houseKey - Ev anahtarı
 * @param {string} verificationToken - Doğrulama token'ı
 */
export async function sendVerificationEmail(email, houseKey, verificationToken) {
    const verificationUrl = `${PUBLIC_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;
    const copy = getEmailCopy('verification');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
            .content { padding: 30px; }
            .verify-box { background: linear-gradient(135deg, #10b981, #059669); padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; }
            .verify-button { display: inline-block; background: white; color: #059669; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
            .house-key { background: #f0f9ff; border: 2px dashed #6366f1; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .house-key code { font-size: 20px; color: #6366f1; font-weight: bold; letter-spacing: 2px; word-break: break-all; }
            .features { list-style: none; padding: 0; }
            .features li { padding: 10px 0; border-bottom: 1px solid #eee; }
            .features li:last-child { border-bottom: none; }
            .features li::before { content: "✓"; color: #22c55e; margin-right: 10px; font-weight: bold; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; font-size: 14px; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${escapeHtml(copy.headerTitle)}</h1>
                <p>${escapeHtml(copy.headerSubtitle)}</p>
            </div>
            <div class="content">
                <p>${escapeHtml(copy.greeting)}</p>
                <p>${escapeHtml(copy.intro)}</p>
                
                <div class="verify-box">
                    <p style="color: white; margin: 0 0 15px; font-size: 16px;">${escapeHtml(copy.verifyPrompt)}</p>
                    <a href="${verificationUrl}" class="verify-button">${escapeHtml(copy.verifyButton)}</a>
                </div>

                <div class="warning">
                    <strong>${escapeHtml(copy.warningTitle)}</strong> ${escapeHtml(copy.warningBody)}
                </div>
                
                <div class="house-key">
                    <p style="margin: 0 0 10px; color: #6b7280;">${escapeHtml(copy.houseKeyLabel)}</p>
                    <code>${escapeHtml(houseKey)}</code>
                    <p style="margin: 10px 0 0; color: #6b7280; font-size: 12px;">${escapeHtml(copy.houseKeyNote)}</p>
                </div>

                <h3>${escapeHtml(copy.featuresTitle)}</h3>
                <ul class="features">
                    <li>${escapeHtml(copy.features[0])}</li>
                    <li>${escapeHtml(copy.features[1])}</li>
                    <li>${escapeHtml(copy.features[2])}</li>
                    <li>${escapeHtml(copy.features[3])}</li>
                </ul>

                <p style="font-size: 12px; color: #6b7280;">${escapeHtml(copy.fallback)}</p>
                <p style="word-break: break-all; color: #6b7280; font-size: 11px; background: #f3f4f6; padding: 10px; border-radius: 4px;">${verificationUrl}</p>

                <p>${escapeHtml(copy.support)} <a href="mailto:${SUPPORT_EMAIL}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
            </div>
            <div class="footer">
                <p>${escapeHtml(copy.footer)}</p>
            </div>
        </div>
    </body>
    </html>
    `;

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
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
            .content { padding: 30px; }
            .house-key { background: #f0f9ff; border: 2px dashed #6366f1; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .house-key code { font-size: 24px; color: #6366f1; font-weight: bold; letter-spacing: 2px; }
            .features { list-style: none; padding: 0; }
            .features li { padding: 10px 0; border-bottom: 1px solid #eee; }
            .features li:last-child { border-bottom: none; }
            .features li::before { content: "✓"; color: #22c55e; margin-right: 10px; font-weight: bold; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${escapeHtml(copy.headerTitle)}</h1>
                <p>${escapeHtml(copy.headerSubtitle)}</p>
            </div>
            <div class="content">
                <p>${escapeHtml(copy.greeting)}</p>
                <p>${escapeHtml(copy.intro)}</p>
                
                <div class="house-key">
                    <p style="margin: 0 0 10px; color: #6b7280;">${escapeHtml(copy.houseKeyLabel)}</p>
                    <code>${escapeHtml(houseKey)}</code>
                    <p style="margin: 10px 0 0; color: #6b7280; font-size: 12px;">${escapeHtml(copy.houseKeyNote)}</p>
                </div>

                <h3>${escapeHtml(copy.featuresTitle)}</h3>
                <ul class="features">
                    <li>${escapeHtml(copy.features[0])}</li>
                    <li>${escapeHtml(copy.features[1])}</li>
                    <li>${escapeHtml(copy.features[2])}</li>
                    <li>${escapeHtml(copy.features[3])}</li>
                </ul>

                <p>${escapeHtml(copy.support)} <a href="mailto:${SUPPORT_EMAIL}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
            </div>
            <div class="footer">
                <p>${escapeHtml(copy.footer)}</p>
            </div>
        </div>
    </body>
    </html>
    `;

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

    return sendEmail({
        to,
        subject: copy.subject,
        html: `
            <p>${escapeHtml(copy.greeting)}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine1Template, { username: safeRequesterUsername, house: safeHouseName }))}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine2, { username: safeRequesterUsername, house: safeHouseName }))}</p>
        `
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

    return sendEmail({
        to,
        subject: fillTemplate(copy.subjectTemplate, { status: statusLabel, statusLabel }),
        html: `
            <p>${escapeHtml(copy.greeting)}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine1Template, { house: safeHouseName, status: statusLabel, statusLabel }))}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine2, { house: safeHouseName, status: statusLabel, statusLabel }))}</p>
        `
    });
}

export async function sendHouseKickNotification({ to, houseName }) {
    if (!process.env.RESEND_API_KEY) {
        return { success: false, skipped: true };
    }

    const safeHouseName = String(houseName || 'ev').trim();

    const copy = getEmailCopy('houseKick');

    return sendEmail({
        to,
        subject: copy.subject,
        html: `
            <p>${escapeHtml(copy.greeting)}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine1Template, { house: safeHouseName }))}</p>
            <p>${escapeHtml(fillTemplate(copy.bodyLine2, { house: safeHouseName }))}</p>
        `
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
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #ef4444, #f97316); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${escapeHtml(copy.headerTitle)}</h1>
            </div>
            <div class="content">
                <p>${escapeHtml(copy.greeting)}</p>
                <p>${escapeHtml(copy.intro)}</p>
                
                <p style="text-align: center;">
                    <a href="${resetUrl}" class="button">${escapeHtml(copy.buttonLabel)}</a>
                </p>

                <div class="warning">
                    <strong>${escapeHtml(copy.warningTitle)}</strong> ${escapeHtml(copy.warningBody)}
                </div>

                <p>${escapeHtml(copy.fallback)}</p>
                <p style="word-break: break-all; color: #6b7280; font-size: 12px;">${resetUrl}</p>
            </div>
            <div class="footer">
                <p>${escapeHtml(copy.footer)}</p>
            </div>
        </div>
    </body>
    </html>
    `;

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

    return sendEmail({
        to,
        subject: copy.subject,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #22c55e, #16a34a); padding: 30px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; }
                .content { padding: 30px; text-align: center; }
                .success-icon { font-size: 64px; margin: 20px 0; }
                .info-box { background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${escapeHtml(copy.headerTitle)}</h1>
                </div>
                <div class="content">
                    <div class="success-icon">✅</div>
                    <h2>${escapeHtml(copy.successTitle)}</h2>
                    <p>${escapeHtml(copy.successBody)}</p>
                    <div class="info-box">
                        <p><strong>${escapeHtml(copy.sentAtLabel)}:</strong> ${escapeHtml(sentAt)}</p>
                        <p><strong>${escapeHtml(copy.senderLabel)}:</strong> ${escapeHtml(DEFAULT_FROM)}</p>
                        <p><strong>${escapeHtml(copy.serviceLabel)}:</strong> Resend API</p>
                    </div>
                </div>
                <div class="footer">
                    <p>${escapeHtml(copy.footer)}</p>
                </div>
            </div>
        </body>
        </html>
        `
    });
}

export default {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendTestEmail
};
