import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const explicitBrandKey = String(process.env.APP_BRAND_KEY || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
const isCustomBrandBuild = Boolean(explicitBrandKey && explicitBrandKey !== 'homeinventory');
const outputDirectory = String(
    process.env.APP_BUILD_OUT_DIR || (isCustomBrandBuild ? `dist-${explicitBrandKey}` : 'dist')
).trim();
const homeInventoryBuildEnv = {
    APP_BRAND_KEY: 'homeinventory',
    APP_BRAND_NAME: 'HomeInventory',
    APP_PWA_MANIFEST_ID: '/app/homeinventory/20260519-pwa-assets',
    APP_PWA_THEME_COLOR_LIGHT: '#f6f2e9',
    APP_PWA_BACKGROUND_COLOR_LIGHT: '#f6f2e9',
    APP_PWA_THEME_COLOR_DARK: '#1a1f1c',
    APP_PWA_BACKGROUND_COLOR_DARK: '#1a1f1c',
    APP_SITE_URL: 'http://localhost:3001',
    APP_VERSION: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
    SITE_URL: 'http://localhost:3001',
    SUPPORT_EMAIL: ''
};
const effectiveBuildEnv = {
    ...process.env,
    ...(isCustomBrandBuild ? {} : homeInventoryBuildEnv)
};
const child = spawn(process.execPath, [
    viteEntry,
    'build',
    `--outDir=${outputDirectory}`,
    ...process.argv.slice(2)
], {
    env: {
        ...effectiveBuildEnv,
        NODE_ENV: 'production'
    },
    stdio: 'inherit'
});

child.once('error', (error) => {
    console.error(`Unable to start the production client build: ${error.message}`);
    process.exitCode = 1;
});

child.once('exit', (code, signal) => {
    if (signal) {
        console.error(`Production client build stopped by signal ${signal}.`);
        process.exitCode = 1;
        return;
    }

    if (code !== 0) {
        process.exitCode = code ?? 1;
        return;
    }

    // Local production runs keep immutable asset headers. Stamp generated asset URLs so a
    // fresh build cannot be visually masked by a previous browser cache entry.
    const indexPath = join(fileURLToPath(new URL(`../${outputDirectory}/`, import.meta.url)), 'index.html');
    const buildStamp = Date.now().toString(36);
    const html = readFileSync(indexPath, 'utf8').replace(
        /(assets\/[^"'?]+\.css)/g,
        `$1?v=${buildStamp}`
    );
    writeFileSync(indexPath, html);

    const offlinePath = join(fileURLToPath(new URL(`../${outputDirectory}/`, import.meta.url)), 'offline.html');
    const offlineHtml = readFileSync(offlinePath, 'utf8')
        .replaceAll('__APP_BRAND_NAME__', effectiveBuildEnv.APP_BRAND_NAME || 'HomeInventory')
        .replaceAll('__APP_THEME_COLOR_LIGHT__', effectiveBuildEnv.APP_PWA_THEME_COLOR_LIGHT || '#f6f2e9')
        .replaceAll('__APP_BACKGROUND_COLOR_LIGHT__', effectiveBuildEnv.APP_PWA_BACKGROUND_COLOR_LIGHT || '#f6f2e9')
        .replaceAll('__APP_THEME_COLOR_DARK__', effectiveBuildEnv.APP_PWA_THEME_COLOR_DARK || '#1a1f1c')
        .replaceAll('__APP_BACKGROUND_COLOR_DARK__', effectiveBuildEnv.APP_PWA_BACKGROUND_COLOR_DARK || '#1a1f1c');

    if (/__APP_[A-Z0-9_]+__/.test(offlineHtml)) {
        console.error('Offline page still contains unresolved brand placeholders.');
        process.exitCode = 1;
        return;
    }
    writeFileSync(offlinePath, offlineHtml);

    process.exitCode = 0;
});
