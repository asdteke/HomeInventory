import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = read('../apps/launcher/src/App.tsx');
const libSource = read('../apps/launcher/src-tauri/src/lib.rs');
const appWindowSource = read('../apps/launcher/src-tauri/src/app_window.rs');
const sidebarCapability = JSON.parse(read('../apps/launcher/src-tauri/capabilities/app-sidebar.json'));
const defaultCapability = JSON.parse(read('../apps/launcher/src-tauri/capabilities/default.json'));

test('app mode is an opt-in launcher setting', () => {
  assert.match(appSource, /appMode: false,/);
  assert.match(appSource, /settings\.appMode\s*\?\s*invoke\('open_app_window'/);
});

test('only the sidebar webview gets IPC in the app window', () => {
  assert.deepEqual(sidebarCapability.webviews, ['app-sidebar']);
  assert.equal(sidebarCapability.windows, undefined);
  assert.equal(sidebarCapability.remote, undefined);
  assert.deepEqual(defaultCapability.windows, ['main']);
  assert.doesNotMatch(JSON.stringify(sidebarCapability.permissions), /shell|fs:|http:/);
});

test('the content webview is limited to the local app', () => {
  assert.match(appWindowSource, /\.on_navigation\(content_navigation_allowed\)/);
  assert.match(appWindowSource, /NewWindowResponse::Deny/);
  assert.match(appWindowSource, /validate_local_app_url\(&url\)\?/);
});

test('closing the app window does not stop HomeInventory', () => {
  assert.match(libSource, /app_window::MAIN_WINDOW_LABEL => \{[\s\S]*?stop_all_internal/);
  const appWindowArm = libSource.slice(libSource.indexOf('app_window::APP_WINDOW_LABEL =>'));
  assert.doesNotMatch(appWindowArm.slice(0, 200), /stop_all_internal/);
  assert.doesNotMatch(appWindowSource, /stop_all_internal/);
});
