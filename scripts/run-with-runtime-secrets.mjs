import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadRuntimeSecrets } from '../utils/runtimeSecrets.js';

const [, , targetModulePath, ...targetArgs] = process.argv;

if (!targetModulePath) {
  throw new Error('Usage: node scripts/run-with-runtime-secrets.mjs <module-path> [...args]');
}

const resolvedTargetModulePath = resolve(targetModulePath);

process.argv = [
  process.argv[0],
  resolvedTargetModulePath,
  ...targetArgs
];

await loadRuntimeSecrets();
await import(pathToFileURL(resolvedTargetModulePath).href);
