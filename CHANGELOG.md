# Changelog

All notable changes to HomeInventory are documented here.

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
