import fs from 'fs';
import path from 'path';
import { translate } from '@vitalets/google-translate-api';

const enJson = JSON.parse(fs.readFileSync('./client/public/locales/en/translation.json', 'utf8'));
const langs = ['es', 'de', 'fr', 'it', 'ar', 'ru', 'zh-Hans'];

async function transObj(obj, lang) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object') {
      result[k] = await transObj(v, lang);
    } else {
      try {
        const res = await translate(v, { to: lang });
        let text = res.text;
        text = text.replace(/\{\s?\{\s?([^}]+)\s?\}\s?\}/g, '{{$1}}');
        result[k] = text;
        console.log(`Translated ${k}: ${text}`);
      } catch (e) {
        result[k] = v;
      }
    }
  }
  return result;
}

async function run() {
  for (const l of langs) {
    const file = `./client/public/locales/${l}/translation.json`;
    if (!fs.existsSync(file)) continue;
    
    console.log(`Translating ${l}...`);
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // settings.two_factor
    if (!current.settings.two_factor) {
      current.settings.two_factor = await transObj(enJson.settings.two_factor, l);
    }
    
    // auth.login.two_factor
    if (!current.auth.login.two_factor) {
      current.auth.login.two_factor = await transObj(enJson.auth.login.two_factor, l);
    }
    
    fs.writeFileSync(file, JSON.stringify(current, null, 4));
    console.log(`Saved ${l}`);
  }
}
run();
