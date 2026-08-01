import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { get } from 'node:https';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const launcherDir = resolve(repoRoot, 'apps/launcher');
const tauriDir = resolve(launcherDir, 'src-tauri');
const resourcesDir = resolve(tauriDir, 'resources');
const storeRoot = resolve(repoRoot, '.local/store');
const stagingRoot = resolve(storeRoot, 'app-staging');
const distStore = resolve(repoRoot, 'dist/store');
const appArchivePath = resolve(resourcesDir, 'homeinventory-app-store.tar.gz');
const portableNodeVersion = '22.22.0';
const nodeFileName = `node-v${portableNodeVersion}-win-x64.zip`;
const nodeZipUrl = `https://nodejs.org/dist/v${portableNodeVersion}/${nodeFileName}`;
const nodeZipPath = resolve(resourcesDir, nodeFileName);
const storeTauriConfigPath = resolve(storeRoot, 'tauri.store.conf.json');
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const launcherPackage = JSON.parse(readFileSync(resolve(launcherDir, 'package.json'), 'utf8'));

const excludedRootNames = new Set([
  '.DS_Store',
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
  'remote-edit',
  'scratch',
  'secrets',
  'test-results',
  'tests',
  'uploads'
]);

const includedRootEntries = new Set([
  'app.js',
  'auth.js',
  'client',
  'config',
  'database.js',
  'LICENSE',
  'locales',
  'middleware',
  'node_modules',
  'package.json',
  'package-lock.json',
  'README.md',
  'routes',
  'server.js',
  'THIRD_PARTY_NOTICES.md',
  'utils',
  'vendor',
  '.env.example'
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const executable = command === 'npm' && process.env.npm_execpath
    ? process.execPath
    : command;
  const executableArgs = command === 'npm' && process.env.npm_execpath
    ? [process.env.npm_execpath, ...args]
    : args;
  const env = {
    ...process.env,
    npm_config_userconfig: 'NUL',
    ...options.env
  };
  const result = spawnSync(executable, executableArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
    env
  });

  if (result.status !== 0) {
    fail(`${executable} ${executableArgs.join(' ')} failed with status ${result.status}`);
  }
}

function assertWindows() {
  if (process.platform !== 'win32') {
    fail('Microsoft Store package builds must run on Windows so native node_modules match the target platform.');
  }
}

function copyTree(source, target) {
  const rel = relative(repoRoot, source);
  const parts = rel.split(sep);
  const name = basename(source);

  if (!rel || rel.startsWith('..')) return;
  if (parts.length === 1 && !includedRootEntries.has(name)) return;
  if (parts.length === 1 && excludedRootNames.has(name)) return;
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return;
  if (rel.startsWith(`client${sep}`) && !rel.startsWith(`client${sep}dist`) && rel !== `client${sep}package.json`) return;
  if (rel.includes(`${sep}node_modules${sep}.cache${sep}`)) return;
  if (parts.includes('node_modules') && parts.some((part) => part.startsWith('oci-'))) return;

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

async function download(url, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  await new Promise((resolveDownload, rejectDownload) => {
    get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        download(response.headers.location, destination).then(resolveDownload, rejectDownload);
        return;
      }
      if (response.statusCode !== 200) {
        rejectDownload(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }
      pipeline(response, createWriteStream(destination)).then(resolveDownload, rejectDownload);
    }).on('error', rejectDownload);
  });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyStoreArtifacts() {
  try {
    rmSync(distStore, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Could not remove ${distStore} directly, cleaning contents: ${err.message}`);
    if (existsSync(distStore)) {
      for (const entry of readdirSync(distStore)) {
        try {
          rmSync(join(distStore, entry), { recursive: true, force: true });
        } catch (e) {
          console.error(`Failed to delete ${entry}: ${e.message}`);
        }
      }
    }
  }
  if (!existsSync(distStore)) {
    mkdirSync(distStore, { recursive: true });
  }
  const bundleRoot = resolve(tauriDir, 'target/release/bundle');
  const collected = [];

  function collect(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(full);
      } else if (/\.(exe|msi)$/i.test(entry.name)) {
        const target = resolve(distStore, entry.name);
        copyFileSync(full, target);
        collected.push(target);
      }
    }
  }

  collect(bundleRoot);
  if (!collected.length) {
    fail('No Windows installer artifacts were produced by Tauri.');
  }

  const checksums = collected
    .map((file) => `${sha256(file)}  ${basename(file)}`)
    .join('\n');
  writeFileSync(resolve(distStore, 'SHA256SUMS.txt'), `${checksums}\n`);
  writeFileSync(resolve(distStore, 'MICROSOFT_STORE_UPLOAD_CHECKLIST.md'), `# HomeInventory Local Store Upload Checklist

- Product name: HomeInventory Local
- Distribution: Microsoft Store only
- Version: ${rootPackage.version}
- Launcher version: ${launcherPackage.version}
- Privacy policy: mention same-network LAN/QR access, optional Google Sign-In, barcode lookup providers, and Microsoft Store updates.
- Upload the generated Windows installer from this folder.
- Verify on a clean Windows 11 machine with Node.js uninstalled and network disabled after install.
`);
}

async function main() {
  assertWindows();
  mkdirSync(resourcesDir, { recursive: true });
  mkdirSync(storeRoot, { recursive: true });

  if (!existsSync(resolve(repoRoot, 'node_modules'))) {
    run('npm', ['ci', '--ignore-scripts']);
  }

  try {
    console.log('Applying custom uuid mock to node_modules/uuid...');
    const uuidDest = resolve(repoRoot, 'node_modules/uuid');
    rmSync(uuidDest, { recursive: true, force: true });
    mkdirSync(uuidDest, { recursive: true });
    copyFileSync(resolve(repoRoot, 'vendor/uuid/package.json'), join(uuidDest, 'package.json'));
    copyFileSync(resolve(repoRoot, 'vendor/uuid/index.cjs'), join(uuidDest, 'index.cjs'));
    copyFileSync(resolve(repoRoot, 'vendor/uuid/index.cjs'), join(uuidDest, 'index.js'));
    copyFileSync(resolve(repoRoot, 'vendor/uuid/v1.cjs'), join(uuidDest, 'v1.cjs'));
  } catch (err) {
    console.warn('Warning: Could not re-apply custom uuid mock (might be in use or already set):', err.message);
  }

  const sqliteBinary = resolve(repoRoot, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');
  if (!existsSync(sqliteBinary)) {
    run('node', [
      resolve(repoRoot, 'node_modules/prebuild-install/bin.js'),
      '--runtime=node',
      `--target=${portableNodeVersion}`,
      '--platform=win32',
      '--arch=x64'
    ], {
      cwd: resolve(repoRoot, 'node_modules/better-sqlite3')
    });
  }

  if (!existsSync(resolve(repoRoot, 'client/node_modules'))) {
    run('npm', ['ci', '--prefix', 'client']);
  }
  run('npm', ['run', 'build', '--prefix', 'client']);
  if (!existsSync(resolve(repoRoot, 'apps/launcher/node_modules'))) {
    run('npm', ['ci', '--prefix', 'apps/launcher']);
  }
  run('npm', ['run', 'build', '--prefix', 'apps/launcher'], {
    env: {
      ...process.env,
      VITE_HOMEINVENTORY_DISTRIBUTION: 'store'
    }
  });

  if (!existsSync(resolve(repoRoot, 'node_modules'))) {
    fail('Root node_modules is missing after npm ci.');
  }
  if (!existsSync(resolve(repoRoot, 'client/dist/index.html'))) {
    fail('client/dist is missing after client build.');
  }

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  for (const entry of readdirSync(repoRoot)) {
    copyTree(join(repoRoot, entry), join(stagingRoot, entry));
  }

  rmSync(appArchivePath, { force: true });
  run('tar', ['-czf', appArchivePath, '-C', stagingRoot, '.']);

  if (process.env.STORE_NODE_ZIP) {
    copyFileSync(resolve(process.env.STORE_NODE_ZIP), nodeZipPath);
  } else if (!existsSync(nodeZipPath)) {
    console.log(`Downloading ${nodeZipUrl}`);
    await download(nodeZipUrl, nodeZipPath);
  }
  copyFileSync(
    resolve(repoRoot, 'THIRD_PARTY_NOTICES.md'),
    resolve(resourcesDir, 'THIRD_PARTY_NOTICES.md')
  );

  writeFileSync(storeTauriConfigPath, `${JSON.stringify({
    productName: 'HomeInventory Local',
    version: launcherPackage.version,
    identifier: 'net.homeinventory.local',
    app: {
      windows: [{
        label: 'main',
        title: 'HomeInventory Local',
        width: 460,
        height: 720,
        resizable: false,
        maximizable: false,
        fullscreen: false
      }]
    },
    bundle: {
      active: true,
      targets: ['nsis', 'msi'],
      resources: [
        'resources/homeinventory-app-store.tar.gz',
        `resources/${nodeFileName}`,
        'resources/THIRD_PARTY_NOTICES.md'
      ],
      windows: {
        nsis: {
          installerHooks: resolve(tauriDir, 'hooks.nsh')
        }
      }
    }
  }, null, 2)}\n`);

  rmSync(resolve(tauriDir, 'target/release/bundle'), { recursive: true, force: true });
  run('node', [
    'node_modules/@tauri-apps/cli/tauri.js',
    'build',
    '--bundles',
    'nsis,msi',
    '--config',
    storeTauriConfigPath
  ], {
    cwd: launcherDir,
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '1',
      HOMEINVENTORY_DISTRIBUTION: 'store',
      VITE_HOMEINVENTORY_DISTRIBUTION: 'store'
    }
  });

  copyStoreArtifacts();
  console.log(`Created Microsoft Store artifacts in ${distStore}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
