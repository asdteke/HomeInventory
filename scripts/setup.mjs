#!/usr/bin/env node
// Generates the runtime secrets HomeInventory needs (JWT_SECRET,
// APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_ID) so self-hosters do not have to
// hand-craft them with openssl.
//
//   npm run setup                      -> fill the secrets in ./.env (created from .env.example)
//   npm run setup -- --docker          -> write ./secrets/*.txt for docker-compose.yml
//   node scripts/setup.mjs --docker --out /secrets   (inside the published image)
//
// Existing real values are never overwritten, so the command is safe to re-run.
// Only Node.js built-ins are used: it works offline and inside the runtime image.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
// Values shipped in .env.example and the README snippets; treated as "not set".
const PLACEHOLDER_PREFIX = 'replace-with-';

const DOCKER_SECRET_FILES = {
  JWT_SECRET: 'jwt_secret.txt',
  APP_ENCRYPTION_KEY: 'app_encryption_key.txt',
  APP_ENCRYPTION_KEY_ID: 'app_encryption_key_id.txt',
};

const USAGE = `Usage: node scripts/setup.mjs [--docker] [--out <dir>]

Generates JWT_SECRET, APP_ENCRYPTION_KEY and APP_ENCRYPTION_KEY_ID.
Existing values are kept; only missing or placeholder values are filled in.

  (default)     Write the values into <dir>/.env, creating it from
                .env.example when it does not exist. <dir> defaults to the
                current directory.
  --docker      Write Docker secret files (jwt_secret.txt,
                app_encryption_key.txt, app_encryption_key_id.txt) into <dir>,
                which defaults to ./secrets.
  --out <dir>   Target directory.
  -h, --help    Show this help.`;

function parseArgs(argv) {
  const options = { docker: false, out: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--docker') {
      options.docker = true;
    } else if (arg === '--out') {
      options.out = argv[index + 1] || '';
      index += 1;
      if (!options.out) {
        throw new Error('--out needs a directory.');
      }
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export function generateJwtSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64');
}

export function generateKeyId(now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}-primary`;
}

function isPlaceholder(value) {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized.startsWith(PLACEHOLDER_PREFIX);
}

// Mirrors decodeMasterKey() in utils/encryption.js closely enough to warn
// about a hand-written key the server would reject at startup.
function isValidEncryptionKey(value) {
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    if (Buffer.from(normalized, 'base64').length === 32) {
      return true;
    }
  }
  return Buffer.byteLength(value, 'utf8') === 32;
}

// Decides the final values. The key id is only replaced together with a newly
// generated key: changing the id of an existing key would orphan data that was
// already encrypted under the old id.
function resolveValues(current, defaultKeyId) {
  const values = {};
  const actions = [];

  const generateKey = isPlaceholder(current.APP_ENCRYPTION_KEY);

  if (isPlaceholder(current.JWT_SECRET)) {
    values.JWT_SECRET = generateJwtSecret();
    actions.push(['generated', 'JWT_SECRET']);
  } else {
    actions.push(['kept', 'JWT_SECRET']);
  }

  if (generateKey) {
    values.APP_ENCRYPTION_KEY = generateEncryptionKey();
    actions.push(['generated', 'APP_ENCRYPTION_KEY']);
  } else {
    actions.push(['kept', 'APP_ENCRYPTION_KEY']);
    if (!isValidEncryptionKey(String(current.APP_ENCRYPTION_KEY).trim())) {
      actions.push(['warning', 'APP_ENCRYPTION_KEY is not a 32-byte base64 or 64-character hex key; the server will refuse to start with it.']);
    }
  }

  const currentKeyId = String(current.APP_ENCRYPTION_KEY_ID ?? '').trim();
  if (isPlaceholder(currentKeyId) || (generateKey && currentKeyId === defaultKeyId)) {
    values.APP_ENCRYPTION_KEY_ID = generateKeyId();
    actions.push(['generated', 'APP_ENCRYPTION_KEY_ID']);
  } else {
    actions.push(['kept', 'APP_ENCRYPTION_KEY_ID']);
    if (!KEY_ID_PATTERN.test(currentKeyId)) {
      actions.push(['warning', 'APP_ENCRYPTION_KEY_ID must be 1-64 letters, numbers, dots, underscores or hyphens.']);
    }
  }

  return { values, actions, generatedKey: generateKey };
}

function lineValue(rawValue) {
  let value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, '');
  }
  return value.trim();
}

function keyPattern(key) {
  return new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=)(.*)$`);
}

function readTemplateDefault(templateText, key) {
  for (const line of templateText.split(/\r?\n/)) {
    const match = line.match(keyPattern(key));
    if (match) {
      return lineValue(match[2]);
    }
  }
  return '';
}

function setupEnvFile(outDir) {
  const envPath = path.join(outDir, '.env');
  const templatePath = path.join(repoRoot, '.env.example');
  const templateText = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
  const report = [];

  let text;
  let created = false;
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, 'utf8');
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    text = templateText || '# HomeInventory environment\n';
    created = true;
    report.push(templateText ? `Created ${envPath} from .env.example` : `Created ${envPath}`);
  }

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const current = {};
  const lineIndex = {};
  for (const key of Object.keys(DOCKER_SECRET_FILES)) {
    const pattern = keyPattern(key);
    // dotenv keeps the first occurrence, so that is the one that counts.
    const index = lines.findIndex((line) => pattern.test(line));
    if (index !== -1) {
      lineIndex[key] = index;
      current[key] = lineValue(lines[index].match(pattern)[2]);
    }
  }

  const { values, actions, generatedKey } = resolveValues(current, readTemplateDefault(templateText, 'APP_ENCRYPTION_KEY_ID'));
  for (const [key, value] of Object.entries(values)) {
    if (lineIndex[key] !== undefined) {
      lines[lineIndex[key]] = lines[lineIndex[key]].replace(keyPattern(key), `$1${value}`);
    } else {
      if (lines.length && lines[lines.length - 1] === '') {
        lines.pop();
      }
      lines.push(`${key}=${value}`, '');
    }
  }

  if (created || Object.keys(values).length > 0) {
    // .env holds secrets: keep it private to the current user where supported.
    fs.writeFileSync(envPath, lines.join(eol), { mode: 0o600 });
    tryChmod(envPath, 0o600);
  }

  return { report, actions, generatedKey, location: envPath };
}

function tryChmod(target, mode) {
  try {
    fs.chmodSync(target, mode);
  } catch {
    // Not supported on every filesystem (Windows, some bind mounts); harmless.
  }
}

function setupDockerSecrets(outDir) {
  const report = [];
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    report.push(`Created ${outDir}`);
  }
  // The directory keeps other host users out. The files themselves must stay
  // world-readable (0644): Compose bind-mounts each one into the container,
  // where HomeInventory reads it as uid 1001, not as the host user who owns it.
  tryChmod(outDir, 0o700);

  const current = {};
  for (const [key, fileName] of Object.entries(DOCKER_SECRET_FILES)) {
    const filePath = path.join(outDir, fileName);
    current[key] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
  }

  // A fresh secrets directory has no template default for the key id.
  const { values, actions, generatedKey } = resolveValues(current, '');
  for (const [key, value] of Object.entries(values)) {
    const filePath = path.join(outDir, DOCKER_SECRET_FILES[key]);
    fs.writeFileSync(filePath, value, { mode: 0o644 });
    tryChmod(filePath, 0o644);
  }

  return { report, actions, generatedKey, location: outDir };
}

export function runSetup(argv = process.argv.slice(2), log = console.log) {
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return 0;
  }

  const outDir = path.resolve(options.out || (options.docker ? 'secrets' : '.'));
  const result = options.docker ? setupDockerSecrets(outDir) : setupEnvFile(outDir);

  for (const line of result.report) {
    log(line);
  }
  let warnings = 0;
  for (const [action, detail] of result.actions) {
    if (action === 'warning') {
      warnings += 1;
      log(`Warning: ${detail}`);
    } else if (action === 'generated') {
      log(`Generated ${detail}`);
    } else {
      log(`Kept existing ${detail}`);
    }
  }

  if (result.actions.some(([action]) => action === 'generated')) {
    log(`Secrets written to ${result.location}`);
  } else {
    log(`Nothing to do: all secrets in ${result.location} are already set.`);
  }

  if (result.generatedKey) {
    log('');
    log('IMPORTANT: back up APP_ENCRYPTION_KEY and APP_ENCRYPTION_KEY_ID now and keep them');
    log('somewhere safe outside this machine. Encrypted data, including uploaded photos,');
    log('cannot be recovered without them, and a database backup alone is not enough.');
  }

  return warnings > 0 ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runSetup();
  } catch (error) {
    console.error(`setup: ${error.message}`);
    console.error('Run with --help for usage.');
    process.exitCode = 1;
  }
}
