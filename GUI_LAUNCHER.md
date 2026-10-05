# HomeInventory Desktop GUI Launcher (Beta)

HomeInventory Desktop Launcher is an optional cross-platform desktop application built with **Tauri**, **React**, and **TypeScript**. It helps local/self-host users start HomeInventory, manage local profiles, inspect logs, create backups, and configure common environment settings from a graphical interface.

The launcher does not replace the normal open-source workflow:

```bash
npm run install-all
npm run dev
```

CLI and Docker remain first-class setup paths. The launcher is a convenience layer for people who prefer a desktop control panel.

## Key Features

- **One-click local start/stop:** starts and stops HomeInventory. Launcher-managed installs run the production server with the prebuilt UI on one port; custom source folders keep the API plus Vite development setup.
- **Profile isolation:** launcher-managed profiles receive separate data, SQLite, uploads, and encrypted media paths.
- **Dependency verifier:** detects Node.js and npm, including macOS/Linux GUI PATH handling and Windows path lookup.
- **Port and LAN checks:** validates local ports before launch and shows a QR code for devices on the same network.
- **Optional offline mobile HTTPS:** creates a launcher-local CA, expiring enrollment links, and an HTTPS LAN gateway so supported phone browsers can grant camera permission without a domain or external certificate service. Normal HTTP remains available and is the default.
- **Five launcher languages:** English, Turkish, German, Spanish, and French can be selected directly from the launcher and are remembered locally.
- **Automatic local handoff:** can open the local HomeInventory URL in the browser after the services are ready.
- **Integrated logs:** shows setup, backend, frontend, and launcher logs in one place.
- **Backups:** creates local backups for launcher-managed profiles.
- **Advanced settings:** lets users set email/admin bootstrap values, choose API/UI ports, and override the project root, Node path, or npm path when auto-detection is not enough.

## Safety Model

- **No arbitrary shell from React:** the React frontend never invokes arbitrary system commands directly.
- **Rust command boundary:** process control, backups, file writes, path selection, and URL opening go through validated Tauri commands.
- **Minimal capabilities:** the launcher avoids broad shell/filesystem permissions in the frontend.
- **Process cleanup:** launcher-managed service process groups are stopped when services are stopped or the launcher exits.
- **Isolated runtime paths:** profiles use separate `HOMEINVENTORY_DATA_DIR`, `HOMEINVENTORY_DB_PATH`, and `HOMEINVENTORY_UPLOADS_DIR` values.
- **Private certificate storage:** CA and server private keys stay in the launcher application-data directory, outside managed-app archives and HomeInventory backups. Only the public CA is offered to enrolled phones.

## Installation

For most users, there is no need to compile the launcher from source. Go to the [GitHub Releases](https://github.com/asdteke/HomeInventory/releases) page and download the launcher package for your operating system:

- **macOS:** `.dmg` or `.app.zip`
- **Windows:** `.exe` or `.msi`
- **Linux:** `.AppImage`, `.deb`, or `.rpm`

On the first run the launcher shows **Install HomeInventory**. It installs the HomeInventory version that ships with the launcher, then starts it once. After that, click **Launch HomeInventory**: the launcher checks ports, starts the app, waits until the UI is actually served, and then shows the local URL plus a QR code for devices on the same network.

### First Install and Run Modes

- **First install:** the launcher unpacks its bundled app into the launcher data folder (`managed-app/versions/<version>`), downloads the portable Node.js runtime, and runs `npm ci --omit=dev` for the server only. The UI ships prebuilt in the archive (`client/dist`), so no client dependencies or Vite build are needed. This needs an internet connection once and usually takes one to three minutes. The app is not started and stopped during the install; it is started once after the install succeeds.
- **Production mode (default for launcher-managed installs and HomeInventory Local):** `NODE_ENV=production node server.js` serves the API and the prebuilt UI on a single port (default 3001). The launcher waits up to 120 seconds for `/api/health` and the app shell before it reports the app as ready or opens the browser.
- **Development mode (custom install folders and older managed installs without `client/dist`):** the launcher keeps running `scripts/dev.mjs` with separate API and UI ports, as before. `npm run dev` from the repository is unchanged.
- **Custom folder:** **Use a custom install folder** on the first-install screen (or **Developer Tools > Settings > Install folder**) keeps the previous behaviour of installing into, or running from, a folder you choose.
- User data, profile data, and launcher configuration stay in the same launcher application-data locations as before.
- Every server process started by the launcher gets `UPDATE_CHECK=false`, so the app's own GitHub release check is skipped; the launcher handles updates.

### Optional Updates

Updates never block or replace **Launch HomeInventory**: Start always runs the installed version. When an update is available, the launcher shows a separate update card with three choices:

- **Update Now** installs it. For a verified online release this creates a backup, installs the managed app, and then applies the matching launcher update (the app and launcher are released together). For a newer app bundled with an updated launcher, it only replaces the app files and finishes stopped; the next Start runs the new version.
- **Later** hides the offer until the launcher is opened again.
- **Skip This Version** hides that version permanently (saved in the launcher settings). A newer version is offered again. **Show Update** on the card, or **Developer Tools > Updates**, brings a skipped or postponed update back.

The launcher still checks for updates when it opens, but it only checks; nothing is downloaded or installed until you choose **Update Now**.

Live mobile camera access over a LAN IP requires a secure browser context. The opt-in, domain-free setup and its trust/rotation limits are documented in [Optional Offline Mobile HTTPS](docs/offline-mobile-https.md).

## Building from Source

Install the native development prerequisites for Tauri:

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** Microsoft C++ Build Tools
- **Linux:** `build-essential`, WebKitGTK 4.1 development packages, GTK/AppIndicator development packages, and `curl`

From the repository root:

```bash
npm run launcher:install
npm run launcher:dev
```

Build a production desktop package for the current platform:

```bash
npm run launcher:build
```

Cross-platform release packages are produced by the `Launcher Packages` GitHub Actions workflow on native macOS, Windows, and Linux runners.

## Profile Directory Isolation

When a profile is launched through the GUI, the launcher maps runtime data to app-data folders:

```text
Launcher app data
└── profiles/
    └── homeinventory/
        ├── data/
        │   └── inventory.db
        ├── uploads/
        └── env/
            └── launcher-secrets.env
```

The active process receives equivalent runtime variables:

```env
HOMEINVENTORY_DATA_DIR=<launcher-app-data>/profiles/homeinventory/data
HOMEINVENTORY_DB_PATH=<launcher-app-data>/profiles/homeinventory/data/inventory.db
HOMEINVENTORY_UPLOADS_DIR=<launcher-app-data>/profiles/homeinventory/uploads
```

This keeps launcher-managed local runs separate from the normal repository `.env`, database, and uploads unless the user explicitly changes paths.

The launcher also sets `UPDATE_CHECK=false`: it updates HomeInventory itself, so the admin panel's GitHub new-version notice (meant for Docker and command-line installs) is turned off and never contacts GitHub.

## Release Packaging

The launcher is shared as release artifacts, separate from the source archive:

```text
GitHub Release v2.7.0
├── HomeInventory.Launcher-macos.dmg
├── HomeInventory.Launcher-macos.app.zip
├── HomeInventory.Launcher_2.7.0_x64-setup.exe
├── HomeInventory.Launcher_2.7.0_x64_en-US.msi
├── HomeInventory.Launcher_2.7.0_amd64.AppImage
├── HomeInventory.Launcher_2.7.0_amd64.deb
└── HomeInventory.Launcher-2.7.0-1.x86_64.rpm
```

The `Launcher Packages` GitHub Actions workflow builds these packages on native macOS, Windows, and Linux runners. On tag pushes, the workflow uploads them to the matching GitHub Release alongside the normal source code archive. Linux packages still inherit Tauri's current GTK3/GLib dependency chain until an upstream Tauri release moves to a patched GLib stack.

## Troubleshooting

### 1. macOS: "EPERM: operation not permitted, uv_cwd" Error or Process Exiting at Launch
If the launcher interface opens, but after clicking **Launch HomeInventory**, the app hangs at "HomeInventory is starting" and the console logs show `EPERM` or `uv_cwd` errors:
* **Do not run the app from inside the DMG:** Open the DMG, drag and drop the `HomeInventory Launcher` app into your **`/Applications`** folder, and then eject the DMG volume.
* **Remove the Quarantine Flag:** Open your Terminal and execute:
  ```bash
  xattr -cr /Applications/HomeInventory\ Launcher.app
  ```
* **"Documents" Folder Access Permissions:** If your project directory is located in protected user folders (like `Documents`, `Desktop`, or `Downloads`), macOS might block access:
  - **Grant Folder Permission:** Go to *System Settings > Privacy & Security > Files and Folders* and ensure the *Documents Folder* switch is turned **ON** for *HomeInventory Launcher*.
  - **Alternative (Recommended):** Move your project folder outside protected directories, e.g., directly into your user home directory (`/Users/<username>/HomeInventory`), and update the path in the launcher settings. This completely bypasses macOS folder privacy checks.

### 2. Windows: Blue "SmartScreen" Warning
Unsigned open-source applications downloaded from the internet may trigger a Windows SmartScreen block on launch. To bypass this:
* Open the downloaded `.exe` or installer.
* Click on **More info** on the blue warning card.
* Click **Run anyway**. This is a one-time approval per binary file.
