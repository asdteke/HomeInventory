# Roadmap

HomeInventory v2.6.0 adds simple box management to the TypeScript-first client, responsive liquid-glass interface, shopping-list and smart-maintenance workflows, optional desktop-launcher packages, mobile camera support, and signed managed-app updates. This roadmap stays short and practical so reliability work remains ahead of speculative features.

The v2.6 release track adds practical household box organization while continuing to prioritize self-hosting reliability, accessibility, performance on constrained devices, and reproducible signed releases.

## Near-Term Focus

- **Self-hosting reliability:** keep Docker, environment setup, backup/restore, and upgrade notes easy to follow.
- **Launcher release flow:** keep macOS, Windows, and Linux desktop packages reproducible through GitHub Releases.
- **Workflow polish:** refine shopping-list, maintenance reminders, dashboard alerts, and mobile ergonomics after real use.
- **Box workflow follow-through:** keep mobile QR labels, photo capture, shared/personal visibility, safe non-empty deletion, bulk moves, and backup/restore covered by real-household feedback.
- **Translation review:** prioritize English and Turkish quality, then improve high-usage community locales over time.
- **Mobile and PWA polish:** refine install icons, offline behavior, QR scanning, and small-screen inventory workflows.
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
