# Changelog

All notable changes to HomeInventory are documented here.

## v2.2.3 - Launcher Local Branding Patch

### Highlights

- **Launcher branding fallback fixed:** Prevented local launcher URLs such as `127.0.0.1`, `0.0.0.0`, or IPv6 loopback addresses from being interpreted as the public brand name in the About screen and translated beta notices.
- **Version metadata synchronized:** Updated root, client, launcher, Tauri, and Rust package metadata to `2.2.3` for this small patch release.

### Upgrade Notes

- Restart the desktop launcher or rebuild the client after pulling this release so the new branding fallback is compiled into the local app bundle.

## v2.2.0 - Launcher Release, Security Patch, and Packaging Verification

### Highlights

- **Desktop launcher release line:** Published the current Tauri launcher experience as v2.2.0 packages, including one-click initialize/launch, profile start/stop, dependency detection, port checks with suggested replacements, LAN status, QR access, and automatic local browser opening after the app is ready.
- **Launcher control panel polish:** Documented and verified the launcher UI flow across setup, warm-up, running, and stopped states, plus the system console, logs/backups/settings modal, path pickers, local backup action, and advanced email/admin/port configuration fields.
- **Native packages verified:** Published and verified macOS `.dmg`/`.app.zip`, Windows `.exe`/`.msi`, and Linux `.AppImage`/`.deb`/`.rpm` artifacts from the `Launcher Packages` workflow for the v2.2.0 release.
- **Critical npm advisory fixed:** Forced transitive `shell-quote` resolution to patched `1.8.4`, closing the open critical development-scope Dependabot alert from the root lockfile.
- **Release metadata synchronized:** Updated root, client, launcher, Tauri, and workflow release markers to `2.2.0`.
- **Tauri/GLib status checked:** Tauri `2.11.2` is the latest observed Tauri release, but it still resolves the GTK3 stack through `glib 0.18.x`; the upstream `glib` advisory requires `glib 0.20.0`, so this cannot yet be truly fixed by a released Tauri update.
- **Documentation corrected:** Updated README, Docker, launcher, locale, client, roadmap, environment, changelog, and GitHub Release notes so the v2.2 section covers the launcher release/security/package work without repeating older mobile camera, TypeScript migration, or React Router patch items as new v2.2 work.

### Upgrade Notes

- Run the normal production build after pulling this release: `npm run build`.
- Back up SQLite data and uploads before upgrading a self-hosted production deployment.
- Download fresh launcher packages from the v2.2.0 GitHub Release if you use the optional desktop launcher.
- If you run through the launcher, use the fresh v2.2.0 package for the updated release metadata, package checks, and verified platform artifacts.
- The optional Linux desktop launcher still inherits Tauri's current GTK3/GLib runtime dependency chain until Tauri publishes a compatible upstream fix.

## v2.1.3 - React Router Security Patch and Mobile Camera Support

This patch release closes the React Router same-origin redirect advisory by moving to React Router 6.30.4 and keeps the mobile camera support introduced in the v2.1.x line.

### Highlights

- **Security patch:** Updated React Router `6.30.3` -> `6.30.4` and `@remix-run/router` `1.23.2` -> `1.23.3` to close the protocol-relative URL reinterpretation open redirect risk.
- **Camera capture support:** Added "Take Photo" controls to item photo and invoice photo fields so supported mobile devices open the native camera flow.
- **Gallery selection preserved:** Kept the existing file/gallery upload path through separate "Choose from Gallery" controls.
- **Localization completeness:** Maintained required localization coverage across all 100+ supported UI languages.

## v2.1.1 - Smooth Motion, Accessibility & Global Visual Polish

This release introduces UI/UX enhancements, robust unmount guards, smooth accordion transitions, and custom premium global control elements.

### Highlights

- **Custom Premium Checkbox Redesign:** Replaced native browser default checkboxes globally with custom-styled, tactile checkbox components featuring dynamic vector check icons, smooth hover scales, customizable status indicators (`var(--hi-accent)` success green), and perfect alignment across authorization, setup, legal consent, and backup encryption fields.
- **Hardware-Accelerated Accordion Transitions:** Refactored Settings sections to utilize CSS Grid-based height transitions (`0fr` -> `1fr`) with fluid ease-out curves and proper hidden overflows, eliminating visual jumping.
- **Enhanced WAI-ARIA Semantics:** Added professional accessibility hooks to Settings accordions, including automatic `id` and `aria-controls` bindings, `role="region"`, `aria-labelledby`, and dynamic `aria-hidden` properties.
- **Keyboard Focus Safeguards:** Ensured collapsed Settings sections completely bypass keyboard focus tab-indexes using dynamic CSS visibility and ARIA hidden states.
- **OS Reduced-Motion Support:** Added standard `prefers-reduced-motion` compliance to bypass accordion transition animations for users with motion sensitivities.
- **De-Cluttered Settings UI:** Replaced double-card visual nested outlines with clean, flat `.app-control-section-nested` structures.
- **Robust Async State Lifecycles:** Patched React unmount states across key asynchronous actions (Forms, Task Deletions, Performing Tasks) to eliminate post-await race conditions and console errors.

## v2.1.0 - Desktop Launcher, TypeScript, Shopping List & Smart Maintenance

This release introduces the optional desktop GUI launcher, migrates the client interface to TypeScript, and adds shopping-list plus smart-maintenance workflows.

### Highlights

- **Desktop GUI Launcher (Beta):** Added a cross-platform Tauri launcher for local setup, dependency checks, start/stop control, isolated data/uploads, backups, logs, port checks, LAN/QR access, and Node/npm path overrides.
- **Client TypeScript Migration:** Migrated the React client to TypeScript on Vite, improving build-time checks, editor feedback, and maintainability while keeping the existing app flow familiar.
- **Shopping List:** Added household-scoped shopping-list APIs and UI for manual items, inventory-linked items, completed history, and low-stock suggestions.
- **Smart Maintenance Recurrence:** Added recurring item-care tasks with day/week/month/year intervals, overdue state, completion tracking, and automatic next-due-date calculation.
- **Global Localization Verification:** Integrated and validated localized UI keys across 100+ languages with automated compliance checks (`npm run i18n:check`).

### Release Packaging

- Desktop launcher packages are intended to be attached to GitHub Releases as separate artifacts: macOS `.dmg`/`.app.zip`, Windows `.exe`/`.msi`, and Linux `.AppImage`/`.deb`/`.rpm`.
- CLI and Docker remain first-class setup paths; the launcher is optional and does not replace `npm run dev`, `npm run install-all`, or Docker deployments.

### Upgrade Notes

- Run the normal production build after pulling this release: `npm run build`.
- Back up SQLite data and uploads before upgrading a self-hosted production deployment.
- Review `.env.example` and `README_ENVIRONMENT_SETUP.md`, especially if enabling email delivery or launcher-managed local profiles.

## v2.0.0 - Redesigned Release

HomeInventory v2.0.0 is a major product refresh of the open-source household inventory app. It keeps the same privacy-first, self-hostable direction while rebuilding large parts of the user experience and hardening critical flows.

This was the previous public major release of HomeInventory before the v2.1.0 desktop and workflow line.

### Highlights

- Redesigned the main React experience across the landing page, app shell, dashboard, inventory, settings, auth, admin, legal, QR, and Personal Vault surfaces.
- Improved household-scoped security around backups, borrowing, private items, stale sessions, OAuth state, and account lockout behavior.
- Expanded and cleaned localization coverage with 100+ UI locale packs, fallback behavior, and legal translation checks.
- Refined HomeInventory PWA assets with light/dark icons, browser metadata, and updated GitHub-facing screenshots.
- Added stronger tests for auth, vault, borrowing privacy, legal translations, SQLite date handling, TOTP, and security-hardening flows.
- Improved local development startup output and release validation.

### Upgrade Notes

- Review `.env.example` and `README_ENVIRONMENT_SETUP.md` before deploying. Production instances must keep strong `JWT_SECRET`, `APP_ENCRYPTION_KEY`, and `APP_ENCRYPTION_KEY_ID` values.
- Run the normal production build after pulling this release: `npm run build`.
- Back up SQLite data and uploads before upgrading a self-hosted production deployment.
- If you maintain custom branding, review the new files under `client/public/brand` and `client/public/pwa`.

## v1.0.0 - Initial Stable Baseline

The v1.0.0 line established the original stable HomeInventory baseline: multi-house inventory management, QR/barcode workflows, Docker self-hosting, authentication, backups, encryption-at-rest support, and multilingual UI foundations.
