import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, AlertCircle, Loader2 } from 'lucide-react';
import BrandLogo from './BrandLogo';
import RecoveryKeyModal from './RecoveryKeyModal';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';

export default function ForgotPassword() {
    const { t } = useTranslation();
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

    const handleRequestReset = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');
        setRequestLoading(true);

        try {
            const response = await axios.post('/api/auth/forgot-password', { identifier });
            setMode(response.data.mode);
            setMessage(response.data.message);
        } catch (requestError) {
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setRequestLoading(false);
        }
    };

    const handleRecoveryReset = async (event) => {
        event.preventDefault();
        setError('');

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
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setResetLoading(false);
        }
    };

    const recoveryModeActive = mode === 'recovery_key';

    return (
        <div className="min-h-screen bg-slate-50 p-4 transition-colors duration-300 dark:bg-slate-950">
            <button
                onClick={toggleTheme}
                className="absolute right-4 top-4 rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition-all hover:scale-110 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
                <div className="w-full">
                    <div className="mb-8 text-center">
                        <Link to="/">
                            <BrandLogo variant="full" size="md" className="mx-auto mb-4 w-auto max-h-[76px]" />
                        </Link>
                        <h1 className="mb-2 text-3xl font-bold gradient-text">{t('auth.forgot_password.title')}</h1>
                        <p className="text-slate-500 dark:text-slate-400">{t('auth.forgot_password.subtitle')}</p>
                    </div>

                    <div className="card">
                        {error && (
                            <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {message && (
                            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                                {message}
                            </div>
                        )}

                        {!mode && (
                            <form onSubmit={handleRequestReset} className="space-y-5">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={(event) => setIdentifier(event.target.value)}
                                        className="input-field"
                                        placeholder={t('auth.forgot_password.identifier_placeholder')}
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={requestLoading} className="btn-primary w-full py-3">
                                    {requestLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            {t('auth.forgot_password.requesting')}
                                        </span>
                                    ) : (
                                        t('auth.forgot_password.submit')
                                    )}
                                </button>
                            </form>
                        )}

                        {mode === 'email' && (
                            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                                <p>{t('auth.forgot_password.email_success')}</p>
                                <Link to="/login" className="btn-primary block w-full py-3 text-center">
                                    {t('auth.forgot_password.back_to_login')}
                                </Link>
                            </div>
                        )}

                        {recoveryModeActive && (
                            <form onSubmit={handleRecoveryReset} className="space-y-5">
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                    {t('auth.forgot_password.recovery_mode_info')}
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('auth.forgot_password.identifier')}
                                    </label>
                                    <input type="text" value={identifier} className="input-field bg-slate-100 dark:bg-slate-800" disabled />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('auth.forgot_password.recovery_key')}
                                    </label>
                                    <input
                                        type="text"
                                        value={recoveryKey}
                                        onChange={(event) => setRecoveryKey(event.target.value)}
                                        className="input-field font-mono"
                                        placeholder={t('auth.forgot_password.recovery_key_placeholder')}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('auth.forgot_password.new_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        className="input-field"
                                        placeholder={t('auth.forgot_password.new_password_placeholder')}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('auth.forgot_password.confirm_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        className="input-field"
                                        placeholder={t('auth.forgot_password.confirm_password_placeholder')}
                                        required
                                    />
                                </div>

                                <button type="submit" disabled={resetLoading} className="btn-primary w-full py-3">
                                    {resetLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            {t('auth.forgot_password.resetting')}
                                        </span>
                                    ) : (
                                        t('auth.forgot_password.reset_submit')
                                    )}
                                </button>
                            </form>
                        )}

                        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            <Link to="/login" className="text-primary-500 hover:text-primary-600">
                                {t('auth.forgot_password.back_to_login')}
                            </Link>
                        </div>
                    </div>
                </div>
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
