import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { resolveBrandLegalLanguage } from './LegalLanguageToggle';

export default function CookieBanner() {
    const { i18n } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);
    const legalLanguage = resolveBrandLegalLanguage(i18n);
    const legalT = i18n.getFixedT(legalLanguage);

    useEffect(() => {
        const dismissed = localStorage.getItem('cookie_notice_dismissed');
        const legacyConsent = localStorage.getItem('cookie_consent');
        if (!dismissed && !legacyConsent) {
            setIsVisible(true);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookie_notice_dismissed', 'true');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up pointer-events-none">
            <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 pointer-events-auto relative">
                <div className="hidden sm:flex flex-shrink-0 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-xl">
                    <Info className="w-6 h-6 text-blue-500" />
                </div>
                
                <div className="flex-1 text-sm text-center sm:text-left text-slate-700 dark:text-slate-300 pr-4 sm:pr-0">
                    <span className="sm:hidden inline-block mr-2">📌</span>
                    {legalT('cookies.banner_text')}
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                    <Link 
                        to="/privacy-policy" 
                        target="_blank"
                        className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium px-2"
                    >
                        {legalT('cookies.learn_more')}
                    </Link>
                    <button 
                        onClick={handleAccept}
                        className="btn-primary py-2 px-6 w-full sm:w-auto"
                    >
                        {legalT('cookies.accept')}
                    </button>
                    <button 
                        onClick={handleAccept}
                        className="sm:hidden p-2 text-slate-400 hover:text-slate-600 rounded-lg absolute top-2 right-2"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
