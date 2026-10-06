import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const archivePath = resolve(
  repoRoot,
  'apps/launcher/src-tauri/resources/homeinventory-app.tar.gz'
);
const appPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const launcherPackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/launcher/package.json'), 'utf8')
);

if (!existsSync(archivePath)) {
  console.error(`Managed app archive is missing: ${archivePath}`);
  console.error('Run npm run launcher:bundle-app before building the launcher.');
  process.exit(1);
}

const archivePackageResult = spawnSync(
  'tar',
  ['-xOf', basename(archivePath), './package.json'],
  { cwd: dirname(archivePath), encoding: 'utf8', shell: false }
);

if (archivePackageResult.status !== 0) {
  console.error(`Could not inspect managed app archive: ${archivePath}`);
  console.error(archivePackageResult.stderr || archivePackageResult.stdout);
  console.error('Run npm run launcher:bundle-app to regenerate it.');
  process.exit(archivePackageResult.status || 1);
}

let archivePackage;
try {
  archivePackage = JSON.parse(archivePackageResult.stdout);
} catch (error) {
  console.error(`Managed app archive contains an invalid package.json: ${error.message}`);
  process.exit(1);
}

const versions = {
  app: appPackage.version,
  launcher: launcherPackage.version,
  archive: archivePackage.version,
};

if (new Set(Object.values(versions)).size !== 1) {
  console.error(
    `Managed app version mismatch: app=${versions.app}, launcher=${versions.launcher}, archive=${versions.archive}.`
  );
  console.error('Run npm run launcher:bundle-app before building the launcher.');
  process.exit(1);
}

// The launcher runs managed installs in production mode, so the archive must
// carry the prebuilt client and must not carry any installed dependencies.
const listResult = spawnSync('tar', ['-tzf', basename(archivePath)], {
  cwd: dirname(archivePath),
  encoding: 'utf8',
  shell: false,
  maxBuffer: 64 * 1024 * 1024
});

if (listResult.status !== 0) {
  console.error(`Could not list managed app archive: ${archivePath}`);
  console.error(listResult.stderr || listResult.stdout);
  process.exit(listResult.status || 1);
}

const entries = listResult.stdout
  .split('\n')
  .filter(Boolean)
  .map((entry) => entry.replace(/^\.\//, ''));

if (!entries.includes('client/dist/index.html')) {
  console.error('Managed app archive does not include the prebuilt client (client/dist/index.html).');
  console.error('Run npm run build and then npm run launcher:bundle-app.');
  process.exit(1);
}

const dependencyEntry = entries.find((entry) => /(^|\/)node_modules\//.test(entry));
if (dependencyEntry) {
  console.error(`Managed app archive must not contain installed dependencies: ${dependencyEntry}`);
  process.exit(1);
}

console.log(`Managed app archive verified: v${versions.archive} (prebuilt client included)`);
