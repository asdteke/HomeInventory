import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    ArrowRight,
    Eye,
    EyeOff,
    Home,
    Key,
    Lock,
    Mail,
    Moon,
    ShieldCheck,
    Sun,
    User,
    Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { BRAND_KEY, BRAND_NAME, SUPPORT_CONTACT_URL } from '../constants/branding';
import '../auth-landing-v25.css';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';
import BrandLogo from './BrandLogo';
import HouseKeyModal from './HouseKeyModal';
import { PremiumCheckbox } from './PremiumCheckbox';
import LanguageSwitcher from './LanguageSwitcher';
import RecoveryKeyModal from './RecoveryKeyModal';

const LEGAL_REGISTER_KEYS = [
    'legal.register_consent',
    'legal.consent_required',
    'legal.terms_of_service_title',
    'legal.privacy_policy_title'
];

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export default function Register() {
    const { t, i18n } = useTranslation();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        house_key: ''
    });
    const [legalAccepted, setLegalAccepted] = useState(false);
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [modeDragProgress, setModeDragProgress] = useState<number | null>(null);
    const modeTrackRef = useRef<HTMLDivElement | null>(null);
    const modeDragRef = useRef<{
        pointerId: number;
        startX: number;
        startProgress: number;
        currentProgress: number;
        travel: number;
    } | null>(null);
    const suppressModeClickRef = useRef(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showKeyModal, setShowKeyModal] = useState(false);
    const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
    const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
    const [generatedKey, setGeneratedKey] = useState('');
    const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
    const [showHouseKeyAfterRecovery, setShowHouseKeyAfterRecovery] = useState(false);

    const { register, refreshUser } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const isCustomBrand = BRAND_KEY !== 'homeinventory';
    const isTurkish = String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase().startsWith('tr');
    const legalLanguage = resolveVerifiedLegalTranslationLanguage(i18n, LEGAL_REGISTER_KEYS);
    const legalT = i18n.getFixedT(legalLanguage);

    const pageClass = isDark
        ? (isCustomBrand ? 'bg-[var(--hi-bg-strong)] text-white' : 'bg-[#1a1f1c] text-white')
        : 'bg-[var(--hi-bg)] text-[var(--hi-text)]';
    const pageGlow = isDark
        ? (isCustomBrand
            ? 'radial-gradient(circle_at_18%_16%,rgba(88,213,240,0.08),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(100,168,255,0.10),transparent_30%),linear-gradient(180deg,#08111e_0%,#0d1726_52%,#10213a_100%)'
            : 'radial-gradient(circle_at_20%_18%,rgba(205,176,136,0.08),transparent_26%),radial-gradient(circle_at_78%_22%,rgba(74,125,100,0.12),transparent_30%),linear-gradient(180deg,#151a17_0%,#1a201d_52%,#151917_100%)')
        : (isCustomBrand
            ? 'radial-gradient(circle_at_18%_18%,rgba(100,168,255,0.14),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(22,166,220,0.10),transparent_28%),linear-gradient(180deg,#f3f7ff_0%,#edf4ff_48%,#e8f1ff_100%)'
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
        ? (isCustomBrand ? 'border-[var(--hi-border)]' : 'border-white/8')
        : 'border-[rgba(18,32,22,0.08)]';
    const trustSurfaceClass = isDark
        ? (isCustomBrand
            ? 'border-[var(--hi-border-strong)] bg-[rgba(26,34,46,0.72)] text-[var(--hi-text-soft)]'
            : 'border-white/8 bg-white/[0.045] text-white/62')
        : (isCustomBrand
            ? 'border-[rgba(176,193,216,0.32)] bg-[rgba(248,251,255,0.88)] text-[var(--hi-text-soft)]'
            : 'border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.66)] text-[var(--hi-text-soft)]');
    const panelSurfaceClass = isDark
        ? (isCustomBrand ? 'border-[var(--hi-border)] bg-[rgba(24,31,44,0.72)]' : 'border-white/8 bg-white/[0.02]')
        : (isCustomBrand
            ? 'border-[rgba(176,193,216,0.22)] bg-[rgba(248,251,255,0.7)]'
            : 'border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.52)]');
    const segmentedSurfaceClass = isDark
        ? (isCustomBrand
            ? 'overflow-hidden border-[var(--hi-border)] bg-[rgba(23,30,43,0.7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
            : 'overflow-hidden border-white/10 bg-[rgba(255,255,255,0.04)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]')
        : (isCustomBrand
            ? 'overflow-hidden border-[rgba(176,193,216,0.28)] bg-[rgba(248,251,255,0.82)] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)]'
            : 'overflow-hidden border-[rgba(18,32,22,0.08)] bg-[rgba(255,255,255,0.70)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]');
    const segmentedThumbClass = isDark
        ? (isCustomBrand
            ? 'border-[rgba(139,171,216,0.42)] bg-[linear-gradient(180deg,rgba(123,160,215,0.84),rgba(89,129,196,0.76))] shadow-[0_14px_28px_rgba(0,0,0,0.24)]'
            : 'border-[rgba(139,179,149,0.26)] bg-[linear-gradient(180deg,rgba(121,159,130,0.92),rgba(97,131,105,0.88))] shadow-[0_14px_28px_rgba(0,0,0,0.24)]')
        : (isCustomBrand
            ? 'border-[rgba(139,171,216,0.34)] bg-[linear-gradient(180deg,rgba(124,165,227,0.94),rgba(89,144,221,0.9))] shadow-[0_14px_26px_rgba(44,84,146,0.16)]'
            : 'border-[rgba(111,153,120,0.18)] bg-[linear-gradient(180deg,rgba(123,164,132,0.96),rgba(97,137,108,0.94))] shadow-[0_14px_26px_rgba(68,96,75,0.16)]');
    const footerLinkClass = isDark ? 'text-white/50 hover:text-white/82' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]';
    const activeModeTextClass = 'text-white';
    const inactiveModeClass = isDark
        ? (isCustomBrand ? 'text-[var(--hi-text-muted)] hover:text-white/88' : 'text-white/54 hover:text-white/78')
        : 'text-[rgba(32,53,40,0.58)] hover:text-[var(--hi-text)]';

    const registerShellLabel = t('auth.register.form_title', {
        defaultValue: isTurkish ? 'Hesap oluştur' : 'Create account'
    });
    const registerHeaderKicker = t('auth.register.eyebrow', {
        defaultValue: isTurkish ? 'Ev paylaşımına başlayın' : 'Shared household access'
    });
    const registerHeaderTitle = t('auth.register.title', {
        defaultValue: isTurkish ? 'Evinizi oluşturun' : 'Set up your household'
    });
    const registerHeaderSubtitle = t('auth.register.subtitle', {
        defaultValue: isTurkish
            ? 'Yeni bir ev oluşturun veya size verilen ev anahtarıyla katılın.'
            : 'Create a house or join one with a House Key.'
    });
    const registerTrustSignal = t('auth.register.trust_signal', {
        defaultValue: isTurkish
            ? 'Kişisel kayıtlarınız ayrı tutulur; hesabınız ek güvenlik adımlarıyla korunur.'
            : 'Private by design, so household sharing stays secure with 2FA.'
    });
    const supportLabel = t('auth.login.support_link', {
        defaultValue: isTurkish ? 'Destek ekibiyle iletişime geçin' : 'Contact support'
    });

    const modeOptions = [
        { value: 'create' as const, icon: Home, label: t('auth.register.create_house') },
        { value: 'join' as const, icon: Users, label: t('auth.register.join_house') }
    ];

    const visualMode = modeDragProgress === null
        ? mode
        : (modeDragProgress >= 0.5 ? 'join' : 'create');
    const dragStretch = modeDragProgress === null
        ? 0
        : Math.sin(modeDragProgress * Math.PI);

    const activeMode = mode === 'create'
        ? {
            icon: Home,
            body: t('auth.register.mode_create_body', {
                defaultValue: isTurkish
                    ? 'Evinizi oluşturun, davetleri daha sonra paylaşın.'
                    : 'Start your household here, then invite others.'
            })
        }
        : {
            icon: Key,
            body: t('auth.register.mode_join_body', {
                defaultValue: isTurkish
                    ? 'Size verilen Ev Anahtarı ile katılın.'
                    : 'Join with the House Key you received.'
            })
        };

    const handleModePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        const track = modeTrackRef.current;
        if (!track) {
            return;
        }

        modeDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startProgress: mode === 'join' ? 1 : 0,
            currentProgress: mode === 'join' ? 1 : 0,
            travel: Math.max(track.getBoundingClientRect().width / 2, 1)
        };
        suppressModeClickRef.current = false;
        setModeDragProgress(mode === 'join' ? 1 : 0);
        track.setPointerCapture(event.pointerId);
    };

    const handleModePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = modeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        const delta = event.clientX - drag.startX;
        if (Math.abs(delta) > 5) {
            suppressModeClickRef.current = true;
        }

        drag.currentProgress = Math.min(1, Math.max(0, drag.startProgress + (delta / drag.travel)));
        setModeDragProgress(drag.currentProgress);
    };

    const finishModeDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
        const drag = modeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        if (modeTrackRef.current?.hasPointerCapture(event.pointerId)) {
            modeTrackRef.current.releasePointerCapture(event.pointerId);
        }

        if (!cancelled && suppressModeClickRef.current) {
            const nextMode = drag.currentProgress >= 0.5 ? 'join' : 'create';
            setMode(nextMode);
            setError('');
        }

        modeDragRef.current = null;
        setModeDragProgress(null);
    };
    const ActiveModeIcon = activeMode.icon;

    const handleChange = ({ target: { name, value } }: React.ChangeEvent<HTMLInputElement>) => {
        setError('');
        setFormData((current) => ({ ...current, [name]: value }));
    };

    const resolvePasswordServerError = (payload: any) => {
        const firstCode = Array.isArray(payload?.passwordErrorCodes) ? payload.passwordErrorCodes[0] : '';
        if (!firstCode) {
            return '';
        }

        return t(`auth.password_errors.${firstCode}`, {
            min: 10,
            defaultValue: payload?.error || ''
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.username.trim() || !formData.email.trim() || !formData.password || !formData.confirmPassword) {
            setError(t('auth.fill_all_fields', { defaultValue: 'Tüm alanları doldurun' }));
            return;
        }

        if (!isValidEmail(formData.email)) {
            setError(t('auth.invalid_email', { defaultValue: 'Geçerli bir e-posta adresi girin' }));
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError(t('auth.register.passwords_mismatch'));
            return;
        }

        const passwordValidation = validatePasswordStrengthClient(formData.password, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error || '');
            return;
        }

        if (mode === 'join' && !formData.house_key) {
            setError(t('auth.register.key_required'));
            return;
        }

        if (!legalAccepted) {
            setError(legalT('legal.consent_required'));
            return;
        }

        setLoading(true);
        try {
            const result = await register(
                formData.username,
                formData.email,
                formData.password,
                mode,
                mode === 'join' ? formData.house_key : null,
                {
                    acceptedTerms: true,
                    acknowledgedPrivacyNotice: true
                }
            );

            if (result.requiresEmailVerification) {
                if (result.isNewHouse && result.house_key) {
                    setGeneratedKey(result.house_key);
                }
                setShowEmailVerificationModal(true);
                return;
            }

            if (result.newRecoveryKey) {
                setGeneratedRecoveryKey(result.newRecoveryKey);
                if (result.isNewHouse && result.house_key) {
                    setGeneratedKey(result.house_key);
                    setShowHouseKeyAfterRecovery(true);
                }
                setShowRecoveryKeyModal(true);
                return;
            }

            if (result.isNewHouse && result.house_key) {
                setGeneratedKey(result.house_key);
                setShowKeyModal(true);
                return;
            }

            if (result.user) {
                await refreshUser();
                navigate('/');
            }
        } catch (err: any) {
            const payload = err.response?.data;
            setError(resolvePasswordServerError(payload) || payload?.error || err.message || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = async () => {
        setShowKeyModal(false);
        await refreshUser();
        navigate('/');
    };

    const handleRecoveryKeyConfirm = async () => {
        setShowRecoveryKeyModal(false);

        if (showHouseKeyAfterRecovery && generatedKey) {
            setShowHouseKeyAfterRecovery(false);
            setShowKeyModal(true);
            return;
        }

        await refreshUser();
        navigate('/');
    };

    const handleEmailVerificationModalClose = () => {
        setShowEmailVerificationModal(false);
        navigate('/login');
    };

    return (
        <div className={`auth-page-v25 landing-page-shell relative min-h-screen overflow-hidden ${pageClass}`}>
            <div className="absolute inset-0" style={{ background: pageGlow }} />
            <div className={`absolute inset-0 ${isDark ? 'opacity-[0.14]' : 'opacity-[0.22]'}`}>
                <div className="landing-grid absolute inset-0" />
            </div>
            <div className={`absolute left-[-7rem] top-16 h-56 w-56 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(139,180,255,0.10)]' : 'bg-[rgba(205,176,136,0.10)]') : (isCustomBrand ? 'bg-[rgba(139,180,255,0.16)]' : 'bg-[rgba(205,176,136,0.16)]')}`} />
            <div className={`absolute bottom-8 right-[-5rem] h-64 w-64 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.12)]' : 'bg-[rgba(74,125,100,0.14)]') : (isCustomBrand ? 'bg-[rgba(22,166,220,0.10)]' : 'bg-[rgba(45,82,65,0.10)]')}`} />

            <div className="auth-shell-v25 relative z-10 flex min-h-screen items-center justify-center px-5 py-8 sm:px-6 sm:py-12">
                <div className="w-full max-w-[31rem]">
                    <div className="auth-top-tools-v25 mb-4 flex items-center justify-between gap-3 sm:mb-5">
                        <div className="auth-top-controls-v25 flex shrink-0 items-center gap-2 sm:gap-3">
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition sm:h-11 sm:w-11 ${topChromeClass}`}
                                title={isDark ? t('common.theme.light') || undefined : t('common.theme.dark') || undefined}
                                aria-label={isDark ? t('common.theme.light') || undefined : t('common.theme.dark') || undefined}
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

                        <div className={`auth-top-label-v25 text-right font-medium uppercase ${isDark ? 'text-white/38' : 'text-[var(--hi-text-muted)]'}`}>
                            {registerShellLabel}
                        </div>
                    </div>

                    <div className={`auth-card-v25 relative overflow-hidden rounded-[var(--hi-radius-md)] ${cardClass}`}>
                        <div className={`landing-panel-glow absolute inset-0 ${isCustomBrand && isDark ? 'opacity-30' : 'opacity-50'}`} />

                        <div className={`relative p-6 sm:p-8 ${isCustomBrand && isDark ? 'bg-[linear-gradient(180deg,rgba(17,24,35,0.24),rgba(17,24,35,0.08))]' : ''}`}>
                            <Link to="/" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]">
                                <BrandLogo variant="full" size="md" className="h-auto max-h-10 w-auto sm:max-h-11" />
                            </Link>

                            <div className="mt-7 sm:mt-9">
                                <p className="landing-kicker text-[var(--hi-secondary)]">
                                    {registerHeaderKicker}
                                </p>
                                <h1 className={`landing-display mt-3 text-[2rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[2.4rem] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                    {registerHeaderTitle}
                                </h1>
                                <p className={`mt-2.5 max-w-[26rem] text-[0.98rem] leading-6 ${subtleTextClass}`}>
                                    {registerHeaderSubtitle}
                                </p>
                                <div className={`mt-4 inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-[0.78rem] leading-5 ${trustSurfaceClass}`}>
                                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--hi-secondary)]" />
                                    <span>{registerTrustSignal}</span>
                                </div>
                            </div>

                            <div className="mt-8 sm:mt-9">
                                {error && (
                                    <div className={`mb-6 rounded-[var(--hi-radius-md)] border px-4 py-3 text-sm ${isDark ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-red-500/18 bg-red-500/8 text-red-700'}`}>
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                                    <div className="space-y-2.5">
                                        <label className={`block text-sm font-medium ${labelClass}`}>
                                            {t('auth.register.mode_label', {
                                                defaultValue: isTurkish ? 'Nasıl devam etmek istersiniz?' : 'Household access'
                                            })}
                                        </label>
                                        <div className={`register-mode-v25 border ${segmentedSurfaceClass}`}>
                                            <div
                                                ref={modeTrackRef}
                                                className={`register-mode-track-v25 relative grid grid-cols-2 ${modeDragProgress !== null ? 'is-dragging' : ''}`}
                                                role="tablist"
                                                aria-label={t('auth.register.mode_label') || undefined}
                                                onPointerDown={handleModePointerDown}
                                                onPointerMove={handleModePointerMove}
                                                onPointerUp={(event) => finishModeDrag(event)}
                                                onPointerCancel={(event) => finishModeDrag(event, true)}
                                                onClickCapture={(event) => {
                                                    if (suppressModeClickRef.current) {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        suppressModeClickRef.current = false;
                                                    }
                                                }}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={`register-mode-thumb-v25 pointer-events-none absolute z-0 border ${segmentedThumbClass}`}
                                                    style={{
                                                        '--register-drag-progress': modeDragProgress ?? (mode === 'join' ? 1 : 0),
                                                        '--register-glow-x': `${18 + ((modeDragProgress ?? (mode === 'join' ? 1 : 0)) * 64)}%`,
                                                        transform: `translate3d(${(modeDragProgress ?? (mode === 'join' ? 1 : 0)) * 100}%, 0, 0) scaleX(${1 + (dragStretch * 0.055)}) scaleY(${1 - (dragStretch * 0.025)})`,
                                                        transformOrigin: (modeDragProgress ?? (mode === 'join' ? 1 : 0)) < 0.5 ? 'left center' : 'right center'
                                                    } as React.CSSProperties}
                                                />
                                                {modeOptions.map((option) => {
                                                    const isActive = mode === option.value;
                                                    const isVisuallyActive = visualMode === option.value;
                                                    const Icon = option.icon;

                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            role="tab"
                                                            aria-selected={isActive}
                                                            onClick={() => {
                                                                setMode(option.value);
                                                                setError('');
                                                            }}
                                                            className={`register-mode-option-v25 relative z-10 inline-flex items-center justify-center gap-2.5 px-4 text-sm ${isVisuallyActive ? `is-active font-semibold ${activeModeTextClass}` : `font-medium ${inactiveModeClass}`}`}
                                                        >
                                                            <Icon className={`h-4 w-4 ${isVisuallyActive ? activeModeTextClass : ''}`} />
                                                            <span>{option.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <p className={`flex items-start gap-2.5 pl-1 text-sm leading-5 ${subtleTextClass}`}>
                                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                                <ActiveModeIcon className="h-3.5 w-3.5" />
                                            </span>
                                            <span>{activeMode.body}</span>
                                        </p>
                                    </div>

                                    {mode === 'join' && (
                                        <div>
                                            <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                                {t('auth.register.house_key')}
                                            </label>
                                            <div className="group relative">
                                                <Key className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                                <input
                                                    type="text"
                                                    name="house_key"
                                                    value={formData.house_key}
                                                    onChange={handleChange}
                                                    className={`${inputClass} pl-11 font-mono text-sm`}
                                                    placeholder={t('auth.register.house_key_placeholder') || undefined}
                                                    autoCapitalize="off"
                                                    autoCorrect="off"
                                                    spellCheck="false"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                            {t('auth.register.username')}
                                        </label>
                                        <div className="group relative">
                                            <User className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                            <input
                                                type="text"
                                                name="username"
                                                value={formData.username}
                                                onChange={handleChange}
                                                className={`${inputClass} pl-11`}
                                                placeholder={t('auth.register.username_placeholder') || undefined}
                                                autoComplete="username"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                            {t('auth.register.email')}
                                        </label>
                                        <div className="group relative">
                                            <Mail className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                className={`${inputClass} pl-11`}
                                                placeholder={t('auth.register.email_placeholder') || undefined}
                                                autoComplete="email"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                            {t('auth.register.password')}
                                        </label>
                                        <div className="group relative">
                                            <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                name="password"
                                                value={formData.password}
                                                onChange={handleChange}
                                                className={`${inputClass} pl-11 pr-12`}
                                                placeholder={t('auth.register.password_placeholder') || undefined}
                                                autoComplete="new-password"
                                                aria-describedby="register-password-hint"
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
                                        <p id="register-password-hint" className={`mt-2 text-xs leading-5 ${subtleTextClass}`}>
                                            {t('auth.register.password_hint')}
                                        </p>
                                    </div>

                                    <div>
                                        <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                                            {t('auth.register.password_confirm')}
                                        </label>
                                        <div className="group relative">
                                            <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition ${isCustomBrand ? 'group-focus-within:text-[var(--hi-accent)]' : 'group-focus-within:text-[#6f9978]'} ${iconMutedClass}`} />
                                            <input
                                                type="password"
                                                name="confirmPassword"
                                                value={formData.confirmPassword}
                                                onChange={handleChange}
                                                className={`${inputClass} pl-11`}
                                                placeholder={t('auth.register.password_confirm_placeholder') || undefined}
                                                autoComplete="new-password"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <label className={`app-premium-checkbox-container flex items-start gap-3 rounded-[var(--hi-radius-md)] border px-4 py-3 text-sm ${panelMutedClass} ${panelSurfaceClass} hover:border-[var(--hi-border-strong)] transition-all`}>
                                        <PremiumCheckbox
                                            checked={legalAccepted}
                                            onChange={(event) => {
                                                setError('');
                                                setLegalAccepted(event.target.checked);
                                            }}
                                            required
                                        />
                                        <span>
                                            <Trans
                                                t={legalT}
                                                i18nKey="legal.register_consent"
                                                components={{
                                                    1: <Link to="/terms-of-service" target="_blank" className={`font-medium underline transition ${isCustomBrand ? 'text-[var(--hi-accent)] hover:text-[var(--hi-secondary-strong)]' : 'text-[#6f9978] hover:text-[#8bb395]'}`} />,
                                                    2: <Link to="/privacy-policy" target="_blank" className={`font-medium underline transition ${isCustomBrand ? 'text-[var(--hi-accent)] hover:text-[var(--hi-secondary-strong)]' : 'text-[#6f9978] hover:text-[#8bb395]'}`} />
                                                }}
                                            />
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className={`btn-primary !h-14 !w-full !rounded-[var(--hi-radius-md)] !px-5 text-base ${isCustomBrand ? '!shadow-[0_18px_36px_rgba(8,44,110,0.24)]' : '!shadow-[0_18px_36px_rgba(111,153,120,0.24)]'} disabled:opacity-60`}
                                    >
                                        {loading ? t('auth.register.submitting') : (mode === 'create' ? t('auth.register.submit_create') : t('auth.register.submit_join'))}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </button>
                                </form>

                                <div className={`mt-8 border-t pt-5 ${dividerClass}`}>
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <p className={`text-sm ${panelMutedClass}`}>
                                            {t('auth.register.already_have_account')}{' '}
                                            <Link to="/login" className={`font-semibold transition ${isCustomBrand ? 'text-[var(--hi-accent)] hover:text-[var(--hi-secondary-strong)]' : 'text-[#6f9978] hover:text-[#8bb395]'}`}>
                                                {t('auth.register.login_link')}
                                            </Link>
                                        </p>

                                        <a href={SUPPORT_CONTACT_URL} target="_blank" rel="noreferrer" className={`text-xs font-medium transition ${footerLinkClass}`}>
                                            {supportLabel}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showKeyModal && (
                <HouseKeyModal
                    houseKey={generatedKey}
                    title={t('auth.register.modals.key_created.title') || undefined}
                    subtitle={t('auth.register.modals.key_created.subtitle') || undefined}
                    warning={t('auth.register.modals.key_created.warning') || undefined}
                    confirmLabel={t('auth.register.modals.key_created.button') || undefined}
                    onConfirm={handleCloseModal}
                />
            )}

            {showRecoveryKeyModal && (
                <RecoveryKeyModal
                    recoveryKey={generatedRecoveryKey}
                    title={t('auth.recovery_key_modal.register_title') || undefined}
                    subtitle={t('auth.recovery_key_modal.subtitle') || undefined}
                    warning={t('auth.recovery_key_modal.warning') || undefined}
                    confirmLabel={t('auth.recovery_key_modal.confirm') || undefined}
                    onConfirm={handleRecoveryKeyConfirm}
                />
            )}

            {showEmailVerificationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
                        <div className="mb-6 text-center">
                            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                                <Mail className="h-8 w-8 text-white" />
                            </div>
                            <h3 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
                                {t('auth.register.modals.email_verification.title')}
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400">
                                {t('auth.register.modals.email_verification.message')}
                            </p>
                        </div>

                        <div className="mb-6 space-y-4">
                            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                                <span className="text-2xl">1️⃣</span>
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    <Trans i18nKey="auth.register.modals.email_verification.step_1" values={{ email: formData.email }} components={{ 1: <strong /> }} />
                                </p>
                            </div>

                            <div className={`flex items-start gap-3 rounded-xl border p-4 ${isCustomBrand ? 'border-[rgba(88,213,240,0.24)] bg-[rgba(88,213,240,0.10)] dark:border-[rgba(88,213,240,0.28)] dark:bg-[rgba(88,213,240,0.12)]' : 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'}`}>
                                <span className="text-2xl">2️⃣</span>
                                <p className={`text-sm ${isCustomBrand ? 'text-[var(--hi-accent)] dark:text-[var(--hi-accent)]' : 'text-green-700 dark:text-green-300'}`}>
                                    <Trans i18nKey="auth.register.modals.email_verification.step_2" components={{ 1: <strong /> }} />
                                </p>
                            </div>

                            <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-500/30 dark:bg-purple-500/10">
                                <span className="text-2xl">3️⃣</span>
                                <p className="text-sm text-purple-700 dark:text-purple-300">
                                    <Trans i18nKey="auth.register.modals.email_verification.step_3" components={{ 1: <strong /> }} />
                                </p>
                            </div>
                        </div>

                        {generatedKey && (
                            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                <div className="text-sm text-amber-700 dark:text-amber-300">
                                    {t('auth.register.modals.email_verification.key_note')}
                                </div>
                            </div>
                        )}

                        <div className="mb-4 text-center text-xs text-slate-500 dark:text-slate-400">
                            {t('auth.register.modals.email_verification.spam_note')}
                        </div>

                        <button type="button" onClick={handleEmailVerificationModalClose} className="btn-primary w-full py-3">
                            {t('auth.register.modals.email_verification.button')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
