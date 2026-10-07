# Code signing policy

Last updated: 7 October 2026

## Current status

HomeInventory is preparing an application to the [SignPath Foundation](https://signpath.org/) free code-signing program. Acceptance and production signing have not been confirmed. Current Windows releases are not Authenticode-signed by SignPath Foundation. Publishing this policy does not make an existing installer signed.

The intended provider attribution, applicable only after acceptance and signing are enabled, is: **Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).** Under that program, the certificate's publisher identity is SignPath Foundation rather than the maintainer's personal name.

## Source, downloads and intended signing scope

- Source: [asdteke/HomeInventory](https://github.com/asdteke/HomeInventory), licensed under MIT.
- Official downloads: [GitHub Releases](https://github.com/asdteke/HomeInventory/releases).
- Automated builds: the repository's public [GitHub Actions workflows](https://github.com/asdteke/HomeInventory/actions).
- Requested Windows scope: the HomeInventory Launcher executable and its EXE/MSI installers, built from this repository's release source. Third-party components retain their own signatures, if any; they must not be signed as if maintained by HomeInventory.

If the project is accepted, the signing workflow must verify the build's source origin, restrict signing to approved release sources and consistent HomeInventory product/version metadata, and obtain a maintainer's manual approval for each signing request. It must sign application files and installers before creating any updater signatures or publishing the final artifacts. This is the intended integration, not a claim that SignPath is already configured.

## Maintainer and roles

[Ahmed Said Dege (asdteke)](https://github.com/asdteke) is the project maintainer and the designated author, reviewer and signing approver. External contributions are reviewed before inclusion. GitHub and SignPath access must use multi-factor authentication, and every production signing request must receive manual approval before a release is signed. Additional people with signing responsibilities must be listed here before receiving that role.

## Verifying downloads

For a Windows file explicitly published as Authenticode-signed, open **Properties → Digital Signatures** or use Windows SDK SignTool (`signtool verify /pa /all <file>`) to check the signature and documented publisher. If there is no valid signature, do not treat that file as covered by this policy. Signing does not guarantee immediate Microsoft SmartScreen reputation or the absence of installation warnings.

Existing Tauri updater signatures and signed managed-app manifests authenticate update artifacts; they are separate from Windows Authenticode publisher signing. macOS Developer ID signing/notarization is also a separate process, and ad-hoc signing does not provide Apple notarization.

## Privacy and reporting

See the [HomeInventory Privacy Policy](PRIVACY.md) for local/server data handling, update requests and optional third-party services. Report suspicious release files through the [project issue tracker](https://github.com/asdteke/HomeInventory/issues), without including private inventory, credentials or unredacted logs. Affected signed artifacts must be investigated with the signing provider; signatures may be revoked if the provider's terms are violated.
