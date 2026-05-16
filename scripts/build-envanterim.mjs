import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const distDir = path.join(rootDir, 'client', 'dist');
const textExtensions = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.svg',
    '.txt',
    '.webmanifest',
    '.xml'
]);

const replacements = [
    [/HomeInventory/g, 'Envanterim'],
    [/Home Inventory/g, 'Envanterim'],
    [/homeinventory\.net\.tr/g, 'envanterim.net.tr'],
    [/homeinventory/g, 'envanterim']
];

function runBuild() {
    return new Promise((resolve, reject) => {
        const child = spawn('npm', ['run', 'build', '--prefix', 'client'], {
            cwd: rootDir,
            env: {
                ...process.env,
                APP_BRAND_NAME: 'Envanterim',
                SITE_URL: 'https://envanterim.net.tr',
                APP_SITE_URL: 'https://envanterim.net.tr'
            },
            stdio: 'inherit'
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`Envanterim build failed with exit code ${code}`));
        });
    });
}

function walkFiles(directory) {
    const entries = readdirSync(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(absolutePath));
            continue;
        }

        if (entry.isFile()) {
            files.push(absolutePath);
        }
    }

    return files;
}

function rewriteDistBranding() {
    if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
        throw new Error(`Build output not found: ${distDir}`);
    }

    let changedFiles = 0;
    for (const filePath of walkFiles(distDir)) {
        if (!textExtensions.has(path.extname(filePath))) continue;

        const original = readFileSync(filePath, 'utf8');
        let updated = original;
        for (const [pattern, replacement] of replacements) {
            updated = updated.replace(pattern, replacement);
        }

        if (updated !== original) {
            writeFileSync(filePath, updated);
            changedFiles += 1;
        }
    }

    console.log(`[envanterim] Rewrote branding in ${changedFiles} built file(s).`);
}

await runBuild();
rewriteDistBranding();
