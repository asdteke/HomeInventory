import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(relativePath) {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const adminSource = read('client/src/components/AdminPanel.tsx');
const boxEditorSource = read('client/src/components/BoxEditorDialog.tsx');
const personalVaultSource = read('client/src/components/PersonalVault.tsx');
const tooltipSource = read('client/src/components/Tooltip.tsx');
const layoutSource = read('client/src/components/Layout.tsx');
const indexCss = read('client/src/index.css');
const boxesCss = read('client/src/boxes-v26.css');
const adminCss = read('client/src/admin-overlays-v25.css');
const vaultCss = read('client/src/vault-settings-v25.css');
const scannerCss = read('client/src/scanner.css');
const english = JSON.parse(read('client/public/locales/en/translation.json'));
const turkish = JSON.parse(read('client/public/locales/tr/translation.json'));

test('active user semantics include every non-banned account, including admins', () => {
    assert.match(adminSource, /userFilter === 'active' && !user\.is_banned/);
    assert.doesNotMatch(adminSource, /userFilter === 'active' && !user\.is_banned && user\.role !== 'admin'/);
    assert.match(adminSource, /\{!user\.is_banned && <span className="app-meta-pill app-meta-pill-accent">/);
    assert.doesNotMatch(adminSource, /!user\.is_banned && !isAdminAccount/);
});

test('box photo selection and stored photos use the shared fullscreen viewer', () => {
    assert.match(boxEditorSource, /import FullscreenImage from '\.\/FullscreenImage'/);
    assert.match(boxEditorSource, /src=\{photoPreview\}[\s\S]*className="box-photo-preview-v26"/);
    assert.match(boxEditorSource, /src=\{box\.photo_path\}[\s\S]*secure[\s\S]*className="box-photo-preview-v26"/);
});

test('room action tooltips rise above neighboring rows', () => {
    assert.match(tooltipSource, /import \{ createPortal \} from 'react-dom'/);
    assert.match(tooltipSource, /createPortal\([\s\S]*fixed z-\[10000\]/);
    assert.match(tooltipSource, /document\.body/);
    assert.match(indexCss, /\.room-manager-v25 \.manager-row-v25:hover,[\s\S]*z-index: 2/);
    assert.match(indexCss, /\.room-manager-v25 \.manager-list-v25 \{[\s\S]*backdrop-filter: blur\(18px\)/);
});

test('v2.7 visual corrections remove duplicate dividers and nested rectangular focus chrome', () => {
    assert.match(indexCss, /\.category-manager-v25 \.manager-list-v25 \{\s*margin-top: -1\.35rem;\s*border-top: 0/);
    assert.match(adminCss, /\.admin-v25 \.core-section-header-v25 \{[\s\S]*border-bottom: 0/);
    assert.match(vaultCss, /\.settings-about-content > \.settings-about-row:first-child \{\s*border-top: 0/);
    assert.match(indexCss, /\.dashboard-search-form \{[\s\S]*border: 1px solid var\(--hi-border\);[\s\S]*border-radius: 999px/);
    assert.match(indexCss, /\.dashboard-search-form:focus-within \{[\s\S]*border-color: color-mix[\s\S]*0 0 0 4px/);
    assert.match(indexCss, /\.dashboard-search-form input:focus-visible \{[\s\S]*background: transparent !important;[\s\S]*box-shadow: none !important/);
    assert.doesNotMatch(indexCss, /\.dashboard-search-form::after/);
    assert.match(indexCss, /\.inventory-search-field input:focus,[\s\S]*background: transparent !important;[\s\S]*box-shadow: none !important/);
    assert.match(indexCss, /--inventory-frame-bleed:[\s\S]*margin-inline: calc\(var\(--inventory-frame-bleed\) \* -1\)/);
    assert.match(indexCss, /select:not\(\[multiple\]\):not\(\[size\]\)[\s\S]*appearance: none;[\s\S]*background-position: right 1\.35rem center !important/);
    assert.match(indexCss, /html\[dir='rtl'\][\s\S]*background-position: left 1\.35rem center !important/);
    assert.match(indexCss, /\.item-invoice-toggle-v27/);
    assert.match(vaultCss, /\.vault-secure-workspace \{[\s\S]*border: 0;[\s\S]*background:/);
});

test('single box rows keep rounded hover and thumbnail clipping', () => {
    assert.match(boxesCss, /\.box-list-v26 > article:only-child \{\s*border-radius: inherit/);
    assert.match(boxesCss, /\.box-list-photo-v26 > img \{[\s\S]*border-radius: inherit/);
});

test('unlocked vault avoids split rectangular panels and nested hard frames', () => {
    assert.match(vaultCss, /\.vault-record-form \{[\s\S]*border-radius: 2\.5rem;[\s\S]*radial-gradient/);
    assert.match(vaultCss, /\.vault-record-browser \{[\s\S]*border: 0;[\s\S]*background: transparent/);
    assert.match(vaultCss, /\.vault-filter-bar \{[\s\S]*border: 0;/);
    assert.match(vaultCss, /\.vault-record-state \{[\s\S]*border: 0;[\s\S]*border-radius: 2\.35rem/);
    assert.doesNotMatch(vaultCss, /\.vault-record-browser \{\s*border-left: 1px/);
    assert.match(vaultCss, /\.vault-unlock-layout \{[\s\S]*overflow: visible;[\s\S]*border-bottom: 0;[\s\S]*background: transparent/);
});

test('personal vault camera capture reuses the encrypted photo preparation flow', () => {
    assert.match(personalVaultSource, /const cameraInputRef = useRef<HTMLInputElement>\(null\)/);
    assert.match(personalVaultSource, /ref=\{cameraInputRef\}[\s\S]*capture="environment"[\s\S]*onChange=\{handlePhotoFileChange\}/);
    assert.match(personalVaultSource, /onClick=\{\(\) => cameraInputRef\.current\?\.click\(\)\}/);
    assert.match(personalVaultSource, /t\('items\.form\.take_photo'/);
});

test('request copy explains policy-gated Borrow Center delivery without promising a notification', () => {
    const enCopy = english.borrow_requests.dialogs.request_subtitle;
    const trCopy = turkish.borrow_requests.dialogs.request_subtitle;
    assert.match(enCopy, /accepts requests from outside its household/);
    assert.match(enCopy, /Borrow Center/);
    assert.doesNotMatch(enCopy, /notif/i);
    assert.match(trCopy, /hanesi dışından gelen talepleri kabul ediyorsa/);
    assert.doesNotMatch(trCopy, /bildirim/i);
});

test('branded scanner chrome is driven by product theme tokens', () => {
    assert.match(scannerCss, /html\[data-brand\]:not\(\[data-brand='homeinventory'\]\) \.scanner-overlay/);
    assert.match(scannerCss, /var\(--hi-bg-strong\)/);
    assert.match(scannerCss, /html\[data-brand\]:not\(\[data-brand='homeinventory'\]\) \.scanner-shell/);
});

test('desktop account menu uses the v2.7 liquid glass treatment', () => {
    assert.match(layoutSource, /sidebar-account-menu-v27/);
    assert.match(layoutSource, /sidebar-account-group-v27/);
    assert.match(layoutSource, /sidebar-account-theme-v27/);
    assert.doesNotMatch(layoutSource, /fullWidth\s*\n\s*sliding/);
    assert.match(indexCss, /\.sidebar-account-menu-v27 \{[\s\S]*blur\(24px\) saturate\(135%\)/);
    assert.match(indexCss, /\.sidebar-account-trigger-v27:focus-visible \{[\s\S]*0 0 0 2px/);
    assert.match(indexCss, /\.sidebar-account-group-v27 \{[\s\S]*border-radius: 1\.55rem/);
    assert.match(indexCss, /\.sidebar-account-theme-v27 \.segmented-toggle-thumb-v25/);
});

test('expanded and compact desktop navigation share the liquid glass shell', () => {
    assert.match(layoutSource, /desktop-sidebar-v27 \$\{sidebarOpen \? 'is-expanded' : 'is-compact'\}/);
    assert.match(layoutSource, /shell-link-v27 \$\{compact \? 'is-compact' : 'is-expanded'\}/);
    assert.match(layoutSource, /shell-link-icon-v27/);
    assert.match(indexCss, /\.shell-link-v27\.is-expanded\.is-active \{[\s\S]*linear-gradient/);
    assert.match(indexCss, /\.shell-link-v27\.is-compact \{[\s\S]*border-radius: 1\.3rem/);
    assert.match(indexCss, /\.sidebar-resize-control-v27 \{[\s\S]*width: 2\.55rem/);
    assert.match(indexCss, /html\.dark \.desktop-sidebar-v27 \{[\s\S]*saturate\(108%\)/);
    assert.match(indexCss, /html\.dark \.sidebar-account-menu-v27 \{[\s\S]*rgba\(35, 41, 37, \.965\)/);
    assert.match(indexCss, /html\.dark \.shell-link-v27\.is-expanded\.is-active \{[\s\S]*rgba\(255, 255, 255, \.035\)/);
    assert.match(indexCss, /Final sidebar pass: intentionally simple/);
    assert.match(indexCss, /\.sidebar-account-group-v27,[\s\S]*border-top: 1px solid var\(--hi-border\)/);
    assert.match(indexCss, /\.shell-link-v27\.is-expanded\.is-active,[\s\S]*background: var\(--hi-panel-muted\)/);
});
