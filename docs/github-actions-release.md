# GitHub Actions Release and Signing

HomeInventory v2.5 publishes two independently verified artifact families:

- Native launcher packages. macOS applications are code-signed; optional Tauri updater artifacts use the Tauri signing key.
- The managed HomeInventory archive, shipped as `homeinventory-app.tar.gz` with an Ed25519-signed `homeinventory-app-manifest.json` and a SHA-256 digest.

The launcher rejects online managed-app manifests with an empty or `unsigned` signature. The release job also fails before publishing when the managed-app signing secret is missing. The archive builder excludes `.env`, databases, uploads, dependencies, local/private brands, and generated build output.

## Repository secrets

Required for a publishing run:

- `HOMEINVENTORY_APP_MANIFEST_PRIVATE_KEY_PEM`: Ed25519 PKCS#8 PEM private key matching the public key embedded in the launcher.

Required when Tauri updater artifacts are published:

- `TAURI_SIGNING_PRIVATE_KEY`: private key generated with the Tauri signer.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that key, when configured.

Recommended for trusted macOS distribution:

- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_DEVELOPER_ID_APPLICATION`
- `APPLE_NOTARY_KEY_ID`
- `APPLE_NOTARY_ISSUER_ID`
- `APPLE_NOTARY_KEY_P8`

Never commit any of these values. Key rotation requires updating the corresponding public key/configuration and its verification test in the same release.

## Signing modes

- **Managed app:** release publication always requires an Ed25519 signature. `--allow-unsigned true` exists only for local, non-release fixtures.
- **macOS with Apple secrets:** Developer ID signing, timestamping, notarization, and stapling are performed and verified.
- **macOS without Apple secrets:** the workflow falls back to ad-hoc signing. This checks bundle integrity but does not establish developer identity or notarization; Gatekeeper may require manual approval.
- **Tauri updater:** updater artifacts and `latest.json` are produced only when the Tauri signing key is available.

## Release workflow

1. Complete [`release-checklist.md`](release-checklist.md).
2. Confirm root, client, launcher, Tauri, and Rust versions are all `2.5.0` with `npm run version:check`.
3. Run CI and fix every build, test, audit, archive, launcher, and Rust failure.
4. Create the GitHub Release/tag first, or run `Launcher Packages` manually with `publish_release=true` and `release_tag=v2.5.0`.
5. The workflow builds the HomeInventory-only managed archive, creates its signed manifest, builds native packages, verifies macOS signatures, optionally notarizes, collects updater signatures, generates `latest.json`, and uploads the release assets.
6. Download the published assets into a clean machine and repeat the checksum/signature and first-launch smoke checks before announcing the release.
