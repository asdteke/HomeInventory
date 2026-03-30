import { useTranslation } from 'react-i18next';
import { FileText, Sun, Moon, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import LegalLanguageToggle, { resolveLegalLanguage } from './LegalLanguageToggle';
import { useTheme } from '../context/ThemeContext';
import { BRAND_NAME, SUPPORT_EMAIL } from '../constants/branding';

export default function TermsOfService() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const legalLanguage = resolveLegalLanguage(i18n);
    const legalT = i18n.getFixedT(legalLanguage);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 p-4 sm:p-8">
            <button onClick={toggleTheme} className="absolute top-4 right-4 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:scale-110 transition-all shadow-sm">
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <div className="max-w-3xl mx-auto pt-8">
                <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-primary-500 font-medium transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        {t('common.cancel')}
                    </Link>
                    <LegalLanguageToggle />
                </div>

                <div className="text-center mb-10 animate-fade-in">
                    <Link to="/" className="inline-block mb-6">
                        <BrandLogo variant="full" size="md" className="mx-auto" />
                    </Link>
                    <div className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 mb-6">
                        <FileText className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                        {legalT('legal.terms_of_service_title')}
                    </h1>
                </div>
                
                <div className="card border border-slate-200/50 dark:border-slate-800/50 p-6 sm:p-10 animate-slide-up">
                    <div className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">
                        {legalT('legal.terms_of_service_content', {
                            brandName: BRAND_NAME,
                            supportEmail: SUPPORT_EMAIL
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
