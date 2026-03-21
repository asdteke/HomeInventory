import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import RecoveryKeyModal from './RecoveryKeyModal';

export default function RecoveryKeySetup() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');

    const handleSetup = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await axios.post('/api/auth/recovery-key/setup');
            setRecoveryKey(response.data.recoveryKey);
        } catch (requestError) {
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
        <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        <ShieldAlert className="h-8 w-8" />
                    </div>
                    <h1 className="mb-3 text-3xl font-bold text-slate-900 dark:text-white">{t('auth.recovery_setup.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('auth.recovery_setup.subtitle')}</p>
                </div>

                <div className="card">
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        <p>{t('auth.recovery_setup.warning')}</p>
                    </div>

                    <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                        <p>{t('auth.recovery_setup.account', { username: user?.username || '-' })}</p>
                        <p>{t('auth.recovery_setup.description')}</p>
                    </div>

                    {error && (
                        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleSetup}
                        disabled={loading}
                        className="btn-primary mt-6 w-full py-3"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                {t('auth.recovery_setup.generating')}
                            </span>
                        ) : (
                            t('auth.recovery_setup.submit')
                        )}
                    </button>
                </div>
            </div>

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
