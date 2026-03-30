import { useTranslation } from 'react-i18next';

function normalizeLegalLanguage(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'tr' || normalized === 'en' ? normalized : '';
}

const BRAND_LEGAL_LANGUAGE = normalizeLegalLanguage(import.meta.env.VITE_BRAND_LEGAL_LANGUAGE);

export function resolveLegalLanguage(i18n) {
    return i18n.resolvedLanguage?.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

export function resolveBrandLegalLanguage(i18n) {
    return BRAND_LEGAL_LANGUAGE || resolveLegalLanguage(i18n);
}

const OPTIONS = [
    { code: 'tr', label: 'TR' },
    { code: 'en', label: 'EN' }
];

export default function LegalLanguageToggle({ className = '' }) {
    const { i18n } = useTranslation();
    const activeLanguage = resolveLegalLanguage(i18n);

    return (
        <div className={`inline-flex items-center rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 ${className}`.trim()}>
            {OPTIONS.map((option) => (
                <button
                    key={option.code}
                    type="button"
                    onClick={() => i18n.changeLanguage(option.code)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeLanguage === option.code
                            ? 'bg-primary-500 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
