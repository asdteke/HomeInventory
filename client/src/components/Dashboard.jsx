import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    ChevronRight,
    Globe,
    KeyRound,
    Lock,
    Package,
    Plus,
    Search,
    AlertTriangle,
    Wrench,
    ShoppingCart,
    Calendar
} from 'lucide-react';
import SecureImage from './SecureImage';
import { EmptyState, LoadingState, PageHeader, SectionHeader, NoticeBanner } from './ProductUI';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';

function formatItemDate(value, locale) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return formatDateForLanguage(date, locale, {
        month: 'short',
        day: 'numeric'
    });
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [stats, setStats] = useState(null);
    const [allItems, setAllItems] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [maintenanceTasks, setMaintenanceTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, itemsRes, roomsRes, maintenanceRes] = await Promise.all([
                    axios.get('/api/items/stats/summary'),
                    axios.get('/api/items'),
                    axios.get('/api/rooms'),
                    axios.get('/api/maintenance').catch(() => ({ data: { tasks: [] } }))
                ]);
                setStats(statsRes.data);
                setAllItems(itemsRes.data.items || []);
                setRooms(roomsRes.data.rooms || []);
                setMaintenanceTasks(maintenanceRes.data.tasks || []);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const recentItems = useMemo(() => {
        return [...allItems]
            .sort((a, b) => {
                const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                return dateB - dateA;
            })
            .slice(0, 5);
    }, [allItems]);

    const locale = i18n.language || 'en';
    const resolveVisibleRoomName = (roomLike) => {
        if (!roomLike) {
            return '';
        }

        const fullRoom = roomLike.id
            ? rooms.find((room) => String(room.id) === String(roomLike.id))
            : rooms.find((room) => String(room.name || '').trim() === String(roomLike.name || '').trim());

        return getRoomPresentation(fullRoom || roomLike, locale).name;
    };

    const totalItems = typeof stats?.totalItems === 'number' ? stats.totalItems : allItems.length;
    const totalQuantity = typeof stats?.totalQuantity === 'number'
        ? stats.totalQuantity
        : allItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const sharedItemsCount = allItems.filter((item) => Number(item.is_public) === 1).length;
    const borrowedItemsCount = allItems.filter((item) => item.active_borrow).length;
    const hasItems = totalItems > 0;
    const formattedTotalItems = formatNumberForLanguage(totalItems, locale);
    const formattedTotalQuantity = formatNumberForLanguage(totalQuantity, locale);
    const formattedSharedItems = formatNumberForLanguage(sharedItemsCount, locale);
    const formattedBorrowedItems = formatNumberForLanguage(borrowedItemsCount, locale);

    const expiredItems = useMemo(() => allItems.filter(item => item.is_expired), [allItems]);
    const closeToExpiryItems = useMemo(() => allItems.filter(item => !item.is_expired && item.is_close_to_expiry), [allItems]);
    const lowStockItems = useMemo(() => allItems.filter(item => item.is_low_stock), [allItems]);
    const overdueTasks = useMemo(() => maintenanceTasks.filter(task => task.is_overdue), [maintenanceTasks]);

    const handleSearch = (event) => {
        event.preventDefault();
        const query = searchQuery.trim();
        if (query) {
            navigate(`/items?search=${encodeURIComponent(query)}`);
        }
    };

    if (loading) {
        return (
            <LoadingState
                title={t('common.loading')}
                description={t('dashboard.page.loading_description', {
                    defaultValue: 'Ana görünüm hazırlanıyor. Son eklenen eşyalar ve hızlı arama birkaç saniye içinde gelecek.'
                })}
            />
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('dashboard.page.title')}
                description={hasItems ? t('dashboard.page.description_ready') : t('dashboard.page.description_empty')}
                meta={hasItems ? [
                    { label: t('dashboard.top_bar.items_tracked', { count: formattedTotalItems }), tone: 'accent' },
                    { label: t('dashboard.top_bar.total_quantity', { count: formattedTotalQuantity }), tone: 'secondary' },
                    ...(sharedItemsCount > 0 ? [{ label: t('dashboard.top_bar.shared_items', { count: formattedSharedItems }), tone: 'secondary' }] : []),
                    ...(borrowedItemsCount > 0 ? [{ label: t('dashboard.top_bar.borrowed_now', { count: formattedBorrowedItems }), tone: 'accent' }] : [])
                ] : [
                    { label: t('dashboard.top_bar.status_empty'), tone: 'secondary' }
                ]}
                actions={(
                    <Link to="/items/new" className="btn-primary">
                        <Plus className="h-4 w-4" />
                        <span>{t('navigation.new_item')}</span>
                    </Link>
                )}
            >
                <section className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)] sm:p-5">
                    <SectionHeader
                        title={t('dashboard.search_panel.title')}
                        description={t('dashboard.search_panel.description')}
                    />

                    <form onSubmit={handleSearch} className="mt-4">
                        <div className="overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] transition focus-within:border-[var(--hi-border-strong)]">
                            <div className="flex flex-col md:flex-row md:items-center">
                                <div className="relative flex-1 px-4">
                                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--hi-text-muted)]" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder={t('dashboard.search_panel.placeholder')}
                                        aria-label={t('dashboard.search_panel.placeholder')}
                                        className="h-14 w-full border-0 bg-transparent pl-10 pr-4 text-base text-[var(--hi-text)] outline-none placeholder:text-[var(--hi-text-muted)]"
                                    />
                                </div>
                                <button type="submit" className="btn-secondary m-2 h-11 min-w-[150px] !rounded-[12px] !px-5">
                                    <Search className="h-4 w-4" />
                                    <span>{t('dashboard.search_panel.submit')}</span>
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--hi-text-soft)]">
                        <span>{t('dashboard.search_panel.secondary_hint', { defaultValue: 'Sensitive records stay separate.' })}</span>
                        <Link
                            to="/vault"
                            className="inline-flex items-center gap-1 font-semibold text-[var(--hi-accent)] transition hover:text-[var(--hi-accent-strong)]"
                        >
                            <KeyRound className="h-4 w-4" />
                            <span>{t('navigation.personal_vault')}</span>
                        </Link>
                    </div>
                </section>
            </PageHeader>

            {/* Warning and Notification Banners */}
            {(expiredItems.length > 0 || closeToExpiryItems.length > 0 || lowStockItems.length > 0 || overdueTasks.length > 0) && (
                <div className="space-y-3">
                    {expiredItems.length > 0 && (
                        <NoticeBanner
                            tone="danger"
                            icon={AlertTriangle}
                            title={t('dashboard.alerts.expired_title', { defaultValue: 'Son Kullanma Tarihi Geçmiş Eşyalar Var!' })}
                            description={t('dashboard.alerts.expired_desc', {
                                count: expiredItems.length,
                                defaultValue: 'Envanterinizde son kullanma tarihi geçmiş {{count}} eşya bulunuyor. Güvenliğiniz için bunları kontrol edin.'
                            })}
                            action={
                                <Link to="/items" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm text-red-500 border-red-200 bg-red-100/50 dark:bg-red-500/10 hover:bg-red-100">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            }
                        />
                    )}

                    {overdueTasks.length > 0 && (
                        <NoticeBanner
                            tone="warning"
                            icon={Wrench}
                            title={t('dashboard.alerts.maintenance_title', { defaultValue: 'Gecikmiş Bakım Görevleri Var!' })}
                            description={t('dashboard.alerts.maintenance_desc', {
                                count: overdueTasks.length,
                                defaultValue: 'Zamanı geçmiş {{count}} bakım görevi bulunuyor. Cihazlarınızın ömrünü uzatmak için bakımlarını yapın.'
                            })}
                            action={
                                <Link to="/maintenance" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm">
                                    {t('dashboard.alerts.go_to_maintenance', { defaultValue: 'Bakıma Git' })}
                                </Link>
                            }
                        />
                    )}

                    {lowStockItems.length > 0 && (
                        <NoticeBanner
                            tone="info"
                            icon={ShoppingCart}
                            title={t('dashboard.alerts.low_stock_title', { defaultValue: 'Azalan Stok Uyarısı' })}
                            description={t('dashboard.alerts.low_stock_desc', {
                                count: lowStockItems.length,
                                defaultValue: '{{count}} ürün belirlediğiniz asgari stok limitinin altına düştü.'
                            })}
                            action={
                                <Link to="/shopping" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm text-[var(--hi-accent)] border-[var(--hi-accent-soft)]">
                                    {t('dashboard.alerts.go_to_shopping', { defaultValue: 'Alışveriş Listesi' })}
                                </Link>
                            }
                        />
                    )}

                    {closeToExpiryItems.length > 0 && expiredItems.length === 0 && (
                        <NoticeBanner
                            tone="info"
                            icon={Calendar}
                            title={t('dashboard.alerts.close_expiry_title', { defaultValue: 'Yaklaşan Son Kullanma Tarihleri' })}
                            description={t('dashboard.alerts.close_expiry_desc', {
                                count: closeToExpiryItems.length,
                                defaultValue: '{{count}} ürünün son kullanma tarihi 30 gün içinde dolacak.'
                            })}
                            action={
                                <Link to="/items" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            }
                        />
                    )}
                </div>
            )}

            <section className="card !p-4 lg:!p-5">
                <SectionHeader
                    title={t('dashboard.content.title')}
                    description={hasItems ? t('dashboard.content.description') : t('dashboard.content.description_empty')}
                    action={hasItems ? (
                        <Link to="/items" className="btn-secondary !rounded-[12px] !px-4 !py-2.5 text-sm">
                            <span>{t('dashboard.content.see_all')}</span>
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    ) : null}
                />

                {recentItems.length > 0 ? (
                    <div className="mt-4 space-y-3">
                        {recentItems.map((item) => {
                            const itemTitle = resolveVisibleItemTitle(item, t('dashboard.content.untitled_item'));
                            const visibilityIsPublic = Number(item.is_public) === 1;
                            const locationParts = [
                                item.room_name ? resolveVisibleRoomName({ id: item.room_id, name: item.room_name }) : '',
                                item.location_name
                            ].filter(Boolean);
                            const locationText = locationParts.join(' • ') || t('dashboard.content.location_fallback');
                            const addedOn = formatItemDate(item.created_at || item.createdAt, locale);
                            const statusNote = item.active_borrow?.borrower_display_name
                                ? t('inventory.borrow.borrowed_to', {
                                    name: item.active_borrow.borrower_display_name || t('inventory.borrow.unknown')
                                })
                                : locationText;

                            return (
                                <Link
                                    key={item.id}
                                    to={`/items/${item.id}/edit`}
                                    className="group grid gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--hi-border-strong)] hover:shadow-[var(--hi-shadow-soft)] sm:grid-cols-[68px_minmax(0,1fr)_20px] sm:items-center"
                                >
                                    <div className="h-[68px] w-[68px] overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
                                        {item.photo_path ? (
                                            <SecureImage
                                                src={item.photo_path}
                                                alt={itemTitle}
                                                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                                fallback={<div className="flex h-full items-center justify-center text-3xl opacity-40">{item.category_icon || '📦'}</div>}
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-3xl opacity-40">{item.category_icon || '📦'}</div>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <p className="truncate text-base font-semibold leading-tight tracking-[-0.01em] text-[var(--hi-text)] sm:text-lg">
                                            {itemTitle}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium leading-5 text-[var(--hi-text-muted)] sm:text-xs">
                                            <span className="inline-flex items-center gap-1">
                                                {visibilityIsPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                                <span>{visibilityIsPublic ? t('dashboard.visibility.public') : t('dashboard.visibility.private')}</span>
                                            </span>
                                            <span>{t('dashboard.content.quantity', { count: item.quantity || 0 })}</span>
                                            {addedOn && <span>{t('dashboard.content.added_on', { date: addedOn })}</span>}
                                        </div>
                                        <p className="mt-1.5 truncate text-sm leading-5 text-[var(--hi-text-soft)]">{statusNote}</p>
                                    </div>

                                    <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-[var(--hi-text-muted)] sm:block" />
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mt-4">
                        <EmptyState
                            icon={Package}
                            title={t('dashboard.content.empty_title', { defaultValue: 'No recent additions yet' })}
                            description={t('dashboard.content.empty_description', { defaultValue: 'This list starts filling itself as soon as you add the first item. Begin with something easy to recognize later, then rooms and categories will stay truthful from day one.' })}
                            actions={(
                                <Link to="/items/new" className="btn-primary">
                                    <Plus className="h-4 w-4" />
                                    <span>{t('navigation.new_item')}</span>
                                </Link>
                            )}
                            tips={[
                                {
                                    title: t('dashboard.content.empty_tip_one_title', { defaultValue: 'Start with one visible household item' }),
                                    description: t('dashboard.content.empty_tip_one_body', { defaultValue: 'Pick something you will recognize instantly later, like an appliance, storage box, or small tool.' })
                                },
                                {
                                    title: t('dashboard.content.empty_tip_two_title', { defaultValue: 'Assign a real room' }),
                                    description: t('dashboard.content.empty_tip_two_body', { defaultValue: 'Room and category counts stay accurate only when new items are assigned as they are created.' })
                                },
                                {
                                    title: t('dashboard.content.empty_tip_three_title', { defaultValue: 'Keep secrets out of the shared feed' }),
                                    description: t('dashboard.content.empty_tip_three_body', { defaultValue: 'Use Personal Vault for keys, codes, deeds, or anything that should not appear in household inventory history.' })
                                }
                            ]}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}
