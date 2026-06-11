# Roadmap

HomeInventory was recently redesigned for v2.0.0 and is now on the v2.2 line with a TypeScript-first client, shopping-list and smart-maintenance workflows, optional desktop-launcher packages, mobile camera support, production delivery polish, and dependency security maintenance. This roadmap stays short and practical so the new surfaces can settle before larger feature promises.

The v2.2 release track focuses on reliability, mobile ergonomics, release packaging, self-hosting clarity, and follow-through on the remaining upstream Tauri/GLib dependency issue.

## Near-Term Focus

- **Self-hosting reliability:** keep Docker, environment setup, backup/restore, and upgrade notes easy to follow.
- **Launcher release flow:** keep macOS, Windows, and Linux desktop packages reproducible through GitHub Releases.
- **New workflow polish:** refine shopping-list, maintenance reminders, dashboard alerts, and mobile ergonomics after real use.
- **Translation review:** prioritize English and Turkish quality, then improve high-usage community locales over time.
- **Mobile and PWA polish:** refine install icons, offline behavior, QR scanning, and small-screen inventory workflows.
- **Backup confidence:** continue testing owner-only export/import flows and document safe restore practices.
- **Documentation cleanup:** split advanced configuration, deployment, and security model notes into focused docs as the project stabilizes.

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
