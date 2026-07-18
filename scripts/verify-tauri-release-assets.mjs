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

if (!expectedVersion) fail('--version is required.');
if (!existsSync(assetsDir)) fail(`Release assets directory not found: ${assetsDir}`);

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
