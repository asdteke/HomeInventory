import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const FALLBACK_STRINGS = {
    'controller_host_fallback': 'the operator of VAR0',
    'controller_fallback': 'the operator of this installation',
    'address_fallback': 'Not configured by the operator of this installation',
    'transfer_disclosure_fallback': 'Transfers may occur to the hosting, email, and optional providers used by this installation. The operator must specify the relevant destination countries.',
    'complaint_authority_fallback': 'The competent data protection authority in your country; for Turkey, the Personal Data Protection Authority (KVKK).'
};

// Turkish manual overrides
const TR_STRINGS = {
    'controller_host_fallback': '{{host}} kurulumunun işletmecisi',
    'controller_fallback': 'bu kurulumun işletmecisi',
    'address_fallback': 'İşletmeci tarafından yapılandırılmadı',
    'transfer_disclosure_fallback': 'Bu kurulumda kullanılan barındırma, e-posta ve isteğe bağlı sağlayıcılara veri aktarımı olabilir.',
    'complaint_authority_fallback': 'Yetkili veri koruma otoritesi; Türkiye için Kişisel Verileri Koruma Kurumu (KVKK).'
};

const TARGET_LANGS = fs.readdirSync(PUBLIC_LOCALES_DIR).filter(f => fs.lstatSync(path.join(PUBLIC_LOCALES_DIR, f)).isDirectory());

async function translateChunk(text, targetLang) {
    if (!text.trim()) return text;
    if (targetLang === 'en') return text;

    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(item => item[0]).join('');
    } catch (e) {
        console.error(`Error translating to ${targetLang}:`, e.message);
        return text;
    }
}

async function main() {
    let count = 0;
    for (const lang of TARGET_LANGS) {
        if (lang === 'en') continue;

        let gLang = lang;
        if (gLang === 'sr-Cyrl') gLang = 'sr';
        if (gLang === 'zh-Hans') gLang = 'zh-CN';
        if (gLang === 'zh-Hant') gLang = 'zh-TW';

        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Skip if already translated (or if we already added keys)
        if (content.legal?.address_fallback) {
            continue;
        }

        console.log(`Translating fallbacks for ${lang}...`);
        
        if (!content.legal) content.legal = {};

        if (lang === 'tr') {
            content.legal.controller_host_fallback = TR_STRINGS.controller_host_fallback;
            content.legal.controller_fallback = TR_STRINGS.controller_fallback;
            content.legal.address_fallback = TR_STRINGS.address_fallback;
            content.legal.transfer_disclosure_fallback = TR_STRINGS.transfer_disclosure_fallback;
            content.legal.complaint_authority_fallback = TR_STRINGS.complaint_authority_fallback;
        } else {
            for (const [key, text] of Object.entries(FALLBACK_STRINGS)) {
                let translated = await translateChunk(text, gLang);
                if (key === 'controller_host_fallback') {
                    // Google Translate might add spaces around the variable
                    const regex = new RegExp(`\\s*VAR0\\s*`, 'g');
                    translated = translated.replace(regex, '{{host}}');
                    // Also replace it directly just in case
                    translated = translated.replace('VAR0', '{{host}}');
                }
                content.legal[key] = translated;
            }
        }

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`  - [OK] ${lang} translated.`);
        count++;
        
        if (lang !== 'tr') {
            await new Promise(r => setTimeout(r, 1000)); // Sleep 1s to avoid rate limit
        }
    }
    console.log(`Total processed: ${count}`);
}

main();
