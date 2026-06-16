import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const npmCommand = process.env.HOMEINVENTORY_NPM_EXEC || (process.platform === 'win32' ? 'npm.cmd' : 'npm');

// Developer entrypoint for the public v2 release line.
const children = [
    spawn(npmCommand, ['--silent', 'run', 'server'], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    }),
    spawn(npmCommand, ['--silent', '--prefix', 'client', 'run', 'dev', '--', '--clearScreen', 'false'], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    })
];

let activeChildren = children.length;
let settled = false;

function terminateChildren(signal = 'SIGTERM') {
    for (const child of children) {
        if (child.exitCode === null && !child.killed) {
            child.kill(signal);
        }
    }
}

function finish(code = 0) {
    if (settled) {
        return;
    }

    settled = true;
    process.exit(code);
}

function handleParentSignal(signal) {
    terminateChildren(signal);

    setTimeout(() => {
        terminateChildren('SIGKILL');
    }, 1500).unref();
}

process.on('SIGINT', () => handleParentSignal('SIGINT'));
process.on('SIGTERM', () => handleParentSignal('SIGTERM'));

for (const child of children) {
    child.on('exit', (code, signal) => {
        activeChildren -= 1;

        if (settled) {
            return;
        }

        if (signal) {
            terminateChildren(signal);
            finish(1);
            return;
        }

        if ((code ?? 0) !== 0) {
            terminateChildren('SIGTERM');
            finish(code ?? 1);
            return;
        }

        if (activeChildren === 0) {
            finish(0);
        }
    });
}
