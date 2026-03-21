import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Eye, EyeOff, Home, Users, Key, Copy, Check, AlertTriangle, Mail } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import BrandLogo from './BrandLogo';
import RecoveryKeyModal from './RecoveryKeyModal';
import { copyTextToClipboard } from '../utils/clipboard';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';

export default function Register() {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        house_key: ''
    });
    const [mode, setMode] = useState('create'); // 'create' = new house, 'join' = existing house
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showKeyModal, setShowKeyModal] = useState(false);
    const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
    const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
    const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
    const [generatedKey, setGeneratedKey] = useState('');
    const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
    const [showHouseKeyAfterRecovery, setShowHouseKeyAfterRecovery] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);
    const { register, refreshUser } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const copyKey = async () => {
        try {
            await copyTextToClipboard(generatedKey);
            setKeyCopied(true);
            setTimeout(() => setKeyCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError(t('auth.register.passwords_mismatch'));
            return;
        }
        const passwordValidation = validatePasswordStrengthClient(formData.password, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error);
            return;
        }
        if (mode === 'join' && !formData.house_key) {
            setError(t('auth.register.key_required'));
            return;
        }

        setLoading(true);
        try {
            const result = await register(
                formData.username,
                formData.email,
                formData.password,
                mode,
                mode === 'join' ? formData.house_key : null
            );

            // If email verification is required, show the verification modal
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
        } catch (err) {
            setError(err.response?.data?.error || t('common.error'));
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
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <button onClick={toggleTheme} className="absolute top-4 right-4 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:scale-110 transition-all shadow-sm">
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="w-full max-w-md">
                <div className="text-center mb-8 animate-fade-in">
                    <Link to="/">
                        <BrandLogo variant="full" size="md" className="mx-auto w-auto mb-4 max-h-[76px]" />
                    </Link>
                    <h1 className="text-3xl font-bold gradient-text mb-2">{t('auth.register.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('auth.register.subtitle')}</p>
                </div>

                <div className="card animate-slide-up">
                    {/* Mode Selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                        <button
                            type="button"
                            onClick={() => setMode('create')}
                            className={`w-full min-w-0 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${mode === 'create'
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                                }`}
                        >
                            <Home className="w-5 h-5" />
                            <span className="font-medium text-center">{t('auth.register.create_house')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('join')}
                            className={`w-full min-w-0 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${mode === 'join'
                                ? 'border-green-500 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                                }`}
                        >
                            <Users className="w-5 h-5" />
                            <span className="font-medium text-center">{t('auth.register.join_house')}</span>
                        </button>
                    </div>

                    {/* Mode Description */}
                    <div className={`mb-6 p-3 rounded-xl text-sm ${mode === 'create'
                        ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-500/30'
                        : 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30'
                        }`}>
                        {mode === 'create' ? (
                            <p>
                                <Trans i18nKey="auth.register.create_house_desc" components={{ strong: <strong /> }} />
                            </p>
                        ) : (
                            <p>
                                <Trans i18nKey="auth.register.join_house_desc" components={{ strong: <strong /> }} />
                            </p>
                        )}
                    </div>

                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">{t('auth.register.form_title')}</h2>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.register.username')}</label>
                            <input
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                className="input-field"
                                placeholder={t('auth.register.username_placeholder')}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.register.email')}</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="input-field"
                                placeholder={t('auth.register.email_placeholder')}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.register.password')}</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="input-field pr-12"
                                    placeholder={t('auth.register.password_placeholder')}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.register.password_confirm')}</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className="input-field"
                                placeholder={t('auth.register.password_confirm_placeholder')}
                                required
                            />
                        </div>

                        {/* House Key Input - Only for Join Mode */}
                        {mode === 'join' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <Key className="w-4 h-4 inline mr-1" />
                                    {t('auth.register.house_key')}
                                </label>
                                <input
                                    type="text"
                                    name="house_key"
                                    value={formData.house_key}
                                    onChange={handleChange}
                                    className="input-field font-mono text-sm"
                                    placeholder={t('auth.register.house_key_placeholder')}
                                    required={mode === 'join'}
                                />
                            </div>
                        )}

                        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-lg disabled:opacity-50">
                            {loading ? t('auth.register.submitting') : (mode === 'create' ? t('auth.register.submit_create') : t('auth.register.submit_join'))}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-slate-500 dark:text-slate-400">
                            {t('auth.register.already_have_account')} <Link to="/login" className="text-primary-500 hover:text-primary-600 font-medium">{t('auth.register.login_link')}</Link>
                        </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-center space-y-2">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            {t('auth.register.support')} <a href="mailto:support@homeinventory.local" className="text-primary-500 hover:underline">support@homeinventory.local</a>
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowDisclaimerModal(true)}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                        >
                            {t('auth.register.terms')}
                        </button>
                    </div>
                </div>
            </div>

            {/* House Key Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-slide-up">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg mb-4">
                                <Key className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('auth.register.modals.key_created.title')}
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400">
                                {t('auth.register.modals.key_created.subtitle')}
                            </p>
                        </div>

                        {/* Warning */}
                        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl mb-6">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-700 dark:text-amber-300">
                                {t('auth.register.modals.key_created.warning')}
                            </div>
                        </div>

                        {/* Key Display */}
                        <div className="relative mb-6">
                            <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-xl font-mono text-sm break-all select-all text-slate-800 dark:text-slate-200">
                                {generatedKey}
                            </div>
                            <button
                                onClick={copyKey}
                                className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-600 rounded-lg shadow hover:scale-105 transition-transform"
                                title={t('auth.register.modals.key_created.copy')}
                            >
                                {keyCopied ? (
                                    <Check className="w-5 h-5 text-green-500" />
                                ) : (
                                    <Copy className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                                )}
                            </button>
                        </div>

                        <button
                            onClick={handleCloseModal}
                            className="btn-primary w-full py-3"
                        >
                            {t('auth.register.modals.key_created.button')}
                        </button>
                    </div>
                </div>
            )}

            {showRecoveryKeyModal && (
                <RecoveryKeyModal
                    recoveryKey={generatedRecoveryKey}
                    title={t('auth.recovery_key_modal.register_title')}
                    subtitle={t('auth.recovery_key_modal.subtitle')}
                    warning={t('auth.recovery_key_modal.warning')}
                    confirmLabel={t('auth.recovery_key_modal.confirm')}
                    onConfirm={handleRecoveryKeyConfirm}
                />
            )}

            {/* Disclaimer Modal */}
            {showDisclaimerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                                <AlertTriangle className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('auth.login.terms_title')}
                            </h3>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                                <div className="flex items-start gap-3">
                                    <span className="text-amber-500 font-bold">1.</span>
                                    <p className="text-sm text-amber-800 dark:text-amber-200">
                                        {t('auth.login.terms_beta')}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                                <div className="flex items-start gap-3">
                                    <span className="text-amber-500 font-bold">2.</span>
                                    <p className="text-sm text-amber-800 dark:text-amber-200">
                                        {t('auth.login.terms_disclaimer')}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50">
                                <p className="text-sm text-red-800 dark:text-red-200 text-center">
                                    {t('auth.login.terms_backup')}
                                </p>
                            </div>
                        </div>

                        <div className="text-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                            {t('auth.register.support')} <a href="mailto:support@homeinventory.local" className="text-primary-500 hover:underline">support@homeinventory.local</a>
                        </div>

                        <button
                            onClick={() => setShowDisclaimerModal(false)}
                            className="btn-primary w-full py-3"
                        >
                            {t('common.close') || 'Kapat'}
                        </button>
                    </div>
                </div>
            )}

            {/* Email Verification Required Modal */}
            {showEmailVerificationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-slide-up">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg mb-4">
                                <Mail className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('auth.register.modals.email_verification.title')}
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400">
                                {t('auth.register.modals.email_verification.message')}
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl">
                                <span className="text-2xl">1️⃣</span>
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    <Trans
                                        i18nKey="auth.register.modals.email_verification.step_1"
                                        values={{ email: formData.email }}
                                        components={{ 1: <strong /> }}
                                    />
                                </p>
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl">
                                <span className="text-2xl">2️⃣</span>
                                <p className="text-sm text-green-700 dark:text-green-300">
                                    <Trans
                                        i18nKey="auth.register.modals.email_verification.step_2"
                                        components={{ 1: <strong /> }}
                                    />
                                </p>
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl">
                                <span className="text-2xl">3️⃣</span>
                                <p className="text-sm text-purple-700 dark:text-purple-300">
                                    <Trans
                                        i18nKey="auth.register.modals.email_verification.step_3"
                                        components={{ 1: <strong /> }}
                                    />
                                </p>
                            </div>
                        </div>

                        {/* Show house key if new house was created */}
                        {generatedKey && (
                            <div className="mb-6">
                                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl mb-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-700 dark:text-amber-300">
                                        {t('auth.register.modals.email_verification.key_note')}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="text-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                            {t('auth.register.modals.email_verification.spam_note')}
                        </div>

                        <button
                            onClick={handleEmailVerificationModalClose}
                            className="btn-primary w-full py-3"
                        >
                            {t('auth.register.modals.email_verification.button')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
