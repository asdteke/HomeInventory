import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { useTheme } from '../context/ThemeContext';
import { BRAND_KEY, BRAND_NAME, SUPPORT_EMAIL } from '../constants/branding';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';

const LEGAL_LINK_KEYS = [
    'legal.terms_of_service_title',
    'legal.privacy_policy_title'
];

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const [requires2FA, setRequires2FA] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const [rememberDevice, setRememberDevice] = useState(false);
    const [useBackupCode, setUseBackupCode] = useState(false);

    const { login } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const isCustomBrand = BRAND_KEY !== 'homeinventory';
    const isTurkish = (i18n.resolvedLanguage || i18n.language || 'tr').toLowerCase().startsWith('tr');
    const legalLanguage = resolveVerifiedLegalTranslationLanguage(i18n, LEGAL_LINK_KEYS);
    const legalT = i18n.getFixedT(legalLanguage);
    const pageClass = isDark
        ? (isCustomBrand ? 'bg-[var(--hi-bg-strong)] text-white' : 'bg-[#1a1f1c] text-white')
        : 'bg-[var(--hi-bg)] text-[var(--hi-text)]';
    const pageGlow = isDark
        ? (isCustomBrand
            ? 'radial-gradient(circle_at_18%_16%,rgba(103,227,242,0.08),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(139,180,255,0.09),transparent_30%),linear-gradient(180deg,#101620_0%,#161c27_52%,#111722_100%)'
            : 'radial-gradient(circle_at_20%_18%,rgba(205,176,136,0.08),transparent_26%),radial-gradient(circle_at_78%_22%,rgba(74,125,100,0.12),transparent_30%),linear-gradient(180deg,#151a17_0%,#1a201d_52%,#151917_100%)')
        : (isCustomBrand
            ? 'radial-gradient(circle_at_18%_18%,rgba(139,180,255,0.13),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(18,158,154,0.10),transparent_28%),linear-gradient(180deg,#f4f8fd_0%,#eff5fc_48%,#eaf1fa_100%)'
            : 'radial-gradient(circle_at_18%_18%,rgba(184,153,104,0.12),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(45,82,65,0.10),transparent_28%),linear-gradient(180deg,#f7f2e8_0%,#f4ede2_48%,#efe6d9_100%)');
    const topChromeClass = isDark
        ? (isCustomBrand
            ? 'border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] hover:text-white'
            : 'border-white/10 bg-white/4 text-white/84 hover:bg-white/8 hover:text-white')
        : 'border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const cardClass = isDark
        ? (isCustomBrand
            ? 'landing-surface border-[var(--hi-border)] bg-[linear-gradient(180deg,rgba(23,30,42,0.96),rgba(17,23,33,0.92))] shadow-[0_28px_72px_rgba(0,0,0,0.34)]'
            : 'landing-surface border-white/8 bg-[rgba(16,21,18,0.86)] shadow-[0_28px_72px_rgba(0,0,0,0.30)]')
        : (isCustomBrand
            ? 'landing-surface border-[rgba(176,193,216,0.28)] bg-[rgba(255,255,255,0.9)] shadow-[0_24px_60px_rgba(19,35,61,0.10)]'
            : 'landing-surface border-[rgba(18,32,22,0.06)] bg-[rgba(255,251,245,0.84)] shadow-[0_24px_60px_rgba(28,41,32,0.12)]');
    const labelClass = isDark ? 'text-white/78' : 'text-[var(--hi-text-soft)]';
    const subtleTextClass = isDark
        ? (isCustomBrand ? 'text-[var(--hi-text-muted)]' : 'text-white/55')
        : 'text-[var(--hi-text-soft)]';
    const iconMutedClass = isDark
        ? (isCustomBrand ? 'text-[var(--hi-text-muted)]' : 'text-white/28')
        : 'text-[var(--hi-text-muted)]';
    const iconButtonClass = isDark
        ? (isCustomBrand ? 'text-[var(--hi-text-muted)] hover:text-white' : 'text-white/32 hover:text-white/68')
        : 'text-[var(--hi-text-muted)] hover:text-[var(--hi-text)]';
    const inputClass = isDark
        ? (isCustomBrand
            ? 'input-field h-14 border-[var(--hi-border)] bg-[rgba(22,30,43,0.92)] text-white placeholder:text-[var(--hi-text-muted)]'
            : 'input-field h-14 border-white/8 bg-[rgba(10,14,12,0.62)] text-white placeholder:text-white/28')
        : 'input-field h-14 border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.82)] text-[var(--hi-text)] placeholder:text-[var(--hi-text-muted)]';
    const panelMutedClass = isDark ? 'text-white/46' : 'text-[var(--hi-text-soft)]';
    const dividerClass = isDark
        ? (isCustomBrand ? 'bg-[var(--hi-border)]' : 'bg-white/8')
        : 'bg-[rgba(18,32,22,0.08)]';
    const trustSurfaceClass = isDark
        ? (isCustomBrand
            ? 'border-[var(--hi-border-strong)] bg-[rgba(26,34,46,0.72)] text-[var(--hi-text-soft)]'
            : 'border-white/8 bg-white/[0.045] text-white/62')
        : (isCustomBrand
            ? 'border-[rgba(176,193,216,0.32)] bg-[rgba(248,251,255,0.88)] text-[var(--hi-text-soft)]'
            : 'border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.66)] text-[var(--hi-text-soft)]');
    const secondaryButtonClass = isDark
        ? (isCustomBrand
            ? 'border border-[var(--hi-border-strong)] bg-[rgba(22,30,43,0.7)] text-white hover:bg-[rgba(29,38,52,0.92)]'
            : 'border border-white/8 bg-white/[0.02] text-white/82 hover:bg-white/[0.05]')
        : 'border border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.78)] text-[var(--hi-text)] hover:bg-white';
    const footerLinkClass = isDark ? 'text-white/50 hover:text-white/82' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]';
    const actionLinkClass = isCustomBrand
        ? 'text-sm font-medium text-[var(--hi-accent)] transition hover:text-[var(--hi-secondary-strong)]'
        : 'text-sm font-medium text-[#6f9978] transition hover:text-[#8bb395]';
    const loginHeaderKicker = t('auth.login.header_kicker', {
        defaultValue: isTurkish ? 'Hesabınıza giriş yapın' : 'Secure sign in'
    });
    const loginHeaderTitle = t('auth.login.header_title', {
        defaultValue: isTurkish ? 'Envanterinize güvenle devam edin' : 'Return to your inventory'
    });
    const loginHeaderSubtitle = t('auth.login.header_subtitle', {
        defaultValue: isTurkish
            ? 'Eşyalarınızı, odalarınızı ve kişisel kayıtlarınızı düzenli şekilde yönetin.'
            : 'Rooms, items, and private records stay in one calm place.'
    });
    const loginTrustSignal = t('auth.login.trust_signal', {
        defaultValue: isTurkish
            ? 'Kişisel kayıtlarınız ayrı tutulur; hesabınız ek güvenlik adımlarıyla korunur.'
            : 'Private by design. Supports 2FA and trusted devices.'
    });
    const securityKicker = isTurkish ? 'Güvenlik adımı' : 'Security step';
    const termsLinkLabel = legalT('legal.terms_of_service_title');
    const privacyLinkLabel = isTurkish ? 'Aydınlatma Metni' : legalT('legal.privacy_policy_title');
    const supportLabel = t('auth.login.support_link', {
        defaultValue: isTurkish ? 'Destek ekibiyle iletişime geçin' : 'Support'
    });
    const rememberDeviceLabel = t('auth.login.two_factor.remember_device');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!requires2FA && (!username.trim() || !password)) {
            setError(t('auth.username_password_required', { defaultValue: 'Kullanıcı adı ve şifre gerekli' }));
            return;
        }

        if (requires2FA && !totpCode.trim()) {
            setError(t('auth.login.two_factor.code_required', { defaultValue: 'Doğrulama kodu gerekli' }));
            return;
        }

        setLoading(true);

        try {
            const result = await login(
                username,
                password,
                requires2FA ? totpCode : null,
                requires2FA ? rememberDevice : false
            );

            if (result?.requiresTwoFactor) {
                setRequires2FA(true);
                setLoading(false);
                return;
            }
        } catch (err) {
            const data = err.response?.data;
            setError(data?.error || err.message || t('common.error'));
            if (data?.requiresTwoFactor) {
                setRequires2FA(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setRequires2FA(false);
        setTotpCode('');
        setError('');
        setUseBackupCode(false);
    };

    return (
        <div className={`landing-page-shell relative min-h-screen overflow-hidden ${pageClass}`}>
            <div className="absolute inset-0" style={{ background: pageGlow }} />
            <div className={`absolute inset-0 ${isDark ? 'opacity-[0.14]' : 'opacity-[0.22]'}`}>
                <div className="landing-grid absolute inset-0" />
            </div>
            <div className={`absolute left-[-7rem] top-16 h-56 w-56 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(139,180,255,0.10)]' : 'bg-[rgba(205,176,136,0.10)]') : (isCustomBrand ? 'bg-[rgba(139,180,255,0.16)]' : 'bg-[rgba(205,176,136,0.16)]')}`} />
            <div className={`absolute bottom-8 right-[-5rem] h-64 w-64 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(103,227,242,0.12)]' : 'bg-[rgba(74,125,100,0.14)]') : (isCustomBrand ? 'bg-[rgba(18,158,154,0.10)]' : 'bg-[rgba(45,82,65,0.10)]')}`} />

            <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8 sm:px-6 sm:py-12">
                <div className="w-full max-w-[31rem]">
                    <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
                        <div className={`hidden text-xs font-medium uppercase tracking-[0.22em] sm:block ${isDark ? 'text-white/30' : 'text-[var(--hi-text-muted)]'}`}>
                            {t('landing.nav.login')}
                        </div>

                        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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
                                <LanguageSwitcher
                                    showTooltip={false}
                                    showCodeBadge={false}
                                    className={`!h-10 !rounded-full !px-3 !py-0 sm:!h-11 sm:!px-4 ${isDark ? (isCustomBrand ? '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-white hover:!bg-[var(--hi-panel-muted)]' : '!border-white/10 !bg-white/4 !text-white/88 hover:!bg-white/8') : '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)]'}`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`relative overflow-hidden rounded-[var(--hi-radius-md)] ${cardClass}`}>
                        <div className={`landing-panel-glow absolute inset-0 ${isCustomBrand && isDark ? 'opacity-30' : 'opacity-50'}`} />

                        <div className={`relative p-6 sm:p-8 ${isCustomBrand && isDark ? 'bg-[linear-gradient(180deg,rgba(17,24,35,0.24),rgba(17,24,35,0.08))]' : ''}`}>
                            <Link to="/" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]">
                                <BrandLogo variant="full" size="md" className="h-auto max-h-10 w-auto sm:max-h-11" />
                            </Link>

                            <div className="mt-8 sm:mt-10">
                                <p className="landing-kicker text-[var(--hi-secondary)]">
                                    {requires2FA ? securityKicker : loginHeaderKicker}
                                </p>
                                <h1 className={`landing-display mt-3 text-[2rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[2.4rem] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                    {requires2FA ? t('auth.login.two_factor.title') : loginHeaderTitle}
                                </h1>
                                <p className={`mt-3 max-w-[26rem] text-[0.98rem] leading-7 ${subtleTextClass}`}>
                                    {requires2FA
                                        ? (useBackupCode ? t('auth.login.two_factor.backup_subtitle') : t('auth.login.two_factor.subtitle'))
                                        : loginHeaderSubtitle}
                                </p>
                                <div className={`mt-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-[0.78rem] leading-5 ${trustSurfaceClass}`}>
                                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--hi-secondary)]" />
                                    <span>{loginTrustSignal}</span>
                                </div>
                            </div>

                            <div className="mt-8 sm:mt-9">
                                {error && (
                                    <div className={`mb-6 rounded-[var(--hi-radius-md)] border px-4 py-3 text-sm ${isDark ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-red-500/18 bg-red-500/8 text-red-700'}`}>
                                        {error}
                                    </div>
                                )}

                                {!requires2FA ? (
                                    <>
                                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                                            <div>
                                                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                                    {t('auth.login.username_or_email')}
                                                </label>
                                                <div className="group relative">
                                                    <User className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                                    <input
                                                        type="text"
                                                        value={username}
                                                        onChange={(e) => setUsername(e.target.value)}
                                                        className={`${inputClass} pl-11`}
                                                        placeholder={t('auth.login.identifier_placeholder')}
                                                        autoComplete="username"
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                                    {t('auth.login.password')}
                                                </label>
                                                <div className="group relative">
                                                    <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className={`${inputClass} pl-11 pr-12`}
                                                        placeholder="••••••••"
                                                        autoComplete="current-password"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword((prev) => !prev)}
                                                        className={`absolute right-4 top-1/2 -translate-y-1/2 transition ${iconButtonClass}`}
                                                        aria-label={showPassword ? t('common.hide', { defaultValue: isTurkish ? 'Şifreyi gizle' : 'Hide password' }) : t('common.show', { defaultValue: isTurkish ? 'Şifreyi göster' : 'Show password' })}
                                                    >
                                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex justify-end">
                                                <Link to="/forgot-password" className={actionLinkClass}>
                                                    {t('auth.login.forgot_password')}
                                                </Link>
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className={`btn-primary !h-14 !w-full !rounded-[var(--hi-radius-md)] !px-5 text-base ${isCustomBrand ? '!shadow-[0_18px_36px_rgba(8,44,110,0.24)]' : '!shadow-[0_18px_36px_rgba(111,153,120,0.24)]'} disabled:opacity-60`}
                                            >
                                                {loading ? t('auth.login.submitting') : t('auth.login.submit')}
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </button>
                                        </form>

                                        <div className={`my-6 h-px w-full ${dividerClass}`} />

                                        <a
                                            href="/api/auth/google"
                                            className={`inline-flex h-14 w-full items-center justify-center rounded-[var(--hi-radius-md)] px-5 text-sm font-medium transition ${secondaryButtonClass}`}
                                        >
                                            <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                            {t('auth.login.google_continue')}
                                        </a>

                                        <div className={`mt-8 border-t pt-5 ${isDark ? 'border-white/8' : 'border-[rgba(18,32,22,0.08)]'}`}>
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <p className={`text-sm ${panelMutedClass}`}>
                                                    {t('auth.login.no_account')}{' '}
                                                    <Link to="/register" className={`font-semibold transition ${isCustomBrand ? 'text-[var(--hi-accent)] hover:text-[var(--hi-secondary-strong)]' : 'text-[#6f9978] hover:text-[#8bb395]'}`}>
                                                        {t('auth.login.register_link')}
                                                    </Link>
                                                </p>

                                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                                    <Link to="/terms-of-service" className={`transition ${footerLinkClass}`}>
                                                        {termsLinkLabel}
                                                    </Link>
                                                    <span className={isDark ? 'text-white/18' : 'text-[var(--hi-border-strong)]'}>&bull;</span>
                                                    <Link to="/privacy-policy" className={`transition ${footerLinkClass}`}>
                                                        {privacyLinkLabel}
                                                    </Link>
                                                    <span className={isDark ? 'text-white/18' : 'text-[var(--hi-border-strong)]'}>&bull;</span>
                                                    <a href={`mailto:${SUPPORT_EMAIL}`} title={SUPPORT_EMAIL} className={`transition ${footerLinkClass}`}>
                                                        {supportLabel}
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                                        <div>
                                            <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                                {useBackupCode ? t('auth.login.two_factor.backup_code_label') : t('auth.login.two_factor.code_label')}
                                            </label>
                                            <input
                                                type="text"
                                                value={totpCode}
                                                onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ''))}
                                                className={`${inputClass} text-center font-mono text-2xl tracking-[0.45em]`}
                                                placeholder={useBackupCode ? 'ABCD1234' : '000000'}
                                                maxLength={useBackupCode ? 8 : 6}
                                                autoFocus
                                                autoComplete="one-time-code"
                                                required
                                            />
                                        </div>

                                        <label className={`flex items-start gap-3 rounded-[var(--hi-radius-md)] border px-4 py-3 text-sm ${panelMutedClass} ${isDark ? (isCustomBrand ? 'border-[var(--hi-border)] bg-[rgba(24,31,44,0.72)]' : 'border-white/8 bg-white/[0.02]') : 'border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.52)]'}`}>
                                            <input
                                                type="checkbox"
                                                checked={rememberDevice}
                                                onChange={(e) => setRememberDevice(e.target.checked)}
                                                className={`mt-0.5 h-4 w-4 rounded border ${isDark ? (isCustomBrand ? 'border-[var(--hi-border-strong)] bg-transparent' : 'border-white/16 bg-transparent') : 'border-[rgba(18,32,22,0.18)] bg-transparent'} ${isCustomBrand ? 'text-[var(--hi-accent)] focus:ring-[var(--hi-accent)]' : 'text-[#6f9978] focus:ring-[#6f9978]'} focus:ring-offset-0`}
                                            />
                                            <span>{rememberDeviceLabel}</span>
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className={`btn-primary !h-14 !w-full !rounded-[var(--hi-radius-md)] !px-5 text-base ${isCustomBrand ? '!shadow-[0_18px_36px_rgba(8,44,110,0.24)]' : '!shadow-[0_18px_36px_rgba(111,153,120,0.24)]'} disabled:opacity-60`}
                                        >
                                            {loading ? t('auth.login.submitting') : t('auth.login.two_factor.verify')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </button>

                                        <div className="flex items-center justify-between gap-3 pt-1">
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className={`text-sm transition ${footerLinkClass}`}
                                            >
                                                ← {t('auth.login.two_factor.back')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(''); setError(''); }}
                                                className={`inline-flex items-center gap-1 ${actionLinkClass}`}
                                            >
                                                <KeyRound className="h-3.5 w-3.5" />
                                                {useBackupCode ? t('auth.login.two_factor.use_totp') : t('auth.login.two_factor.use_backup')}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
