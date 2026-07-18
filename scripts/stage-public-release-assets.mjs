import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
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

function filesIn(directory) {
  return readdirSync(directory)
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile());
}

const sourceDir = resolve(repoRoot, readArg('source', 'release-assets'));
const outputDir = resolve(repoRoot, readArg('output', 'public-release-assets'));
const expectedVersion = readArg('version');

if (!expectedVersion) fail('--version is required.');
if (!existsSync(sourceDir)) fail(`Release assets directory not found: ${sourceDir}`);

const latestPath = join(sourceDir, 'latest.json');
if (!existsSync(latestPath)) fail('latest.json is missing.');
const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
if (latest.version !== expectedVersion) {
  fail(`latest.json version ${latest.version} does not match ${expectedVersion}.`);
}

const selectedNames = new Set([
  'homeinventory-app.tar.gz',
  'homeinventory-app-manifest.json',
  'latest.json'
]);

for (const [platform, entry] of Object.entries(latest.platforms || {})) {
  if (!entry?.url || !entry?.signature) fail(`Incomplete updater entry for ${platform}.`);
  selectedNames.add(decodeURIComponent(new URL(entry.url).pathname.split('/').pop() || ''));
}

for (const platform of ['darwin-aarch64', 'darwin-x86_64']) {
  const matches = filesIn(sourceDir).filter((path) => {
    const name = basename(path);
    return name.includes(`_${platform}`) && name.endsWith('.dmg');
  });
  if (matches.length !== 1) {
    fail(`Expected exactly one ${platform} DMG, found ${matches.length}.`);
  }
  selectedNames.add(basename(matches[0]));
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const name of selectedNames) {
  if (!name) fail('An updater URL resolved to an empty asset name.');
  const source = join(sourceDir, name);
  if (!existsSync(source)) fail(`Selected release asset is missing: ${name}`);
  copyFileSync(source, join(outputDir, name));
}

console.log(`Staged ${selectedNames.size} public HomeInventory ${expectedVersion} release assets.`);
