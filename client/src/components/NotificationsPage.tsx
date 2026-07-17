import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowUpRight, Bell, CheckCircle2, Clock, Package, ShieldCheck, Wrench } from 'lucide-react';
import { LoadingState } from './ProductUI';
import '../operations-v25.css';

const TYPE_ICON: Record<string, any> = {
    stock: Package,
    expiry: Clock,
    warranty: ShieldCheck,
    maintenance: Wrench,
    borrow: Bell
};

function severityClass(severity: string) {
    if (severity === 'danger') {
        return 'is-danger';
    }
    if (severity === 'warning') {
        return 'is-warning';
    }
    return 'is-info';
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
        <div className="operations-page-v25 animate-fade-in">
            <header className="operations-intro-v25">
                <div className="operations-intro-copy-v25">
                    <span className="operations-hero-icon-v25 is-info" aria-hidden="true">
                        <Bell />
                    </span>
                    <div>
                        <h1>{t('notifications.title', { defaultValue: 'Bildirim Merkezi' })}</h1>
                        <p>{t('notifications.description', { defaultValue: 'Stok, garanti, bakım, son kullanma ve ödünç iade uyarıları.' })}</p>
                    </div>
                </div>
                <div className="operations-intro-meta-v25" aria-label={t('notifications.title', { defaultValue: 'Bildirim Merkezi' })}>
                    {meta.map((item) => (
                        <span key={item.label} className={item.tone === 'warning' ? 'is-warning' : ''}>{item.label}</span>
                    ))}
                </div>
            </header>

            <section className="operations-workspace-v25" aria-live="polite">
                {notifications.length === 0 ? (
                    <div className="operations-inline-empty-v25">
                        <span className="operations-empty-icon-v25"><CheckCircle2 /></span>
                        <div>
                            <h2>{t('notifications.empty_title', { defaultValue: 'Şu an ilgilenmeniz gereken bir uyarı yok' })}</h2>
                            <p>{t('notifications.empty_desc', { defaultValue: 'Düşük stok, yaklaşan tarih veya gecikmiş bakım olduğunda burada görünecek.' })}</p>
                        </div>
                        <Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>
                    </div>
                ) : (
                    <div className="operations-list-v25">
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
                                className="operations-row-v25 group"
                            >
                                <span className={`operations-row-icon-v25 ${severityClass(notification.severity)}`}>
                                    <Icon />
                                </span>
                                <span className="operations-row-copy-v25">
                                    <strong>{title}</strong>
                                    <span>{body}</span>
                                </span>
                                <ArrowUpRight className="operations-row-arrow-v25" aria-hidden="true" />
                            </Link>
                        );
                    })}
                    </div>
                )}
            </section>
        </div>
    );
}
