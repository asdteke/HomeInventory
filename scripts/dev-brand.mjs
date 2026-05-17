import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envFileInput = process.env.APP_BRAND_ENV_FILE || process.argv[2] || '';

if (!envFileInput) {
    console.error('Usage: npm run dev:brand -- <ignored-env-file>');
    process.exit(1);
}

const envFilePath = path.isAbsolute(envFileInput)
    ? envFileInput
    : path.resolve(projectRoot, envFileInput);

if (!existsSync(envFilePath)) {
    console.error(`Brand env file not found: ${envFilePath}`);
    process.exit(1);
}

dotenv.config({ path: envFilePath, override: true });

await import('./dev.mjs');
