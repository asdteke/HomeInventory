import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Activity, Clock3, Package } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader } from './ProductUI';

interface ActivityRecord {
    id: number;
    item_id?: number | null;
    actor_name?: string;
    item_name?: string;
    action: string;
    metadata?: Record<string, any>;
    created_at: string;
}

function actionLabel(action: string, t: any) {
    const labels: Record<string, string> = {
        'item.created': t('activity.actions.item_created', { defaultValue: 'Eşya eklendi' }),
        'item.updated': t('activity.actions.item_updated', { defaultValue: 'Eşya güncellendi' }),
        'item.deleted': t('activity.actions.item_deleted', { defaultValue: 'Eşya silindi' }),
        'item.borrowed': t('activity.actions.item_borrowed', { defaultValue: 'Eşya ödünç verildi' }),
        'item.returned': t('activity.actions.item_returned', { defaultValue: 'Eşya teslim alındı' }),
        'item.bulk_updated': t('activity.actions.item_bulk_updated', { defaultValue: 'Toplu güncellendi' }),
        'item.bulk_deleted': t('activity.actions.item_bulk_deleted', { defaultValue: 'Toplu silindi' }),
        'item.stock_adjusted': t('activity.actions.item_stock_adjusted', { defaultValue: 'Stok güncellendi' }),
        'item.attachment_added': t('activity.actions.item_attachment_added', { defaultValue: 'Ek dosya eklendi' }),
        'item.attachment_deleted': t('activity.actions.item_attachment_deleted', { defaultValue: 'Ek dosya silindi' })
    };

    return labels[action] || action;
}

export default function ActivityPage() {
    const { t, i18n } = useTranslation();
    const [activities, setActivities] = useState<ActivityRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/activity?limit=120');
                if (mounted) {
                    setActivities(response.data.activities || []);
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

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    return (
        <div className="space-y-5">
            <PageHeader
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={t('activity.title', { defaultValue: 'Aktivite Geçmişi' })}
                description={t('activity.description', { defaultValue: 'Ev envanterinde yapılan son güvenli işlemler.' })}
            />

            {activities.length === 0 ? (
                <EmptyState
                    icon={Activity}
                    title={t('activity.empty_title', { defaultValue: 'Henüz aktivite yok' })}
                    description={t('activity.empty_description', { defaultValue: 'Eşya ekleme, güncelleme, ödünç verme ve toplu işlemler burada görünecek.' })}
                />
            ) : (
                <section className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)]">
                    <div className="space-y-3">
                        {activities.map((entry) => (
                            <article key={entry.id} className="flex gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                    <Activity className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <h2 className="font-semibold text-[var(--hi-text)]">{actionLabel(entry.action, t)}</h2>
                                        <span className="text-sm text-[var(--hi-text-soft)]">
                                            {entry.actor_name || t('activity.unknown_actor', { defaultValue: 'Bilinmeyen kullanıcı' })}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-[var(--hi-text-soft)]">
                                        {entry.item_name || (entry.metadata?.item_id
                                            ? t('activity.deleted_item_with_id', { id: entry.metadata.item_id, defaultValue: 'Silinen eşya #{{id}}' })
                                            : t('activity.item_missing', { defaultValue: 'Eşya kaydı artık mevcut değil' }))}
                                    </p>
                                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--hi-text-muted)]">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        {new Date(entry.created_at).toLocaleString(i18n.language)}
                                    </p>
                                </div>
                                <Package className="mt-1 h-4 w-4 shrink-0 text-[var(--hi-text-muted)]" />
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
