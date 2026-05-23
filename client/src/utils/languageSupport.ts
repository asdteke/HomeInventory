export interface LanguageOption {
    code: string;
    label: string;
}

export const PRODUCT_LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'tr', label: 'Türkçe' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ar', label: 'العربية' },
    { code: 'fr', label: 'Français' },
    { code: 'ru', label: 'Русский' },
    { code: 'pt', label: 'Português' },
    { code: 'it', label: 'Italiano' },
    { code: 'ja', label: '日本語' },
    { code: 'af', label: 'Afrikaans' },
    { code: 'sq', label: 'Shqip' },
    { code: 'am', label: 'አማርኛ' },
    { code: 'hy', label: 'Հայերեն' },
    { code: 'az', label: 'Azərbaycan' },
    { code: 'bn', label: 'বাংলা' },
    { code: 'bs', label: 'Bosanski' },
    { code: 'bg', label: 'Български' },
    { code: 'my', label: 'မြန်မာ' },
    { code: 'ca', label: 'Català' },
    { code: 'zh', label: '中文' },
    { code: 'zh-Hans', label: '简体中文' },
    { code: 'zh-Hant', label: '繁體中文' },
    { code: 'hr', label: 'Hrvatski' },
    { code: 'cs', label: 'Čeština' },
    { code: 'da', label: 'Dansk' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'et', label: 'Eesti' },
    { code: 'fi', label: 'Suomi' },
    { code: 'ka', label: 'ქართული' },
    { code: 'el', label: 'Ελληνικά' },
    { code: 'gu', label: 'ગુજરાતી' },
    { code: 'ht', label: 'Kreyòl' },
    { code: 'he', label: 'עברית' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'hu', label: 'Magyar' },
    { code: 'is', label: 'Íslenska' },
    { code: 'id', label: 'Indonesia' },
    { code: 'ga', label: 'Gaeilge' },
    { code: 'kk', label: 'Қазақ' },
    { code: 'km', label: 'ខ្មែរ' },
    { code: 'ko', label: '한국어' },
    { code: 'ku', label: 'Kurdî' },
    { code: 'lo', label: 'ລາວ' },
    { code: 'lv', label: 'Latviešu' },
    { code: 'lt', label: 'Lietuvių' },
    { code: 'mk', label: 'Македонски' },
    { code: 'ms', label: 'Melayu' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'mt', label: 'Malti' },
    { code: 'mr', label: 'मराठी' },
    { code: 'ne', label: 'नेपाली' },
    { code: 'no', label: 'Norsk' },
    { code: 'fa', label: 'فارسی' },
    { code: 'pl', label: 'Polski' },
    { code: 'ro', label: 'Română' },
    { code: 'sr', label: 'Srpski' },
    { code: 'sr-Cyrl', label: 'Српски' },
    { code: 'sk', label: 'Slovenčina' },
    { code: 'sl', label: 'Slovenščina' },
    { code: 'sw', label: 'Kiswahili' },
    { code: 'sv', label: 'Svenska' },
    { code: 'be', label: 'Беларуская' },
    { code: 'cy', label: 'Cymraeg' },
    { code: 'eo', label: 'Esperanto' },
    { code: 'eu', label: 'Euskara' },
    { code: 'gl', label: 'Galego' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'ky', label: 'Кыргызча' },
    { code: 'lb', label: 'Lëtzebuergesch' },
    { code: 'mi', label: 'Māori' },
    { code: 'mn', label: 'Монгол' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ' },
    { code: 'si', label: 'සිංහල' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'te', label: 'తెలుగు' },
    { code: 'tg', label: 'Тоҷикӣ' },
    { code: 'th', label: 'ไทย' },
    { code: 'uk', label: 'Українська' },
    { code: 'ur', label: 'اردو' },
    { code: 'uz', label: 'Oʻzbekcha' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'yi', label: 'ייִديש' },
    { code: 'yo', label: 'Yoruba' },
    { code: 'zu', label: 'isiZulu' },
    { code: 'so', label: 'Soomaali' },
    { code: 'sn', label: 'chiShona' },
    { code: 'sd', label: 'سنڌي' },
    { code: 'ps', label: 'پښتو' },
    { code: 'or', label: 'ଓଡ଼ିଆ' },
    { code: 'mg', label: 'Malagasy' },
    { code: 'la', label: 'Latina' },
    { code: 'jv', label: 'Basa Jawa' },
    { code: 'ig', label: 'Asụsụ Igbo' },
    { code: 'hmn', label: 'Hmong' },
    { code: 'haw', label: 'Ōlelo Hawaiʻi' },
    { code: 'gd', label: 'Gàidhlig' },
    { code: 'fy', label: 'Frysk' },
    { code: 'ceb', label: 'Cebuano' },
    { code: 'ny', label: 'Chichewa' },
    { code: 'co', label: 'Corsu' },
    { code: 'fil', label: 'Filipino' },
    { code: 'st', label: 'Sesotho' }
];

export const SUPPORTED_PRODUCT_LANGUAGE_CODES: string[] = PRODUCT_LANGUAGE_OPTIONS.map((option) => option.code);

export function resolveSupportedLanguageCode(lang: string | null | undefined, fallbackCode = 'en'): string {
    if (!lang) {
        return fallbackCode;
    }

    const normalizedFallback = SUPPORTED_PRODUCT_LANGUAGE_CODES.includes(fallbackCode)
        ? fallbackCode
        : 'en';

    const rawCode = String(lang);
    const exactMatch = PRODUCT_LANGUAGE_OPTIONS.find(
        (option) => option.code.toLowerCase() === rawCode.toLowerCase()
    );

    if (exactMatch) {
        return exactMatch.code;
    }

    const baseCode = rawCode.split('-')[0].toLowerCase();
    const baseMatch = PRODUCT_LANGUAGE_OPTIONS.find(
        (option) => option.code.toLowerCase() === baseCode
    );

    return baseMatch?.code || normalizedFallback;
}
