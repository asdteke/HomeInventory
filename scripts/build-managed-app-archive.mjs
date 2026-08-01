import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(
  repoRoot,
  process.argv[2] || 'apps/launcher/src-tauri/resources/homeinventory-app.tar.gz'
);
const stagingRoot = resolve(repoRoot, '.local/release/managed-app-staging');

const excludedNames = new Set([
  '.DS_Store',
  '.aider.chat.history.md',
  '.aider.input.history',
  '.aider.tags.cache.v4',
  '.codex',
  '.git',
  '.github',
  '.local',
  '.npm-cache',
  '.npm-tmp',
  'apps',
  'cloud-reference',
  'data',
  'dist',
  'brand-local',
  'local-brands',
  'node_modules',
  'private-brands',
  'remote-edit',
  'scratch',
  'secrets',
  'test-results',
  'tests',
  'uploads'
]);

const excludedExtensions = new Set([
  '.db',
  '.dmg',
  '.log',
  '.sqlite',
  '.tar.gz'
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function archiveEntries(path) {
  const result = spawnSync('tar', ['-tzf', path], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false
  });

  if (result.status !== 0) {
    fail(`tar -tzf ${path} failed with status ${result.status}`);
  }

  return result.stdout.split('\n').filter(Boolean);
}

function isExcluded(path) {
  const rel = relative(repoRoot, path);
  const parts = rel.split(sep);
  const name = basename(path);

  if (!rel || rel.startsWith('..')) return true;
  if (rel === 'client' || rel.startsWith(`client${sep}`)) {
    const clientRelative = rel.slice('client'.length + 1);
    if (clientRelative === 'dist' || clientRelative.startsWith(`dist-`)) return true;
  }
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true;
  if (excludedNames.has(name) || parts.some((part) => excludedNames.has(part))) return true;
  if (name.endsWith('.tar.gz')) return true;
  return [...excludedExtensions].some((ext) => name.endsWith(ext));
}

function copyTree(source, target) {
  if (isExcluded(source)) return;

  const stats = statSync(source);
  if (stats.isSymbolicLink()) return;

  if (stats.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyTree(join(source, entry), join(target, entry));
    }
    return;
  }

  if (!stats.isFile()) return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

for (const entry of readdirSync(repoRoot)) {
  copyTree(join(repoRoot, entry), join(stagingRoot, entry));
}

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'server.js',
  'scripts/dev.mjs',
  'client/package.json',
  'client/package-lock.json'
];

for (const file of requiredFiles) {
  if (!existsSync(join(stagingRoot, file))) {
    fail(`Managed app archive is missing required file: ${file}`);
  }
}

rmSync(outputPath, { force: true });
run('tar', ['-czf', outputPath, '-C', stagingRoot, '.']);

const forbiddenArchivePatterns = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)/,
  /(^|\/)node_modules\//,
  /(^|\/)apps\//,
  /(^|\/)data\//,
  /(^|\/)client\/dist(?:-[^/]+)?\//,
  /(^|\/)local-brands\//,
  /(^|\/)private-brands\//,
  /(^|\/)brand-local\//,
  /(^|\/)uploads\//,
  /(^|\/)secrets\//,
  /(^|\/).*\.db$/,
  /(^|\/).*\.sqlite$/
];
const forbiddenEntry = archiveEntries(outputPath).find((entry) =>
  forbiddenArchivePatterns.some((pattern) => pattern.test(entry.replace(/^\.\//, '')))
);
if (forbiddenEntry) {
  fail(`Managed app archive contains forbidden entry: ${forbiddenEntry}`);
}

console.log(`Created ${outputPath}`);
