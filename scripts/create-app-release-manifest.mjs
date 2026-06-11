import { createHash, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readBoolArg(name, fallback) {
  const value = readArg(name, String(fallback));
  return value === 'true';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function privateKeyPem() {
  const raw =
    process.env.HOMEINVENTORY_APP_MANIFEST_PRIVATE_KEY_PEM ||
    process.env.HOMEINVENTORY_APP_MANIFEST_PRIVATE_KEY ||
    '';

  if (!raw.trim()) {
    return null;
  }

  return raw.includes('BEGIN PRIVATE KEY')
    ? raw.replace(/\\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8').replace(/\\n/g, '\n');
}

const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const version = readArg('version', rootPackage.version);
const archivePath = resolve(
  repoRoot,
  readArg('archive', 'apps/launcher/src-tauri/resources/homeinventory-app.tar.gz')
);
const url = readArg(
  'url',
  `https://github.com/asdteke/HomeInventory/releases/download/v${version}/homeinventory-app.tar.gz`
);
const nodeMajor = Number(readArg('node-major', '20'));
const rootInstall = readBoolArg('root-install', true);
const clientInstall = readBoolArg('client-install', true);
const outputPath = resolve(repoRoot, readArg('output', 'dist/release/homeinventory-app-manifest.json'));

if (!existsSync(archivePath)) {
  fail(`Archive not found: ${archivePath}`);
}

if (!Number.isInteger(nodeMajor) || nodeMajor < 18 || nodeMajor > 30) {
  fail('--node-major must be an integer between 18 and 30.');
}

const archive = readFileSync(archivePath);
const sha256 = createHash('sha256').update(archive).digest('hex');
const message = `${version}:${sha256}:${url}:${nodeMajor}:${rootInstall}:${clientInstall}`;
const key = privateKeyPem();
const signature = key ? sign(null, Buffer.from(message), key).toString('hex') : 'unsigned';

const manifest = {
  version,
  sha256,
  url,
  nodeMajor,
  rootInstall,
  clientInstall,
  signature
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Created ${outputPath}`);
console.log(`SHA-256 ${sha256}`);
