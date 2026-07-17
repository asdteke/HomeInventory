# HomeInventory v2.5 Release Checklist

Use this checklist for public HomeInventory source and launcher releases. Local/private branding is deliberately outside this workflow.

## 1. Source and brand boundary

- [ ] Work from a clean review branch and inspect `git status --short --ignored`.
- [ ] Confirm `.env`, databases, uploads, logs, private keys, `.local/`, `local-brands/`, `private-brands/`, and `client/public/brand-local/` are not tracked.
- [ ] Confirm the normal client command is `npm run build` or `npm run build:homeinventory`.
- [ ] Confirm the generated PWA manifest, logos, theme colors, legal text, and support fallback identify HomeInventory only.
- [ ] Run `npm run launcher:bundle-app`, list the archive with `tar -tzf`, and verify that no private/local brand path appears.

## 2. Deterministic validation

Use the Node.js major configured in CI (Node 20 for v2.5):

```bash
npm ci
npm ci --prefix client
npm ci --prefix apps/launcher
npm run version:check
npm run i18n:check
npm run build
npm run build --prefix apps/launcher
node --test --test-concurrency=1 tests/*.test.mjs
cargo test --manifest-path apps/launcher/src-tauri/Cargo.toml
npm audit --audit-level=moderate
npm audit --audit-level=moderate --prefix client
npm audit --audit-level=moderate --prefix apps/launcher
```

- [ ] Check light/dark modes at 384×824 and a desktop viewport.
- [ ] Exercise login/register, dashboard, inventory list/detail/create, scanners, maintenance, shopping, borrow center, vault, settings, dialogs, legal pages, side menu, and top/bottom navigation.
- [ ] Test keyboard focus, reduced motion, long translations, text zoom, and horizontal overflow.

## 3. Signing and integrity

- [ ] Verify the GitHub Actions publishing environment contains `HOMEINVENTORY_APP_MANIFEST_PRIVATE_KEY_PEM`.
- [ ] If updater artifacts are expected, verify `TAURI_SIGNING_PRIVATE_KEY` and its password are configured.
- [ ] If a trusted macOS release is expected, configure the Developer ID and notarization secrets listed in [`github-actions-release.md`](github-actions-release.md).
- [ ] Confirm `homeinventory-app-manifest.json` contains a non-empty signature that is not `unsigned`.
- [ ] Confirm the manifest SHA-256 matches `homeinventory-app.tar.gz`.
- [ ] Confirm the launcher Rust signature tests pass and reject both tampered and unsigned manifests.
- [ ] Verify macOS artifacts with `codesign --verify --deep --strict --verbose=2`; for notarized builds also run `xcrun stapler validate`.

## 4. Publish and smoke test

- [ ] Tag exactly the version reported by `npm run version:check`.
- [ ] Run `Launcher Packages` with `publish_release=true` and the matching tag.
- [ ] Confirm all expected platform packages and managed-app assets are attached.
- [ ] Install on clean macOS, Windows, and Linux environments where available.
- [ ] Start a fresh launcher profile, verify dependency/port checks, open the browser handoff, create an account and home, restart services, and confirm data isolation.
- [ ] Test backup creation and confirm no secret or private-brand files are present in the archive.
- [ ] Record any platform limitation in the release notes before announcement.
