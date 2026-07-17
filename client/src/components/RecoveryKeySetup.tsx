import * as React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Loader2, AlertCircle, KeyRound, Moon, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import RecoveryKeyModal from './RecoveryKeyModal';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import '../auth-onboarding-v25.css';

export default function RecoveryKeySetup() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');

    const handleSetup = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await axios.post('/api/auth/recovery-key/setup');
            setRecoveryKey(response.data.recoveryKey);
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        await refreshUser();
        navigate('/');
    };

    return (
        <div className="auth-flow-page-v25">
            <main className="auth-flow-shell-v25 flex min-h-[100svh] flex-col justify-center">
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

                <section className="auth-flow-card-v25" aria-labelledby="recovery-setup-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25"><KeyRound className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{t('auth.recovery_key_modal.badge')}</p>
                            <h1 id="recovery-setup-title" className="auth-flow-title-v25">{t('auth.recovery_setup.title')}</h1>
                            <p className="auth-flow-subtitle-v25">{t('auth.recovery_setup.subtitle')}</p>
                        </header>

                        <div className="auth-flow-notice-v25 is-warning">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--hi-warning)]" />
                                <p>{t('auth.recovery_setup.warning')}</p>
                            </div>
                        </div>

                        <div className="auth-flow-account-line-v25 mt-5">
                            <span className="inline-flex min-w-0 items-start gap-2">
                                <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{t('auth.recovery_setup.account', { username: user?.username || '-' })}</span>
                            </span>
                        </div>
                        <p className="auth-flow-subtitle-v25 !mt-4 !text-sm">{t('auth.recovery_setup.description')}</p>

                        {error && (
                            <div className="auth-flow-feedback-v25 is-error mt-5" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleSetup}
                            disabled={loading}
                            className="auth-flow-primary-v25 mt-6 w-full"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                            {loading ? t('auth.recovery_setup.generating') : t('auth.recovery_setup.submit')}
                        </button>
                    </div>
                </section>
            </main>

            {recoveryKey && (
                <RecoveryKeyModal
                    recoveryKey={recoveryKey}
                    title={t('auth.recovery_key_modal.setup_title')}
                    subtitle={t('auth.recovery_key_modal.subtitle')}
                    warning={t('auth.recovery_key_modal.warning')}
                    confirmLabel={t('auth.recovery_key_modal.confirm')}
                    onConfirm={handleConfirm}
                />
            )}
        </div>
    );
}
