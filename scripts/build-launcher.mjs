import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const tauriDir = resolve(repoRoot, 'apps/launcher/src-tauri');
const bundleDir = resolve(tauriDir, 'target/release/bundle');
const launcherPackage = JSON.parse(readFileSync(resolve(repoRoot, 'apps/launcher/package.json'), 'utf8'));

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

const bundles = defaultBundles();
run('npm', ['--prefix', 'apps/launcher', 'run', 'tauri', '--', 'build', '--bundles', bundles]);

if (platform() === 'darwin' && bundles.split(',').map((value) => value.trim()).includes('app')) {
    createMacDmg();
}
