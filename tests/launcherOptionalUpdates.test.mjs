import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../apps/launcher/src/App.tsx', import.meta.url), 'utf8');

function startButtonHandler() {
  const marker = '/* ─── STATE 4: Stopped ─── */';
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, 'stopped state is missing');
  const end = appSource.indexOf('</button>', start);
  return appSource.slice(start, end);
}

test('Start always launches the installed version instead of updating', () => {
  const block = startButtonHandler();
  assert.match(block, /doLaunch\(selProfile\)/);
  assert.doesNotMatch(block, /triggerUpdate/);
  assert.doesNotMatch(block, /updateAvailable/);
});

test('update offers can be applied, postponed, or skipped', () => {
  assert.match(appSource, /t\('update\.updateNow'\)/);
  assert.match(appSource, /t\('update\.later'\)/);
  assert.match(appSource, /t\('update\.skipVersion'\)/);
  assert.match(appSource, /skippedUpdateVersion: string;/);
  assert.match(appSource, /skippedUpdateVersion: version/);
});

test('the bundled app sync only runs when the user asks for it', () => {
  const call = "invoke<CommandResult>('sync_bundled_managed_app'";
  const invokeIndex = appSource.indexOf(call);
  assert.notEqual(invokeIndex, -1, 'bundled sync command is no longer invoked');
  const owner = appSource.lastIndexOf('const startBundledSync = () => {', invokeIndex);
  assert.notEqual(owner, -1, 'bundled sync must be started from startBundledSync');
  assert.equal(appSource.indexOf("'sync_bundled_managed_app'", invokeIndex + call.length), -1);
});
