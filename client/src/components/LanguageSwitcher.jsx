import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Search, X, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export const LANGUAGE_OPTIONS = [
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
    { code: 'km', label: 'ខ្មែਰ' },
    { code: 'ko', label: '한국어' },
    { code: 'ku', label: 'Kurdî' },
    { code: 'lo', label: 'ລາວ' },
    { code: 'lv', label: 'Latviešu' },
    { code: 'lt', label: 'Lietuvių' },
    { code: 'mk', label: 'Македонски' },
    { code: 'ms', label: 'Melayu' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'mt', label: 'Malti' },
    { code: 'mr', label: 'मраठी' },
    { code: 'ne', label: 'नेपाली' },
    { code: 'no', label: 'Norsk' },
    { code: 'fa', label: 'فارسی' },
    { code: 'pl', label: 'Polski' },
    { code: 'ro', label: 'Română' },
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
    { code: 'th', label: 'ไทย' },
    { code: 'uk', label: 'Українська' },
    { code: 'ur', label: 'اردو' },
    { code: 'uz', label: 'Oʻzbekcha' },
    { code: 'vi', label: 'Tiếng Việt' },
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

function resolveLanguageCode(lang) {
    if (!lang) return 'tr';

    const exactMatch = LANGUAGE_OPTIONS.find(
        (option) => option.code.toLowerCase() === lang.toLowerCase()
    );

    if (exactMatch) {
        return exactMatch.code;
    }

    const baseCode = lang.split('-')[0].toLowerCase();
    const baseMatch = LANGUAGE_OPTIONS.find(
        (option) => option.code.toLowerCase() === baseCode
    );

    return baseMatch?.code || 'tr';
}

export default function LanguageSwitcher({ className = '', variant = 'default', showLabel = true }) {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const modalRef = useRef(null);

    const currentLangCode = resolveLanguageCode(i18n.resolvedLanguage || i18n.language);
    const currentLang = useMemo(() =>
        LANGUAGE_OPTIONS.find(l => l.code === currentLangCode) || LANGUAGE_OPTIONS[0]
    , [currentLangCode]);

    const filteredLanguages = useMemo(() => {
        if (!searchQuery) return LANGUAGE_OPTIONS;
        const q = searchQuery.toLowerCase();
        return LANGUAGE_OPTIONS.filter(l =>
            l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    // Handle click outside to close
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e) => {
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen]);

    const handleSelect = (code) => {
        i18n.changeLanguage(code);
        setIsOpen(false);
        setSearchQuery('');
    };

    const isMinimal = variant === 'minimal';

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 w-full
                    ${isMinimal
                        ? 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        : 'text-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }
                    ${className}
                `}
                title={t('settings.select_language')}
            >
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                    <Globe className={`w-5 h-5 flex-shrink-0 ${isMinimal ? 'text-slate-500' : 'text-cyan-500'}`} />
                    {showLabel && <span className="text-left font-medium truncate">{currentLang.label}</span>}
                </div>
                {showLabel && (
                    <span className="px-1.5 h-5 min-w-[20px] rounded-md flex items-center justify-center text-[8px] font-bold uppercase bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        {currentLangCode}
                    </span>
                )}
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="flex min-h-full items-start justify-center p-4 pt-20 pb-6">
                        <div
                            ref={modalRef}
                            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-7rem)]"
                        >
                            {/* Header */}
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-cyan-500" />
                                    {t('settings.select_language')}
                                </h3>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Search */}
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder={t('common.search')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800/50 border-none rounded-xl text-sm outline-none focus:ring-2 ring-cyan-500/50 text-slate-900 dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            {/* Language List */}
                            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    {filteredLanguages.map((lang) => (
                                        <button
                                            key={lang.code}
                                            onClick={() => handleSelect(lang.code)}
                                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all group ${
                                                currentLangCode === lang.code
                                                    ? 'bg-cyan-500 text-white font-semibold shadow-lg shadow-cyan-500/20'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`px-1.5 h-6 min-w-[24px] rounded-md flex items-center justify-center text-[9px] font-bold uppercase transition-colors ${
                                                    currentLangCode === lang.code ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'
                                                }`}>
                                                    {lang.code}
                                                </span>
                                                {lang.label}
                                            </div>
                                            {currentLangCode === lang.code && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                                {filteredLanguages.length === 0 && (
                                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                                        {t('dashboard.filters.no_items')}
                                    </div>
                                )}
                            </div>

                            {/* Footer info */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/30 text-[10px] text-center text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800">
                                {LANGUAGE_OPTIONS.length} {t('settings.select_language').toLowerCase()} available
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
