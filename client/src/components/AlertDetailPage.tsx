import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calendar, ChevronRight, Package, ShoppingCart, Wrench } from 'lucide-react';
import { LoadingState } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';
import '../operations-v25.css';

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
    const toneClass = type === 'expired' || type === 'maintenance'
        ? 'is-danger'
        : type === 'expiring' || type === 'low-stock'
            ? 'is-warning'
            : 'is-info';

    return (
        <div className="operations-page-v25 animate-fade-in">
            <header className="operations-intro-v25">
                <div className="operations-intro-copy-v25">
                    <span className={`operations-hero-icon-v25 ${toneClass}`} aria-hidden="true"><Icon /></span>
                    <div>
                        <nav className="operations-breadcrumb-v25" aria-label="Breadcrumb">
                            <Link to="/">{t('navigation.home')}</Link>
                            <ChevronRight aria-hidden="true" />
                        </nav>
                        <h1>{config.title}</h1>
                        <p>{config.description}</p>
                    </div>
                </div>
                <div className="operations-intro-actions-v25">
                    <span
                        className={`operations-count-v25 ${toneClass}`}
                        aria-label={t('alerts.detail_count', { count, defaultValue: '{{count}} ilgili kayıt listeleniyor.' })}
                    >
                        <strong>{formatNumberForLanguage(count, language)}</strong>
                    </span>
                    <Link to={config.inventoryUrl} className="btn-secondary">
                        <span>{type === 'maintenance' ? t('navigation.maintenance', { defaultValue: 'Bakım' }) : t('navigation.inventory')}</span>
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>
            </header>

            <section className="operations-workspace-v25">
                {count === 0 ? (
                    <div className="operations-inline-empty-v25">
                        <span className={`operations-empty-icon-v25 ${toneClass}`}><Icon /></span>
                        <div>
                            <h2>{t('alerts.empty_title', { defaultValue: 'İlgili kayıt bulunamadı' })}</h2>
                            <p>{config.description}</p>
                        </div>
                    </div>
                ) : type === 'maintenance' ? (
                    <div className="operations-list-v25">
                        {tasks.map((task) => (
                            <Link key={task.id} to="/maintenance" className="operations-row-v25 group">
                                <span className="operations-row-icon-v25 is-danger"><Wrench /></span>
                                <span className="operations-row-copy-v25">
                                    <strong>{task.task_name}</strong>
                                    <span>{task.item_name || t('items.untitled_item', { defaultValue: 'İsimsiz eşya' })}</span>
                                    <small className="operations-row-detail-v25 is-danger">
                                        {formatDate(task.next_due_date, language)}
                                    </small>
                                </span>
                                <ChevronRight className="operations-row-arrow-v25" aria-hidden="true" />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="operations-list-v25 operations-item-list-v25">
                        {items.map((item) => {
                            const roomName = item.room_name
                                ? getRoomPresentation({ name: item.room_name }, language).name
                                : '';
                            const location = [roomName, item.location_name].filter(Boolean).join(' / ') || '-';
                            return (
                                <Link key={item.id} to={`/items/${item.id}/edit`} className="operations-row-v25 group">
                                    <span className={`operations-row-icon-v25 ${toneClass}`}><Package /></span>
                                    <span className="operations-row-copy-v25">
                                        <strong>{resolveVisibleItemTitle(item, t('inventory.untitled_item'))}</strong>
                                        <span>{location}</span>
                                        <small className="operations-row-detail-v25">
                                            {type === 'low-stock' ? (
                                                <span>{t('alerts.low_stock.qty', {
                                                    quantity: formatNumberForLanguage(Number(item.quantity || 0), language),
                                                    min: formatNumberForLanguage(Number(item.min_quantity || 0), language),
                                                    defaultValue: 'Stok {{quantity}} / min {{min}}'
                                                })}</span>
                                            ) : (
                                                <span>{formatDate(item.expiry_date, language)}</span>
                                            )}
                                            {item.category_name && <span className="operations-detail-separator-v25">{item.category_name}</span>}
                                        </small>
                                    </span>
                                    <ChevronRight className="operations-row-arrow-v25" aria-hidden="true" />
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
