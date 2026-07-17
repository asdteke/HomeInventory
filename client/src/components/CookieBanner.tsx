import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';
import '../admin-overlays-v25.css';

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
        <div className="cookie-banner-v25 pointer-events-none fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4">
            <section
                className="cookie-banner-v25-frame pointer-events-auto relative mx-auto flex max-w-6xl flex-col gap-4 rounded-[2rem] p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
                aria-label={legalT('cookies.banner_text')}
            >
                <div className="cookie-banner-v25-icon hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-[1.15rem] sm:flex">
                    <Info className="h-7 w-7 text-[var(--hi-accent)]" />
                </div>

                <div className="min-w-0 flex-1 pr-9 text-left text-sm leading-6 text-[var(--hi-text-soft)] sm:pr-0">
                    <span className="mr-2 inline-block align-middle sm:hidden">
                        <Info className="inline h-4 w-4 text-[var(--hi-accent)]" />
                    </span>
                    {legalT('cookies.banner_text')}
                </div>

                <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    <Link
                        to="/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cookie-banner-v25-link inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[var(--hi-text-soft)] transition hover:text-[var(--hi-text)]"
                    >
                        {legalT('cookies.learn_more')}
                    </Link>
                    <button
                        type="button"
                        onClick={handleAccept}
                        className="btn-primary min-h-11 min-w-[160px] py-2.5"
                    >
                        {legalT('cookies.accept')}
                    </button>
                    <button
                        type="button"
                        onClick={handleAccept}
                        className="cookie-banner-v25-close absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--hi-text-soft)] transition hover:text-[var(--hi-text)] sm:hidden"
                        aria-label={i18n.t('common.close', { defaultValue: 'Close' })}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </section>
        </div>
    );
}
