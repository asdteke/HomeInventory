# HomeInventory Privacy Policy

Last updated: 7 October 2026

**In local and self-hosted use, your inventory stays on your device or the server you choose. The project maintainers do not receive a copy merely because you install or use the application.**

This policy describes the public HomeInventory open-source application and desktop launcher distributed from [asdteke/HomeInventory](https://github.com/asdteke/HomeInventory). It covers the software's default behavior and optional integrations. A separately hosted or modified installation may have its own operator, settings and privacy policy.

## Where your data is stored

HomeInventory runs on your computer or a server selected by you. Inventory and account records are stored in that installation's SQLite database; uploaded media, backups and launcher settings are stored in its configured data directories. Installing the application does not upload your inventory to the project maintainers.

The installation processes the information you enter, including account names and email addresses; password hashes and authentication/recovery records; household membership; rooms, boxes, items, photos, attachments, warranties, shopping, maintenance and borrowing records; and Personal Vault content. Session cookies, trusted-device records, language preferences, IP addresses and operational/security logs support authentication, settings and troubleshooting. Camera access is used for scanning or photos when you grant browser permission; selected photos or files are sent to your HomeInventory installation.

When you use a shared or remotely hosted installation, its operator controls the server and data storage. Household permissions limit normal app access, but server-side encryption does not prevent an operator with database access and runtime encryption secrets from decrypting server-managed records. Household-owner backups can include private household records. Personal Vault uses a separate client-side encryption flow.

## Network requests and third parties

HomeInventory does not include an advertising service, behavioral analytics SDK or automatic upload of your database or usage logs to its maintainers. It does make the operational requests described below; network providers can receive your connection's IP address and normal request metadata.

| Feature | Information and destination | Control |
| --- | --- | --- |
| Launcher setup and updates | Release/version metadata and app packages are requested from GitHub and its download infrastructure. Runtime setup can download Node.js from nodejs.org, and dependency installation can contact the configured npm registry. These requests do not include inventory records. | Launcher startup can check for updates automatically. Installation/update actions can require network access; use a prepared local source/runtime for offline setup. |
| Self-hosted server update notice | GitHub's API receives a release lookup with the HomeInventory version in its User-Agent; inventory and account records are not included. | Set `UPDATE_CHECK=false` in the server environment to disable this check. |
| Google sign-in | If the operator configures Google OAuth and you select Google sign-in, Google handles authentication and returns your account identifier, email address and display name to the installation. | Use local account/password sign-in instead; operators can leave Google OAuth unconfigured. |
| External barcode/product search | When you choose public catalogue lookup, the submitted barcode is sent from your server to Open Food Facts, Open Products Facts or Open Beauty Facts. A HomeInventory version User-Agent identifies the client. | Use local inventory lookup and avoid the optional public catalogue search. |
| Search on Google | Selecting this button opens a Google search for the barcode in your browser. | Do not select the external search button. |
| Email delivery | If the operator configures Resend, the recipient email address and message content needed for account verification, recovery or configured notifications are sent to Resend. | Operators can leave email delivery unconfigured; availability of email-dependent features changes accordingly. |
| Public-site indexing | When an operator configures IndexNow, public landing/login/register/sitemap URLs can be submitted to the configured indexing endpoint. Inventory records are not included in the default URL list. | Leave `INDEXNOW_KEY` unconfigured to disable this integration. |
| LAN access and optional local HTTPS | If you enable/use LAN access, other permitted devices connect to your installation over your local network. Optional HTTPS enrollment installs a local certificate/profile only through the user's enrollment actions. | Do not enable LAN access or local HTTPS enrollment when you do not want these features; remove enrolled profiles/certificates from client devices when no longer needed. |

Third-party services have their own policies: [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Google](https://policies.google.com/privacy), [Resend](https://resend.com/legal/privacy-policy), [Open Food Facts](https://world.openfoodfacts.org/privacy), [Node.js/OpenJS](https://privacy-policy.openjsf.org/), [npm](https://docs.npmjs.com/policies/privacy), and [IndexNow's privacy terms](https://www.indexnow.org/terms). Public issue reports and repository interactions are also subject to GitHub's policy. Please do not post private inventory, credentials or unredacted logs in public issues.

## Retention, export and deletion

Records remain in the installation until users delete them or its operator applies a retention or cleanup policy. Account deletion is available in Settings and removes associated data according to the app's ownership and shared-household rules. Shared household records may remain for other members. Existing backup copies and operator-managed logs require separate cleanup; deleting an account does not rewrite previously exported backups.

Household owners can export backups. For a local installation, you control its data directories and backup files. Uninstalling the launcher may leave application data; remove the relevant profile/data directories and backups yourself when you want to delete the installation's remaining data. For a hosted installation, contact its operator about access, exports, deletion, hosting and retention.

## Privacy contact and changes

For questions about the open-source software, contact [Ahmed Said Dege (asdteke)](https://github.com/asdteke) through the [project repository](https://github.com/asdteke/HomeInventory). For personal data held by a particular hosted installation, contact that installation's operator rather than posting personal information publicly.

Changes to this policy will be published in this file with an updated date. Review the policy and your operator's configuration when changing installation or enabling integrations.
