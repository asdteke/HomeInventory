import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bell, CheckCircle2, Clock, Package, ShieldCheck, Wrench } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader } from './ProductUI';

const TYPE_ICON: Record<string, any> = {
    stock: Package,
    expiry: Clock,
    warranty: ShieldCheck,
    maintenance: Wrench,
    borrow: Bell
};

function severityClass(severity: string) {
    if (severity === 'danger') {
        return 'border-rose-500/25 bg-rose-500/8 text-rose-500';
    }
    if (severity === 'warning') {
        return 'border-amber-500/25 bg-amber-500/8 text-amber-500';
    }
    return 'border-sky-500/25 bg-sky-500/8 text-sky-500';
}

export default function NotificationsPage() {
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/notifications');
                if (mounted) {
                    setNotifications(response.data.notifications || []);
                    setSummary(response.data.summary || {});
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, []);

    const meta = useMemo(() => ([
        { label: t('notifications.meta_total', { count: summary.total || 0, defaultValue: '{{count}} bildirim' }), tone: 'default' as const },
        ...(summary.danger ? [{ label: t('notifications.meta_urgent', { count: summary.danger, defaultValue: '{{count}} acil' }), tone: 'warning' as const }] : [])
    ]), [summary, t]);

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('notifications.title', { defaultValue: 'Bildirim Merkezi' })}
                description={t('notifications.description', { defaultValue: 'Stok, garanti, bakım, son kullanma ve ödünç iade uyarıları.' })}
                meta={meta}
            />

            {notifications.length === 0 ? (
                <EmptyState
                    icon={CheckCircle2}
                    title={t('notifications.empty_title', { defaultValue: 'Şu an ilgilenmeniz gereken bir uyarı yok' })}
                    description={t('notifications.empty_desc', { defaultValue: 'Düşük stok, yaklaşan tarih veya gecikmiş bakım olduğunda burada görünecek.' })}
                    actions={<Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>}
                />
            ) : (
                <section className="space-y-3">
                    {notifications.map((notification) => {
                        const Icon = TYPE_ICON[notification.type] || AlertTriangle;
                        const title = notification.titleKey
                            ? t(notification.titleKey, {
                                ...(notification.titleParams || {}),
                                defaultValue: notification.title
                            })
                            : notification.title;
                        const body = notification.bodyKey
                            ? t(notification.bodyKey, {
                                ...(notification.bodyParams || {}),
                                defaultValue: notification.body
                            })
                            : notification.body;
                        return (
                            <Link
                                key={notification.id}
                                to={notification.target || '/items'}
                                className="flex items-start gap-4 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)] transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)]"
                            >
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${severityClass(notification.severity)}`}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-[var(--hi-text)]">{title}</span>
                                    <span className="mt-1 block text-sm leading-6 text-[var(--hi-text-soft)] [overflow-wrap:anywhere]">{body}</span>
                                </span>
                            </Link>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
