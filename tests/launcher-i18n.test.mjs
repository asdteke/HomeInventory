import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../apps/launcher/src/i18n.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../apps/launcher/src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../apps/launcher/src/styles.css', import.meta.url), 'utf8');
const tauriConfig = readFileSync(new URL('../apps/launcher/src-tauri/tauri.conf.json', import.meta.url), 'utf8');
const localeNames = ['en', 'tr', 'de', 'fr', 'es'];
const invariantKeys = new Set([
  'language.en', 'language.tr', 'language.de', 'language.fr', 'language.es',
  'common.launcher', 'https.ios', 'https.android', 'android.samsung', 'advanced.resendKey',
]);

function localeBlock(name, nextName) {
  const start = source.indexOf(`const ${name}`);
  const end = nextName ? source.indexOf(`const ${nextName}`, start) : source.indexOf('const dictionaries', start);
  assert.notEqual(start, -1, `${name} dictionary is missing`);
  assert.notEqual(end, -1, `${name} dictionary boundary is missing`);
  return source.slice(start, end);
}

function keys(block) {
  return new Set([...block.matchAll(/'([^']+)'\s*:/g)].map(match => match[1]));
}

function entries(block) {
  return new Map([...block.matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)].map(match => [match[1], match[2]]));
}

function placeholders(value) {
  return [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
}

test('launcher ships five complete local dictionaries with matching placeholders', () => {
  const blocks = Object.fromEntries(localeNames.map((name, index) => [name, localeBlock(name, localeNames[index + 1])]));
  const englishKeys = keys(blocks.en);
  const englishEntries = entries(blocks.en);
  assert.ok(englishKeys.size > 200, 'expected the full launcher surface to be localized');

  for (const locale of localeNames.slice(1)) {
    const localeKeys = keys(blocks[locale]);
    const missing = [...englishKeys].filter(key => !localeKeys.has(key) && !invariantKeys.has(key));
    assert.deepEqual(missing, [], `${locale} has missing non-invariant translations`);

    const localeEntries = entries(blocks[locale]);
    for (const [key, value] of localeEntries) {
      if (!englishEntries.has(key)) continue;
      assert.deepEqual(placeholders(value), placeholders(englishEntries.get(key)), `${locale}.${key} placeholders differ`);
    }
  }
});

test('launcher detects, persists, and exposes language choice on the main screen and in Settings', () => {
  assert.match(source, /navigator\.languages/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(source, /document\.documentElement\.lang = locale/);
  assert.match(appSource, /className="language-settings-card"/);
  assert.match(appSource, /className="language-quick-picker"/);
  assert.doesNotMatch(appSource, /aria-haspopup="menu"/);
  assert.match(appSource, /role="radiogroup"/);
  assert.match(appSource, /role="radio"/);
  assert.doesNotMatch(appSource, /launcher-language-select/);
  assert.match(styles, /\.language-options\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s);
  assert.match(styles, /\.language-options button > span\s*\{[^}]*border-radius:\s*50%;/s);
  assert.match(appSource, /aria-label=\{t\('language\.launcherLanguage'\)\}/);
  assert.match(styles, /\.language-quick-picker\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(styles, /\.language-quick-picker select\s*\{[^}]*appearance:\s*none;/s);
});

test('launcher typography remains fully offline', () => {
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(/);
  assert.doesNotMatch(tauriConfig, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(styles, /font-family:\s*-apple-system, BlinkMacSystemFont/);
});

test('advanced field labels use human-readable names without repeating env keys', () => {
  const blocks = localeNames.map((name, index) => localeBlock(name, localeNames[index + 1]));
  const english = entries(blocks[0]);
  const labelKeys = ['advanced.resendKey', 'advanced.sender', 'advanced.supportEmail', 'advanced.bootstrapAdmin'];

  for (const [index, block] of blocks.entries()) {
    const dictionary = index === 0 ? english : new Map([...english, ...entries(block)]);
    for (const key of labelKeys) {
      const value = dictionary.get(key);
      assert.ok(value, `${key} is missing`);
      assert.doesNotMatch(value, /\b(?:RESEND_API_KEY|EMAIL_FROM|SUPPORT_EMAIL|BOOTSTRAP_ADMIN_EMAIL)\b/);
    }
    assert.doesNotMatch(dictionary.get('advanced.bootstrapHelp') || '', /BOOTSTRAP_ADMIN_EMAIL/);
  }
});
