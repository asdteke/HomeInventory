import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
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

function githubAssetName(name) {
  return name.replace(/\s+/g, '.');
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
  'homeinventory-app-manifest.json'
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

for (const [platform, suffixes] of [
  ['windows-x86_64', ['.msi']],
  ['linux-x86_64', ['.deb', '.rpm']]
]) {
  for (const suffix of suffixes) {
    const matches = filesIn(sourceDir).filter((path) => {
      const name = basename(path);
      return name.includes(`_${platform}`) && name.endsWith(suffix);
    });
    if (matches.length !== 1) {
      fail(`Expected exactly one ${platform} ${suffix} package, found ${matches.length}.`);
    }
    selectedNames.add(basename(matches[0]));
  }
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const name of selectedNames) {
  if (!name) fail('An updater URL resolved to an empty asset name.');
  const source = join(sourceDir, name);
  if (!existsSync(source)) fail(`Selected release asset is missing: ${name}`);
  copyFileSync(source, join(outputDir, githubAssetName(name)));
}


for (const entry of Object.values(latest.platforms || {})) {
  const rawName = decodeURIComponent(new URL(entry.url).pathname.split('/').pop() || '');
  const safeName = githubAssetName(rawName);
  entry.url = `${entry.url.slice(0, entry.url.lastIndexOf('/') + 1)}${encodeURIComponent(safeName)}`;
}
writeFileSync(join(outputDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);

console.log(`Staged ${selectedNames.size + 1} public HomeInventory ${expectedVersion} release assets.`);
