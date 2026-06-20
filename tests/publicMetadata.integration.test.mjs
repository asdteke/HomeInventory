import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '..');

async function getFreePort() {
    return await new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => error ? reject(error) : resolvePort(address.port));
        });
        server.on('error', reject);
    });
}

async function waitForServer(port, child, logs) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early.\n${logs.join('')}`);
        }

        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }

        await sleep(100);
    }

    throw new Error(`Server did not become healthy.\n${logs.join('')}`);
}

async function startServer(t) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-metadata-'));
    const port = await getFreePort();
    const siteUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            SITE_URL: siteUrl,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: 'metadata-test-jwt-secret',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'metadata-test-key',
            HOMEINVENTORY_DB_PATH: join(tempDir, 'inventory.db'),
            SUPPORT_EMAIL: 'security@example.test',
            SECURITY_POLICY_URL: 'https://example.test/security-policy'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));

    t.after(async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await Promise.race([
                new Promise((resolveExit) => child.once('exit', resolveExit)),
                sleep(2000).then(() => child.exitCode === null && child.kill('SIGKILL'))
            ]);
        }
        rmSync(tempDir, { recursive: true, force: true });
    });

    await waitForServer(port, child, logs);
    return { port, siteUrl };
}

test('public metadata is canonical, cacheable, and does not set language cookies', async (t) => {
    const { port, siteUrl } = await startServer(t);

    const robotsResponse = await fetch(`${siteUrl}/robots.txt`);
    const robots = await robotsResponse.text();
    assert.equal(robotsResponse.status, 200);
    assert.match(robotsResponse.headers.get('content-type') || '', /^text\/plain/);
    assert.equal(robotsResponse.headers.has('set-cookie'), false);
    assert.match(robotsResponse.headers.get('cache-control') || '', /public, max-age=3600/);
    assert.match(robots, new RegExp(`Sitemap: ${siteUrl.replaceAll('.', '\\.')}\/sitemap\\.xml`));
    assert.doesNotMatch(robots, /your-domain\.com/);

    const sitemapResponse = await fetch(`${siteUrl}/sitemap.xml`);
    const sitemap = await sitemapResponse.text();
    assert.equal(sitemapResponse.status, 200);
    assert.match(sitemapResponse.headers.get('content-type') || '', /^application\/xml/);
    assert.equal(sitemapResponse.headers.has('set-cookie'), false);
    assert.match(sitemap, new RegExp(`<loc>${siteUrl.replaceAll('.', '\\.')}\/</loc>`));
    assert.doesNotMatch(sitemap, /your-domain\.com/);

    const securityResponse = await fetch(`${siteUrl}/.well-known/security.txt`);
    const securityTxt = await securityResponse.text();
    assert.equal(securityResponse.status, 200);
    assert.match(securityResponse.headers.get('content-type') || '', /^text\/plain/);
    assert.equal(securityResponse.headers.has('set-cookie'), false);
    assert.match(securityTxt, /^Contact: mailto:security@example\.test$/m);
    assert.match(securityTxt, new RegExp(`^Canonical: ${siteUrl.replaceAll('.', '\\.')}\/\\.well-known\/security\\.txt$`, 'm'));
    assert.match(securityTxt, /^Policy: https:\/\/example\.test\/security-policy$/m);
    assert.doesNotMatch(securityTxt, /<!DOCTYPE html>/i);

    const expiresLine = securityTxt.match(/^Expires: (.+)$/m);
    assert.ok(expiresLine);
    const expiresAt = Date.parse(expiresLine[1]);
    assert.ok(Number.isFinite(expiresAt));
    assert.ok(expiresAt > Date.now() + (170 * 24 * 60 * 60 * 1000));
});

test('concrete static files bypass language-cookie middleware', async (t) => {
    const { siteUrl } = await startServer(t);
    const response = await fetch(`${siteUrl}/favicon.ico`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.match(response.headers.get('cache-control') || '', /public, max-age=3600/);
});
