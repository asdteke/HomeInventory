import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';

const COOKIE_NOTICE_KEYS = [
    'cookies.banner_text',
    'cookies.accept',
    'cookies.learn_more'
];

export default function CookieBanner() {
    const { i18n } = useTranslation();
    const location = useLocation();
    const [isVisible, setIsVisible] = useState(false);
    const legalLanguage = resolveVerifiedLegalTranslationLanguage(i18n, COOKIE_NOTICE_KEYS);
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

    if (!isVisible || location.pathname === '/legal-consent') return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up pointer-events-none">
            <div className="pointer-events-auto relative mx-auto flex max-w-6xl flex-col gap-4 rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                <div className="hidden h-16 w-16 flex-shrink-0 items-center justify-center rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] sm:flex">
                    <Info className="h-7 w-7 text-[var(--hi-accent)]" />
                </div>

                <div className="min-w-0 flex-1 pr-10 text-center text-sm leading-relaxed text-[var(--hi-text-soft)] sm:pr-0 sm:text-left">
                    <span className="mr-2 inline-block align-middle sm:hidden">
                        <Info className="inline h-4 w-4 text-[var(--hi-accent)]" />
                    </span>
                    {legalT('cookies.banner_text')}
                </div>

                <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    <Link
                        to="/privacy-policy"
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-medium text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                    >
                        {legalT('cookies.learn_more')}
                    </Link>
                    <button
                        onClick={handleAccept}
                        className="btn-primary min-w-[160px] py-2.5"
                    >
                        {legalT('cookies.accept')}
                    </button>
                    <button
                        onClick={handleAccept}
                        className="absolute right-3 top-3 rounded-xl p-2 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] sm:hidden"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
