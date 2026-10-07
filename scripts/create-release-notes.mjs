import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? '' : process.argv[index + 1];
}
const version = readArg('version');
const output = readArg('output');
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !output) {
  throw new Error('--version X.Y.Z and --output are required.');
}
const lines = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
const start = lines.findIndex(line => line === `## v${version}` || line.startsWith(`## v${version} `));
if (start < 0) throw new Error(`CHANGELOG.md has no section for v${version}.`);
let end = start + 1;
while (end < lines.length && !lines[end].startsWith('## ')) end += 1;
const changes = lines.slice(start + 1, end).join('\n').trim();
if (!changes) throw new Error(`CHANGELOG.md section for v${version} is empty.`);
const notes = `## HomeInventory v${version}\n\n${changes}

## Recommended downloads

- **macOS (Apple Silicon):** the \`darwin-aarch64.dmg\` file
- **macOS (Intel):** the \`darwin-x86_64.dmg\` file
- **Windows:** use \`.exe\`; \`.msi\` is also available
- **Linux:** use \`.AppImage\`; \`.deb\` and \`.rpm\` are also available

The remaining archive and metadata files are used automatically by HomeInventory updates.

## Upgrade notes

- Supported browsers: Safari 16.4+, Chrome 111+, or Firefox 128+.
- macOS packages use ad-hoc signing when Apple Developer ID/notarization credentials are unavailable. Ad-hoc signing does not provide Apple notarization.
- Physical iOS Safari certificate/camera validation remains a separate device check.
- Back up the SQLite database, uploads, and your encryption key before upgrading a self-hosted installation.
- Docker users: \`docker compose pull && docker compose up -d\` switches to the published image.
- Rebuild the client and refresh the PWA/service worker after upgrading.
- Flash and zoom availability depends on the mobile browser and camera hardware; unsupported controls remain disabled.
- See \`CHANGELOG.md\` in the source archive for the complete patch notes.
`;
writeFileSync(resolve(output), notes);
console.log(`Created release notes for HomeInventory ${version}.`);
