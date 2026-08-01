import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const releaseVersion = rootPackage.version;
const requiredNodeMajor = Number(String(rootPackage.engines.node).match(/>=\s*(\d+)/)?.[1]);

function runScriptResult(script, args) {
  return spawnSync(process.execPath, [join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

function runScript(script, args) {
  const result = runScriptResult(script, args);
  assert.equal(result.status, 0, `${script} failed:\n${result.stdout}\n${result.stderr}`);
}

function createPublicReleaseFixture() {
  const root = mkdtempSync(join(tmpdir(), 'homeinventory-release-assets-'));
  const source = join(root, 'source');
  const output = join(root, 'public');
  mkdirSync(source, { recursive: true });

  const updaterArtifacts = [
    `HomeInventory Launcher_${releaseVersion}_darwin-aarch64.app.tar.gz`,
    `HomeInventory Launcher_${releaseVersion}_darwin-x86_64.app.tar.gz`,
    `HomeInventory Launcher_${releaseVersion}_windows-x86_64.exe`,
    `HomeInventory Launcher_${releaseVersion}_windows-x86_64.msi`,
    `HomeInventory Launcher_${releaseVersion}_linux-x86_64.AppImage`,
    `HomeInventory Launcher_${releaseVersion}_linux-x86_64.deb`,
    `HomeInventory Launcher_${releaseVersion}_linux-x86_64.rpm`
  ];
  for (const name of updaterArtifacts) {
    writeFileSync(join(source, name), 'artifact');
    writeFileSync(join(source, `${name}.sig`), `signature-${name}`);
  }

  for (const platform of ['darwin-aarch64', 'darwin-x86_64']) {
    writeFileSync(join(source, `HomeInventory Launcher_${releaseVersion}_${platform}.dmg`), 'dmg');
  }
  const managedArchive = Buffer.from('managed-app');
  const managedArchiveSha256 = createHash('sha256').update(managedArchive).digest('hex');
  const managedArchiveUrl =
    `https://github.com/asdteke/HomeInventory/releases/download/v${releaseVersion}/homeinventory-app.tar.gz`;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signatureMessage = [
    releaseVersion,
    managedArchiveSha256,
    managedArchiveUrl,
    requiredNodeMajor,
    true,
    true
  ].join(':');
  const signatureV2 = sign(null, Buffer.from(signatureMessage), privateKey).toString('hex');
  const publicKeyRaw = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('base64');

  writeFileSync(join(source, 'homeinventory-app.tar.gz'), managedArchive);
  writeFileSync(join(source, 'homeinventory-app-manifest.json'), JSON.stringify({
    version: releaseVersion,
    sha256: managedArchiveSha256,
    url: managedArchiveUrl,
    nodeMajor: requiredNodeMajor,
    rootInstall: true,
    clientInstall: true,
    signatureV2
  }));

  runScript('create-tauri-latest-json.mjs', [
    '--assets-dir', source,
    '--output', join(source, 'latest.json'),
    '--version', releaseVersion,
    '--release-tag', `v${releaseVersion}`
  ]);

  const latest = JSON.parse(readFileSync(join(source, 'latest.json'), 'utf8'));
  assert.match(latest.platforms['windows-x86_64'].url, /windows-x86_64\.exe$/);
  assert.match(latest.platforms['linux-x86_64'].url, /linux-x86_64\.AppImage$/);

  runScript('stage-public-release-assets.mjs', [
    '--source', source,
    '--output', output,
    '--version', releaseVersion
  ]);

  return { output, publicKeyRaw };
}

test('public release contains supported installers and required updater files without signature sidecars', () => {
  const { output, publicKeyRaw } = createPublicReleaseFixture();

  runScript('verify-tauri-release-assets.mjs', [
    '--assets-dir', output,
    '--version', releaseVersion,
    '--public-key-base64', publicKeyRaw,
    '--public'
  ]);

  const names = readdirSync(output).sort();
  assert.equal(names.length, 12);
  assert.equal(names.some((name) => name.endsWith('.sig')), false);
  assert.equal(names.some((name) => name.endsWith('.msi')), true);
  assert.equal(names.some((name) => name.endsWith('.deb')), true);
  assert.equal(names.some((name) => name.endsWith('.rpm')), true);

  const publicLatest = JSON.parse(readFileSync(join(output, 'latest.json'), 'utf8'));
  for (const entry of Object.values(publicLatest.platforms)) {
    const name = decodeURIComponent(new URL(entry.url).pathname.split('/').pop());
    assert.equal(name.includes(' '), false);
    assert.equal(names.includes(name), true, `latest.json references missing public asset ${name}`);
  }
});

test('release verifier rejects a tampered managed app archive', () => {
  const { output, publicKeyRaw } = createPublicReleaseFixture();
  writeFileSync(join(output, 'homeinventory-app.tar.gz'), 'tampered-managed-app');

  const result = runScriptResult('verify-tauri-release-assets.mjs', [
    '--assets-dir', output,
    '--version', releaseVersion,
    '--public-key-base64', publicKeyRaw,
    '--public'
  ]);

  assert.notEqual(result.status, 0, 'tampered managed app archive was accepted');
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Managed app manifest SHA-256 does not match homeinventory-app\.tar\.gz/
  );
});

test('macOS packages build updater app bundles with the compact Tauri-controlled DMG layout', () => {
  const tauriConfig = JSON.parse(
    readFileSync(join(repoRoot, 'apps/launcher/src-tauri/tauri.conf.json'), 'utf8')
  );
  const dmg = tauriConfig.bundle.macOS.dmg;

  assert.deepEqual(dmg.windowSize, { width: 520, height: 280 });
  assert.deepEqual(dmg.appPosition, { x: 140, y: 130 });
  assert.deepEqual(dmg.applicationFolderPosition, { x: 380, y: 130 });

  const workflow = readFileSync(
    join(repoRoot, '.github/workflows/launcher-packages.yml'),
    'utf8'
  );
  assert.match(workflow, /name: macos-aarch64[\s\S]*?bundles: app,dmg/);
  assert.match(workflow, /name: macos-x86_64[\s\S]*?bundles: app,dmg/);
  assert.doesNotMatch(workflow, /hdiutil create/);
});
