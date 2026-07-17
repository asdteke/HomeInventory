import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import axios from 'axios';
import { Sun, Moon, Home, Users, Key, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';
import RecoveryKeyModal from './RecoveryKeyModal';
import LanguageSwitcher from './LanguageSwitcher';
import SegmentedToggle from './SegmentedToggle';
import '../auth-onboarding-v25.css';

export default function GoogleHouseSelect() {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [houseKey, setHouseKey] = useState('');
    const [houseName, setHouseName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
    const { refreshUser } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('/api/auth/google-complete', {
                mode,
                house_key: mode === 'join' ? houseKey : undefined,
                house_name: houseName || undefined
            });

            await refreshUser();

            if (response.data.newRecoveryKey) {
                setGeneratedRecoveryKey(response.data.newRecoveryKey);
                return;
            }

            navigate('/');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || t('common.error') || 'İşlem sırasında hata oluştu');
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

                <section className="auth-flow-card-v25" aria-labelledby="google-house-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25"><Home className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{t('google_house_select.welcome_options')}</p>
                            <h1 id="google-house-title" className="auth-flow-title-v25">{t('google_house_select.title')}</h1>
                            <p className="auth-flow-subtitle-v25">{t('google_house_select.subtitle')}</p>
                            <div className="auth-flow-status-v25 mt-4">
                                <ShieldCheck className="h-4 w-4" />
                                <span>{mode === 'create' ? t('google_house_select.create.desc') : t('google_house_select.join.desc')}</span>
                            </div>
                        </header>

                        {error && (
                            <div className="auth-flow-feedback-v25 is-error" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="auth-flow-form-v25">
                            <div className="auth-flow-field-v25">
                                <label className="auth-flow-label-v25">
                                    {t('google_house_select.welcome_options')}
                                </label>
                                <SegmentedToggle
                                    options={[
                                        { value: 'create', label: t('google_house_select.create.title'), icon: Home },
                                        { value: 'join', label: t('google_house_select.join.title'), icon: Users }
                                    ]}
                                    value={mode}
                                    onChange={(value) => {
                                        setMode(value as 'create' | 'join');
                                        setError('');
                                    }}
                                    ariaLabel={t('google_house_select.welcome_options')}
                                    className="auth-flow-segment-v25"
                                    fullWidth
                                    sliding
                                />
                            </div>

                            {mode === 'create' && (
                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        <Home className="h-4 w-4" />
                                        {t('google_house_select.house_name')}
                                    </label>
                                    <input
                                        type="text"
                                        value={houseName}
                                        onChange={(e) => setHouseName(e.target.value)}
                                        className="auth-flow-input-v25"
                                        placeholder={t('google_house_select.house_name_placeholder')}
                                        autoComplete="organization"
                                    />
                                    <p className="auth-flow-hint-v25">
                                        {t('google_house_select.house_name_hint')}
                                    </p>
                                </div>
                            )}

                            {mode === 'join' && (
                                <>
                                    <div className="auth-flow-field-v25">
                                        <label className="auth-flow-label-v25">
                                            <Key className="h-4 w-4" />
                                            {t('google_house_select.house_key')}
                                        </label>
                                        <input
                                            type="text"
                                            value={houseKey}
                                            onChange={(e) => setHouseKey(e.target.value)}
                                            className="auth-flow-input-v25 font-mono"
                                            placeholder={t('google_house_select.house_key_placeholder')}
                                            autoComplete="off"
                                            spellCheck={false}
                                            required
                                        />
                                        <p className="auth-flow-hint-v25">
                                            {t('google_house_select.house_key_hint')}
                                        </p>
                                    </div>
                                    <div className="auth-flow-field-v25">
                                        <label className="auth-flow-label-v25">
                                            <Home className="h-4 w-4" />
                                            {t('google_house_select.house_name_join')}
                                        </label>
                                        <input
                                            type="text"
                                            value={houseName}
                                            onChange={(e) => setHouseName(e.target.value)}
                                            className="auth-flow-input-v25"
                                            placeholder={t('google_house_select.house_name_placeholder')}
                                            autoComplete="organization"
                                        />
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                disabled={loading || (mode === 'join' && !houseKey)}
                                className="auth-flow-primary-v25 w-full"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                {loading ? t('google_house_select.processing') : (mode === 'create' ? t('google_house_select.submit_create') : t('google_house_select.submit_join'))}
                            </button>
                        </form>
                    </div>
                </section>
            </main>

            {generatedRecoveryKey && (
                <RecoveryKeyModal
                    recoveryKey={generatedRecoveryKey}
                    title={t('auth.recovery_key_modal.google_title')}
                    subtitle={t('auth.recovery_key_modal.subtitle')}
                    warning={t('auth.recovery_key_modal.warning')}
                    confirmLabel={t('auth.recovery_key_modal.confirm')}
                    onConfirm={() => navigate('/')}
                />
            )}
        </div>
    );
}
