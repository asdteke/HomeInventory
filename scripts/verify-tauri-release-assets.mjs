import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, files);
    else if (stats.isFile()) files.push(path);
  }
  return files;
}

const assetsDir = resolve(repoRoot, readArg('assets-dir', 'release-assets'));
const expectedVersion = readArg('version');
const publicRelease = process.argv.includes('--public');
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const nodeEngineMatch = String(rootPackage.engines?.node || '').match(/>=\s*(\d+)(?:\.\d+){0,2}/);
const expectedNodeMajor = Number(nodeEngineMatch?.[1]);
const manifestPublicKeyBase64 = readArg(
  'public-key-base64',
  'GaUIILPldrqF7o0X0XfuDo8i45eXCS4lFCnFjulnCh8='
);

if (!expectedVersion) fail('--version is required.');
if (!existsSync(assetsDir)) fail(`Release assets directory not found: ${assetsDir}`);
if (!Number.isInteger(expectedNodeMajor)) {
  fail('package.json must declare a minimum Node.js engine such as >=22.22.0.');
}

const files = walk(assetsDir);
const names = new Set(files.map((file) => basename(file)));
for (const required of [
  'homeinventory-app.tar.gz',
  'homeinventory-app-manifest.json',
  'latest.json'
]) {
  if (!names.has(required)) fail(`Required release asset is missing: ${required}`);
}

const manifest = JSON.parse(
  readFileSync(join(assetsDir, 'homeinventory-app-manifest.json'), 'utf8')
);
if (manifest.version !== expectedVersion) {
  fail(`Managed app manifest version ${manifest.version} does not match ${expectedVersion}.`);
}
if (!manifest.signatureV2 || manifest.signatureV2 === 'unsigned') {
  fail('Managed app release manifest is not signed.');
}
if (manifest.nodeMajor !== expectedNodeMajor) {
  fail(
    `Managed app manifest requires Node.js ${manifest.nodeMajor}; package.json requires major ${expectedNodeMajor}.`
  );
}
if (manifest.rootInstall !== true || manifest.clientInstall !== true) {
  fail('Managed app manifest must install both root and client dependencies.');
}
const expectedArchiveUrl =
  `https://github.com/asdteke/HomeInventory/releases/download/v${expectedVersion}/homeinventory-app.tar.gz`;
if (manifest.url !== expectedArchiveUrl) {
  fail(`Managed app archive URL must be ${expectedArchiveUrl}.`);
}

const archivePath = join(assetsDir, 'homeinventory-app.tar.gz');
const actualArchiveSha256 = createHash('sha256')
  .update(readFileSync(archivePath))
  .digest('hex');
if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))) {
  fail('Managed app manifest SHA-256 must be a 64-character hex string.');
}
if (manifest.sha256.toLowerCase() !== actualArchiveSha256) {
  fail('Managed app manifest SHA-256 does not match homeinventory-app.tar.gz.');
}

const rawPublicKey = Buffer.from(manifestPublicKeyBase64, 'base64');
if (rawPublicKey.length !== 32) {
  fail('Managed app manifest public key must decode to 32 bytes.');
}
const signature = /^[a-f0-9]{128}$/i.test(manifest.signatureV2)
  ? Buffer.from(manifest.signatureV2, 'hex')
  : Buffer.from(manifest.signatureV2, 'base64');
if (signature.length !== 64) {
  fail('Managed app manifest signature must decode to 64 bytes.');
}
const publicKey = createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    rawPublicKey
  ]),
  format: 'der',
  type: 'spki'
});
const signedMessage = [
  manifest.version,
  manifest.sha256,
  manifest.url,
  manifest.nodeMajor,
  manifest.rootInstall,
  manifest.clientInstall
].join(':');
if (!verify(null, Buffer.from(signedMessage), publicKey, signature)) {
  fail('Managed app manifest signature verification failed.');
}

const latest = JSON.parse(readFileSync(join(assetsDir, 'latest.json'), 'utf8'));
if (latest.version !== expectedVersion) {
  fail(`Launcher updater version ${latest.version} does not match ${expectedVersion}.`);
}

const requiredPlatforms = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
  'linux-x86_64'
];
for (const platform of requiredPlatforms) {
  const entry = latest.platforms?.[platform];
  if (!entry?.signature?.trim()) fail(`Updater signature is missing for ${platform}.`);
  if (!entry?.url) fail(`Updater URL is missing for ${platform}.`);

  const artifactName = decodeURIComponent(new URL(entry.url).pathname.split('/').pop() || '');
  if (!artifactName || !names.has(artifactName)) {
    fail(`Updater artifact referenced by ${platform} is missing: ${artifactName || entry.url}`);
  }
  if (!publicRelease && !names.has(`${artifactName}.sig`)) {
    fail(`Updater signature file is missing for ${artifactName}.`);
  }
}

const installerChecks = publicRelease ? [
  ['macOS Apple Silicon DMG', (name) => name.includes('darwin-aarch64') && name.endsWith('.dmg')],
  ['macOS Intel DMG', (name) => name.includes('darwin-x86_64') && name.endsWith('.dmg')],
  ['Windows installer', (name) => name.includes('windows-x86_64') && name.endsWith('.exe')],
  ['Linux AppImage', (name) => name.includes('linux-x86_64') && name.endsWith('.AppImage')]
] : [
  ['macOS Apple Silicon DMG', (name) => name.includes('darwin-aarch64') && name.endsWith('.dmg')],
  ['macOS Intel DMG', (name) => name.includes('darwin-x86_64') && name.endsWith('.dmg')],
  ['Windows NSIS installer', (name) => name.endsWith('_x64-setup.exe')],
  ['Windows MSI installer', (name) => name.endsWith('_x64_en-US.msi')],
  ['Linux AppImage', (name) => name.endsWith('_amd64.AppImage')],
  ['Linux Debian package', (name) => name.endsWith('_amd64.deb')],
  ['Linux RPM package', (name) => name.endsWith('.x86_64.rpm')]
];
for (const [label, predicate] of installerChecks) {
  if (![...names].some(predicate)) fail(`${label} is missing from the release.`);
}

if (publicRelease && names.size !== 12) {
  fail(`Public release should contain exactly 12 focused assets, found ${names.size}.`);
}

console.log(`Verified synchronized HomeInventory ${expectedVersion}${publicRelease ? ' public' : ''} release assets.`);
