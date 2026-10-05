import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupScript = path.join(repoRoot, 'scripts', 'setup.mjs');

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeinventory-setup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runSetup(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [setupScript, ...args], { cwd, encoding: 'utf8' });
}

function readEnv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in values)) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

// Loads utils/encryption.js in a child process with the given values so the
// test proves the server itself accepts what the setup command generates.
function serverAcceptsKey(env) {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "const m = await import('./utils/encryption.js'); console.log(m.APP_ENCRYPTION_KEY_ID);"
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DOCKER_SECRETS_DIR: path.join(os.tmpdir(), 'homeinventory-no-secrets'), ...env }
  });
  return result;
}

test('setup creates .env from .env.example with values the server accepts', (t) => {
  const dir = makeTempDir(t);
  const result = runSetup(['--out', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created .*\.env from \.env\.example/);
  assert.match(result.stdout, /Generated JWT_SECRET/);
  assert.match(result.stdout, /back up APP_ENCRYPTION_KEY/);

  const envPath = path.join(dir, '.env');
  const values = readEnv(envPath);
  assert.match(values.JWT_SECRET, /^[a-f0-9]{64}$/);
  assert.equal(Buffer.from(values.APP_ENCRYPTION_KEY, 'base64').length, 32);
  assert.match(values.APP_ENCRYPTION_KEY_ID, /^\d{4}-\d{2}-primary$/);
  // Non-secret template settings are carried over untouched.
  assert.equal(values.SECRET_PROVIDER, 'env');
  assert.ok(!result.stdout.includes(values.APP_ENCRYPTION_KEY), 'secrets must not be printed');

  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  }

  const check = serverAcceptsKey({
    APP_ENCRYPTION_KEY: values.APP_ENCRYPTION_KEY,
    APP_ENCRYPTION_KEY_ID: values.APP_ENCRYPTION_KEY_ID
  });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout.trim(), values.APP_ENCRYPTION_KEY_ID);
});

test('setup is idempotent and never overwrites real values', (t) => {
  const dir = makeTempDir(t);
  const envPath = path.join(dir, '.env');
  const existingKey = 'a'.repeat(64);
  fs.writeFileSync(envPath, [
    'PORT=4000',
    'JWT_SECRET=replace-with-a-long-random-secret',
    `APP_ENCRYPTION_KEY=${existingKey}`,
    'APP_ENCRYPTION_KEY_ID=2026-03-primary',
    ''
  ].join('\n'));

  const first = runSetup(['--out', dir]);
  assert.equal(first.status, 0, first.stderr);
  const afterFirst = readEnv(envPath);
  assert.equal(afterFirst.PORT, '4000');
  assert.match(afterFirst.JWT_SECRET, /^[a-f0-9]{64}$/);
  assert.equal(afterFirst.APP_ENCRYPTION_KEY, existingKey);
  // The id of an existing key must not change, or old payloads become unreadable.
  assert.equal(afterFirst.APP_ENCRYPTION_KEY_ID, '2026-03-primary');
  assert.doesNotMatch(first.stdout, /back up APP_ENCRYPTION_KEY/);

  const before = fs.readFileSync(envPath, 'utf8');
  const second = runSetup(['--out', dir]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Nothing to do/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), before);
});

test('setup appends missing keys and keeps CRLF line endings', (t) => {
  const dir = makeTempDir(t);
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'PORT=3001\r\nJWT_SECRET=\r\n');

  const result = runSetup(['--out', dir]);
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(envPath, 'utf8');
  assert.ok(!/[^\r]\n/.test(text), 'all line breaks stay CRLF');
  const values = readEnv(envPath);
  assert.equal(values.PORT, '3001');
  assert.match(values.JWT_SECRET, /^[a-f0-9]{64}$/);
  assert.ok(values.APP_ENCRYPTION_KEY);
  assert.ok(values.APP_ENCRYPTION_KEY_ID);
});

test('setup warns about an existing key the server would reject', (t) => {
  const dir = makeTempDir(t);
  fs.writeFileSync(path.join(dir, '.env'), 'JWT_SECRET=x\nAPP_ENCRYPTION_KEY=too-short\nAPP_ENCRYPTION_KEY_ID=k1\n');

  const result = runSetup(['--out', dir]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Warning: APP_ENCRYPTION_KEY/);
  assert.equal(readEnv(path.join(dir, '.env')).APP_ENCRYPTION_KEY, 'too-short');
});

test('setup --docker writes Docker secret files without overwriting them', (t) => {
  const dir = makeTempDir(t);
  const secretsDir = path.join(dir, 'nested', 'secrets');

  const first = runSetup(['--docker', '--out', secretsDir]);
  assert.equal(first.status, 0, first.stderr);
  const files = ['jwt_secret.txt', 'app_encryption_key.txt', 'app_encryption_key_id.txt'];
  const contents = Object.fromEntries(files.map((name) => [name, fs.readFileSync(path.join(secretsDir, name), 'utf8')]));
  assert.match(contents['jwt_secret.txt'], /^[a-f0-9]{64}$/);
  assert.equal(Buffer.from(contents['app_encryption_key.txt'], 'base64').length, 32);
  assert.match(contents['app_encryption_key_id.txt'], /^\d{4}-\d{2}-primary$/);

  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(secretsDir).mode & 0o777, 0o700);
    // Readable by the container's uid 1001 through the Compose bind mount.
    assert.equal(fs.statSync(path.join(secretsDir, 'app_encryption_key.txt')).mode & 0o777, 0o644);
  }

  // The server reads these files through DOCKER_SECRETS_DIR-style lookups.
  const dockerDir = path.join(dir, 'run-secrets');
  fs.mkdirSync(dockerDir);
  for (const name of files) {
    fs.copyFileSync(path.join(secretsDir, name), path.join(dockerDir, name.replace(/\.txt$/, '')));
  }
  const check = serverAcceptsKey({ DOCKER_SECRETS_DIR: dockerDir, APP_ENCRYPTION_KEY: '', APP_ENCRYPTION_KEY_ID: '' });
  assert.equal(check.status, 0, check.stderr);

  fs.writeFileSync(path.join(secretsDir, 'jwt_secret.txt'), 'my-own-secret\n');
  fs.rmSync(path.join(secretsDir, 'app_encryption_key_id.txt'));
  const second = runSetup(['--docker', '--out', secretsDir]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(path.join(secretsDir, 'jwt_secret.txt'), 'utf8'), 'my-own-secret\n');
  assert.equal(fs.readFileSync(path.join(secretsDir, 'app_encryption_key.txt'), 'utf8'), contents['app_encryption_key.txt']);
  assert.ok(fs.readFileSync(path.join(secretsDir, 'app_encryption_key_id.txt'), 'utf8').length > 0);
  assert.doesNotMatch(second.stdout, /back up/);
});

test('setup --docker defaults to ./secrets relative to the working directory', (t) => {
  const dir = makeTempDir(t);
  const result = runSetup(['--docker'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'secrets', 'jwt_secret.txt')));
});

test('setup rejects unknown options', () => {
  const result = runSetup(['--force']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --force/);
});
