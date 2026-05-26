import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, FileCheck2, Moon, ScrollText, Shield, Sun } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';
import { PremiumCheckbox } from './PremiumCheckbox';

const LEGAL_CONSENT_KEYS = [
    'legal.consent_title',
    'legal.consent_subtitle',
    'legal.consent_notice',
    'legal.consent_checkbox',
    'legal.consent_submit',
    'legal.consent_submitting',
    'legal.consent_required',
    'legal.terms_of_service_title',
    'legal.privacy_policy_title'
];

export default function LegalConsent() {
    const { t, i18n } = useTranslation();
    const { refreshUser, markLegalAccepted, membershipState } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [accepted, setAccepted] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const legalLanguage = resolveVerifiedLegalTranslationLanguage(i18n, LEGAL_CONSENT_KEYS);
    const legalT = i18n.getFixedT(legalLanguage);

    const pageClass = 'bg-[var(--hi-bg)] text-[var(--hi-text)]';
    const pageGlow = isDark
        ? 'radial-gradient(circle_at_30%_20%,rgba(103,227,242,0.14),transparent_38%),radial-gradient(circle_at_70%_80%,rgba(139,180,255,0.14),transparent_40%)'
        : 'radial-gradient(circle_at_24%_18%,rgba(18,158,154,0.14),transparent_30%),radial-gradient(circle_at_78%_82%,rgba(15,79,153,0.1),transparent_34%)';
    const topChromeClass = 'border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const cardClass = 'border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-lift)]';
    const softPanelClass = 'border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]';
    const hoverPanelClass = 'hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel)]';

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (loading) return;

        if (!accepted) {
            setError(legalT('legal.consent_required'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            await axios.post('/api/auth/legal-acceptance', {
                acceptedTerms: true,
                acknowledgedPrivacyNotice: true
            });
            markLegalAccepted();

            try {
                await refreshUser();
            } catch (refreshError: any) {
                if (refreshError?.response?.status !== 429) {
                    throw refreshError;
                }
            }

            if (membershipState === 'active') {
                navigate('/');
                return;
            }

            if (membershipState === 'pending_approval') {
                navigate('/house-access');
                return;
            }

            navigate('/google-house-select');
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || requestError.message || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 sm:py-10 ${pageClass}`}>
            <div className="absolute inset-0" style={{ background: pageGlow }} />

            <div className="relative z-10 w-full max-w-2xl">
                <div className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:items-center">
                    <Link to="/" className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]">
                        <BrandLogo variant="full" size="md" className="h-auto max-h-10 w-auto sm:max-h-11" />
                    </Link>

                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <div className="w-[140px] sm:w-[164px]">
                            <LanguageSwitcher className={`!h-10 !rounded-full !px-3 !py-0 sm:!h-11 sm:!px-4 ${isDark ? '!border-white/10 !bg-white/4 !text-white/88 hover:!bg-white/8' : '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)]'}`} />
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition sm:h-11 sm:w-11 ${topChromeClass}`}
                            title={isDark ? t('common.theme.light') : t('common.theme.dark')}
                            aria-label={isDark ? t('common.theme.light') : t('common.theme.dark')}
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] shadow-[0_16px_36px_rgba(15,79,153,0.22)]">
                        <FileCheck2 className="h-8 w-8 text-white" />
                    </div>
                    <h1 className={`text-3xl font-semibold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                        {legalT('legal.consent_title')}
                    </h1>
                    <p className={`mx-auto mt-2 max-w-xl text-lg ${isDark ? 'text-white/55' : 'text-[var(--hi-text-soft)]'}`}>
                        {legalT('legal.consent_subtitle')}
                    </p>
                </div>

                <div className={`overflow-hidden rounded-[2rem] backdrop-blur-xl ${cardClass}`}>
                    <div className="p-8">
                        <div className={`rounded-[1.35rem] px-5 py-4 text-sm leading-7 ${softPanelClass}`}>
                            {legalT('legal.consent_notice')}
                        </div>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <Link
                                to="/terms-of-service"
                                target="_blank"
                                className={`rounded-[1.35rem] p-5 transition ${softPanelClass} ${hoverPanelClass}`}
                            >
                                <div className="flex items-start gap-4">
                                    <span className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                        <ScrollText className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                            {legalT('legal.consent_doc01_label')}
                                        </p>
                                        <h2 className={`mt-2 text-lg font-semibold ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                            {legalT('legal.terms_of_service_title')}
                                        </h2>
                                        <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-white/58' : 'text-[var(--hi-text-soft)]'}`}>
                                            {legalT('legal.consent_doc01_desc')}
                                        </p>
                                    </div>
                                </div>
                            </Link>

                            <Link
                                to="/privacy-policy"
                                target="_blank"
                                className={`rounded-[1.35rem] p-5 transition ${softPanelClass} ${hoverPanelClass}`}
                            >
                                <div className="flex items-start gap-4">
                                    <span className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                        <Shield className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                            {legalT('legal.consent_doc02_label')}
                                        </p>
                                        <h2 className={`mt-2 text-lg font-semibold ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                            {legalT('legal.privacy_policy_title')}
                                        </h2>
                                        <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-white/58' : 'text-[var(--hi-text-soft)]'}`}>
                                            {legalT('legal.consent_doc02_desc')}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            {error && (
                                <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <label className={`app-premium-checkbox-container flex items-start gap-3 rounded-[1.35rem] px-5 py-4 transition ${softPanelClass} ${hoverPanelClass} hover:border-[var(--hi-border-strong)]`}>
                                <PremiumCheckbox
                                    checked={accepted}
                                    onChange={(event) => setAccepted(event.target.checked)}
                                />
                                <span className={`text-sm leading-7 ${isDark ? 'text-white/78' : 'text-[var(--hi-text-soft)]'}`}>
                                    {legalT('legal.consent_checkbox')}
                                </span>
                            </label>

                            <button type="submit" disabled={loading} className="inline-flex h-14 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] px-5 text-lg font-semibold text-white shadow-[0_16px_34px_rgba(15,79,153,0.2)] transition hover:shadow-[0_18px_38px_rgba(18,158,154,0.24)] disabled:opacity-60">
                                {loading ? legalT('legal.consent_submitting') : legalT('legal.consent_submit')}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
