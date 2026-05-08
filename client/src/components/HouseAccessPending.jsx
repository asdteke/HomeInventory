import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Home, Loader2, LogOut, Plus, Send, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './BrandLogo';

export default function HouseAccessPending() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, membershipState, pendingHouseRequest, refreshUser, logout } = useAuth();
    const [joinHouseKey, setJoinHouseKey] = useState('');
    const [newHouseName, setNewHouseName] = useState('');
    const [loadingAction, setLoadingAction] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleCreateHouse = async (event) => {
        event.preventDefault();
        setLoadingAction('create');
        setError('');
        setMessage('');

        try {
            await axios.post('/api/houses', { name: newHouseName });
            await refreshUser();
            navigate('/');
        } catch (requestError) {
            setError(requestError.response?.data?.error || t('house_access_pending.messages.create_error'));
        } finally {
            setLoadingAction('');
        }
    };

    const handleJoinRequest = async (event) => {
        event.preventDefault();
        setLoadingAction('join');
        setError('');
        setMessage('');

        try {
            const response = await axios.post('/api/houses/join', { key: joinHouseKey });
            setMessage(response.data.message || t('house_access_pending.messages.join_success'));
            setJoinHouseKey('');
            await refreshUser();
        } catch (requestError) {
            setError(requestError.response?.data?.error || t('house_access_pending.messages.join_error'));
        } finally {
            setLoadingAction('');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/', { replace: true });
    };

    const pendingTitle = membershipState === 'pending_approval'
        ? t('house_access_pending.pending.title')
        : t('house_access_pending.no_house.title');
    const pendingDescription = membershipState === 'pending_approval'
        ? t('house_access_pending.pending.description', { house: pendingHouseRequest?.requested_house_name || t('house_access_pending.fallback_house') })
        : t('house_access_pending.no_house.description');

    return (
        <div className="premium-shell min-h-screen bg-[var(--hi-bg)] px-4 py-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 text-center">
                    <BrandLogo variant="full" size="md" className="mx-auto mb-6 w-auto max-h-[76px]" />
                    <p className="app-kicker">{t('house_access_pending.eyebrow')}</p>
                    <h1 className="section-title mt-3 text-3xl text-[var(--hi-text)]">{pendingTitle}</h1>
                    <p className="mx-auto mt-3 max-w-2xl text-[var(--hi-text-soft)]">{pendingDescription}</p>
                    {user?.username && (
                        <p className="mt-4 text-sm text-[var(--hi-text-muted)]">
                            {t('house_access_pending.signed_in_as', { username: user.username })}
                        </p>
                    )}
                </div>

                {message && (
                    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                        {message}
                    </div>
                )}

                {error && (
                    <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                    <section className="card">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                <Plus className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('house_access_pending.create.title')}</h2>
                                <p className="text-sm text-[var(--hi-text-soft)]">{t('house_access_pending.create.description')}</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreateHouse} className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                    <Home className="mr-1 inline h-4 w-4" />
                                    {t('house_access_pending.create.name_label')}
                                </label>
                                <input
                                    type="text"
                                    value={newHouseName}
                                    onChange={(event) => setNewHouseName(event.target.value)}
                                    className="input-field"
                                    placeholder={t('house_access_pending.create.name_placeholder')}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loadingAction === 'create'}
                                className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
                            >
                                {loadingAction === 'create' && <Loader2 className="h-5 w-5 animate-spin" />}
                                {loadingAction === 'create' ? t('house_access_pending.create.submitting') : t('house_access_pending.create.submit')}
                            </button>
                        </form>
                    </section>

                    <section className="card">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--hi-panel-muted)] text-[var(--hi-accent)]">
                                <Users className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('house_access_pending.join.title')}</h2>
                                <p className="text-sm text-[var(--hi-text-soft)]">{t('house_access_pending.join.description')}</p>
                            </div>
                        </div>

                        <form onSubmit={handleJoinRequest} className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                    {t('house_access_pending.join.key_label')}
                                </label>
                                <input
                                    type="text"
                                    value={joinHouseKey}
                                    onChange={(event) => setJoinHouseKey(event.target.value)}
                                    className="input-field font-mono text-sm"
                                    placeholder={t('house_access_pending.join.key_placeholder')}
                                    required
                                />
                            </div>

                            {pendingHouseRequest && membershipState === 'pending_approval' && (
                                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                                    {t('house_access_pending.pending.current_request', {
                                        house: pendingHouseRequest.requested_house_name || t('house_access_pending.fallback_house')
                                    })}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loadingAction === 'join' || !joinHouseKey.trim()}
                                className="btn-secondary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
                            >
                                {loadingAction === 'join' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
                                {loadingAction === 'join' ? t('house_access_pending.join.submitting') : t('house_access_pending.join.submit')}
                            </button>
                        </form>
                    </section>
                </div>

                <div className="mt-8 flex justify-center">
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--hi-border)] px-4 py-3 text-[var(--hi-text-soft)] transition-colors hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                    >
                        <LogOut className="h-4 w-4" />
                        {t('house_access_pending.logout')}
                    </button>
                </div>
            </div>
        </div>
    );
}
