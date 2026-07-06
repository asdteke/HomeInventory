import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calendar, ChevronRight, Package, ShoppingCart, Wrench } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';

interface AlertItem {
    id: number;
    name?: string;
    room_name?: string;
    location_name?: string;
    category_name?: string;
    quantity?: number;
    min_quantity?: number;
    expiry_date?: string;
}

interface MaintenanceTask {
    id: number;
    item_id: number;
    item_name?: string;
    task_name: string;
    next_due_date: string;
    is_overdue?: boolean;
}

function formatDate(value: string | undefined, language: string) {
    if (!value) return '-';
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '-';
    return formatDateForLanguage(date, language, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

export default function AlertDetailPage() {
    const { type = '' } = useParams();
    const { t, i18n } = useTranslation();
    const language = i18n.resolvedLanguage || i18n.language;
    const [items, setItems] = useState<AlertItem[]>([]);
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [loading, setLoading] = useState(true);

    const config = useMemo(() => {
        if (type === 'low-stock') {
            return {
                icon: ShoppingCart,
                title: t('alerts.low_stock.title', { defaultValue: 'Azalan Stoklar' }),
                description: t('alerts.low_stock.description', { defaultValue: 'Minimum stok sınırının altına düşen eşyalar.' }),
                itemUrl: '/api/items?stock=low&sort=name_asc',
                inventoryUrl: '/items?stock=low'
            };
        }
        if (type === 'expired') {
            return {
                icon: AlertTriangle,
                title: t('alerts.expired.title', { defaultValue: 'Süresi Geçmiş Eşyalar' }),
                description: t('alerts.expired.description', { defaultValue: 'Son kullanma tarihi geçmiş kayıtlar.' }),
                itemUrl: '/api/items?expiry=expired&sort=expiry_asc',
                inventoryUrl: '/items?expiry=expired&sort=expiry_asc'
            };
        }
        if (type === 'expiring') {
            return {
                icon: Calendar,
                title: t('alerts.expiring.title', { defaultValue: 'Yaklaşan Tarihler' }),
                description: t('alerts.expiring.description', { defaultValue: '30 gün içinde son kullanma tarihi dolacak kayıtlar.' }),
                itemUrl: '/api/items?expiry=close&sort=expiry_asc',
                inventoryUrl: '/items?expiry=close&sort=expiry_asc'
            };
        }
        return {
            icon: Wrench,
            title: t('alerts.maintenance.title', { defaultValue: 'Gecikmiş Bakım Görevleri' }),
            description: t('alerts.maintenance.description', { defaultValue: 'Planlanan tarihi geçmiş bakım görevleri.' }),
            itemUrl: '',
            inventoryUrl: '/maintenance'
        };
    }, [t, type]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                if (type === 'maintenance') {
                    const response = await axios.get('/api/maintenance');
                    const today = new Date().toISOString().slice(0, 10);
                    if (mounted) {
                        setTasks((response.data.tasks || []).filter((task: MaintenanceTask) =>
                            task.is_overdue || task.next_due_date < today
                        ));
                        setItems([]);
                    }
                } else {
                    const response = await axios.get(config.itemUrl);
                    if (mounted) {
                        setItems(response.data.items || []);
                        setTasks([]);
                    }
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, [config.itemUrl, type]);

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    const Icon = config.icon;
    const count = type === 'maintenance' ? tasks.length : items.length;

    return (
        <div className="space-y-5">
            <PageHeader
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={config.title}
                description={t('alerts.detail_count', {
                    count,
                    defaultValue: '{{count}} ilgili kayıt listeleniyor.'
                })}
                meta={[{ label: formatNumberForLanguage(count, language), tone: 'accent' }]}
                actions={(
                    <Link to={config.inventoryUrl} className="btn-secondary">
                        <span>{type === 'maintenance' ? t('navigation.maintenance', { defaultValue: 'Bakım' }) : t('navigation.inventory')}</span>
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                )}
            />

            {count === 0 ? (
                <EmptyState
                    icon={Icon}
                    title={t('alerts.empty_title', { defaultValue: 'İlgili kayıt bulunamadı' })}
                    description={config.description}
                />
            ) : type === 'maintenance' ? (
                <section className="grid gap-3">
                    {tasks.map((task) => (
                        <Link key={task.id} to="/maintenance" className="card group !p-4 transition hover:-translate-y-0.5">
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="font-semibold text-[var(--hi-text)]">{task.task_name}</p>
                                    <p className="mt-1 text-sm text-[var(--hi-text-soft)]">{task.item_name || t('items.untitled_item', { defaultValue: 'İsimsiz eşya' })}</p>
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600">
                                        {formatDate(task.next_due_date, language)}
                                    </p>
                                </div>
                                <Wrench className="h-5 w-5 shrink-0 text-[var(--hi-text-muted)] group-hover:text-[var(--hi-accent)]" />
                            </div>
                        </Link>
                    ))}
                </section>
            ) : (
                <section className="grid gap-3 md:grid-cols-2">
                    {items.map((item) => {
                        const roomName = item.room_name
                            ? getRoomPresentation({ name: item.room_name }, language).name
                            : '';
                        const location = [roomName, item.location_name].filter(Boolean).join(' / ') || '-';
                        return (
                            <Link key={item.id} to={`/items/${item.id}/edit`} className="card group !p-4 transition hover:-translate-y-0.5">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                        <Package className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-[var(--hi-text)]">{resolveVisibleItemTitle(item, t('inventory.untitled_item'))}</p>
                                        <p className="mt-1 text-sm text-[var(--hi-text-soft)]">{location}</p>
                                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--hi-text-muted)]">
                                            {type === 'low-stock' ? (
                                                <span>{t('alerts.low_stock.qty', {
                                                    quantity: formatNumberForLanguage(Number(item.quantity || 0), language),
                                                    min: formatNumberForLanguage(Number(item.min_quantity || 0), language),
                                                    defaultValue: 'Stok {{quantity}} / min {{min}}'
                                                })}</span>
                                            ) : (
                                                <span>{formatDate(item.expiry_date, language)}</span>
                                            )}
                                            {item.category_name && <span>{item.category_name}</span>}
                                        </div>
                                    </div>
                                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--hi-text-muted)] group-hover:text-[var(--hi-accent)]" />
                                </div>
                            </Link>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
