import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGE_OPTIONS = [
    { code: 'tr', label: 'Türkçe' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ar', label: 'العربية' }
];

function normalizeLanguageCode(lang) {
    if (!lang) return 'tr';
    return lang.split('-')[0].toLowerCase();
}

export default function LanguageSwitcher({ className = '' }) {
    const { i18n, t } = useTranslation();
    const currentLang = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language);

    return (
        <label
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 ${className}`}
            title={t('settings.select_language')}
        >
            <Globe className="w-5 h-5" />
            <select
                value={currentLang}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="bg-transparent outline-none cursor-pointer min-w-[96px]"
                aria-label={t('settings.select_language')}
            >
                {LANGUAGE_OPTIONS.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
