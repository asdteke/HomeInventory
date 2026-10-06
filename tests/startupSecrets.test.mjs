import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function getFreePort() {
    return new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolvePort(port));
        });
        server.on('error', reject);
    });
}

// Mirrors docker-compose.yml: the secret env vars are empty and the values
// only exist as files in the Docker secrets directory.
async function startProductionServer(t, secretFiles) {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-startup-secrets-'));
    const secretsDir = join(tempDir, 'secrets');
    mkdirSync(secretsDir);
    for (const [name, value] of Object.entries(secretFiles)) {
        writeFileSync(join(secretsDir, name), `${value}\n`);
    }

    const port = await getFreePort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: String(port),
            SITE_URL: `http://127.0.0.1:${port}`,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: '',
            APP_ENCRYPTION_KEY: '',
            APP_ENCRYPTION_KEY_ID: '',
            DOCKER_SECRETS_DIR: secretsDir,
            HOMEINVENTORY_DB_PATH: join(tempDir, 'inventory.db'),
            HOMEINVENTORY_LOG_DIR: join(tempDir, 'logs'),
            RESEND_API_KEY: '',
            UPDATE_CHECK: 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));

    t.after(async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await Promise.race([new Promise((done) => child.once('exit', done)), sleep(2000)]);
            if (child.exitCode === null) child.kill('SIGKILL');
        }
        rmSync(tempDir, { recursive: true, force: true });
    });

    return { child, port, logs };
}

test('production startup accepts secrets provided only as Docker secret files', async (t) => {
    const { child, port, logs } = await startProductionServer(t, {
        jwt_secret: 'startup-secrets-jwt-secret-1234567890abcdef',
        app_encryption_key: Buffer.alloc(32, 7).toString('base64'),
        app_encryption_key_id: '2026-10-docker'
    });

    for (let attempt = 0; ; attempt += 1) {
        if (child.exitCode !== null || attempt >= 150) {
            throw new Error(`Server did not start.\n${logs.join('')}`);
        }
        try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
        } catch {
            // Still starting.
        }
        await sleep(100);
    }

    assert.doesNotMatch(logs.join(''), /zorunlu environment/);
});

test('production startup still refuses to run without the required secrets', async (t) => {
    const { child, logs } = await startProductionServer(t, {});
    const exitCode = await new Promise((done) => child.once('exit', done));

    assert.equal(exitCode, 1);
    assert.match(logs.join(''), /JWT_SECRET, APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_ID/);
});
