import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function normalizeBrandKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
}

async function prepare() {
    console.log('=== Preparing Brand Assets & Configuration ===');

    let envFilePath = process.env.APP_BRAND_ENV_FILE || process.argv[2] || '';
    if (!envFilePath) {
        console.error('No brand environment file found. Provide APP_BRAND_ENV_FILE or run with a brand env path.');
        process.exit(1);
    } else {
        envFilePath = path.isAbsolute(envFilePath) ? envFilePath : path.resolve(projectRoot, envFilePath);
    }

    if (!fs.existsSync(envFilePath)) {
        console.error(`Brand env file not found: ${envFilePath}`);
        process.exit(1);
    }

    dotenv.config({ path: envFilePath, override: true, quiet: true });
    const brandKey = normalizeBrandKey(process.env.APP_BRAND_KEY);
    if (!brandKey) {
        console.error('APP_BRAND_KEY is empty or invalid after normalization.');
        process.exit(1);
    }
    console.log(`Configured brand key: "${brandKey}"`);

    const brandSourcePublic = path.resolve(projectRoot, `local-brands/${brandKey}/public`);
    const brandDestPublic = path.resolve(projectRoot, `client/public/brand-local/${brandKey}`);
    const brandRoot = path.resolve(projectRoot, `local-brands/${brandKey}`);

    if (!fs.existsSync(brandRoot)) {
        console.error(`Brand directory not found: ${brandRoot}`);
        process.exit(1);
    }

    if (fs.existsSync(brandSourcePublic)) {
        console.log(`Copying brand assets for "${brandKey}"...`);
        copyDirSync(brandSourcePublic, brandDestPublic);
        console.log(`Copied assets to client/public/brand-local/${brandKey}`);
    } else {
        console.log(`No custom assets folder found under local-brands/${brandKey}/public`);
    }

    const repairScript = path.resolve(projectRoot, `local-brands/${brandKey}/scripts/repair-${brandKey}-landing-locales.mjs`);
    if (fs.existsSync(repairScript)) {
        console.log(`Running brand locale repair script: ${repairScript}`);
        try {
            execFileSync(process.execPath, [repairScript], {
                stdio: 'inherit',
                cwd: projectRoot
            });
            console.log('Brand locale repair completed successfully.');
        } catch (error) {
            console.error('Brand locale repair failed:', error.message);
            process.exit(1);
        }
    } else {
        console.log(`No custom locale repair script found for "${brandKey}"`);
    }

    console.log('=== Brand Preparation Complete ===\n');
}

prepare().catch((err) => {
    console.error('Error during brand preparation:', err);
    process.exit(1);
});
