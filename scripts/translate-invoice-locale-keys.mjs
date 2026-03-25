import fs from 'fs';
import path from 'path';
import { translate } from 'bing-translate-api';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');
const BASE_LANG = 'en';
const BATCH_SEPARATOR = '<<<__HI_INVOICE_SEP__>>>';
const RETRYABLE_ERROR_PATTERN = /Too Many Requests|429/i;
const TARGET_KEYS = [
  'items.form.invoice_section',
  'items.form.invoice_section_help',
  'items.form.invoice_section_collapsed',
  'items.form.invoice_section_filled',
  'items.form.invoice_security',
  'items.form.invoice_photo',
  'items.form.invoice_price',
  'items.form.invoice_price_placeholder',
  'items.form.invoice_currency',
  'items.form.invoice_date',
  'items.form.warranty_expiry_date'
];

const TRANSLATION_LANGS = {
  no: 'nb',
  'sr-Cyrl': 'sr',
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hant'
};

function getDeepValue(object, keyPath) {
  return keyPath.split('.').reduce((current, key) => (current ? current[key] : undefined), object);
}

function setDeepValue(object, keyPath, value) {
  const parts = keyPath.split('.');
  let current = object;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[parts.at(-1)] = value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateTexts(texts, targetLang) {
  if (texts.length === 0) {
    return [];
  }

  const mappedTargetLang = TRANSLATION_LANGS[targetLang] || targetLang;
  const payload = texts.join(` ${BATCH_SEPARATOR} `);
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await translate(payload, null, mappedTargetLang);
      return result.translation.split(new RegExp(`\\s*${BATCH_SEPARATOR}\\s*`, 'g'));
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_ERROR_PATTERN.test(String(error.message || '')) || attempt === 3) {
        throw error;
      }

      await delay(3000 * (attempt + 1));
    }
  }

  throw lastError;
}

async function processLanguage(baseTranslation, lang) {
  const localePath = path.join(LOCALES_DIR, lang, 'translation.json');
  const currentTranslation = fs.existsSync(localePath)
    ? JSON.parse(fs.readFileSync(localePath, 'utf8'))
    : {};

  const keysToTranslate = TARGET_KEYS.filter((keyPath) => {
    const baseValue = getDeepValue(baseTranslation, keyPath);
    const localeValue = getDeepValue(currentTranslation, keyPath);

    return baseValue && (!localeValue || localeValue === baseValue);
  });

  if (keysToTranslate.length === 0) {
    console.log(`Skipped ${lang}: no missing invoice keys`);
    return;
  }

  const translatedValues = await translateTexts(
    keysToTranslate.map((keyPath) => getDeepValue(baseTranslation, keyPath)),
    lang
  );

  keysToTranslate.forEach((keyPath, index) => {
    setDeepValue(currentTranslation, keyPath, translatedValues[index] || getDeepValue(baseTranslation, keyPath));
  });

  fs.writeFileSync(localePath, JSON.stringify(currentTranslation, null, 4));
  console.log(`Saved ${lang}/translation.json with ${keysToTranslate.length} invoice keys`);
}

async function run() {
  const languages = process.argv.slice(2);
  if (languages.length === 0) {
    console.log('Usage: node scripts/translate-invoice-locale-keys.mjs <lang1> <lang2> ...');
    process.exit(1);
  }

  const baseTranslation = JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, BASE_LANG, 'translation.json'), 'utf8')
  );

  for (const lang of languages) {
    try {
      await processLanguage(baseTranslation, lang);
    } catch (error) {
      console.error(`Failed ${lang}:`, error.message);
    }
    await delay(1500);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
