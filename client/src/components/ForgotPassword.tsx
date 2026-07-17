import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, AlertCircle, Loader2, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import RecoveryKeyModal from './RecoveryKeyModal';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';
import '../auth-onboarding-v25.css';

export default function ForgotPassword() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mode, setMode] = useState<'recovery_key' | 'email' | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [requestLoading, setRequestLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState('');

    const isTurkish = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('tr');

    const handleRequestReset = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setMessage('');

        if (!identifier.trim()) {
            setError(t('auth.forgot_password.identifier_required', { defaultValue: 'Kullanıcı adı veya e-posta girin' }));
            return;
        }

        setRequestLoading(true);

        try {
            const response = await axios.post('/api/auth/forgot-password', { identifier });
            setMode(response.data.mode);
            setMessage(response.data.message);
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || requestError.message || t('common.error'));
        } finally {
            setRequestLoading(false);
        }
    };

    const handleRecoveryReset = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');

        if (!identifier.trim() || !recoveryKey.trim() || !newPassword || !confirmPassword) {
            setError(t('auth.fill_all_fields', { defaultValue: 'Tüm alanları doldurun' }));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t('auth.register.passwords_mismatch'));
            return;
        }

        const passwordValidation = validatePasswordStrengthClient(newPassword, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error || '');
            return;
        }

        setResetLoading(true);

        try {
            const response = await axios.post('/api/auth/reset-password', {
                identifier,
                recoveryKey,
                newPassword,
                confirmPassword
            });

            setMessage(response.data.message);
            setRotatedRecoveryKey(response.data.newRecoveryKey || '');
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || requestError.message || t('common.error'));
        } finally {
            setResetLoading(false);
        }
    };

    const recoveryModeActive = mode === 'recovery_key';
    const emailModeActive = mode === 'email';

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

                <section className="auth-flow-card-v25" aria-labelledby="forgot-password-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25">
                                {recoveryModeActive ? <KeyRound className="h-6 w-6" /> : emailModeActive ? <Mail className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                            </span>
                            <p className="auth-flow-kicker-v25">{isTurkish ? 'Güvenli hesap kurtarma' : 'Secure account recovery'}</p>
                            <h1 id="forgot-password-title" className="auth-flow-title-v25">{t('auth.forgot_password.title')}</h1>
                            <p className="auth-flow-subtitle-v25">{t('auth.forgot_password.subtitle')}</p>
                        </header>

                        {error && (
                            <div className="auth-flow-feedback-v25 is-error" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        {message && (
                            <div className="auth-flow-feedback-v25 is-success" role="status">
                                <ShieldCheck className="h-4 w-4" />
                                <span>{message}</span>
                            </div>
                        )}

                        {!mode && (
                            <form onSubmit={handleRequestReset} noValidate className="auth-flow-form-v25">
                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={(event) => setIdentifier(event.target.value)}
                                        className="auth-flow-input-v25"
                                        placeholder={t('auth.forgot_password.identifier_placeholder')}
                                        autoComplete="username"
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={requestLoading} className="auth-flow-primary-v25 w-full">
                                    {requestLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {t('auth.forgot_password.requesting')}
                                        </span>
                                    ) : (
                                        <>
                                            {t('auth.forgot_password.submit')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                        {emailModeActive && (
                            <div className="auth-flow-form-v25">
                                <div className="auth-flow-notice-v25">
                                    {t('auth.forgot_password.email_success')}
                                </div>
                                <Link to="/login" className="auth-flow-primary-v25 w-full">
                                    {t('auth.forgot_password.back_to_login')}
                                </Link>
                            </div>
                        )}

                        {recoveryModeActive && (
                            <form onSubmit={handleRecoveryReset} noValidate className="auth-flow-form-v25">
                                <div className="auth-flow-notice-v25">
                                    {t('auth.forgot_password.recovery_mode_info')}
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input type="text" value={identifier} className="auth-flow-input-v25" disabled />
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        {t('auth.forgot_password.recovery_key')}
                                    </label>
                                    <input
                                        type="text"
                                        value={recoveryKey}
                                        onChange={(event) => setRecoveryKey(event.target.value)}
                                        className="auth-flow-input-v25 font-mono text-sm"
                                        placeholder={t('auth.forgot_password.recovery_key_placeholder')}
                                        autoComplete="off"
                                        spellCheck={false}
                                        required
                                    />
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        {t('auth.forgot_password.new_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        className="auth-flow-input-v25"
                                        placeholder={t('auth.forgot_password.new_password_placeholder')}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        {t('auth.forgot_password.confirm_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        className="auth-flow-input-v25"
                                        placeholder={t('auth.forgot_password.confirm_password_placeholder')}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={resetLoading} className="auth-flow-primary-v25 w-full">
                                    {resetLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {t('auth.forgot_password.resetting')}
                                        </span>
                                    ) : (
                                        <>
                                            {t('auth.forgot_password.reset_submit')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>

                    <footer className="auth-flow-footer-v25">
                        <Link to="/login" className="auth-flow-link-v25">
                            {t('auth.forgot_password.back_to_login')}
                        </Link>
                    </footer>
                </section>

                <p className="mt-5 text-center text-xs leading-5 text-[var(--hi-text-muted)]">
                    {isTurkish
                        ? 'Hesap kurtarma e-posta veya kayıtlı kurtarma anahtarınızla çalışır.'
                        : 'The secure account recovery flow works through email or your saved recovery key.'}
                </p>
            </main>

            {rotatedRecoveryKey && (
                <RecoveryKeyModal
                    recoveryKey={rotatedRecoveryKey}
                    title={t('auth.recovery_key_modal.reset_title')}
                    subtitle={t('auth.recovery_key_modal.subtitle')}
                    warning={t('auth.recovery_key_modal.warning')}
                    confirmLabel={t('auth.recovery_key_modal.confirm')}
                    onConfirm={() => navigate('/login')}
                />
            )}
        </div>
    );
}
