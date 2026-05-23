# HomeInventory Launcher

Optional desktop launcher for local HomeInventory profiles.

The launcher does not replace the normal open-source workflow:

```bash
npm run install-all
npm run dev
```

It adds a GUI for local setup tasks: dependency checks, profile start/stop,
isolated data/upload paths, backups, logs, port checks, and QR/LAN access.

## Development

From the repository root:

```bash
npm run launcher:install
npm run launcher:dev
```

Build desktop packages:

```bash
npm run launcher:build
```

Cross-platform packages are produced by the `Launcher Packages` GitHub Actions
workflow and attached to GitHub Releases as separate artifacts.

## Safety model

- React never runs shell commands directly.
- Rust exposes only allowlisted Tauri commands.
- Tauri shell and broad filesystem plugins are not used.
- macOS/Linux resolve `node` and `npm` through the user's login shell environment.
- Windows resolves `node` and `npm` through `where.exe` and common install paths.
- Only one profile can run at a time in the current launcher beta.
- Each profile receives isolated data, database, and uploads directories.
