import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function runScript(script, args) {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${script} failed:\n${result.stdout}\n${result.stderr}`);
}

test('public release contains only recommended installers and required updater files', () => {
  const root = mkdtempSync(join(tmpdir(), 'homeinventory-release-assets-'));
  const source = join(root, 'source');
  const output = join(root, 'public');
  mkdirSync(source, { recursive: true });

  const updaterArtifacts = [
    'HomeInventory Launcher_2.5.0_darwin-aarch64.app.tar.gz',
    'HomeInventory Launcher_2.5.0_darwin-x86_64.app.tar.gz',
    'HomeInventory Launcher_2.5.0_windows-x86_64.exe',
    'HomeInventory Launcher_2.5.0_windows-x86_64.msi',
    'HomeInventory Launcher_2.5.0_linux-x86_64.AppImage',
    'HomeInventory Launcher_2.5.0_linux-x86_64.deb',
    'HomeInventory Launcher_2.5.0_linux-x86_64.rpm'
  ];
  for (const name of updaterArtifacts) {
    writeFileSync(join(source, name), 'artifact');
    writeFileSync(join(source, `${name}.sig`), `signature-${name}`);
  }

  for (const platform of ['darwin-aarch64', 'darwin-x86_64']) {
    writeFileSync(join(source, `HomeInventory Launcher_2.5.0_${platform}.dmg`), 'dmg');
  }
  writeFileSync(join(source, 'homeinventory-app.tar.gz'), 'managed-app');
  writeFileSync(join(source, 'homeinventory-app-manifest.json'), JSON.stringify({
    version: '2.5.0',
    signatureV2: 'signed'
  }));

  runScript('create-tauri-latest-json.mjs', [
    '--assets-dir', source,
    '--output', join(source, 'latest.json'),
    '--version', '2.5.0',
    '--release-tag', 'v2.5.0'
  ]);

  const latest = JSON.parse(readFileSync(join(source, 'latest.json'), 'utf8'));
  assert.match(latest.platforms['windows-x86_64'].url, /windows-x86_64\.exe$/);
  assert.match(latest.platforms['linux-x86_64'].url, /linux-x86_64\.AppImage$/);

  runScript('stage-public-release-assets.mjs', [
    '--source', source,
    '--output', output,
    '--version', '2.5.0'
  ]);
  runScript('verify-tauri-release-assets.mjs', [
    '--assets-dir', output,
    '--version', '2.5.0',
    '--public'
  ]);

  const names = readdirSync(output).sort();
  assert.equal(names.length, 9);
  assert.equal(names.some((name) => name.endsWith('.sig')), false);
  assert.equal(names.some((name) => name.endsWith('.msi')), false);
  assert.equal(names.some((name) => name.endsWith('.deb') || name.endsWith('.rpm')), false);
});
