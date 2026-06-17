import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const launcherDir = resolve(repoRoot, 'apps/launcher');
const tauriDir = resolve(repoRoot, 'apps/launcher/src-tauri');
const bundleDir = resolve(tauriDir, 'target/release/bundle');
const launcherPackage = JSON.parse(readFileSync(resolve(launcherDir, 'package.json'), 'utf8'));
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const managedAppArchive = resolve(tauriDir, 'resources/homeinventory-app.tar.gz');

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false,
        ...options
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function defaultBundles() {
    if (process.env.LAUNCHER_BUNDLES) {
        return process.env.LAUNCHER_BUNDLES;
    }

    if (platform() === 'darwin') {
        return 'app';
    }

    if (platform() === 'win32') {
        return 'nsis,msi';
    }

    return 'appimage,deb,rpm';
}

function macArchLabel() {
    return arch() === 'arm64' ? 'aarch64' : arch();
}

function createMacDmg() {
    const appPath = resolve(bundleDir, 'macos/HomeInventory Launcher.app');
    const dmgDir = resolve(bundleDir, 'dmg');
    const dmgPath = resolve(dmgDir, `HomeInventory Launcher_${launcherPackage.version}_${macArchLabel()}.dmg`);

    mkdirSync(dmgDir, { recursive: true });
    rmSync(dmgPath, { force: true });

    run('hdiutil', [
        'create',
        '-volname',
        'HomeInventory Launcher',
        '-srcfolder',
        appPath,
        '-ov',
        '-format',
        'UDZO',
        dmgPath
    ]);

    run('hdiutil', ['verify', dmgPath]);
}

function readManagedAppArchiveVersion() {
    const result = spawnSync('tar', ['-xOf', managedAppArchive, './package.json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: false
    });

    if (result.status !== 0) {
        console.error(`Could not inspect managed app archive at ${managedAppArchive}.`);
        console.error('Run npm run launcher:bundle-app before building the launcher.');
        process.exit(result.status || 1);
    }

    try {
        return JSON.parse(result.stdout).version;
    } catch (error) {
        console.error(`Could not parse package.json from ${managedAppArchive}: ${error.message}`);
        process.exit(1);
    }
}

function verifyManagedAppArchiveVersion() {
    const archiveVersion = readManagedAppArchiveVersion();
    if (archiveVersion !== rootPackage.version || archiveVersion !== launcherPackage.version) {
        console.error(
            `Managed app archive version mismatch: archive=${archiveVersion}, app=${rootPackage.version}, launcher=${launcherPackage.version}.`
        );
        console.error('Run npm run launcher:bundle-app to regenerate apps/launcher/src-tauri/resources/homeinventory-app.tar.gz.');
        process.exit(1);
    }
}

const bundles = defaultBundles();
verifyManagedAppArchiveVersion();
run('node', ['node_modules/@tauri-apps/cli/tauri.js', 'build', '--bundles', bundles], {
    cwd: launcherDir,
    env: {
        ...process.env,
        CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '1'
    }
});

if (platform() === 'darwin' && bundles.split(',').map((value) => value.trim()).includes('app')) {
    createMacDmg();
}
