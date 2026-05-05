import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, AlertCircle, Loader2, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import RecoveryKeyModal from './RecoveryKeyModal';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';
import { BRAND_NAME } from '../constants/branding';

export default function ForgotPassword() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mode, setMode] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [requestLoading, setRequestLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState('');

    const topChromeClass = isDark
        ? 'border-white/10 bg-white/4 text-white/84 hover:bg-white/8 hover:text-white'
        : 'border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const pageClass = isDark ? 'bg-[var(--hi-bg-strong)] text-white' : 'bg-[var(--hi-bg)] text-[var(--hi-text)]';
    const pageGlow = isDark
        ? (false
            ? 'radial-gradient(circle_at_18%_16%,rgba(103,227,242,0.08),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(139,180,255,0.09),transparent_30%),linear-gradient(180deg,#101620_0%,#161c27_52%,#111722_100%)'
            : 'radial-gradient(circle_at_20%_18%,rgba(205,176,136,0.08),transparent_26%),radial-gradient(circle_at_78%_22%,rgba(74,125,100,0.12),transparent_30%),linear-gradient(180deg,#151a17_0%,#1a201d_52%,#151917_100%)')
        : (false
            ? 'radial-gradient(circle_at_18%_18%,rgba(139,180,255,0.13),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(18,158,154,0.10),transparent_28%),linear-gradient(180deg,#f4f8fd_0%,#eff5fc_48%,#eaf1fa_100%)'
            : 'radial-gradient(circle_at_18%_18%,rgba(184,153,104,0.12),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(45,82,65,0.10),transparent_28%),linear-gradient(180deg,#f7f2e8_0%,#f4ede2_48%,#efe6d9_100%)');
    const cardClass = isDark
        ? 'border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[0_30px_80px_rgba(0,0,0,0.32)]'
        : 'border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)]';
    const labelClass = isDark ? 'text-white/78' : 'text-[var(--hi-text-soft)]';
    const subtleTextClass = isDark ? 'text-white/55' : 'text-[var(--hi-text-soft)]';
    const inputClass = isDark
        ? 'input-field h-12 border-white/8 bg-transparent text-white placeholder:text-white/28'
        : 'input-field h-12 border-[var(--hi-border)] bg-[var(--hi-bg-strong)] text-[var(--hi-text)] placeholder:text-[var(--hi-text-muted)]';
    const isTurkish = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('tr');

    const handleRequestReset = async (event) => {
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
        } catch (requestError) {
            setError(requestError.response?.data?.error || requestError.message || t('common.error'));
        } finally {
            setRequestLoading(false);
        }
    };

    const handleRecoveryReset = async (event) => {
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
            setError(passwordValidation.error);
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
        } catch (requestError) {
            setError(requestError.response?.data?.error || requestError.message || t('common.error'));
        } finally {
            setResetLoading(false);
        }
    };

    const recoveryModeActive = mode === 'recovery_key';
    const emailModeActive = mode === 'email';

    return (
        <div className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 sm:py-10 ${pageClass}`}>
            <div className="absolute inset-0" style={{ background: pageGlow }} />

            <div className="relative z-10 w-full max-w-md">
                <div className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:items-center">
                    <Link to="/" className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]">
                        <BrandLogo variant="full" size="md" className="h-auto max-h-10 w-auto sm:max-h-11" />
                    </Link>

                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition sm:h-11 sm:w-11 ${topChromeClass}`}
                            title={isDark ? t('common.theme.light') : t('common.theme.dark')}
                            aria-label={isDark ? t('common.theme.light') : t('common.theme.dark')}
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>
                        <div className="w-[140px] sm:w-[164px]">
                            <LanguageSwitcher className={`!h-10 !rounded-full !px-3 !py-0 sm:!h-11 sm:!px-4 ${isDark ? '!border-white/10 !bg-white/4 !text-white/88 hover:!bg-white/8' : '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)]'}`} />
                        </div>
                    </div>
                </div>

                <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--hi-accent)] shadow-[var(--hi-shadow-soft)]">
                        {recoveryModeActive ? <KeyRound className="h-8 w-8 text-white" /> : emailModeActive ? <Mail className="h-8 w-8 text-white" /> : <ShieldCheck className="h-8 w-8 text-white" />}
                    </div>
                    <h1 className={`text-3xl font-semibold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                        {t('auth.forgot_password.title')}
                    </h1>
                    <p className={`mt-2 text-lg ${subtleTextClass}`}>
                        {t('auth.forgot_password.subtitle')}
                    </p>
                </div>

                <div className={`overflow-hidden rounded-[2rem] backdrop-blur-xl ${cardClass}`}>
                    <div className="p-8">
                        {error && (
                            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {message && (
                            <div className={`mb-6 rounded-xl border px-4 py-3 text-sm leading-6 ${isDark ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-white/84' : 'border-[var(--hi-border)] bg-[var(--hi-accent-soft)] text-[var(--hi-text)]'}`}>
                                {message}
                            </div>
                        )}

                        {!mode && (
                            <form onSubmit={handleRequestReset} noValidate className="space-y-5">
                                <div>
                                    <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={(event) => setIdentifier(event.target.value)}
                                        className={inputClass}
                                        placeholder={t('auth.forgot_password.identifier_placeholder')}
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={requestLoading} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--hi-accent)] px-5 text-base font-semibold text-white transition hover:bg-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:opacity-60">
                                    {requestLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
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
                            <div className="space-y-5">
                                <div className={`rounded-xl px-4 py-4 text-sm leading-6 ${isDark ? 'border border-white/8 bg-[rgba(255,255,255,0.03)] text-white/72' : 'border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]'}`}>
                                    {t('auth.forgot_password.email_success')}
                                </div>
                                <Link to="/login" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--hi-accent)] px-5 text-base font-semibold text-white transition hover:bg-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]">
                                    {t('auth.forgot_password.back_to_login')}
                                </Link>
                            </div>
                        )}

                        {recoveryModeActive && (
                            <form onSubmit={handleRecoveryReset} noValidate className="space-y-5">
                                <div className={`rounded-xl px-4 py-4 text-sm leading-6 ${isDark ? 'border border-white/8 bg-[rgba(255,255,255,0.03)] text-white/72' : 'border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]'}`}>
                                    {t('auth.forgot_password.recovery_mode_info')}
                                </div>

                                <div>
                                    <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input type="text" value={identifier} className={`${inputClass} ${isDark ? 'opacity-75' : 'opacity-90'}`} disabled />
                                </div>

                                <div>
                                    <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                        {t('auth.forgot_password.recovery_key')}
                                    </label>
                                    <input
                                        type="text"
                                        value={recoveryKey}
                                        onChange={(event) => setRecoveryKey(event.target.value)}
                                        className={`${inputClass} font-mono text-sm`}
                                        placeholder={t('auth.forgot_password.recovery_key_placeholder')}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                        {t('auth.forgot_password.new_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        className={inputClass}
                                        placeholder={t('auth.forgot_password.new_password_placeholder')}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                        {t('auth.forgot_password.confirm_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        className={inputClass}
                                        placeholder={t('auth.forgot_password.confirm_password_placeholder')}
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={resetLoading} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--hi-accent)] px-5 text-base font-semibold text-white transition hover:bg-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:opacity-60">
                                    {resetLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
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

                    <div className={`px-8 py-6 text-center ${isDark ? 'border-t border-white/8 bg-[rgba(255,255,255,0.02)]' : 'border-t border-[var(--hi-border)] bg-[var(--hi-panel-muted)]'}`}>
                        <Link to="/login" className={`text-sm font-medium transition ${isDark ? 'text-white/68 hover:text-white' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {t('auth.forgot_password.back_to_login')}
                        </Link>
                    </div>
                </div>

                <p className={`mt-6 text-center text-xs ${isDark ? 'text-white/34' : 'text-[var(--hi-text-muted)]'}`}>
                    {isTurkish
                        ? 'Hesap kurtarma e-posta veya kayıtlı kurtarma anahtarınızla çalışır.'
                        : 'The secure account recovery flow works through email or your saved recovery key.'}
                </p>
            </div>

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
