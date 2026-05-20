import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let envFileInput = process.env.APP_BRAND_ENV_FILE || process.argv[2] || '';

if (!envFileInput) {
    console.error('Usage: npm run dev:brand -- <brand-env-file>');
    process.exit(1);
}

const envFilePath = path.isAbsolute(envFileInput)
    ? envFileInput
    : path.resolve(projectRoot, envFileInput);

if (!existsSync(envFilePath)) {
    console.error(`Brand env file not found: ${envFilePath}`);
    process.exit(1);
}

// Prepare brand assets and locale overlays before launching the dev environment.
try {
    execFileSync(process.execPath, ['scripts/prepare-brand-dev.mjs', envFilePath], {
        stdio: 'inherit',
        cwd: projectRoot
    });
} catch (prepareErr) {
    console.error('Brand preparation failed. Aborting launch.', prepareErr.message);
    process.exit(1);
}

dotenv.config({ path: envFilePath, override: true, quiet: true });

await import('./dev.mjs');
