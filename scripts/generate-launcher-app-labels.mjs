#!/usr/bin/env node
// Builds the HomeInventory labels the launcher's app window sidebar shows
// (page names and the language list) from the client's own locale files, so
// the merged sidebar speaks every language the app does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'client/public/locales');
const languageSource = path.join(root, 'client/src/utils/languageSupport.ts');
const outFile = path.join(root, 'apps/launcher/src/generated/appLabels.json');

export const LABEL_KEYS = {
  home: 'navigation.home',
  inventory: 'navigation.inventory',
  maintenance: 'navigation.maintenance',
  shopping: 'navigation.shopping',
  borrow: 'navigation.borrow_requests',
  vault: 'navigation.personal_vault',
  settings: 'navigation.settings',
  admin: 'navigation.admin_panel',
  account: 'settings.account_overview.title',
};

function lookup(dictionary, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary);
}

export function readLanguageOptions(source = fs.readFileSync(languageSource, 'utf8')) {
  const block = source.slice(source.indexOf('PRODUCT_LANGUAGE_OPTIONS'), source.indexOf('];'));
  return [...block.matchAll(/\{\s*code:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g)]
    .map(([, code, label]) => ({ code, label }));
}

export function buildAppLabels() {
  const languages = readLanguageOptions();
  const english = JSON.parse(fs.readFileSync(path.join(localesDir, 'en/translation.json'), 'utf8'));
  const labels = {};
  for (const { code } of languages) {
    const file = path.join(localesDir, code, 'translation.json');
    const dictionary = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    labels[code] = Object.fromEntries(Object.entries(LABEL_KEYS).map(([name, key]) => {
      const value = lookup(dictionary, key) ?? lookup(english, key);
      return [name, typeof value === 'string' ? value : name];
    }));
  }
  return { languages, labels };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildAppLabels();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outFile)} (${result.languages.length} languages)`);
}
