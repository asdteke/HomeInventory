# Roadmap

HomeInventory v2.7.0 is the interface-consistency release for the v2.6 box-management line. It modernizes Personal Vault, aligns inventory and admin surfaces, improves branded scanner parity, and fixes daily workflow details without changing the established shared/personal box model. This roadmap stays short and practical so reliability work remains ahead of speculative features.

The v2.7 release track keeps practical household box organization stable while continuing to prioritize self-hosting reliability, accessibility, performance on constrained devices, and reproducible signed releases.

## Near-Term Focus

- **Self-hosting reliability:** keep Docker, environment setup, backup/restore, and upgrade notes easy to follow.
- **Launcher release flow:** keep macOS, Windows, and Linux desktop packages reproducible through GitHub Releases.
- **Workflow polish:** refine shopping-list, maintenance reminders, dashboard alerts, and mobile ergonomics after real use.
- **Box workflow follow-through:** keep mobile QR labels, photo capture, shared/personal visibility, safe non-empty deletion, bulk moves, and backup/restore covered by real-household feedback.
- **Translation review:** prioritize English and Turkish quality, then improve high-usage community locales over time.
- **Mobile and PWA polish:** continue real-device coverage for camera permissions, optional launcher-managed offline HTTPS enrollment, focus, torch, zoom, install icons, offline behavior, and small-screen inventory workflows.
- **Barcode catalogue evaluation:** keep local inventory lookup as the default and evaluate additional public catalogue sources only with clear consent, reliability limits, and source attribution.
- **Backup confidence:** continue testing owner-only export/import flows and document safe restore practices.
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
