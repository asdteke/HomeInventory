# HomeInventory Local Microsoft Store Notes

## Store Description

HomeInventory Local is a local-first household inventory app for Windows. It helps you track rooms, items, media, borrowing, maintenance, shopping lists, backups, and private vault records from your own device.

The Microsoft Store edition is self-contained. It includes the local app package and runtime needed to run HomeInventory locally, without downloading the main application from GitHub during first launch. Updates for this edition are delivered through Microsoft Store.

HomeInventory Local runs a local web app on the Windows device. If the user chooses to use the LAN/QR access feature, the app may also be reachable by other devices on the same local network, subject to the user's Windows Firewall and network settings.

Optional internet features are only used when selected or configured by the user, such as Google Sign-In, barcode/product lookup providers, and email delivery settings.

## Short Description

Local-first household inventory for Windows, packaged for Microsoft Store.

## Submission Notes

- Product name: HomeInventory Local
- Package identity: `net.homeinventory.local`
- Update channel: Microsoft Store only
- External updater: disabled in Store builds
- First launch: prepares bundled app files and portable runtime from the installed package
- User data: stored under the app data directory and preserved across Store updates
- Optional network features: same-network LAN/QR access, Google Sign-In, barcode/product lookup, email delivery, and Microsoft Store updates

## Privacy Policy Text

HomeInventory Local is an open-source household inventory application designed to run locally on Windows.

The core inventory data, uploaded media, account data, and Personal Vault records are stored in the local application data area on the user's device. HomeInventory Local does not sell personal data and does not use advertising or non-essential analytics by default.

The application may process account data such as username, email address, password hash, session cookies, trusted-device data, and security logs; service data such as homes, rooms, categories, items, uploaded media, borrow requests, and Personal Vault records created by the user; and technical data needed to operate and secure the application, such as IP address, local network address, browser/session identifiers, required cookies, and language preference.

Some optional features may contact third-party services only when the user chooses to use or configure them. If LAN/QR access is used, the user's inventory app may be opened from other devices on the same local network. If Google Sign-In is used, Google may provide the user's email address, Google account identifier, and display name for authentication or account creation. If barcode or product lookup is used, the submitted barcode may be sent to Open Food Facts, Open Products Facts, Open Beauty Facts, or Google Search to return product information. HomeInventory Local updates are delivered through Microsoft Store.

Users can delete their account from Settings; associated account data, inventory records, Personal Vault content, and uploaded media are deleted from the application except where retention is required for legal, security, or operational reasons.

For privacy or support questions, contact the developer through the GitHub repository:
https://github.com/asdteke/HomeInventory
