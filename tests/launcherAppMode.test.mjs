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

const sidebarSource = read('../apps/launcher/src/AppSidebar.tsx');
const shellSource = read('../client/src/utils/launcherShell.ts');

test('the launcher only sends fixed, validated values into the page', () => {
  // Events carry a known route, a validated language code or a constant.
  assert.match(appWindowSource, /fn set_app_content_language[\s\S]*?shared_language\(&language\)/);
  assert.match(appWindowSource, /fn navigate_app_content[\s\S]*?CONTENT_ROUTES[\s\S]*?\.find\(/);
  assert.match(appWindowSource, /"back" => "history\.back\(\);",\s*"forward" => "history\.forward\(\);",/);
  // The page script never reaches for the launcher's IPC.
  const script = appWindowSource.slice(appWindowSource.indexOf('const CONTENT_SHELL_SCRIPT'), appWindowSource.indexOf('"#;', appWindowSource.indexOf('const CONTENT_SHELL_SCRIPT')));
  assert.doesNotMatch(script, /__TAURI|invoke|ipc/i);
  assert.doesNotMatch(shellSource, /__TAURI|invoke\(/);
});

test('what the page reports is sanitized before the sidebar sees it', () => {
  assert.match(appWindowSource, /async fn app_content_state[\s\S]*?sanitize_content_state\(path, &raw\)/);
  assert.match(appWindowSource, /Path of the page, taken from the webview URL[^\n]*\n\s*path: String,/);
  assert.match(sidebarSource, /invoke<ContentState \| null>\('app_content_state'\)/);
});

test('the app window sidebar follows the app and respects reduced motion', () => {
  assert.match(sidebarSource, /prefers-reduced-motion: reduce/);
  assert.match(sidebarSource, /set_app_sidebar', \{ mode, animate: !reducedMotion\(\) \}/);
  assert.match(sidebarSource, /document\.body\.dataset\.theme = theme/);
  assert.match(sidebarSource, /page\.language !== appLanguage\) setAppLanguage\(page\.language\)/);
  // A new sidebar resets any layout left behind by an earlier one.
  assert.match(sidebarSource, /set_app_sidebar', \{ mode: 'expanded', animate: false \}/);
  assert.match(appWindowSource, /SIDEBAR_MODE\.store\(SidebarMode::Expanded\.as_u8\(\)/);
});
