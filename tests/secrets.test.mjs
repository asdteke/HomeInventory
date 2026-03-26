import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getDockerSecretsDir, getEnvOrSecret } from '../utils/secrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(__dirname, '..');

test('getDockerSecretsDir defaults to /run/secrets and respects overrides', () => {
    assert.equal(getDockerSecretsDir({}), '/run/secrets');
    assert.equal(getDockerSecretsDir({ DOCKER_SECRETS_DIR: '/tmp/homeinventory-secrets' }), '/tmp/homeinventory-secrets');
});

test('getEnvOrSecret prefers Docker secret files and trims values', () => {
    const secretsDir = mkdtempSync(join(tmpdir(), 'homeinventory-secrets-'));

    try {
        writeFileSync(join(secretsDir, 'jwt_secret'), 'secret-from-file\n');

        const resolved = getEnvOrSecret('JWT_SECRET', 'jwt_secret', {
            env: { JWT_SECRET: 'secret-from-env' },
            secretsDir
        });

        assert.equal(resolved, 'secret-from-file');
    } finally {
        rmSync(secretsDir, { recursive: true, force: true });
    }
});

test('getEnvOrSecret falls back to env when the Docker secret file is absent', () => {
    const secretsDir = mkdtempSync(join(tmpdir(), 'homeinventory-secrets-'));

    try {
        const resolved = getEnvOrSecret('JWT_SECRET', 'jwt_secret', {
            env: { JWT_SECRET: 'secret-from-env' },
            secretsDir
        });

        assert.equal(resolved, 'secret-from-env');
    } finally {
        rmSync(secretsDir, { recursive: true, force: true });
    }
});

test('runtime modules can bootstrap from Docker secret files without plain env secrets', () => {
    const secretsDir = mkdtempSync(join(tmpdir(), 'homeinventory-secrets-'));
    const sandboxDir = mkdtempSync(join(tmpdir(), 'homeinventory-db-'));
    const authModuleUrl = pathToFileURL(resolve(repoRoot, 'middleware', 'auth.js')).href;
    const encryptionModuleUrl = pathToFileURL(resolve(repoRoot, 'utils', 'encryption.js')).href;

    try {
        writeFileSync(join(secretsDir, 'jwt_secret'), 'jwt-secret-from-docker-file');
        writeFileSync(join(secretsDir, 'app_encryption_key'), '0123456789abcdef0123456789abcdef');
        writeFileSync(join(secretsDir, 'app_encryption_key_id'), 'docker-test-key');

        const result = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
                    await import(${JSON.stringify(encryptionModuleUrl)});
                    await import(${JSON.stringify(authModuleUrl)});
                    console.log('docker-secrets-ok');
                `
            ],
            {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    JWT_SECRET: '',
                    APP_ENCRYPTION_KEY: '',
                    APP_ENCRYPTION_KEY_ID: '',
                    DOCKER_SECRETS_DIR: secretsDir,
                    HOMEINVENTORY_DB_PATH: join(sandboxDir, 'inventory.db'),
                    NODE_ENV: 'test'
                },
                encoding: 'utf8'
            }
        );

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.match(result.stdout, /docker-secrets-ok/);
    } finally {
        rmSync(secretsDir, { recursive: true, force: true });
        rmSync(sandboxDir, { recursive: true, force: true });
    }
});
