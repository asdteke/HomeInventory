import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { AlertCircle, FileCheck2, Moon, Sun } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LegalLanguageToggle, { resolveLegalLanguage } from './LegalLanguageToggle';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LegalConsent() {
    const { t, i18n } = useTranslation();
    const { refreshUser, membershipState } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [accepted, setAccepted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const legalLanguage = resolveLegalLanguage(i18n);
    const legalT = i18n.getFixedT(legalLanguage);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!accepted) {
            setError(t('legal.consent_required'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            await axios.post('/api/auth/legal-acceptance', {
                acceptedTerms: true,
                acknowledgedPrivacyNotice: true
            });
            await refreshUser();

            if (membershipState === 'active') {
                navigate('/');
                return;
            }

            if (membershipState === 'pending_approval') {
                navigate('/house-access');
                return;
            }

            navigate('/google-house-select');
        } catch (requestError) {
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 transition-colors duration-300 dark:bg-slate-950">
            <button onClick={toggleTheme} className="absolute right-4 top-4 rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition-all hover:scale-110 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col justify-center">
                <div className="mb-8 text-center animate-fade-in">
                    <Link to="/">
                        <BrandLogo variant="full" size="md" className="mx-auto mb-5 w-auto max-h-[76px]" />
                    </Link>
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
                        <FileCheck2 className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="mb-2 text-3xl font-bold text-slate-900 dark:text-white">
                        {t('legal.consent_title')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        {t('legal.consent_subtitle')}
                    </p>
                    <LegalLanguageToggle className="mt-4" />
                </div>

                <div className="card animate-slide-up">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                        {t('legal.consent_notice')}
                    </div>

                    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                        {error && (
                            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                            <Trans
                                t={legalT}
                                i18nKey="legal.register_consent"
                                components={{
                                    1: <Link to="/terms-of-service" target="_blank" className="font-medium text-primary-500 underline hover:no-underline" />,
                                    2: <Link to="/privacy-policy" target="_blank" className="font-medium text-primary-500 underline hover:no-underline" />
                                }}
                            />
                        </div>

                        <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-500/50">
                            <input
                                type="checkbox"
                                checked={accepted}
                                onChange={(event) => setAccepted(event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                            />
                            <span className="text-sm text-slate-600 dark:text-slate-300">
                                {t('legal.consent_checkbox')}
                            </span>
                        </label>

                        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-lg disabled:opacity-50">
                            {loading ? t('legal.consent_submitting') : t('legal.consent_submit')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
