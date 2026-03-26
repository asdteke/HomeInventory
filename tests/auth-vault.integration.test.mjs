import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { TOTP, Secret } from 'otpauth';

import {
    createPersonalVaultSetup,
    decryptPersonalVaultPayload,
    encryptPersonalVaultPayload,
    unlockPersonalVaultWithPassphrase
} from '../client/src/utils/personalVaultCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    set(name, value) {
        if (!value) {
            this.cookies.delete(name);
            return;
        }

        this.cookies.set(name, value);
    }

    get(name) {
        return this.cookies.get(name);
    }

    delete(name) {
        this.cookies.delete(name);
    }

    toHeader() {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    applySetCookie(headers) {
        const setCookies = typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : [];

        for (const cookie of setCookies) {
            const [pair] = cookie.split(';', 1);
            const [name, value = ''] = pair.split('=');
            this.set(name.trim(), value.trim());
        }
    }
}

async function getFreePort() {
    return await new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolvePort(address.port);
            });
        });
        server.on('error', reject);
    });
}

async function waitForServer(port, child) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited before becoming healthy (code ${child.exitCode}).`);
        }

        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server is still starting.
        }

        await sleep(100);
    }

    throw new Error('Server did not become healthy in time.');
}

async function stopServer(child) {
    if (child.exitCode !== null) {
        return;
    }

    child.kill('SIGTERM');

    await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        sleep(2000).then(() => {
            if (child.exitCode === null) {
                child.kill('SIGKILL');
            }
        })
    ]);
}

async function requestJson(port, path, { method = 'GET', body } = {}, jar = null) {
    const headers = {};

    if (body !== undefined) {
        headers['content-type'] = 'application/json';
    }

    if (jar) {
        const cookieHeader = jar.toHeader();
        if (cookieHeader) {
            headers.cookie = cookieHeader;
        }
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    jar?.applySetCookie(response.headers);

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? JSON.parse(text || '{}')
        : text;

    return {
        status: response.status,
        data
    };
}

function createCurrentTotpCode(secret) {
    return new TOTP({
        issuer: 'HomeInventory',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret)
    }).generate();
}

test('2FA, trusted-device cookies, logout, and personal vault flows are enforced end-to-end', async (t) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'homeinventory-auth-vault-'));
    const dbPath = join(tempDir, 'inventory.db');
    const port = await getFreePort();
    const serverLogs = [];
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(port),
            SITE_URL: `http://127.0.0.1:${port}`,
            SECRET_PROVIDER: 'env',
            JWT_SECRET: 'integration-jwt-secret-1234567890',
            APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
            APP_ENCRYPTION_KEY_ID: 'integration-key',
            HOMEINVENTORY_DB_PATH: dbPath,
            RESEND_API_KEY: '',
            SUPPORT_EMAIL: 'support@example.com'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => serverLogs.push(String(chunk)));
    child.stderr.on('data', (chunk) => serverLogs.push(String(chunk)));

    t.after(async () => {
        await stopServer(child);
        rmSync(tempDir, { recursive: true, force: true });
    });

    await waitForServer(port, child);

    const aliceJar = new CookieJar();
    const registerAlice = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            email: 'alice@example.com',
            password: 'Stronger!Pass123',
            mode: 'create'
        }
    }, aliceJar);

    assert.equal(registerAlice.status, 201);
    assert.equal(registerAlice.data.success, true);
    assert.ok(aliceJar.get('token'));

    const setupTwoFactor = await requestJson(port, '/api/auth/2fa/setup', {
        method: 'POST'
    }, aliceJar);
    assert.equal(setupTwoFactor.status, 200);
    assert.match(setupTwoFactor.data.secret, /^[A-Z2-7]+$/);

    const verifyTwoFactor = await requestJson(port, '/api/auth/2fa/verify-setup', {
        method: 'POST',
        body: {
            token: createCurrentTotpCode(setupTwoFactor.data.secret)
        }
    }, aliceJar);
    assert.equal(verifyTwoFactor.status, 200);
    assert.equal(verifyTwoFactor.data.success, true);
    assert.equal(verifyTwoFactor.data.backupCodes.length, 10);

    const firstBackupCode = verifyTwoFactor.data.backupCodes[0];
    const secondBackupCode = verifyTwoFactor.data.backupCodes[1];

    const logoutAlice = await requestJson(port, '/api/auth/logout', {
        method: 'POST'
    }, aliceJar);
    assert.equal(logoutAlice.status, 200);
    assert.equal(aliceJar.get('token'), undefined);
    assert.equal(aliceJar.get('trusted_device'), undefined);

    const missingSecondFactor = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123'
        }
    }, new CookieJar());
    assert.equal(missingSecondFactor.status, 200);
    assert.equal(missingSecondFactor.data.requiresTwoFactor, true);

    const backupJar = new CookieJar();
    const backupLogin = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123',
            totpCode: firstBackupCode
        }
    }, backupJar);
    assert.equal(backupLogin.status, 200);
    assert.ok(backupJar.get('token'));

    await requestJson(port, '/api/auth/logout', {
        method: 'POST'
    }, backupJar);

    const reusedBackupCode = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123',
            totpCode: firstBackupCode
        }
    }, new CookieJar());
    assert.equal(reusedBackupCode.status, 401);
    assert.equal(reusedBackupCode.data.requiresTwoFactor, true);

    const rememberJar = new CookieJar();
    const rememberedLogin = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123',
            totpCode: secondBackupCode,
            rememberDevice: true
        }
    }, rememberJar);
    assert.equal(rememberedLogin.status, 200);
    assert.ok(rememberJar.get('trusted_device'));

    const trustedDeviceToken = rememberJar.get('trusted_device');
    rememberJar.delete('token');

    const trustedDeviceLogin = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123'
        }
    }, rememberJar);
    assert.equal(trustedDeviceLogin.status, 200);
    assert.ok(rememberJar.get('token'));

    const vaultStatusBeforeSetup = await requestJson(port, '/api/vault', {}, rememberJar);
    assert.equal(vaultStatusBeforeSetup.status, 200);
    assert.equal(vaultStatusBeforeSetup.data.configured, false);
    assert.equal(vaultStatusBeforeSetup.data.itemCount, 0);

    const vaultPassphrase = 'VaultPassphraseA1';
    const vaultSetupMaterial = await createPersonalVaultSetup(vaultPassphrase);
    const setupVault = await requestJson(port, '/api/vault/setup', {
        method: 'POST',
        body: vaultSetupMaterial.setupPayload
    }, rememberJar);
    assert.equal(setupVault.status, 201);
    assert.equal(setupVault.data.success, true);
    assert.equal(setupVault.data.config.wrapAlgorithm, 'A256GCM');

    const firstEnvelope = await encryptPersonalVaultPayload(vaultSetupMaterial.vaultKey, {
        type: 'personal-vault-item',
        schemaVersion: 2,
        name: 'Pasaport',
        quantity: 1,
        category: null,
        room: null,
        location_details: 'Kasa',
        barcode: '',
        invoice_price: '',
        invoice_currency: '',
        invoice_date: '',
        warranty_start_date: '',
        warranty_duration_value: '',
        warranty_duration_unit: '',
        warranty_expiry_date: ''
    });

    const createVaultItem = await requestJson(port, '/api/vault/items', {
        method: 'POST',
        body: {
            encrypted_payload: firstEnvelope
        }
    }, rememberJar);
    assert.equal(createVaultItem.status, 201);
    assert.ok(createVaultItem.data.item.id > 0);

    const listVaultItems = await requestJson(port, '/api/vault/items', {}, rememberJar);
    assert.equal(listVaultItems.status, 200);
    assert.equal(listVaultItems.data.items.length, 1);

    const decryptedStoredItem = await decryptPersonalVaultPayload(
        vaultSetupMaterial.vaultKey,
        listVaultItems.data.items[0].encrypted_payload
    );
    assert.equal(decryptedStoredItem.name, 'Pasaport');
    assert.equal(decryptedStoredItem.location_details, 'Kasa');

    const unlockedVaultKey = await unlockPersonalVaultWithPassphrase(setupVault.data.config, vaultPassphrase);
    const decryptedWithUnlockedKey = await decryptPersonalVaultPayload(
        unlockedVaultKey,
        listVaultItems.data.items[0].encrypted_payload
    );
    assert.equal(decryptedWithUnlockedKey.name, 'Pasaport');

    const updatedEnvelope = await encryptPersonalVaultPayload(vaultSetupMaterial.vaultKey, {
        ...decryptedStoredItem,
        name: 'Yeni Pasaport'
    });
    const updateVaultItem = await requestJson(port, `/api/vault/items/${createVaultItem.data.item.id}`, {
        method: 'PUT',
        body: {
            encrypted_payload: updatedEnvelope
        }
    }, rememberJar);
    assert.equal(updateVaultItem.status, 200);

    const bobJar = new CookieJar();
    const registerBob = await requestJson(port, '/api/auth/register', {
        method: 'POST',
        body: {
            username: 'bobuser',
            email: 'bob@example.com',
            password: 'EvenStronger!Pass123',
            mode: 'create'
        }
    }, bobJar);
    assert.equal(registerBob.status, 201);

    const bobVaultSetupMaterial = await createPersonalVaultSetup('BobVaultPassphraseA1');
    const setupBobVault = await requestJson(port, '/api/vault/setup', {
        method: 'POST',
        body: bobVaultSetupMaterial.setupPayload
    }, bobJar);
    assert.equal(setupBobVault.status, 201);

    const bobEnvelope = await encryptPersonalVaultPayload(bobVaultSetupMaterial.vaultKey, {
        type: 'personal-vault-item',
        schemaVersion: 2,
        name: 'Bob Kaydi'
    });
    const bobCrossUpdate = await requestJson(port, `/api/vault/items/${createVaultItem.data.item.id}`, {
        method: 'PUT',
        body: {
            encrypted_payload: bobEnvelope
        }
    }, bobJar);
    assert.equal(bobCrossUpdate.status, 404);

    const logoutRemembered = await requestJson(port, '/api/auth/logout', {
        method: 'POST'
    }, rememberJar);
    assert.equal(logoutRemembered.status, 200);
    assert.equal(rememberJar.get('trusted_device'), undefined);

    const loginAfterLogout = await requestJson(port, '/api/auth/login', {
        method: 'POST',
        body: {
            username: 'aliceuser',
            password: 'Stronger!Pass123'
        }
    }, rememberJar);
    assert.equal(loginAfterLogout.status, 200);
    assert.equal(loginAfterLogout.data.requiresTwoFactor, true);

    const combinedLogs = serverLogs.join('');
    assert.doesNotMatch(combinedLogs, /LOGIN DEBUG|trustedDeviceCookie|req\.cookies/);
    assert.doesNotMatch(combinedLogs, new RegExp(trustedDeviceToken));
});
