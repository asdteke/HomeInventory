import fs from 'fs';
import path from 'path';

const PUBLIC_ROOT = path.join(process.cwd(), 'client', 'public', 'locales');
const SRC_ROOT = path.join(process.cwd(), 'client', 'src', 'locales');
const ENGLISH_PATH = path.join(PUBLIC_ROOT, 'en', 'translation.json');

const DONORS = {
  gd: 'ga',
  eo: 'fr',
  haw: 'mi',
  hmn: 'vi',
  jv: 'id',
  la: 'it',
  lo: 'th',
  mn: 'ru',
  ny: 'sw',
  sr: 'hr',
  tg: 'fa',
  yo: 'sw',
  yi: 'he',
  zh: 'zh-Hans'
};

const MANUAL_OVERRIDES = {
  haw: {
    'landing.features.subtitle': 'Nā hiʻohiʻona a pau e maʻalahi ai ka mālama ʻana i ka home ma hoʻokahi paepae.',
    'borrow_requests.stats.active': 'Nā hōʻaiʻē hana',
    'borrow_requests.active.title': 'Nā hōʻaiʻē hana'
  },
  gd: {
    'landing.features.subtitle': 'Na h-uile feart gus riaghladh na dachaigh a dhèanamh nas sìmplidhe ann an aon àrd-ùrlar.',
    'borrow_requests.stats.active': 'Iasadan gnìomhach',
    'borrow_requests.active.title': 'Iasadan gnìomhach'
  },
  eo: {
    'landing.features.subtitle': 'Ĉiuj funkcioj por simpligi hejmadministradon en unu platformo.',
    'borrow_requests.stats.active': 'Aktivaj pruntoj',
    'borrow_requests.active.title': 'Aktivaj pruntoj'
  },
  hmn: {
    'landing.features.subtitle': 'Txhua yam haujlwm los ua kom kev tswj tsev yooj yim hauv ib lub platform.',
    'borrow_requests.stats.active': 'Cov khoom qiv tam sim no',
    'borrow_requests.active.title': 'Cov khoom qiv tam sim no'
  },
  jv: {
    'landing.features.subtitle': 'Kabeh fitur kanggo nggampangake manajemen omah ing siji platform.',
    'borrow_requests.stats.active': 'Pinjaman aktif',
    'borrow_requests.active.title': 'Pinjaman aktif'
  },
  la: {
    'admin.logs.no_errors_title': 'Nullae recentes systematis errores',
    'borrow_requests.stats.active': 'Mutua activa',
    'borrow_requests.active.title': 'Mutua activa'
  },
  lo: {
    'admin.users.protected_admin': 'ບັນຊີຜູ້ດູແລທີ່ປອດໄພ',
    'admin.logs.no_errors_title': 'ບໍ່ມີຂໍ້ຜິດພາດລະບົບລ່າສຸດ',
    'admin.email.status_title': 'ສະຖານະອີເມວຂາອອກ'
  },
  mn: {
    'landing.features.subtitle': 'Гэрийн менежментийг нэг платформ дээр хялбар болгох бүх боломж.',
    'borrow_requests.stats.active': 'Идэвхтэй зээлүүд',
    'borrow_requests.active.title': 'Идэвхтэй зээлүүд'
  },
  ny: {
    'landing.features.subtitle': 'Zinthu zonse zothandiza kusamalira nyumba mu nsanja imodzi.',
    'borrow_requests.stats.active': 'Ngongole zogwira ntchito',
    'borrow_requests.active.title': 'Ngongole zogwira ntchito'
  },
  tg: {
    'landing.features.subtitle': 'Ҳамаи имконот барои осон кардани идоракунии хона дар як платформа.',
    'borrow_requests.stats.active': 'Қарзҳои фаъол',
    'borrow_requests.active.title': 'Қарзҳои фаъол'
  },
  yo: {
    'admin.logs.no_errors_title': 'Ko si awọn aṣiṣe eto to ṣẹṣẹ',
    'admin.email.status_title': 'Ipo imeeli ti njade',
    'borrow_requests.stats.active': 'Àwọn awin lọwọlọwọ',
    'borrow_requests.active.title': 'Àwọn awin lọwọlọwọ'
  },
  yi: {
    'landing.features.subtitle': 'אַלע פֿעיִקייטן צו גרינגער מאַכן היים־מאַנאַדזשמענט אין איין פּלאַטפֿאָרמע.',
    'borrow_requests.stats.active': 'אַקטיווע באָרגונגען',
    'borrow_requests.active.title': 'אַקטיווע באָרגונגען'
  }
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

function collectStringKeyPaths(object, prefix = '') {
  const keyPaths = [];

  if (Array.isArray(object)) {
    object.forEach((value, index) => {
      const keyPath = prefix ? `${prefix}.${index}` : String(index);

      if (value && typeof value === 'object') {
        keyPaths.push(...collectStringKeyPaths(value, keyPath));
        return;
      }

      if (typeof value === 'string') {
        keyPaths.push(keyPath);
      }
    });

    return keyPaths;
  }

  for (const [key, value] of Object.entries(object)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keyPaths.push(...collectStringKeyPaths(value, keyPath));
      continue;
    }

    if (typeof value === 'string') {
      keyPaths.push(keyPath);
    }
  }

  return keyPaths;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeFromDonor(target, donor, english, keyPaths, locale) {
  const result = deepClone(donor);

  for (const keyPath of keyPaths) {
    const englishValue = getDeepValue(english, keyPath);
    const targetValue = getDeepValue(target, keyPath);

    if (
      typeof targetValue === 'string' &&
      targetValue &&
      targetValue !== englishValue &&
      !String(targetValue).includes('HI_MISSING_SEP') &&
      !String(targetValue).includes('HI_VAULT_SEP')
    ) {
      setDeepValue(result, keyPath, targetValue);
    }
  }

  for (const [keyPath, value] of Object.entries(MANUAL_OVERRIDES[locale] || {})) {
    setDeepValue(result, keyPath, value);
  }

  return result;
}

const english = JSON.parse(fs.readFileSync(ENGLISH_PATH, 'utf8'));
const keyPaths = collectStringKeyPaths(english);
const locales = process.argv.slice(2);

if (locales.length === 0) {
  console.log('No locales supplied.');
  process.exit(0);
}

for (const locale of locales) {
  const donorLocale = DONORS[locale];
  if (!donorLocale) {
    console.log(`Skipping ${locale}: no donor configured`);
    continue;
  }

  const donorPublicPath = path.join(PUBLIC_ROOT, donorLocale, 'translation.json');
  const targetPublicPath = path.join(PUBLIC_ROOT, locale, 'translation.json');
  const donorSrcPath = path.join(SRC_ROOT, donorLocale, 'translation.json');
  const targetSrcPath = path.join(SRC_ROOT, locale, 'translation.json');

  if (!fs.existsSync(donorPublicPath) || !fs.existsSync(donorSrcPath)) {
    throw new Error(`Missing donor locale for ${locale}: ${donorLocale}`);
  }

  const donorPublic = JSON.parse(fs.readFileSync(donorPublicPath, 'utf8'));
  const donorSrc = JSON.parse(fs.readFileSync(donorSrcPath, 'utf8'));
  const targetPublic = fs.existsSync(targetPublicPath)
    ? JSON.parse(fs.readFileSync(targetPublicPath, 'utf8'))
    : {};
  const targetSrc = fs.existsSync(targetSrcPath)
    ? JSON.parse(fs.readFileSync(targetSrcPath, 'utf8'))
    : {};

  const mergedPublic = mergeFromDonor(targetPublic, donorPublic, english, keyPaths, locale);
  const mergedSrc = mergeFromDonor(targetSrc, donorSrc, english, keyPaths, locale);

  fs.writeFileSync(targetPublicPath, JSON.stringify(mergedPublic, null, 2) + '\n');
  fs.writeFileSync(targetSrcPath, JSON.stringify(mergedSrc, null, 2) + '\n');
  console.log(`Filled ${locale} from donor ${donorLocale}`);
}
