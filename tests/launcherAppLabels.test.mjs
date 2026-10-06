import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAppLabels } from '../scripts/generate-launcher-app-labels.mjs';

const generated = JSON.parse(readFileSync(new URL('../apps/launcher/src/generated/appLabels.json', import.meta.url), 'utf8'));
const sidebar = readFileSync(new URL('../apps/launcher/src/AppSidebar.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../client/src/components/Layout.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../client/src/utils/launcherShell.ts', import.meta.url), 'utf8');
const appWindow = readFileSync(new URL('../apps/launcher/src-tauri/src/app_window.rs', import.meta.url), 'utf8');

test('app window sidebar labels match the client locales', () => {
  assert.deepEqual(generated, buildAppLabels(), 'run node scripts/generate-launcher-app-labels.mjs');
  assert.ok(generated.languages.length >= 100);
  for (const { code } of generated.languages) {
    assert.match(code, /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, `${code} must pass the launcher language check`);
    assert.ok(generated.labels[code]?.home, `${code} has page labels`);
  }
});

test('launcher sidebar and the app agree on the pages it may open', () => {
  const rustRoutes = [...appWindow.slice(appWindow.indexOf('CONTENT_ROUTES')).matchAll(/"(\/[a-z-]*)"/g)].slice(0, 8).map(m => m[1]);
  const clientRoutes = [...shell.slice(shell.indexOf('LAUNCHER_SHELL_ROUTES')).matchAll(/'(\/[a-z-]*)'/g)].slice(0, 8).map(m => m[1]);
  assert.deepEqual(rustRoutes, clientRoutes);
  for (const route of [...sidebar.matchAll(/route: '(\/[a-z-]*)'/g)].map(m => m[1])) {
    assert.ok(clientRoutes.includes(route), `${route} is allowed by the app`);
  }
  // Inside the launcher window the app hides its own sidebar.
  assert.match(layout, /\{!launcherShell && <aside/);
});
