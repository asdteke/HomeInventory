import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJsonVersion(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')).version;
}

function readCargoVersion(relativePath) {
  const contents = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
  return match?.[1] || '';
}

const versions = new Map([
  ['package.json', readJsonVersion('package.json')],
  ['client/package.json', readJsonVersion('client/package.json')],
  ['apps/launcher/package.json', readJsonVersion('apps/launcher/package.json')],
  ['apps/launcher/src-tauri/tauri.conf.json', readJsonVersion('apps/launcher/src-tauri/tauri.conf.json')],
  ['apps/launcher/src-tauri/Cargo.toml', readCargoVersion('apps/launcher/src-tauri/Cargo.toml')],
]);

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size !== 1 || uniqueVersions.has('')) {
  console.error('App and launcher versions must match exactly.');
  for (const [file, version] of versions.entries()) {
    console.error(`${file}: ${version || '(missing)'}`);
  }
  process.exit(1);
}

console.log(`Version parity check passed: ${[...uniqueVersions][0]}`);
