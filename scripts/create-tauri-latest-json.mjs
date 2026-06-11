import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readArg(name, fallback) {
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
    if (stats.isDirectory()) {
      walk(path, files);
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function assetUrl(baseUrl, fileName) {
  return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(fileName)}`;
}

const assetsDir = resolve(repoRoot, readArg('assets-dir', 'release-assets'));
const outputPath = resolve(repoRoot, readArg('output', 'release-assets/latest.json'));
const version = readArg(
  'version',
  JSON.parse(readFileSync(resolve(repoRoot, 'apps/launcher/package.json'), 'utf8')).version
);
const releaseTag = readArg('release-tag', `v${version}`);
const baseUrl = readArg(
  'base-url',
  `https://github.com/asdteke/HomeInventory/releases/download/${releaseTag}`
);
const notes = readArg('notes', 'HomeInventory Launcher update.');
const pubDate = readArg('pub-date', new Date().toISOString());

if (!existsSync(assetsDir)) {
  fail(`Assets directory not found: ${assetsDir}`);
}

const platformKeys = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'];
const platforms = {};

for (const sigPath of walk(assetsDir).filter((path) => path.endsWith('.sig'))) {
  const sigName = basename(sigPath);
  const artifactName = sigName.slice(0, -4);
  const platform = platformKeys.find((key) => artifactName.includes(`_${key}`));
  const artifactPath = join(dirname(sigPath), artifactName);
  if (!platform || !existsSync(artifactPath)) continue;

  platforms[platform] = {
    signature: readFileSync(sigPath, 'utf8').trim(),
    url: assetUrl(baseUrl, artifactName)
  };
}

if (Object.keys(platforms).length === 0) {
  fail('No platform updater artifacts were found for latest.json.');
}

const latest = {
  version,
  notes,
  pub_date: pubDate,
  platforms
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Created ${outputPath}`);
