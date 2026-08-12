import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, AlertCircle, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { getPasswordGuidanceMessage, MIN_PASSWORD_LENGTH, validatePasswordStrengthClient } from '../utils/passwordValidation';
import '../auth-onboarding-v25.css';

export default function ResetPassword() {
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [searchParams] = useSearchParams();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const passwordGuidance = getPasswordGuidanceMessage(t);

    const token = searchParams.get('token') || '';

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword !== confirmPassword) {
            setError(t('auth.register.passwords_mismatch'));
            return;
        }

        const passwordValidation = validatePasswordStrengthClient(newPassword, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error || '');
            return;
        }

        setLoading(true);

        try {
            const response = await axios.post('/api/auth/reset-password', {
                token,
                newPassword,
                confirmPassword
            });

            setSuccess(response.data.message);
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setLoading(false);
        }
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

                <section className="auth-flow-card-v25" aria-labelledby="reset-password-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25"><LockKeyhole className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{t('auth.reset_password.new_password')}</p>
                            <h1 id="reset-password-title" className="auth-flow-title-v25">{t('auth.reset_password.title')}</h1>
                            <p className="auth-flow-subtitle-v25">{t('auth.reset_password.subtitle')}</p>
                        </header>

                        {!token && (
                            <div className="auth-flow-feedback-v25 is-error" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{t('auth.reset_password.missing_token')}</span>
                            </div>
                        )}

                        {error && (
                            <div className="auth-flow-feedback-v25 is-error" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="auth-flow-feedback-v25 is-success" role="status">
                                <ShieldCheck className="h-4 w-4" />
                                <span>{success}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="auth-flow-form-v25">
                            <div className="auth-flow-field-v25">
                                <label className="auth-flow-label-v25">
                                    {t('auth.reset_password.new_password')}
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    className="auth-flow-input-v25"
                                    placeholder={t('auth.reset_password.new_password_placeholder')}
                                    autoComplete="new-password"
                                    minLength={MIN_PASSWORD_LENGTH}
                                    aria-describedby="reset-password-guidance"
                                    disabled={!token || Boolean(success)}
                                    required
                                />
                                <p id="reset-password-guidance" className="auth-flow-hint-v25">{passwordGuidance}</p>
                            </div>

                            <div className="auth-flow-field-v25">
                                <label className="auth-flow-label-v25">
                                    {t('auth.reset_password.confirm_password')}
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="auth-flow-input-v25"
                                    placeholder={t('auth.reset_password.confirm_password_placeholder')}
                                    autoComplete="new-password"
                                    minLength={MIN_PASSWORD_LENGTH}
                                    disabled={!token || Boolean(success)}
                                    required
                                />
                            </div>

                            <button type="submit" disabled={!token || loading || Boolean(success)} className="auth-flow-primary-v25 w-full">
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('auth.reset_password.submitting')}
                                    </span>
                                ) : (
                                    t('auth.reset_password.submit')
                                )}
                            </button>
                        </form>
                    </div>
                    <footer className="auth-flow-footer-v25">
                        <Link to="/login" className="auth-flow-link-v25">
                            {t('auth.reset_password.back_to_login')}
                        </Link>
                    </footer>
                </section>
            </main>
        </div>
    );
}
