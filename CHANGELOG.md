# Changelog

All notable changes to HomeInventory are documented here.

## v2.4.0 - Inventory Operations, Labels, Alerts, and Backup Media

### Highlights

- **Advanced inventory operations:** Added multi-select, bulk category/room/location/visibility updates, bulk deletion, stock +/- actions, richer filters, and practical sorting for larger household inventories.
- **Actionable alerts:** Dashboard warnings now open focused alert detail pages for low stock, expiration dates, and overdue maintenance instead of dropping users into a broad inventory view.
- **Notification and service centers:** Added dedicated notification and service/warranty surfaces for low stock, warranty, expiration, maintenance, and borrow-return follow-up.
- **Printable QR labels:** Added item QR label sheets plus room/shelf labels with cut guides and embedded product branding for real-world storage use.
- **Multiple attachments:** Item records now support multiple additional files for photos, receipts, invoices, manuals, and service documents.
- **Encrypted activity history:** Item changes, stock updates, bulk actions, and attachment changes are recorded in a protected activity log.
- **Attachment security hardening:** Uploaded documents now receive stricter type validation, suspicious PDF actions are blocked, attachment names are encrypted at rest, and downloads are forced through safe attachment headers.
- **Dependency security:** Replaced the filesystem i18n backend with a local JSON-only backend and updated `i18next-http-middleware` to the patched version, clearing the open critical npm audit advisories.
- **Backup media coverage:** Owner backups can include item media and attachments so full restores can bring files back alongside inventory records.
- **macOS DMG polish:** The launcher DMG now includes the standard Applications shortcut so users can drag the app into Applications.
- **Brand build verification:** Custom local brand assets, PWA icons, locale overlays, and production build output were verified for branded deployment paths.
- **Version metadata synchronized:** Updated root, client, launcher, Tauri, and Rust package metadata to `2.4.0`.

### Upgrade Notes

- Run `npm run build` after pulling this release.
- Back up SQLite data and uploads before upgrading a self-hosted production deployment.
- If you use custom brand overlays, rebuild the brand bundle so the new labels, alerts, notification, and activity strings are available.

## v2.3.0 - Performance and macOS Distribution

### Highlights

- **Application optimizations:** Bundles the latest dashboard, inventory, maintenance, shopping, caching, and client build improvements in the v2.3 release line.
- **Ad-hoc macOS code signing:** ARM64 and Intel launcher applications are ad-hoc signed before DMG and updater artifacts are created, preserving bundle integrity and allowing a GUI-only Gatekeeper override where macOS permits it.
- **Managed app version selection:** Fresh launcher installations prefer the bundled managed app when it is newer than the currently published online release, preventing a v2.3 launcher from bootstrapping an older v2.2.x app.
- **Bundled managed app updates:** Existing v2.2.x managed installations now detect and can install the newer v2.3 app embedded in the launcher even before the matching GitHub release manifest is published.
- **Transactional update recovery:** Internal service restarts can complete while the updater lock is held, rollback targets the immediately previous version, and failures before a version switch no longer trigger an unnecessary downgrade.
- **Offline-first release install:** When the embedded managed app matches or exceeds the online release, the launcher installs the sealed bundled archive directly and downloads only when GitHub offers a newer app version.
- **Release verification:** macOS package jobs now verify the final application signature before creating and publishing each DMG.
- **Dependency security:** Updated Multer to `2.2.0` and undici to `7.28.0`, closing the nested multipart field, aborted upload cleanup, TLS validation, shared-cache isolation, and related newly disclosed advisories.
- **CI security gate:** Root, client, and launcher dependency audits now reject moderate-or-higher advisories, and the launcher frontend is built during normal CI validation.
- **Version metadata synchronized:** Updated root, client, launcher, Tauri, and Rust package metadata to `2.3.0`.

### Upgrade Notes

- Ad-hoc signing does not replace Apple notarization. On first launch, macOS may still require **System Settings > Privacy & Security > Open Anyway**.
- Existing HomeInventory data remains outside the launcher application bundle and is preserved during launcher upgrades.

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
