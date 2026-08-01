import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readCargoVersion(relativePath) {
  const contents = readText(relativePath);
  const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
  return match?.[1] || '';
}

function readCargoLockVersion(relativePath, packageName) {
  const packageBlock = readText(relativePath)
    .split('[[package]]')
    .find((block) => new RegExp(`^\\s*name\\s*=\\s*"${packageName}"`, 'm').test(block));
  return packageBlock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || '';
}

function readMatch(relativePath, pattern) {
  return readText(relativePath).match(pattern)?.[1] || '';
}

const rootPackage = readJson('package.json');
const clientPackage = readJson('client/package.json');
const launcherPackage = readJson('apps/launcher/package.json');

const versions = new Map([
  ['package.json', rootPackage.version],
  ['package-lock.json', readJson('package-lock.json').version],
  ['client/package.json', clientPackage.version],
  ['client/package-lock.json', readJson('client/package-lock.json').version],
  ['apps/launcher/package.json', launcherPackage.version],
  ['apps/launcher/package-lock.json', readJson('apps/launcher/package-lock.json').version],
  ['apps/launcher/src-tauri/tauri.conf.json', readJson('apps/launcher/src-tauri/tauri.conf.json').version],
  ['apps/launcher/src-tauri/Cargo.toml', readCargoVersion('apps/launcher/src-tauri/Cargo.toml')],
  [
    'apps/launcher/src-tauri/Cargo.lock',
    readCargoLockVersion('apps/launcher/src-tauri/Cargo.lock', 'homeinventory-launcher')
  ],
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

const nodeEngines = new Map([
  ['package.json', rootPackage.engines?.node || ''],
  ['client/package.json', clientPackage.engines?.node || ''],
  ['apps/launcher/package.json', launcherPackage.engines?.node || '']
]);
const normalizedNodeVersions = new Map(
  [...nodeEngines].map(([file, requirement]) => {
    const match = String(requirement).match(/^>=\s*(\d+\.\d+\.\d+)$/);
    return [file, match?.[1] || ''];
  })
);
const requiredNodeVersions = new Set(normalizedNodeVersions.values());
if (requiredNodeVersions.size !== 1 || requiredNodeVersions.has('')) {
  console.error('Node.js engine requirements must use the same exact minimum version.');
  for (const [file, requirement] of nodeEngines.entries()) {
    console.error(`${file}: ${requirement || '(missing)'}`);
  }
  process.exit(1);
}

const requiredNodeVersion = [...requiredNodeVersions][0];
const requiredNodeMajor = requiredNodeVersion.split('.')[0];
const runtimeVersions = new Map([
  [
    '.github/workflows/ci.yml',
    readMatch('.github/workflows/ci.yml', /node-version:\s*["']?(\d+\.\d+\.\d+)["']?/)
  ],
  [
    '.github/workflows/launcher-packages.yml',
    readMatch('.github/workflows/launcher-packages.yml', /NODE_VERSION:\s*["'](\d+\.\d+\.\d+)["']/)
  ],
  [
    'apps/launcher/src-tauri/src/lib.rs',
    readMatch(
      'apps/launcher/src-tauri/src/lib.rs',
      /const PORTABLE_NODE_VERSION:\s*&str\s*=\s*"(\d+\.\d+\.\d+)"/
    )
  ],
  [
    'scripts/build-store-windows.mjs',
    readMatch(
      'scripts/build-store-windows.mjs',
      /const portableNodeVersion\s*=\s*'(\d+\.\d+\.\d+)'/
    )
  ]
]);
const mismatchedRuntimeVersions = [...runtimeVersions]
  .filter(([, version]) => version !== requiredNodeVersion);
if (mismatchedRuntimeVersions.length > 0) {
  console.error(`Node.js runtimes must match package engines (${requiredNodeVersion}).`);
  for (const [file, version] of runtimeVersions.entries()) {
    console.error(`${file}: ${version || '(missing)'}`);
  }
  process.exit(1);
}

const runtimeMajors = new Map([
  [
    '.github/workflows/launcher-packages.yml --node-major',
    readMatch('.github/workflows/launcher-packages.yml', /--node-major\s+(\d+)/)
  ],
  [
    'scripts/create-app-release-manifest.mjs',
    readMatch(
      'scripts/create-app-release-manifest.mjs',
      /readArg\('node-major',\s*'(\d+)'\)/
    )
  ],
  [
    'apps/launcher/src-tauri/src/lib.rs REQUIRED_NODE_MAJOR',
    readMatch(
      'apps/launcher/src-tauri/src/lib.rs',
      /const REQUIRED_NODE_MAJOR:\s*u32\s*=\s*(\d+)/
    )
  ]
]);
const mismatchedRuntimeMajors = [...runtimeMajors]
  .filter(([, major]) => major !== requiredNodeMajor);
if (mismatchedRuntimeMajors.length > 0) {
  console.error(`Node.js major-version metadata must match package engines (${requiredNodeMajor}).`);
  for (const [file, major] of runtimeMajors.entries()) {
    console.error(`${file}: ${major || '(missing)'}`);
  }
  process.exit(1);
}

console.log(`Node.js runtime parity check passed: ${requiredNodeVersion} (major ${requiredNodeMajor})`);
