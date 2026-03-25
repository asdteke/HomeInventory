import 'dotenv/config';
import { loadRuntimeSecrets } from './utils/runtimeSecrets.js';

await loadRuntimeSecrets();
await import('./app.js');
