# Roadmap

HomeInventory is on the v2.5 line with a TypeScript-first client, a responsive liquid-glass interface, shopping-list and smart-maintenance workflows, optional desktop-launcher packages, mobile camera support, and signed managed-app updates. This roadmap stays short and practical so reliability work remains ahead of speculative features.

The v2.5 release track focuses on self-hosting reliability, accessibility, performance on constrained devices, reproducible signed releases, and follow-through on upstream desktop-runtime advisories.

## Near-Term Focus

- **Self-hosting reliability:** keep Docker, environment setup, backup/restore, and upgrade notes easy to follow.
- **Launcher release flow:** keep macOS, Windows, and Linux desktop packages reproducible through GitHub Releases.
- **Workflow polish:** refine shopping-list, maintenance reminders, dashboard alerts, and mobile ergonomics after real use.
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
