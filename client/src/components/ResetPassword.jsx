import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, AlertCircle, Loader2 } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';

export default function ResetPassword() {
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [searchParams] = useSearchParams();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const token = searchParams.get('token') || '';

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword !== confirmPassword) {
            setError(t('auth.register.passwords_mismatch'));
            return;
        }

        const passwordValidation = validatePasswordStrengthClient(newPassword, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error);
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
        } catch (requestError) {
            setError(requestError.response?.data?.error || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

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
                        <h1 className="mb-2 text-3xl font-bold gradient-text">{t('auth.reset_password.title')}</h1>
                        <p className="text-slate-500 dark:text-slate-400">{t('auth.reset_password.subtitle')}</p>
                    </div>

                    <div className="card">
                        {!token && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {t('auth.reset_password.missing_token')}
                            </div>
                        )}

                        {error && (
                            <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                                {success}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t('auth.reset_password.new_password')}
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    className="input-field"
                                    placeholder={t('auth.reset_password.new_password_placeholder')}
                                    disabled={!token || Boolean(success)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t('auth.reset_password.confirm_password')}
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="input-field"
                                    placeholder={t('auth.reset_password.confirm_password_placeholder')}
                                    disabled={!token || Boolean(success)}
                                    required
                                />
                            </div>

                            <button type="submit" disabled={!token || loading || Boolean(success)} className="btn-primary w-full py-3">
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        {t('auth.reset_password.submitting')}
                                    </span>
                                ) : (
                                    t('auth.reset_password.submit')
                                )}
                            </button>
                        </form>

                        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            <Link to="/login" className="text-primary-500 hover:text-primary-600">
                                {t('auth.reset_password.back_to_login')}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
