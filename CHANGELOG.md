# Changelog

All notable changes to HomeInventory are documented here.

## v2.2.0 - Security Maintenance and Release Readiness

This release prepares the public v2.2 line with dependency security maintenance, synchronized package metadata, and release workflow verification.

### Highlights

- **Critical npm advisory fixed:** Forced transitive `shell-quote` resolution to patched `1.8.4`, closing the open critical development-scope Dependabot alert from the root lockfile.
- **Release metadata synchronized:** Updated root, client, launcher, Tauri, and workflow release markers to `2.2.0`.
- **Tauri/GLib status checked:** Tauri `2.11.2` is the latest observed Tauri release, but it still resolves the GTK3 stack through `glib 0.18.x`; the upstream `glib` advisory requires `glib 0.20.0`, so this cannot yet be truly fixed by a released Tauri update.
- **Release checks refreshed:** CI and launcher packaging workflows remain in place for the v2.2 release path.

### Upgrade Notes

- Run the normal production build after pulling this release: `npm run build`.
- Back up SQLite data and uploads before upgrading a self-hosted production deployment.
- The optional Linux desktop launcher still inherits Tauri's current GTK3/GLib runtime dependency chain until Tauri publishes a compatible upstream fix.

## v2.1.3 - React Router Güvenlik Yaması ve Mobil Kamera Desteği

Bu patch sürümü, React Router same-origin redirect açık yönlendirme açığını patched React Router 6.30.4 sürümüne geçerek kapatır ve mobil kamera desteğini korur.

### Highlights

- **Güvenlik Yaması:** React Router `6.30.3` -> `6.30.4` ve `@remix-run/router` `1.23.2` -> `1.23.3` güncellenerek protocol-relative URL reinterpretation kaynaklı open redirect riski kapatıldı.
- **Kamera ile Fotoğraf Çekme Desteği:** Eşya fotoğrafı ve Fatura fotoğrafı alanlarına "Kamerayla Çek" butonu eklendi. Mobil cihazlarda doğrudan yerel kamera arayüzü açılır.
- **Galeriden Seçim Modu:** Mevcut galeriden dosya/fotoğraf seçme özelliği "Galeriden Seç" butonu ile geriye dönük uyumlu olarak korundu.
- **Çeviri ve Bütünlük:** 100+ desteklenen dilin tamamı için gerekli lokalizasyon bütünlüğü sağlandı.

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
