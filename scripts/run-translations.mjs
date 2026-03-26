import { execSync } from 'child_process';
import fs from 'fs';

const json = JSON.parse(fs.readFileSync('./client/public/locales/en/translation.json'));
const keys = [];
for (const k in json.auth.login.two_factor) keys.push('auth.login.two_factor.' + k);
for (const k in json.settings.two_factor) keys.push('settings.two_factor.' + k);

const dirs = fs.readdirSync('./client/public/locales', {withFileTypes: true})
  .filter(d => d.isDirectory() && d.name !== 'en' && d.name !== 'tr' && d.name !== 'brand')
  .map(d => d.name);

// Process keys in chunks of 10 to avoid 1000 char limits in Bing API
for (let i = 0; i < dirs.length; i += 5) {
  const langChunk = dirs.slice(i, i + 5);
  console.log(`\n--- Languages: ${langChunk.join(', ')} ---`);
  
  for (let j = 0; j < keys.length; j += 10) {
    const keyChunk = keys.slice(j, j + 10);
    console.log(`Translating keys ${j} to ${j + keyChunk.length}...`);
    try {
      execSync(`node scripts/translate-locale-keys.mjs ${keyChunk.join(' ')} -- ${langChunk.join(' ')}`, { stdio: 'inherit' });
    } catch (err) {
      console.error('Error translating key chunk for languages', langChunk);
    }
  }
}
