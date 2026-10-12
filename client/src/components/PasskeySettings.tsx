import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
    PasskeyListResponse,
    PasskeySummary,
    addPasskey,
    isPasskeyCancellation,
    listPasskeys,
    removePasskey,
    renamePasskey
} from '../utils/passkeys';

interface PasskeySettingsProps {
    totpEnabled: boolean;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

type PendingAction = { type: 'add' } | { type: 'remove'; passkey: PasskeySummary };

const MODAL_CLOSE_BUTTON_CLASS = 'rounded-xl p-2 text-(--hi-text-soft) transition hover:bg-(--hi-panel-muted) hover:text-(--hi-text) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--hi-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hi-panel-strong)';

function defaultPasskeyName() {
    const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    if (/iPhone/i.test(agent)) return 'iPhone';
    if (/iPad/i.test(agent)) return 'iPad';
    if (/Android/i.test(agent)) return 'Android';
    if (/Macintosh|Mac OS X/i.test(agent)) return 'Mac';
    if (/Windows/i.test(agent)) return 'Windows';
    if (/Linux/i.test(agent)) return 'Linux';
    return 'Passkey';
}

export default function PasskeySettings({ totpEnabled, onSuccess, onError }: PasskeySettingsProps) {
    const { t, i18n } = useTranslation();
    const [state, setState] = useState<PasskeyListResponse | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [name, setName] = useState('');
    const [dialogError, setDialogError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const load = useCallback(async () => {
        try {
            setState(await listPasskeys());
        } catch {
            setState(null);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (!state || !state.enabled) {
        return null;
    }

    const formatDate = (value: string | null) => {
        if (!value) return null;
        const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleDateString(i18n.resolvedLanguage || i18n.language, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const openDialog = (action: PendingAction) => {
        setPendingAction(action);
        setPassword('');
        setTotpCode('');
        setDialogError('');
        setName(action.type === 'add' ? defaultPasskeyName() : '');
    };

    const closeDialog = () => {
        if (!submitting) setPendingAction(null);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!pendingAction) return;
        setSubmitting(true);
        setDialogError('');
        const reauthentication = { password, ...(totpEnabled ? { totpCode } : {}) };

        try {
            if (pendingAction.type === 'add') {
                const passkeys = await addPasskey(name, reauthentication);
                setState((current) => current && { ...current, passkeys });
                onSuccess(t('passkeys.added'));
            } else {
                const passkeys = await removePasskey(pendingAction.passkey.id, reauthentication);
                setState((current) => current && { ...current, passkeys });
                onSuccess(t('passkeys.removed'));
            }
            setPendingAction(null);
        } catch (err: any) {
            if (isPasskeyCancellation(err)) {
                setDialogError(t('passkeys.create_cancelled'));
            } else {
                setDialogError(err.response?.data?.error || t('passkeys.action_failed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRename = async (passkey: PasskeySummary) => {
        try {
            const passkeys = await renamePasskey(passkey.id, renameValue);
            setState((current) => current && { ...current, passkeys });
            setRenamingId(null);
        } catch (err: any) {
            onError(err.response?.data?.error || t('passkeys.action_failed'));
        }
    };

    const unavailableMessage = state.available ? null : t(`passkeys.unavailable.${state.reason || 'unknown_origin'}`, {
        defaultValue: t('passkeys.unavailable.unknown_origin')
    });

    return (
        <div className="settings-passkeys-card rounded-xl border border-(--hi-border) bg-(--hi-panel-strong) p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2.5 text-base font-semibold text-(--hi-text)">
                        <Fingerprint className="h-5.5 w-5.5 text-(--hi-accent)" />
                        {t('passkeys.title')}
                    </h3>
                    <p className="text-sm text-(--hi-text-soft) mt-2 leading-relaxed max-w-2xl">
                        {t('passkeys.description')}
                    </p>
                </div>
                {state.available && (
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={() => openDialog({ type: 'add' })}
                            className="btn-secondary py-2.5 px-5 text-sm font-semibold flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {t('passkeys.add')}
                        </button>
                    </div>
                )}
            </div>

            {unavailableMessage && (
                <p className="mt-4 rounded-xl border border-(--hi-border) bg-(--hi-panel-muted) px-4 py-3 text-sm text-(--hi-text-soft)">
                    {unavailableMessage}
                </p>
            )}

            {state.passkeys.length > 0 ? (
                <ul className="mt-6 space-y-3 border-t border-(--hi-border) pt-6">
                    {state.passkeys.map((passkey) => {
                        const createdAt = formatDate(passkey.createdAt);
                        const lastUsedAt = formatDate(passkey.lastUsedAt);
                        return (
                            <li key={passkey.id} className="flex flex-col gap-3 rounded-xl border border-(--hi-border) bg-(--hi-panel-muted) p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    {renamingId === passkey.id ? (
                                        <form
                                            className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                handleRename(passkey);
                                            }}
                                        >
                                            <input
                                                value={renameValue}
                                                onChange={(event) => setRenameValue(event.target.value)}
                                                maxLength={64}
                                                className="input-field min-w-0 flex-1 basis-48 py-2 text-sm"
                                                aria-label={t('passkeys.name_label')}
                                                autoFocus
                                            />
                                            <button type="submit" className="btn-secondary shrink-0 whitespace-nowrap px-4 py-2 text-xs font-semibold">{t('common.save')}</button>
                                            <button type="button" onClick={() => setRenamingId(null)} className="shrink-0 whitespace-nowrap px-3 py-2 text-xs text-(--hi-text-soft) hover:text-(--hi-text)">{t('common.cancel')}</button>
                                        </form>
                                    ) : (
                                        <p className="flex flex-wrap items-center gap-2 font-semibold text-sm text-(--hi-text)">
                                            {passkey.name}
                                            {passkey.backedUp && (
                                                <span className="app-meta-pill">{t('passkeys.synced')}</span>
                                            )}
                                            {!passkey.usableHere && (
                                                <span className="app-meta-pill app-meta-pill-warning">{t('passkeys.other_address', { address: passkey.rpId })}</span>
                                            )}
                                        </p>
                                    )}
                                    <p className="text-xs text-(--hi-text-soft) mt-1">
                                        {createdAt && t('passkeys.created_on', { date: createdAt })}
                                        {createdAt && ' · '}
                                        {lastUsedAt ? t('passkeys.last_used_on', { date: lastUsedAt }) : t('passkeys.never_used')}
                                    </p>
                                </div>
                                {renamingId !== passkey.id && (
                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRenamingId(passkey.id);
                                                setRenameValue(passkey.name);
                                            }}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-(--hi-text-soft) transition hover:bg-(--hi-panel-strong) hover:text-(--hi-text)"
                                            aria-label={t('passkeys.rename')}
                                            title={t('passkeys.rename')}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openDialog({ type: 'remove', passkey })}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-(--hi-text-soft) transition hover:bg-red-500/10 hover:text-red-500"
                                            aria-label={t('passkeys.remove')}
                                            title={t('passkeys.remove')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : state.available && (
                <p className="mt-4 text-sm text-(--hi-text-soft)">{t('passkeys.empty')}</p>
            )}

            {pendingAction && (
                <div
                    className="app-modal-backdrop house-action-backdrop fixed inset-0 z-80 flex items-center justify-center p-4 animate-fade-in"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDialog();
                    }}
                >
                    <div role="dialog" aria-modal="true" className="house-action-dialog w-full max-w-md overflow-hidden">
                        <div className="house-action-dialog-header flex items-center justify-between gap-4">
                            <h2 className="text-lg font-semibold text-(--hi-text)">
                                {pendingAction.type === 'add' ? t('passkeys.add_title') : t('passkeys.remove_title')}
                            </h2>
                            <button type="button" onClick={closeDialog} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="house-action-dialog-body space-y-4">
                            <p className="text-sm text-(--hi-text-soft)">
                                {pendingAction.type === 'add'
                                    ? t('passkeys.confirm_identity')
                                    : t('passkeys.remove_description', { name: pendingAction.passkey.name })}
                            </p>

                            {dialogError && (
                                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
                                    {dialogError}
                                </div>
                            )}

                            {pendingAction.type === 'add' && (
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-(--hi-text)">{t('passkeys.name_label')}</label>
                                    <input
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        maxLength={64}
                                        className="input-field"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="mb-2 block text-sm font-medium text-(--hi-text)">{t('settings.two_factor.password_label')}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="input-field"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>

                            {totpEnabled && (
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-(--hi-text)">{t('settings.two_factor.totp_code_label')}</label>
                                    <input
                                        type="text"
                                        value={totpCode}
                                        onChange={(event) => setTotpCode(event.target.value)}
                                        className="input-field text-center text-xl tracking-[0.3em] font-mono"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={8}
                                        required
                                    />
                                </div>
                            )}

                            <div className="house-action-dialog-actions pt-2">
                                <button type="button" onClick={closeDialog} className="btn-secondary flex-1 py-3">
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`${pendingAction.type === 'add' ? 'btn-primary' : 'btn-danger'} flex-1 disabled:opacity-50`}
                                >
                                    {submitting
                                        ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                        : (pendingAction.type === 'add' ? t('passkeys.add_confirm') : t('passkeys.remove_confirm'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
