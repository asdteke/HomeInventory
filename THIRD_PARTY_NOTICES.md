# Third Party Notices

HomeInventory Local includes third-party open-source software required to run the local desktop package.

## Runtime

- Node.js is included in the Microsoft Store package as a portable runtime for local execution.
- Node.js is distributed under the Node.js project license terms. See https://github.com/nodejs/node for the full upstream notices and license files.

## JavaScript Dependencies

HomeInventory Local includes production JavaScript dependencies installed from the npm ecosystem for the server runtime. Each dependency remains subject to its own license terms as declared in its npm package metadata.

The primary application source is distributed under the repository license in `LICENSE`.

## Optional Network Services

Some user-triggered features may contact third-party services:

- Google Sign-In, when configured and selected by the user.
- Barcode and product lookup providers: Open Food Facts, Open Products Facts, and Open Beauty Facts (open data under the Open Database License). The optional "Search on Google" button opens a normal Google search in the user's own browser; the server does not query Google.
- Microsoft Store, for HomeInventory Local updates.
- GitHub (`api.github.com`), for the admin-only "new version available" notice in self-hosted Docker or command-line installs. The server asks GitHub's public releases API for the latest version number only when an admin opens the admin panel, sends no user or inventory data, and caches the answer for 12 hours. It is turned off in the desktop launcher and Microsoft Store builds, which update themselves, and by setting `UPDATE_CHECK=false`.

These services are not used for advertising or non-essential analytics by default.
