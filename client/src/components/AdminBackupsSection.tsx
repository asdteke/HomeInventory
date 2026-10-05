import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    ArchiveRestore,
    CheckCircle2,
    Clock,
    DatabaseBackup,
    Download,
    FolderOpen,
    ImageOff,
    KeyRound,
    RefreshCw,
    Save,
    Trash2,
    Upload
} from 'lucide-react';
import { ConfirmDialog } from './ModalDialog';
import { PremiumCheckbox } from './PremiumCheckbox';
import { EmptyState, NoticeBanner, SectionHeader } from './ProductUI';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';

// Admin view for instance-level database snapshots. Restores are staged on
// the server and applied on the next restart, so this screen never swaps the
// live database itself.

type BackupKind = 'auto' | 'manual' | 'upload' | 'prerestore';
type BackupSchedule = 'off' | 'daily' | 'weekly';

interface BackupEntry {
    name: string;
    kind: BackupKind;
    createdAt: string;
    size: number;
}

interface BackupOverview {
    settings: { schedule: BackupSchedule; keepLast: number; source: string };
    schedules: BackupSchedule[];
    maxKeep: number;
    directory: string;
    status: {
        lastRunAt?: string;
        lastResult?: 'success' | 'failed';
        lastSuccessAt?: string;
        lastError?: string | null;
    };
    running: boolean;
    nextRunAt: string | null;
    backups: BackupEntry[];
    pendingRestore: { source: string; stagedAt: string } | null;
    lastRestore: { status: 'applied' | 'failed'; source: string; safetySnapshot?: string | null; error?: string; finishedAt?: string } | null;
    uploadLimitBytes: number;
}

interface ToastInput {
    title: string;
    description?: string;
    tone?: 'info' | 'success' | 'warning' | 'danger';
}

interface AdminBackupsSectionProps {
    onToast: (toast: ToastInput) => void;
}

const SCHEDULE_OPTIONS: BackupSchedule[] = ['off', 'daily', 'weekly'];

function formatBytes(bytes: number, locale: string): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Math.max(0, Number(bytes) || 0);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${formatNumberForLanguage(value, locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function formatBackupDate(value: string | null | undefined, locale: string): string {
    if (!value) {
        return '—';
    }
    return formatDateForLanguage(new Date(value), locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }, { fallback: 'datetime' });
}

export default function AdminBackupsSection({ onToast }: AdminBackupsSectionProps) {
    const { t: tRaw, i18n } = useTranslation();
    const t = tRaw as any;
    const locale = i18n.language || 'en';
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [overview, setOverview] = useState<BackupOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [scheduleDraft, setScheduleDraft] = useState<BackupSchedule>('daily');
    const [keepDraft, setKeepDraft] = useState('7');
    const [pendingDelete, setPendingDelete] = useState<BackupEntry | null>(null);
    const [pendingRestore, setPendingRestore] = useState<BackupEntry | null>(null);
    const [restoreAcknowledged, setRestoreAcknowledged] = useState(false);

    const applyOverview = (next: BackupOverview) => {
        setOverview(next);
        setScheduleDraft(next.settings.schedule);
        setKeepDraft(String(next.settings.keepLast));
    };

    const describeError = (error: any): string => {
        const code = error?.response?.data?.code;
        if (code === 'NOT_SQLITE' || code === 'CORRUPT' || code === 'NOT_HOMEINVENTORY') {
            return t('autoBackup.error_invalid_file');
        }
        if (code === 'KEY_MISMATCH') {
            return t('autoBackup.error_key_mismatch');
        }
        if (code === 'BACKUP_TOO_LARGE' || error?.response?.status === 413) {
            return t('autoBackup.error_too_large', { size: formatBytes(overview?.uploadLimitBytes || 0, locale) });
        }
        if (code === 'BACKUP_BUSY') {
            return t('autoBackup.error_busy');
        }
        return error?.response?.data?.error || t('common.error', { defaultValue: 'Something went wrong' });
    };

    const loadOverview = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/admin/backups');
            applyOverview(response.data);
            setLoadError(null);
        } catch (error: any) {
            setLoadError(describeError(error));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOverview();
    }, []);

    const runAction = async (action: string, task: () => Promise<void>) => {
        setBusyAction(action);
        try {
            await task();
        } catch (error: any) {
            onToast({
                title: t('common.error', { defaultValue: 'Something went wrong' }),
                description: describeError(error),
                tone: 'danger'
            });
        } finally {
            setBusyAction(null);
        }
    };

    const handleSaveSettings = () => runAction('settings', async () => {
        const response = await axios.put('/api/admin/backups/settings', {
            schedule: scheduleDraft,
            keepLast: Number.parseInt(keepDraft, 10)
        });
        applyOverview(response.data);
        onToast({ title: t('autoBackup.saved'), tone: 'success' });
    });

    const handleBackupNow = () => runAction('create', async () => {
        const response = await axios.post('/api/admin/backups');
        applyOverview(response.data.overview);
        onToast({ title: t('autoBackup.created'), description: response.data.backup?.name, tone: 'success' });
    });

    const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        if (overview && file.size > overview.uploadLimitBytes) {
            onToast({
                title: t('common.error', { defaultValue: 'Something went wrong' }),
                description: t('autoBackup.error_too_large', { size: formatBytes(overview.uploadLimitBytes, locale) }),
                tone: 'danger'
            });
            return;
        }

        runAction('upload', async () => {
            const response = await axios.post('/api/admin/backups/upload', file, {
                headers: { 'Content-Type': 'application/octet-stream' }
            });
            applyOverview(response.data.overview);
            onToast({ title: t('autoBackup.uploaded'), description: response.data.backup?.name, tone: 'success' });
        });
    };

    const handleConfirmDelete = () => {
        if (!pendingDelete) {
            return;
        }
        const target = pendingDelete;
        runAction('delete', async () => {
            const response = await axios.delete(`/api/admin/backups/${encodeURIComponent(target.name)}`);
            applyOverview(response.data.overview);
            setPendingDelete(null);
            onToast({ title: t('autoBackup.deleted'), description: target.name });
        });
    };

    const handleConfirmRestore = () => {
        if (!pendingRestore || !restoreAcknowledged) {
            return;
        }
        const target = pendingRestore;
        runAction('restore', async () => {
            const response = await axios.post(`/api/admin/backups/${encodeURIComponent(target.name)}/restore`, {
                confirm: target.name
            });
            applyOverview(response.data.overview);
            setPendingRestore(null);
            setRestoreAcknowledged(false);
            onToast({ title: t('autoBackup.pending_title'), description: target.name, tone: 'warning' });
        });
    };

    const handleCancelPending = () => runAction('cancel', async () => {
        const response = await axios.delete('/api/admin/backups/restore/pending');
        applyOverview(response.data.overview);
        onToast({ title: t('autoBackup.pending_cancelled') });
    });

    if (loading && !overview) {
        return (
            <div className="flex justify-center py-20">
                <div className="spinner" />
            </div>
        );
    }

    if (!overview) {
        return (
            <EmptyState
                icon={DatabaseBackup}
                title={t('common.error', { defaultValue: 'Something went wrong' })}
                description={loadError || ''}
                actions={(
                    <button type="button" onClick={loadOverview} className="btn-primary">
                        <RefreshCw className="h-4 w-4" />
                        <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                    </button>
                )}
                align="left"
            />
        );
    }

    const { status, lastRestore } = overview;
    const settingsChanged = scheduleDraft !== overview.settings.schedule || keepDraft !== String(overview.settings.keepLast);
    const keepValue = Number.parseInt(keepDraft, 10);
    const keepValid = Number.isInteger(keepValue) && keepValue >= 1 && keepValue <= overview.maxKeep;

    return (
        <div className="space-y-6">
            {overview.pendingRestore && (
                <NoticeBanner
                    icon={ArchiveRestore}
                    tone="warning"
                    title={t('autoBackup.pending_title')}
                    description={t('autoBackup.pending_body', { name: overview.pendingRestore.source })}
                    action={(
                        <button
                            type="button"
                            onClick={handleCancelPending}
                            disabled={busyAction !== null}
                            className="btn-secondary"
                        >
                            {t('autoBackup.pending_cancel')}
                        </button>
                    )}
                />
            )}

            {lastRestore && !overview.pendingRestore && (
                lastRestore.status === 'applied' ? (
                    <NoticeBanner
                        icon={CheckCircle2}
                        tone="success"
                        title={t('autoBackup.last_restore_applied', {
                            name: lastRestore.source,
                            safety: lastRestore.safetySnapshot || '—'
                        })}
                        description={formatBackupDate(lastRestore.finishedAt, locale)}
                    />
                ) : (
                    <NoticeBanner
                        icon={AlertTriangle}
                        tone="danger"
                        title={t('autoBackup.last_restore_failed')}
                        description={lastRestore.error || ''}
                    />
                )
            )}

            <NoticeBanner
                icon={KeyRound}
                tone="info"
                title={t('autoBackup.key_warning_title')}
                description={t('autoBackup.key_warning_body')}
            />

            <div className="grid items-stretch gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="admin-v25-surface card mt-0! flex! h-full! flex-col! p-5!">
                    <SectionHeader
                        title={t('autoBackup.schedule_title')}
                        description={t('autoBackup.schedule_body')}
                    />

                    <div className="mt-5 space-y-4">
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-(--hi-text)">{t('autoBackup.schedule_label')}</span>
                            <select
                                value={scheduleDraft}
                                onChange={(event) => setScheduleDraft(event.target.value as BackupSchedule)}
                                className="input-field"
                            >
                                {SCHEDULE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{t(`autoBackup.schedule_${option}`)}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-(--hi-text)">{t('autoBackup.keep_label')}</span>
                            <input
                                type="number"
                                min={1}
                                max={overview.maxKeep}
                                value={keepDraft}
                                onChange={(event) => setKeepDraft(event.target.value)}
                                className="input-field"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={handleSaveSettings}
                            disabled={!settingsChanged || !keepValid || busyAction !== null}
                            className="btn-primary w-full disabled:opacity-60"
                        >
                            {busyAction === 'settings' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            <span>{t('autoBackup.save')}</span>
                        </button>

                        <div className="admin-v25-row space-y-2 rounded-[1.1rem] border border-(--hi-border) bg-(--hi-panel-muted) px-4 py-3 text-sm text-(--hi-text-soft)">
                            <p className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--hi-text-muted)" />
                                <span>
                                    {status.lastSuccessAt
                                        ? t('autoBackup.last_success', { date: formatBackupDate(status.lastSuccessAt, locale) })
                                        : t('autoBackup.empty_title')}
                                </span>
                            </p>
                            {overview.nextRunAt && overview.settings.schedule !== 'off' && (
                                <p className="flex items-start gap-2">
                                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-(--hi-text-muted)" />
                                    <span>{t('autoBackup.next_run', { date: formatBackupDate(overview.nextRunAt, locale) })}</span>
                                </p>
                            )}
                            {status.lastResult === 'failed' && (
                                <p className="flex items-start gap-2 text-red-600 dark:text-red-400">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{t('autoBackup.last_failed', { error: status.lastError || '—' })}</span>
                                </p>
                            )}
                            <p className="flex items-start gap-2 break-all">
                                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-(--hi-text-muted)" />
                                <code className="text-xs">{overview.directory}</code>
                            </p>
                            <p className="flex items-start gap-2">
                                <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-(--hi-text-muted)" />
                                <span>{t('autoBackup.uploads_note')}</span>
                            </p>
                        </div>
                    </div>
                </section>

                <section className="admin-v25-surface card mt-0! flex! h-full! flex-col! p-5!">
                    <SectionHeader
                        title={t('autoBackup.list_title')}
                        description={t('autoBackup.list_body')}
                        action={(
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={busyAction !== null}
                                    className="btn-secondary"
                                >
                                    {busyAction === 'upload' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    <span>{t('autoBackup.upload')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBackupNow}
                                    disabled={busyAction !== null || overview.running}
                                    className="btn-primary"
                                >
                                    {busyAction === 'create' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                                    <span>{t('autoBackup.backup_now')}</span>
                                </button>
                            </div>
                        )}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/x-sqlite3"
                        onChange={handleUpload}
                        className="hidden"
                    />

                    {overview.backups.length > 0 ? (
                        <ul className="mt-5 space-y-3">
                            {overview.backups.map((entry) => (
                                <li
                                    key={entry.name}
                                    className="admin-v25-row flex flex-col gap-3 rounded-[1.1rem] border border-(--hi-border) bg-(--hi-panel-muted) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-(--hi-text)">{formatBackupDate(entry.createdAt, locale)}</p>
                                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--hi-text-muted)">
                                            <span className={`app-meta-pill ${entry.kind === 'prerestore' ? 'app-meta-pill-warning' : ''}`}>
                                                {t(`autoBackup.kind_${entry.kind}`)}
                                            </span>
                                            <span>{formatBytes(entry.size, locale)}</span>
                                            <span className="truncate font-mono">{entry.name}</span>
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <a
                                            href={`/api/admin/backups/${encodeURIComponent(entry.name)}/download`}
                                            download={entry.name}
                                            className="btn-secondary"
                                            aria-label={`${t('autoBackup.download')} ${entry.name}`}
                                        >
                                            <Download className="h-4 w-4" />
                                            <span>{t('autoBackup.download')}</span>
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRestoreAcknowledged(false);
                                                setPendingRestore(entry);
                                            }}
                                            disabled={busyAction !== null}
                                            className="btn-secondary"
                                        >
                                            <ArchiveRestore className="h-4 w-4" />
                                            <span>{t('autoBackup.restore')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPendingDelete(entry)}
                                            disabled={busyAction !== null}
                                            className="btn-secondary"
                                            aria-label={`${t('autoBackup.delete')} ${entry.name}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState
                            icon={DatabaseBackup}
                            title={t('autoBackup.empty_title')}
                            description={t('autoBackup.empty_body')}
                            align="left"
                        />
                    )}
                </section>
            </div>

            <ConfirmDialog
                isOpen={Boolean(pendingDelete)}
                title={t('autoBackup.delete_title')}
                description={t('autoBackup.delete_body', { name: pendingDelete?.name || '' })}
                confirmLabel={t('autoBackup.delete')}
                cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
                confirmButtonClassName="btn-danger"
                tone="danger"
                confirming={busyAction === 'delete'}
                onClose={() => busyAction !== 'delete' && setPendingDelete(null)}
                onConfirm={handleConfirmDelete}
            />

            <ConfirmDialog
                isOpen={Boolean(pendingRestore)}
                title={t('autoBackup.restore_title')}
                description={t('autoBackup.restore_body', { date: formatBackupDate(pendingRestore?.createdAt, locale) })}
                confirmLabel={t('autoBackup.restore_confirm')}
                cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
                confirmButtonClassName="btn-danger"
                tone="danger"
                icon={ArchiveRestore}
                confirming={busyAction === 'restore'}
                confirmDisabled={!restoreAcknowledged}
                onClose={() => {
                    if (busyAction !== 'restore') {
                        setPendingRestore(null);
                        setRestoreAcknowledged(false);
                    }
                }}
                onConfirm={handleConfirmRestore}
            >
                <div className="space-y-3">
                    <div className="rounded-2xl border border-(--hi-border) bg-(--hi-panel-muted) px-4 py-3">
                        <p className="font-mono text-xs break-all text-(--hi-text)">{pendingRestore?.name}</p>
                        <p className="mt-2 text-sm leading-6 text-(--hi-text-soft)">{t('autoBackup.restore_steps')}</p>
                    </div>
                    <label className="app-premium-checkbox-container flex items-start gap-3 rounded-2xl border border-(--hi-border) px-4 py-3 text-sm text-(--hi-text)">
                        <PremiumCheckbox
                            checked={restoreAcknowledged}
                            onChange={(event) => setRestoreAcknowledged(event.target.checked)}
                        />
                        <span>{t('autoBackup.restore_ack')}</span>
                    </label>
                </div>
            </ConfirmDialog>
        </div>
    );
}
