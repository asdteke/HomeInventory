import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

function normalizedRemoteAddress(address = '') {
    return String(address).replace(/^::ffff:/, '');
}

export function isPrivateClientAddress(address) {
    const value = normalizedRemoteAddress(address);
    if (value === '127.0.0.1' || value === '::1') return true;
    if (/^10\./.test(value) || /^192\.168\./.test(value)) return true;
    const match = value.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
    return /^f[cd][0-9a-f]{2}:/i.test(value) || /^fe80:/i.test(value);
}

function copyRequestHeaders(headers, targetPort, forwardedHost, publicOrigin, remoteAddress = '') {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== 'origin') {
            result[name] = value;
        }
    }
    result.host = `127.0.0.1:${targetPort}`;
    result['x-forwarded-proto'] = 'https';
    result['x-forwarded-host'] = forwardedHost;
    result['x-forwarded-for'] = normalizedRemoteAddress(remoteAddress);
    result['x-homeinventory-gateway-origin'] = publicOrigin;
    return result;
}

export function secureSetCookieHeader(value) {
    const cookies = Array.isArray(value) ? value : [value];
    return cookies.map(cookie => /;\s*secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`);
}

function proxyResponseHeaders(headers, targetPort, publicOrigin) {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) result[name] = value;
    }
    if (result['set-cookie']) result['set-cookie'] = secureSetCookieHeader(result['set-cookie']);
    if (typeof result.location === 'string') {
        result.location = result.location
            .replace(`http://127.0.0.1:${targetPort}`, publicOrigin)
            .replace(`http://localhost:${targetPort}`, publicOrigin)
            .replace(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/, publicOrigin);
    }
    result['x-content-type-options'] ||= 'nosniff';
    return result;
}

export function originIsAllowed(origin, publicOrigin) {
    return !origin || origin === publicOrigin;
}

function mobileConfig(caDer, caName) {
    const escapedName = caName.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[char]);
    const payloadUuid = randomUUID().toUpperCase();
    const profileUuid = randomUUID().toUpperCase();
    const instanceId = caName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadCertificateFileName</key><string>HomeInventory-Local-CA.cer</string>
<key>PayloadContent</key><data>${caDer.toString('base64')}</data>
<key>PayloadDescription</key><string>Trusts only certificates issued by this HomeInventory installation.</string>
<key>PayloadDisplayName</key><string>${escapedName}</string>
<key>PayloadIdentifier</key><string>net.homeinventory.local.${instanceId}.ca</string>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadUUID</key><string>${payloadUuid}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDescription</key><string>Offline HTTPS access for HomeInventory on your local network.</string>
<key>PayloadDisplayName</key><string>${escapedName}</string>
<key>PayloadIdentifier</key><string>net.homeinventory.local.${instanceId}.profile</string>
<key>PayloadOrganization</key><string>HomeInventory</string>
<key>PayloadRemovalDisallowed</key><false/>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadUUID</key><string>${profileUuid}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
}

function pemCertificateToDer(pem) {
    const base64 = pem
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');
    if (!base64) throw new Error('The public CA certificate is empty.');
    return Buffer.from(base64, 'base64');
}

export function createEnrollmentServer({ caPem, caName, token, expiresAt }) {
    const caDer = pemCertificateToDer(caPem);
    const prefix = `/enroll/${encodeURIComponent(token)}/`;
    return http.createServer((req, res) => {
        const finish = (status, body, headers = {}) => {
            res.writeHead(status, {
                'Cache-Control': 'no-store, max-age=0',
                'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
                'Referrer-Policy': 'no-referrer',
                'X-Content-Type-Options': 'nosniff',
                ...headers
            });
            res.end(body);
        };

        if (!isPrivateClientAddress(req.socket.remoteAddress)) {
            finish(403, 'Local-network clients only.');
            return;
        }
        if (Date.now() > expiresAt) {
            finish(410, 'This enrollment link has expired. Generate a new link in the launcher.');
            return;
        }
        if (req.method !== 'GET' || !req.url?.startsWith(prefix)) {
            finish(404, 'Not found.');
            return;
        }

        const asset = req.url.slice(prefix.length).split('?')[0];
        if (asset === 'ios.mobileconfig') {
            finish(200, mobileConfig(caDer, caName), {
                'Content-Type': 'application/x-apple-aspen-config',
                'Content-Disposition': 'attachment; filename="HomeInventory-Local-CA.mobileconfig"'
            });
            return;
        }
        if (asset === 'android.crt') {
            finish(200, caDer, {
                'Content-Type': 'application/x-x509-ca-cert',
                'Content-Disposition': 'attachment; filename="HomeInventory-Local-CA.crt"'
            });
            return;
        }
        finish(404, 'Not found.');
    });
}

export function createHttpsGateway({ keyPem, certificateChainPem, targetPort, publicOrigin }) {
    const publicUrl = new URL(publicOrigin);
    const server = https.createServer({
        key: keyPem,
        cert: certificateChainPem,
        minVersion: 'TLSv1.2'
    }, (req, res) => {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        if (!originIsAllowed(origin, publicOrigin)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Cross-origin request blocked.');
            return;
        }
        if (req.url === '/.homeinventory/https-health') {
            res.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/json; charset=utf-8'
            });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        const upstream = http.request({
            host: '127.0.0.1',
            port: targetPort,
            method: req.method,
            path: req.url,
            headers: copyRequestHeaders(
                req.headers,
                targetPort,
                req.headers.host || publicUrl.host,
                publicOrigin,
                req.socket.remoteAddress
            )
        }, upstreamResponse => {
            res.writeHead(
                upstreamResponse.statusCode || 502,
                proxyResponseHeaders(upstreamResponse.headers, targetPort, publicOrigin)
            );
            upstreamResponse.pipe(res);
        });
        upstream.setTimeout(30_000, () => upstream.destroy(new Error('Upstream timeout')));
        upstream.on('error', () => {
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('HomeInventory is not ready yet.');
        });
        req.pipe(upstream);
    });

    server.on('upgrade', (req, socket, head) => {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        if (!originIsAllowed(origin, publicOrigin)) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
        }
        const upstream = net.connect(targetPort, '127.0.0.1', () => {
            const headers = copyRequestHeaders(
                req.headers,
                targetPort,
                req.headers.host || publicUrl.host,
                publicOrigin,
                req.socket.remoteAddress
            );
            headers.connection = 'Upgrade';
            headers.upgrade = req.headers.upgrade || 'websocket';
            const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (const [name, value] of Object.entries(headers)) {
                if (Array.isArray(value)) {
                    for (const item of value) lines.push(`${name}: ${item}`);
                } else if (value !== undefined) {
                    lines.push(`${name}: ${value}`);
                }
            }
            upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
            if (head.length) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
        });
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
    });
    return server;
}

export function loadGatewayFiles({ keyPath, certificatePath, caPath }) {
    return {
        keyPem: readFileSync(keyPath, 'utf8'),
        certificateChainPem: readFileSync(certificatePath, 'utf8'),
        caPem: readFileSync(caPath, 'utf8')
    };
}
