import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Home, KeyRound, Loader2, LogOut, Plus, Send, Sun, Moon, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import SegmentedToggle from './SegmentedToggle';
import '../auth-onboarding-v25.css';

export default function HouseAccessPending() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, membershipState, pendingHouseRequest, refreshUser, logout } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [mode, setMode] = useState<'create' | 'join'>(membershipState === 'pending_approval' ? 'join' : 'create');
    const [joinHouseKey, setJoinHouseKey] = useState('');
    const [newHouseName, setNewHouseName] = useState('');
    const [loadingAction, setLoadingAction] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleCreateHouse = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoadingAction('create');
        setError('');
        setMessage('');

        try {
            await axios.post('/api/houses', { name: newHouseName });
            await refreshUser();
            navigate('/');
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || t('house_access_pending.messages.create_error'));
        } finally {
            setLoadingAction('');
        }
    };

    const handleJoinRequest = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoadingAction('join');
        setError('');
        setMessage('');

        try {
            const response = await axios.post('/api/houses/join', { key: joinHouseKey });
            setMessage(response.data.message || t('house_access_pending.messages.join_success'));
            setJoinHouseKey('');
            await refreshUser();
        } catch (requestError: any) {
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
        <div className="auth-flow-page-v25">
            <main className="auth-flow-shell-v25 is-wide flex min-h-[100svh] flex-col justify-center">
                <div className="auth-flow-topbar-v25">
                    <span className="auth-flow-brand-v25">
                        <BrandLogo variant="full" size="md" />
                    </span>
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

                <section className="auth-flow-card-v25" aria-labelledby="house-access-title">
                    <div className="auth-flow-card-body-v25">
                        <header className="auth-flow-hero-v25">
                            <span className="auth-flow-icon-v25"><Home className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{t('house_access_pending.eyebrow')}</p>
                            <h1 id="house-access-title" className="auth-flow-title-v25">{pendingTitle}</h1>
                            <p className="auth-flow-subtitle-v25">{pendingDescription}</p>
                            {user?.username && (
                                <div className="auth-flow-status-v25 mt-4">
                                    <Users className="h-4 w-4" />
                                    <span>{t('house_access_pending.signed_in_as', { username: user.username })}</span>
                                </div>
                            )}
                        </header>

                        {message && (
                            <div className="auth-flow-feedback-v25 is-success" role="status">
                                <Send className="h-4 w-4" />
                                <span>{message}</span>
                            </div>
                        )}

                        {error && (
                            <div className="auth-flow-feedback-v25 is-error" role="alert">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="auth-flow-field-v25 mb-6">
                            <label className="auth-flow-label-v25">
                                {t('house_access_pending.eyebrow')}
                            </label>
                            <SegmentedToggle
                                options={[
                                    { value: 'create', label: t('house_access_pending.create.title'), icon: Plus },
                                    { value: 'join', label: t('house_access_pending.join.title'), icon: Users }
                                ]}
                                value={mode}
                                onChange={(value) => {
                                    setMode(value as 'create' | 'join');
                                    setError('');
                                    setMessage('');
                                }}
                                ariaLabel={t('house_access_pending.eyebrow')}
                                className="auth-flow-segment-v25"
                                fullWidth
                                sliding
                            />
                        </div>

                        {mode === 'create' ? (
                            <form onSubmit={handleCreateHouse} className="auth-flow-form-v25">
                                <div className="auth-flow-section-head-v25">
                                    <span className="auth-flow-section-icon-v25"><Plus className="h-5 w-5" /></span>
                                    <div>
                                        <h2>{t('house_access_pending.create.title')}</h2>
                                        <p>{t('house_access_pending.create.description')}</p>
                                    </div>
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        <Home className="h-4 w-4" />
                                        {t('house_access_pending.create.name_label')}
                                    </label>
                                    <input
                                        type="text"
                                        value={newHouseName}
                                        onChange={(event) => setNewHouseName(event.target.value)}
                                        className="auth-flow-input-v25"
                                        placeholder={t('house_access_pending.create.name_placeholder')}
                                        autoComplete="organization"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loadingAction === 'create'}
                                    className="auth-flow-primary-v25 w-full"
                                >
                                    {loadingAction === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {loadingAction === 'create' ? t('house_access_pending.create.submitting') : t('house_access_pending.create.submit')}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleJoinRequest} className="auth-flow-form-v25">
                                <div className="auth-flow-section-head-v25">
                                    <span className="auth-flow-section-icon-v25"><KeyRound className="h-5 w-5" /></span>
                                    <div>
                                        <h2>{t('house_access_pending.join.title')}</h2>
                                        <p>{t('house_access_pending.join.description')}</p>
                                    </div>
                                </div>

                                <div className="auth-flow-field-v25">
                                    <label className="auth-flow-label-v25">
                                        <KeyRound className="h-4 w-4" />
                                        {t('house_access_pending.join.key_label')}
                                    </label>
                                    <input
                                        type="text"
                                        value={joinHouseKey}
                                        onChange={(event) => setJoinHouseKey(event.target.value)}
                                        className="auth-flow-input-v25 font-mono text-sm"
                                        placeholder={t('house_access_pending.join.key_placeholder')}
                                        autoComplete="off"
                                        spellCheck={false}
                                        required
                                    />
                                </div>

                                {pendingHouseRequest && membershipState === 'pending_approval' && (
                                    <div className="auth-flow-notice-v25">
                                        {t('house_access_pending.pending.current_request', {
                                            house: pendingHouseRequest.requested_house_name || t('house_access_pending.fallback_house')
                                        })}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loadingAction === 'join' || !joinHouseKey.trim()}
                                    className="auth-flow-primary-v25 w-full"
                                >
                                    {loadingAction === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {loadingAction === 'join' ? t('house_access_pending.join.submitting') : t('house_access_pending.join.submit')}
                                </button>
                            </form>
                        )}
                    </div>
                    <footer className="auth-flow-footer-v25">
                        <button type="button" onClick={handleLogout} className="auth-flow-link-v25 inline-flex items-center gap-2">
                            <LogOut className="h-4 w-4" />
                            {t('house_access_pending.logout')}
                        </button>
                    </footer>
                </section>
            </main>
        </div>
    );
}
