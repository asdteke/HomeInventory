import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resend } from 'resend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const serviceUrl = pathToFileURL(resolve(repoRoot, 'utils/emailService.js')).href;
const localeRoot = resolve(repoRoot, 'client/public/locales');
const languages = readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

function installEmailStub() {
    const emailsProto = Object.getPrototypeOf(new Resend('dummy').emails);
    const originalSend = emailsProto.send;
    const sent = [];

    emailsProto.send = async function sendStub(payload) {
        sent.push(payload);
        return { data: { id: 'fake-email-id' } };
    };

    return {
        sent,
        restore() {
            emailsProto.send = originalSend;
        }
    };
}

async function loadEmailService(language) {
    process.env.RESEND_API_KEY = 'dummy';
    process.env.SUPPORT_EMAIL = 'support@example.com';
    process.env.SITE_URL = 'http://localhost:4010';
    process.env.APP_EMAIL_LANGUAGE = language;

    return import(`${serviceUrl}?lang=${encodeURIComponent(language)}&t=${Date.now()}`);
}

test('email templates render across all locales without unresolved placeholders', async (t) => {
    const { sent, restore } = installEmailStub();
    const originalConsoleLog = console.log;
    const originalSetInterval = globalThis.setInterval;
    console.log = () => {};
    globalThis.setInterval = () => ({ unref() {} });

    t.after(() => {
        console.log = originalConsoleLog;
        globalThis.setInterval = originalSetInterval;
        restore();
        delete process.env.RESEND_API_KEY;
        delete process.env.SUPPORT_EMAIL;
        delete process.env.SITE_URL;
        delete process.env.APP_EMAIL_LANGUAGE;
    });

    const failures = [];
    for (const language of languages) {
        const svc = await loadEmailService(language);
        const cases = [
            ['verification', () => svc.sendVerificationEmail('user@example.com', 'HOUSE123', 'token123')],
            ['welcome', () => svc.sendWelcomeEmail('user@example.com', 'HOUSE123')],
            ['joinRequest', () => svc.sendHouseJoinRequestNotification({ to: 'user@example.com', requesterUsername: 'Alice', requestedHouseName: 'Blue House' })],
            ['joinDecision', () => svc.sendHouseJoinRequestDecisionNotification({ to: 'user@example.com', status: 'approved', requestedHouseName: 'Blue House' })],
            ['houseKick', () => svc.sendHouseKickNotification({ to: 'user@example.com', houseName: 'Blue House' })],
            ['passwordReset', () => svc.sendPasswordResetEmail({ email: 'user@example.com', resetUrl: 'http://localhost/reset?token=abc' })],
            ['testEmail', () => svc.sendTestEmail('user@example.com')]
        ];

        for (const [name, run] of cases) {
            sent.length = 0;
            await run();

            const payload = sent[0];
            if (!payload) {
                failures.push({ language, name, reason: 'no payload generated' });
                continue;
            }

            const combined = `${payload.subject}\n${payload.html}`;
            if (combined.includes('{{') || /,\s*!\s*(👋)?\s*</u.test(combined)) {
                failures.push({ language, name, reason: 'invalid rendered content' });
            }

            if (name === 'verification' && /password reset|şifre sıfırlama/i.test(combined)) {
                failures.push({ language, name, reason: 'verification email reused password reset fallback copy' });
            }
        }
    }

    assert.deepEqual(failures, []);
});

test('Docker runtime includes locale files needed by email service', () => {
    const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');
    assert.match(
        dockerfile,
        /COPY --from=frontend-builder \/app\/client\/public\/locales \.\/client\/public\/locales/
    );
});
