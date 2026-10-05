import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, ExternalLink, X } from 'lucide-react';

// Self-hosted installs: tells admins when a newer GitHub release exists.
// The server only contacts GitHub when this component asks (and caches the
// answer); UPDATE_CHECK=false turns that off and this renders nothing.

const DISMISSED_UPDATE_KEY = 'admin_update_notice_dismissed_version';
const DOCKER_UPGRADE_COMMAND = 'docker compose pull && docker compose up -d';

interface UpdateStatus {
    status: 'ok' | 'unknown' | 'disabled';
    currentVersion: string;
    latestVersion: string | null;
    releaseUrl: string | null;
    updateAvailable: boolean;
}

function readDismissedVersion(): string {
    try {
        return window.localStorage.getItem(DISMISSED_UPDATE_KEY) || '';
    } catch {
        return '';
    }
}

function isSafeReleaseUrl(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('https://github.com/asdteke/HomeInventory/releases/');
}

export default function AdminUpdateNotice() {
    const { t: tRaw } = useTranslation();
    const t = tRaw as any;
    const [update, setUpdate] = useState<UpdateStatus | null>(null);
    const [dismissedVersion, setDismissedVersion] = useState(readDismissedVersion);

    useEffect(() => {
        let cancelled = false;

        axios.get('/api/admin/update-status')
            .then((response) => {
                if (!cancelled) {
                    setUpdate(response.data);
                }
            })
            .catch(() => {
                // The notice is optional; failures must never disturb the admin panel.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (
        !update
        || update.status !== 'ok'
        || !update.updateAvailable
        || !update.latestVersion
        || !isSafeReleaseUrl(update.releaseUrl)
        || dismissedVersion === update.latestVersion
    ) {
        return null;
    }

    const latestVersion = update.latestVersion;

    const handleDismiss = () => {
        setDismissedVersion(latestVersion);
        try {
            window.localStorage.setItem(DISMISSED_UPDATE_KEY, latestVersion);
        } catch {
            // Storage can be blocked; the dismissal then lasts until the page reloads.
        }
    };

    return (
        <div
            role="status"
            aria-live="polite"
            className="app-notice core-notice-v25 app-notice-info admin-update-notice"
        >
            <span className="app-notice-icon">
                <ArrowUpCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-(--hi-text)">
                    {t('updateNotice.title', {
                        latest: latestVersion,
                        current: update.currentVersion,
                        defaultValue: 'Version {{latest}} is available (you have {{current}})'
                    })}
                </p>
                <p className="mt-1 text-sm leading-6 text-(--hi-text-soft)">
                    {t('updateNotice.docker_hint', { defaultValue: 'Running with Docker Compose? Upgrade with:' })}
                </p>
                <code className="mt-2 block w-full break-all rounded-2xl border border-(--hi-border) bg-(--hi-bg-strong) px-3 py-2 font-mono text-sm text-(--hi-text-soft)">
                    {DOCKER_UPGRADE_COMMAND}
                </code>
                <a
                    href={update.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-v25-refresh mt-3"
                >
                    <ExternalLink className="h-4 w-4" />
                    <span>{t('updateNotice.release_notes', { defaultValue: 'Release notes' })}</span>
                </a>
            </div>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label={t('updateNotice.dismiss', { version: latestVersion, defaultValue: 'Hide this notice for version {{version}}' })}
                title={t('updateNotice.dismiss', { version: latestVersion, defaultValue: 'Hide this notice for version {{version}}' })}
                className="self-start rounded-xl p-2 text-(--hi-text-soft) transition hover:bg-(--hi-panel-muted) hover:text-(--hi-text) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--hi-accent)"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
