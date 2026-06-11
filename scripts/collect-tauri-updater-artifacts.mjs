import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
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
  if (!existsSync(dir)) return files;
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

function updaterSuffix(name) {
  const suffixes = [
    '.app.tar.gz',
    '.AppImage.tar.gz',
    '.nsis.zip',
    '.msi.zip',
    '.tar.gz',
    '.zip'
  ];
  return suffixes.find((suffix) => name.endsWith(suffix)) || extname(name);
}

const bundleDir = resolve(repoRoot, readArg('bundle-dir', 'apps/launcher/src-tauri/target/release/bundle'));
const outputDir = resolve(repoRoot, readArg('output-dir', 'artifacts'));
const platform = readArg('platform', '');
const version = readArg('version', '');

if (!platform) fail('--platform is required.');
mkdirSync(outputDir, { recursive: true });

const packageVersion =
  version || JSON.parse(readFileSync(resolve(repoRoot, 'apps/launcher/package.json'), 'utf8')).version;

let count = 0;
for (const sigPath of walk(bundleDir).filter((path) => path.endsWith('.sig'))) {
  const artifactPath = sigPath.slice(0, -4);
  if (!existsSync(artifactPath)) continue;

  const suffix = updaterSuffix(basename(artifactPath));
  const targetBase = `HomeInventory Launcher_${packageVersion}_${platform}${suffix}`;
  const targetArtifact = join(outputDir, targetBase);
  const targetSig = `${targetArtifact}.sig`;

  mkdirSync(dirname(targetArtifact), { recursive: true });
  copyFileSync(artifactPath, targetArtifact);
  copyFileSync(sigPath, targetSig);
  count += 1;
  console.log(`Collected updater artifact ${targetBase}`);
}

if (count === 0) {
  fail(`No Tauri updater .sig artifacts found in ${bundleDir}`);
}
