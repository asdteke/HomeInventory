import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertCircle, FileCheck2, Moon, ScrollText, Shield, Sun } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';
import { PremiumCheckbox } from './PremiumCheckbox';
import '../auth-onboarding-v25.css';

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
        <div className="auth-flow-page-v25">
            <main className="auth-flow-shell-v25 is-wide flex min-h-[100svh] flex-col justify-center">
                <div className="auth-flow-topbar-v25">
                    <Link to="/" className="auth-flow-brand-v25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]">
                        <BrandLogo variant="full" size="md" />
                    </Link>
                    <div className="auth-flow-tools-v25">
                        <div className="auth-flow-language-v25">
                            <LanguageSwitcher
                                showTooltip={false}
                                showCodeBadge={false}
                                className="!h-[2.65rem] !rounded-full !border-[var(--hi-border)] !bg-[var(--hi-panel-muted)] !px-3 !py-0 !text-[var(--hi-text)] max-[430px]:!h-[2.45rem]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="auth-flow-tool-v25"
                            title={isDark ? t('common.theme.light') : t('common.theme.dark')}
                            aria-label={isDark ? t('common.theme.light') : t('common.theme.dark')}
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                <section className="auth-flow-card-v25" aria-labelledby="legal-consent-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25"><FileCheck2 className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{legalT('legal.consent_doc01_label')}</p>
                            <h1 id="legal-consent-title" className="auth-flow-title-v25">{legalT('legal.consent_title')}</h1>
                            <p className="auth-flow-subtitle-v25">{legalT('legal.consent_subtitle')}</p>
                        </header>

                        <div className="auth-flow-notice-v25">
                            {legalT('legal.consent_notice')}
                        </div>

                        <div className="auth-flow-document-list-v25">
                            <Link
                                to="/terms-of-service"
                                target="_blank"
                                rel="noreferrer"
                                className="auth-flow-document-v25"
                            >
                                <span className="auth-flow-document-icon-v25"><ScrollText className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                    <strong>{legalT('legal.terms_of_service_title')}</strong>
                                    <small>{legalT('legal.consent_doc01_desc')}</small>
                                </div>
                            </Link>

                            <Link
                                to="/privacy-policy"
                                target="_blank"
                                rel="noreferrer"
                                className="auth-flow-document-v25"
                            >
                                <span className="auth-flow-document-icon-v25"><Shield className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                    <strong>{legalT('legal.privacy_policy_title')}</strong>
                                    <small>{legalT('legal.consent_doc02_desc')}</small>
                                </div>
                            </Link>
                        </div>

                        <form onSubmit={handleSubmit} className="auth-flow-form-v25">
                            {error && (
                                <div className="auth-flow-feedback-v25 is-error" role="alert">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <label className="auth-flow-consent-v25 app-premium-checkbox-container">
                                <PremiumCheckbox
                                    checked={accepted}
                                    onChange={(event) => setAccepted(event.target.checked)}
                                />
                                <span>{legalT('legal.consent_checkbox')}</span>
                            </label>

                            <button type="submit" disabled={loading} className="auth-flow-primary-v25 w-full">
                                {loading ? legalT('legal.consent_submitting') : legalT('legal.consent_submit')}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </div>
    );
}
