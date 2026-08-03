# HomeInventory v2.6.1 Release Checklist

Use this checklist for public HomeInventory source and launcher releases. Local/private branding is deliberately outside this workflow.

## 1. Source and brand boundary

- [ ] Work from a clean review branch and inspect `git status --short --ignored`.
- [ ] Confirm `.env`, databases, uploads, logs, private keys, `.local/`, `local-brands/`, `private-brands/`, `client/public/brand-local/`, and generated `client/dist-*/` build directories are neither tracked nor included in release archives.
- [ ] Confirm the normal client command is `npm run build` or `npm run build:homeinventory`.
- [ ] Confirm the generated PWA manifest, logos, theme colors, legal text, and support fallback identify HomeInventory only.
- [ ] Run `npm run launcher:bundle-app`, list the archive with `tar -tzf`, and verify that no private/local brand path appears.

## 2. Deterministic validation

Use the Node.js version configured in CI (Node 22.22.0 for v2.6.1):

```bash
npm ci
npm ci --prefix client
npm ci --prefix apps/launcher
git diff --check
npm run version:check
npm run i18n:check
npm run build
npm run build --prefix apps/launcher
node --test --test-concurrency=1 tests/*.test.mjs
cargo test --locked --manifest-path apps/launcher/src-tauri/Cargo.toml
npm audit --audit-level=moderate
npm audit --audit-level=moderate --prefix client
npm audit --audit-level=moderate --prefix apps/launcher
```

- [ ] Check light/dark modes at 384×824 and a desktop viewport.
- [ ] Exercise login/register, dashboard, inventory list/detail/create, scanners, maintenance, shopping, borrow center, vault, settings, dialogs, legal pages, side menu, and top/bottom navigation.
- [ ] Create, edit, archive, and restore both shared and personal boxes; verify camera/gallery photos and room-scoped inline location creation.
- [ ] Assign, move, and unassign items through item forms, box contents, and multi-select. Confirm assigned items follow the box room/location and unassigned items retain their current room/location.
- [ ] Delete a non-empty box once by moving contents to a valid destination and once by explicit unassignment. Include hidden private contents and confirm no item identifiers or private metadata leak.
- [ ] In a multi-user household, verify personal boxes and labels remain creator-only (including from the household-owner inventory view), private items remain hidden inside shared boxes, and a public item inside another member's personal box does not reveal that box or its exact placement.
- [ ] Scan and print box QR labels through the existing QR flow; verify both the compact single-label layout and multi-label sheet.
- [ ] On a real HTTPS mobile browser, verify barcode and QR camera start/close/reopen, rear-camera selection, one visible scan frame, detected-code feedback, supported zoom presets, torch shutdown on close, and **Scan again** without replaying the previous result.
- [ ] Confirm a barcode scan checks only the signed-in household inventory until the user chooses online search. Verify the consent copy, public-source result attribution, timeout/cancellation behavior, and that an online miss does not replay success/error sound or vibration.
- [ ] Import a catalogue image, remove it on a touch viewport, and verify box-scoped quick add creates the minimal barcode item while keeping batch scanning available.
- [ ] Round-trip standard and full encrypted owner backups. Verify box visibility, archive state, assignments, room/location, and full-backup media restore correctly.
- [ ] Test keyboard focus, reduced motion, long translations, text zoom, and horizontal overflow.
- [ ] Review English and Turkish release copy manually, then confirm all 103 locale packs pass parity, key-shape, replacement-character, and translation-artifact checks.

## 3. Signing and integrity

- [ ] Verify the GitHub Actions publishing environment contains `HOMEINVENTORY_APP_MANIFEST_PRIVATE_KEY_PEM`.
- [ ] Verify `TAURI_SIGNING_PRIVATE_KEY` and its optional password are configured; updater artifacts are mandatory for public releases.
- [ ] If a trusted macOS release is expected, configure the Developer ID and notarization secrets listed in [`github-actions-release.md`](github-actions-release.md).
- [ ] Confirm `homeinventory-app-manifest.json` contains a non-empty `signatureV2` that is not `unsigned`; the legacy `signature` field remains `unsigned` for pre-v2.5 launcher compatibility.
- [ ] Confirm the manifest SHA-256 matches `homeinventory-app.tar.gz`.
- [ ] Confirm the launcher Rust signature tests pass and reject both tampered and unsigned manifests.
- [ ] Confirm `latest.json` and the managed-app manifest report the same version and contain signed updater entries for macOS ARM64, macOS Intel, Windows x64, and Linux x64.
- [ ] Verify macOS artifacts with `codesign --verify --deep --strict --verbose=2`; for notarized builds also run `xcrun stapler validate`.

## 4. Publish and smoke test

- [ ] Tag exactly the version reported by `npm run version:check`.
- [ ] Run `Launcher Packages` with `publish_release=true` and the matching tag.
- [ ] Confirm all expected platform installers, four updater packages/signatures, `latest.json`, and managed-app assets are attached.
- [ ] From v2.5.0 onward, update a previous coordinated installation and confirm both **App** and **Launcher** display the new version after restart.
- [ ] Install on clean macOS, Windows, and Linux environments where available.
- [ ] Start a fresh launcher profile, verify dependency/port checks, open the browser handoff, create an account and home, restart services, and confirm data isolation.
- [ ] Test backup creation and confirm no secret or private-brand files are present in the archive.
- [ ] Record any platform limitation in the release notes before announcement.
