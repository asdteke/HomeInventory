import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { i18n as I18nInstance } from 'i18next';

function normalizeLegalLanguage(value: string | undefined): 'tr' | 'en' | '' {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'tr' || normalized === 'en' ? normalized : '';
}

const BRAND_LEGAL_LANGUAGE = normalizeLegalLanguage(import.meta.env.VITE_BRAND_LEGAL_LANGUAGE as string | undefined);

export function resolveLegalLanguage(i18n: I18nInstance): 'en' | 'tr' {
    return (i18n.resolvedLanguage || '').toLowerCase().startsWith('en') ? 'en' : 'tr';
}

export function resolveBrandLegalLanguage(i18n: I18nInstance): 'en' | 'tr' {
    return BRAND_LEGAL_LANGUAGE || resolveLegalLanguage(i18n);
}

const OPTIONS = [
    { code: 'tr' as const, label: 'Türkçe' },
    { code: 'en' as const, label: 'English' }
];

interface LegalLanguageToggleProps {
    className?: string;
}

export default function LegalLanguageToggle({ className = '' }: LegalLanguageToggleProps) {
    const { i18n } = useTranslation();
    const { isDark } = useTheme();
    const activeLanguage = resolveLegalLanguage(i18n);

    return (
        <div className={`inline-flex items-center rounded-full border p-1 shadow-sm backdrop-blur-xl ${isDark ? 'border-white/10 bg-white/4' : 'border-[var(--hi-border)] bg-[var(--hi-panel)]'} ${className}`.trim()}>
            {OPTIONS.map((option) => (
                <button
                    key={option.code}
                    type="button"
                    onClick={() => i18n.changeLanguage(option.code)}
                    aria-label={option.label}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeLanguage === option.code
                            ? 'bg-[var(--hi-accent)] text-white shadow-[var(--hi-shadow-soft)]'
                            : isDark ? 'text-white/56 hover:text-white' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
