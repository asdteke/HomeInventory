import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    createEnrollmentServer,
    createHttpsGateway,
    isPrivateClientAddress,
    originIsAllowed,
    secureSetCookieHeader
} from '../utils/httpsGateway.js';

const TEST_CA_PEM = `-----BEGIN CERTIFICATE-----
AQIDBAUGBwg=
-----END CERTIFICATE-----`;

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
}

function request(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks)
            }));
        });
        req.on('error', reject);
    });
}

function secureRequest(port, path, origin) {
    return new Promise((resolve, reject) => {
        const req = https.get({
            host: '127.0.0.1',
            port,
            path,
            rejectUnauthorized: false,
            headers: origin ? { Origin: origin } : {}
        }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks)
            }));
        });
        req.on('error', reject);
    });
}

test('certificate enrollment accepts only the tokenized platform assets', async t => {
    const server = createEnrollmentServer({
        caPem: TEST_CA_PEM,
        caName: 'HomeInventory Local CA TEST1234',
        token: 'secret-token',
        expiresAt: Date.now() + 60_000
    });
    t.after(() => server.close());
    const port = await listen(server);

    const missingToken = await request(port, '/enroll/wrong/android.crt');
    assert.equal(missingToken.status, 404);

    const android = await request(port, '/enroll/secret-token/android.crt');
    assert.equal(android.status, 200);
    assert.equal(android.headers['cache-control'], 'no-store, max-age=0');
    assert.equal(android.headers['content-type'], 'application/x-x509-ca-cert');
    assert.equal(android.headers['content-disposition'], 'attachment; filename="HomeInventory-Local-CA.crt"');
    assert.deepEqual(android.body, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

    const ios = await request(port, '/enroll/secret-token/ios.mobileconfig');
    assert.equal(ios.status, 200);
    assert.equal(ios.headers['content-type'], 'application/x-apple-aspen-config');
    const profile = ios.body.toString('utf8');
    assert.match(profile, /com\.apple\.security\.root/);
    assert.match(profile, /HomeInventory Local CA TEST1234/);
    assert.doesNotMatch(profile, /PRIVATE KEY/);
});

test('expired enrollment links fail closed', async t => {
    const server = createEnrollmentServer({
        caPem: TEST_CA_PEM,
        caName: 'HomeInventory Local CA EXPIRED',
        token: 'expired-token',
        expiresAt: Date.now() - 1
    });
    t.after(() => server.close());
    const port = await listen(server);
    const response = await request(port, '/enroll/expired-token/android.crt');
    assert.equal(response.status, 410);
});

test('enrollment private-client allowlist excludes public addresses', () => {
    for (const address of ['127.0.0.1', '::1', '10.0.0.7', '172.16.4.2', '172.31.255.9', '192.168.8.4', 'fe80::1']) {
        assert.equal(isPrivateClientAddress(address), true, address);
    }
    for (const address of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '203.0.113.9']) {
        assert.equal(isPrivateClientAddress(address), false, address);
    }
});

test('HTTPS gateway accepts only its exact browser origin and upgrades cookies to Secure', () => {
    const origin = 'https://192.168.1.20:5443';
    assert.equal(originIsAllowed('', origin), true);
    assert.equal(originIsAllowed(origin, origin), true);
    assert.equal(originIsAllowed('https://192.168.1.20:5444', origin), false);
    assert.equal(originIsAllowed('https://attacker.example', origin), false);

    assert.deepEqual(
        secureSetCookieHeader(['token=abc; HttpOnly; SameSite=Lax', 'already=secure; Secure']),
        ['token=abc; HttpOnly; SameSite=Lax; Secure', 'already=secure; Secure']
    );
});

test('HTTPS gateway proxies localhost traffic, rejects foreign origins, and secures cookies', async t => {
    const fixture = mkdtempSync(join(tmpdir(), 'homeinventory-https-gateway-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const keyPath = join(fixture, 'key.pem');
    const certificatePath = join(fixture, 'certificate.pem');
    try {
        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', keyPath, '-out', certificatePath,
            '-subj', '/CN=127.0.0.1', '-days', '1'
        ], { stdio: 'ignore' });
    } catch {
        t.skip('OpenSSL is unavailable for the live TLS proxy test.');
        return;
    }

    let forwardedProto = '';
    const upstream = http.createServer((req, res) => {
        forwardedProto = String(req.headers['x-forwarded-proto'] || '');
        res.setHeader('Set-Cookie', 'token=test; HttpOnly; SameSite=Lax');
        res.end('proxied');
    });
    t.after(() => upstream.close());
    const upstreamPort = await listen(upstream);

    const gatewayPortProbe = http.createServer();
    const gatewayPort = await listen(gatewayPortProbe);
    await new Promise(resolve => gatewayPortProbe.close(resolve));
    const publicOrigin = `https://127.0.0.1:${gatewayPort}`;
    const gateway = createHttpsGateway({
        keyPem: readFileSync(keyPath, 'utf8'),
        certificateChainPem: readFileSync(certificatePath, 'utf8'),
        targetPort: upstreamPort,
        publicOrigin
    });
    t.after(() => gateway.close());
    await new Promise((resolve, reject) => {
        gateway.once('error', reject);
        gateway.listen(gatewayPort, '127.0.0.1', resolve);
    });

    const accepted = await secureRequest(gatewayPort, '/test', publicOrigin);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.toString(), 'proxied');
    assert.equal(forwardedProto, 'https');
    assert.deepEqual(accepted.headers['set-cookie'], ['token=test; HttpOnly; SameSite=Lax; Secure']);

    const rejected = await secureRequest(gatewayPort, '/test', 'https://attacker.example');
    assert.equal(rejected.status, 403);
});

test('launcher keeps mobile HTTPS optional and its tall setup card scrollable', () => {
    const appSource = readFileSync(new URL('../apps/launcher/src/App.tsx', import.meta.url), 'utf8');
    const i18nSource = readFileSync(new URL('../apps/launcher/src/i18n.tsx', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../apps/launcher/src/styles.css', import.meta.url), 'utf8');
    const rustSource = readFileSync(new URL('../apps/launcher/src-tauri/src/lib.rs', import.meta.url), 'utf8');
    assert.match(appSource, /mobileHttps:\s*false/);
    assert.match(appSource, /t\('https\.normalRemains'\)/);
    assert.match(appSource, /t\('https\.iosHelp'\)/);
    assert.match(appSource, /t\('https\.rotate'\)/);
    assert.match(appSource, /t\('https\.installTitle'\)/);
    assert.match(appSource, /t\('https\.choosePlatform'\)/);
    assert.match(i18nSource, /Normal HTTP access remains available/);
    assert.match(i18nSource, /Certificate Trust Settings/);
    assert.match(i18nSource, /Rotate compromised CA/);
    assert.match(i18nSource, /1 · Install the certificate/);
    assert.match(i18nSource, /Choose iPhone \/ iPad or Android\./);
    assert.match(i18nSource, /Samsung Galaxy/);
    assert.match(i18nSource, /Install from device storage → CA certificate/);
    assert.match(i18nSource, /It contains no private key or HomeInventory data\./);
    assert.doesNotMatch(i18nSource, /not a Wi-Fi certificate/);
    assert.doesNotMatch(i18nSource, /1 · (?:iPhone \/ iPad|Android) certificate/);
    assert.match(styles, /\.running-layout\s*\{[^}]*height:\s*100vh;[^}]*place-items:\s*start center;[^}]*overflow-y:\s*auto;/s);
    assert.match(styles, /\.running-card\s*\{[^}]*height:\s*max-content;/s);
    assert.match(styles, /\.mobile-https-card\s*\{[^}]*flex:\s*0 0 auto;/s);
    assert.equal((appSource.match(/httpsStatus\.[a-zA-Z]+Url\} size=\{220\}/g) || []).length, 3);
    assert.match(styles, /\.mobile-https-qr-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
    assert.match(appSource, /invoke<SuggestedPorts>\('suggest_random_ports'\)/);
    assert.match(rustSource, /fn suggest_random_ports_internal\(\) -> Result<SuggestedPorts, String>/);
    assert.doesNotMatch(appSource, /mobile-https-card compact/);
});
