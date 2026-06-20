import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [viteEntry, 'build', ...process.argv.slice(2)], {
    env: {
        ...process.env,
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

    process.exitCode = code ?? 1;
});
