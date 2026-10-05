# Roadmap

HomeInventory v2.8.0 is the self-hosting release: a ready-made multi-architecture Docker image, one-command secret setup, automatic server backups with restore, a new-version notice for self-hosters, and a faster desktop launcher with optional updates and an optional app window. This roadmap stays short and practical so reliability work remains ahead of speculative features.

The v2.8 release track keeps practical household box organization stable while continuing to prioritize self-hosting reliability, accessibility, performance on constrained devices, and reproducible signed releases.

## Near-Term Focus

- **Self-hosting reliability:** keep Docker, environment setup, backup/restore, and upgrade notes easy to follow.
- **Launcher release flow:** keep macOS, Windows, and Linux desktop packages reproducible through GitHub Releases, and harden the beta app window from real-device feedback.
- **Workflow polish:** refine shopping-list, maintenance reminders, dashboard alerts, and mobile ergonomics after real use.
- **Box workflow follow-through:** keep mobile QR labels, photo capture, shared/personal visibility, safe non-empty deletion, bulk moves, and backup/restore covered by real-household feedback.
- **Translation review:** prioritize English and Turkish quality, then improve high-usage community locales over time.
- **Mobile and PWA polish:** continue real-device coverage for camera permissions, optional launcher-managed offline HTTPS enrollment, focus, torch, zoom, install icons, offline behavior, and small-screen inventory workflows.
- **Barcode catalogue evaluation:** keep local inventory lookup as the default and evaluate additional public catalogue sources only with clear consent, reliability limits, and source attribution.
- **Backup confidence:** automatic server backups, staged restore, and an export/import round-trip test shipped in v2.8.0; next, include uploads in backups and gather restore feedback from real installs.
- **Release confidence:** keep version parity, archive isolation, signatures, checksums, and launcher packages verifiable in CI.

## Contribution Areas

- Translation corrections for existing locale packs.
- Self-hosting notes for common platforms.
- Small UI accessibility fixes.
- Reproducible bug reports with screenshots or logs.
- Documentation improvements that make setup easier for first-time users.

## Not Planned Right Now

- A hosted SaaS roadmap inside this open-source repo.
- Large new modules before the v2 redesign has settled.
- Breaking storage migrations without a clear upgrade path.
- Nested boxes, capacity/weight calculations, warehouse maps, OCR, and spreadsheet import/reporting for box management.
