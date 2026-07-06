import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    Calendar,
    X
} from 'lucide-react';
import SecureImage from './SecureImage';
import { EmptyState, LoadingState, PageHeader, SectionHeader, NoticeBanner } from './ProductUI';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';

interface DashboardStats {
    totalItems: number;
    totalQuantity: number;
    sharedItemsCount?: number;
    borrowedItemsCount?: number;
}

interface InventoryItem {
    id: number;
    name?: string;
    item_name?: string;
    title?: string;
    label?: string;
    created_at?: string;
    createdAt?: string;
    is_public?: number | boolean;
    active_borrow?: {
        borrower_display_name?: string;
    } | null;
    photo_path?: string;
    category_icon?: string;
    quantity?: number;
    room_name?: string;
    room_id?: number;
    location_name?: string;
    is_expired?: boolean;
    is_close_to_expiry?: boolean;
    is_low_stock?: boolean;
}

interface DashboardAlerts {
    expiredItemIds?: number[];
    closeToExpiryItemIds?: number[];
    lowStockItemIds?: number[];
    overdueMaintenanceTaskIds?: number[];
}

interface DashboardSummary {
    stats?: DashboardStats;
    recentItems?: InventoryItem[];
    alerts?: DashboardAlerts;
}

function formatItemDate(value: string | undefined, locale: string): string | null {
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

import { fetchWithCache, getCachedData, hasCache } from '../utils/apiCache';

const DISMISSED_DASHBOARD_ALERTS_KEY = 'dashboard_dismissed_alerts_v1';
const DASHBOARD_SUMMARY_URL = '/api/items/dashboard-summary';

function readDismissedDashboardAlerts(): Record<string, string> {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        return JSON.parse(window.localStorage.getItem(DISMISSED_DASHBOARD_ALERTS_KEY) || '{}');
    } catch {
        return {};
    }
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const cachedDashboardSummary = getCachedData(DASHBOARD_SUMMARY_URL) as DashboardSummary | null;

    const [stats, setStats] = useState<DashboardStats | null>(() => cachedDashboardSummary?.stats || null);
    const [recentDashboardItems, setRecentDashboardItems] = useState<InventoryItem[]>(() => cachedDashboardSummary?.recentItems || []);
    const [dashboardAlerts, setDashboardAlerts] = useState<DashboardAlerts>(() => cachedDashboardSummary?.alerts || {});
    const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, string>>(readDismissedDashboardAlerts);

    const [loading, setLoading] = useState<boolean>(!hasCache(DASHBOARD_SUMMARY_URL));
    const [searchQuery, setSearchQuery] = useState<string>('');

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                await fetchWithCache(DASHBOARD_SUMMARY_URL, (data: DashboardSummary) => {
                    if (!isMounted) {
                        return;
                    }

                    setStats(data.stats || null);
                    setRecentDashboardItems(data.recentItems || []);
                    setDashboardAlerts(data.alerts || {});
                });
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, []);

    const recentItems = useMemo(() => {
        return [...recentDashboardItems]
            .sort((a, b) => {
                const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                return dateB - dateA;
            })
            .slice(0, 5);
    }, [recentDashboardItems]);

    const locale = i18n.language || 'en';
    const resolveVisibleRoomName = (roomLike: { id?: number; name?: string } | null) => {
        if (!roomLike) {
            return '';
        }

        return getRoomPresentation(roomLike, locale).name;
    };

    const totalItems = typeof stats?.totalItems === 'number' ? stats.totalItems : recentItems.length;
    const totalQuantity = typeof stats?.totalQuantity === 'number'
        ? stats.totalQuantity
        : recentItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const sharedItemsCount = stats?.sharedItemsCount || 0;
    const borrowedItemsCount = stats?.borrowedItemsCount || 0;
    const hasItems = totalItems > 0;
    const formattedTotalItems = formatNumberForLanguage(totalItems, locale);
    const formattedTotalQuantity = formatNumberForLanguage(totalQuantity, locale);
    const formattedSharedItems = formatNumberForLanguage(sharedItemsCount, locale);
    const formattedBorrowedItems = formatNumberForLanguage(borrowedItemsCount, locale);

    const expiredItemIds = dashboardAlerts.expiredItemIds || [];
    const closeToExpiryItemIds = dashboardAlerts.closeToExpiryItemIds || [];
    const lowStockItemIds = dashboardAlerts.lowStockItemIds || [];
    const overdueMaintenanceTaskIds = dashboardAlerts.overdueMaintenanceTaskIds || [];
    const alertSignatures = useMemo(() => ({
        expired: [...expiredItemIds].sort((a, b) => a - b).join(','),
        maintenance: [...overdueMaintenanceTaskIds].sort((a, b) => a - b).join(','),
        lowStock: [...lowStockItemIds].sort((a, b) => a - b).join(','),
        closeToExpiry: [...closeToExpiryItemIds].sort((a, b) => a - b).join(',')
    }), [expiredItemIds, overdueMaintenanceTaskIds, lowStockItemIds, closeToExpiryItemIds]);

    const isAlertDismissed = (alertId: keyof typeof alertSignatures) => (
        dismissedAlerts[alertId] === alertSignatures[alertId]
    );
    const dismissAlert = (alertId: keyof typeof alertSignatures) => {
        const next = {
            ...dismissedAlerts,
            [alertId]: alertSignatures[alertId]
        };
        setDismissedAlerts(next);
        window.localStorage.setItem(DISMISSED_DASHBOARD_ALERTS_KEY, JSON.stringify(next));
    };
    const renderAlertAction = (alertId: keyof typeof alertSignatures, action: ReactNode) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {action}
            <button
                type="button"
                onClick={() => dismissAlert(alertId)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hi-border)] text-[var(--hi-text-soft)] transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                aria-label={t('common.close')}
                title={t('common.close')}
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
    const showExpiredAlert = expiredItemIds.length > 0 && !isAlertDismissed('expired');
    const showMaintenanceAlert = overdueMaintenanceTaskIds.length > 0 && !isAlertDismissed('maintenance');
    const showLowStockAlert = lowStockItemIds.length > 0 && !isAlertDismissed('lowStock');
    const showCloseToExpiryAlert = closeToExpiryItemIds.length > 0
        && expiredItemIds.length === 0
        && !isAlertDismissed('closeToExpiry');
    const hasVisibleAlerts = showExpiredAlert || showMaintenanceAlert || showLowStockAlert || showCloseToExpiryAlert;

    const handleSearch = (event: React.FormEvent) => {
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
                description={t('dashboard.page.loading_description', { defaultValue: 'Ana görünüm hazırlanıyor.' })}
            />
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('dashboard.page.title')}
                description={hasItems ? undefined : t('dashboard.page.description_empty')}
                meta={hasItems ? [
                    { label: t('dashboard.top_bar.items_tracked', { count: formattedTotalItems as any }), tone: 'accent' as const },
                    { label: t('dashboard.top_bar.total_quantity', { count: formattedTotalQuantity as any }), tone: 'secondary' as const },
                    ...(sharedItemsCount > 0 ? [{ label: t('dashboard.top_bar.shared_items', { count: formattedSharedItems as any }), tone: 'secondary' as const }] : []),
                    ...(borrowedItemsCount > 0 ? [{ label: t('dashboard.top_bar.borrowed_now', { count: formattedBorrowedItems as any }), tone: 'accent' as const }] : [])
                ] : [
                    { label: t('dashboard.top_bar.status_empty'), tone: 'secondary' as const }
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
            {hasVisibleAlerts && (
                <div className="space-y-3">
                    {showExpiredAlert && (
                        <NoticeBanner
                            tone="danger"
                            icon={AlertTriangle}
                            title={t('dashboard.alerts.expired_title', { defaultValue: 'Son Kullanma Tarihi Geçmiş Eşyalar Var!' })}
                            description={t('dashboard.alerts.expired_desc', {
                                count: expiredItemIds.length,
                                defaultValue: '{{count}} eşyanın son kullanma tarihi geçti.'
                            })}
                            action={renderAlertAction('expired',
                                <Link to="/alerts/expired" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm text-red-500 border-red-200 bg-red-100/50 dark:bg-red-500/10 hover:bg-red-100">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            )}
                        />
                    )}

                    {showMaintenanceAlert && (
                        <NoticeBanner
                            tone="warning"
                            icon={Wrench}
                            title={t('dashboard.alerts.maintenance_title', { defaultValue: 'Gecikmiş Bakım Görevleri Var!' })}
                            description={t('dashboard.alerts.maintenance_desc', {
                                count: overdueMaintenanceTaskIds.length,
                                defaultValue: '{{count}} bakım görevi gecikmiş.'
                            })}
                            action={renderAlertAction('maintenance',
                                <Link to="/alerts/maintenance" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm">
                                    {t('dashboard.alerts.go_to_maintenance', { defaultValue: 'Bakıma Git' })}
                                </Link>
                            )}
                        />
                    )}

                    {showLowStockAlert && (
                        <NoticeBanner
                            tone="info"
                            icon={ShoppingCart}
                            title={t('dashboard.alerts.low_stock_title', { defaultValue: 'Azalan Stok Uyarısı' })}
                            description={t('dashboard.alerts.low_stock_desc', {
                                count: lowStockItemIds.length,
                                defaultValue: '{{count}} ürün belirlediğiniz asgari stok limitinin altına düştü.'
                            })}
                            action={renderAlertAction('lowStock',
                                <Link to="/alerts/low-stock" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm text-[var(--hi-accent)] border-[var(--hi-accent-soft)]">
                                    {t('dashboard.alerts.view_low_stock_items', { defaultValue: 'Azalan Stokları Gör' })}
                                </Link>
                            )}
                        />
                    )}

                    {showCloseToExpiryAlert && (
                        <NoticeBanner
                            tone="info"
                            icon={Calendar}
                            title={t('dashboard.alerts.close_expiry_title', { defaultValue: 'Yaklaşan Son Kullanma Tarihleri' })}
                            description={t('dashboard.alerts.close_expiry_desc', {
                                count: closeToExpiryItemIds.length,
                                defaultValue: '{{count}} ürünün son kullanma tarihi 30 gün içinde dolacak.'
                            })}
                            action={renderAlertAction('closeToExpiry',
                                <Link to="/alerts/expiring" className="btn-secondary !rounded-[12px] !px-4 !py-2 text-sm">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            )}
                        />
                    )}
                </div>
            )}

            <section className="card !p-4 lg:!p-5">
                <SectionHeader
                    title={t('dashboard.content.title')}
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
                                                fallback={
                                                    <div className="flex h-full items-center justify-center">
                                                        {item.category_icon ? (
                                                            <span className="opacity-70 text-3xl">{item.category_icon}</span>
                                                        ) : (
                                                            <Package className="h-7 w-7 stroke-[1.5] text-[var(--hi-text-muted)] opacity-60" />
                                                        )}
                                                    </div>
                                                }
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center">
                                                {item.category_icon ? (
                                                    <span className="opacity-70 text-3xl">{item.category_icon}</span>
                                                ) : (
                                                    <Package className="h-7 w-7 stroke-[1.5] text-[var(--hi-text-muted)] opacity-60" />
                                                )}
                                            </div>
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
                            description={t('dashboard.content.empty_description', { defaultValue: 'İlk eşyayı eklediğinizde bu alan otomatik dolacak.' })}
                            actions={(
                                <Link to="/items/new" className="btn-primary">
                                    <Plus className="h-4 w-4" />
                                    <span>{t('navigation.new_item')}</span>
                                </Link>
                            )}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}
