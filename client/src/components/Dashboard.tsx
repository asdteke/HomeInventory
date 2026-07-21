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
import { LoadingState, SectionHeader, NoticeBanner } from './ProductUI';
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
        <div className="dashboard-notice-actions">
            {action}
            <button
                type="button"
                onClick={() => dismissAlert(alertId)}
                className="dashboard-notice-dismiss"
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
        <div className="dashboard-page">
            <header className="dashboard-intro">
                <div className="dashboard-intro-copy">
                    <h1>{t('dashboard.page.title')}</h1>
                    <p>
                        {hasItems
                            ? t('dashboard.page.description_ready', { defaultValue: 'Your household inventory, recent activity, and important reminders in one calm overview.' })
                            : t('dashboard.page.description_empty')}
                    </p>
                </div>

                <Link to="/items/new" className="btn-primary dashboard-desktop-create hidden lg:inline-flex">
                    <Plus className="h-4 w-4" />
                    <span>{t('navigation.new_item')}</span>
                </Link>

                <div className="dashboard-stats" aria-label={t('dashboard.page.title')}>
                    {hasItems ? (
                        <>
                            <span className="dashboard-stat">
                                <strong>{formattedTotalItems}</strong>
                                <small>{t('dashboard.stats.total_items', { defaultValue: 'Items' })}</small>
                            </span>
                            <span className="dashboard-stat">
                                <strong>{formattedTotalQuantity}</strong>
                                <small>{t('dashboard.stats.total_quantity', { defaultValue: 'Total quantity' })}</small>
                            </span>
                            {sharedItemsCount > 0 && (
                                <span className="dashboard-stat">
                                    <strong>{formattedSharedItems}</strong>
                                    <small>{t('dashboard.visibility.public', { defaultValue: 'Shared' })}</small>
                                </span>
                            )}
                            {borrowedItemsCount > 0 && (
                                <span className="dashboard-stat">
                                    <strong>{formattedBorrowedItems}</strong>
                                    <small>{t('inventory.borrow.borrowed_badge', { defaultValue: 'Borrowed' })}</small>
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="dashboard-empty-status">
                            <span aria-hidden="true" />
                            {t('dashboard.top_bar.status_empty')}
                        </span>
                    )}
                </div>
            </header>

            <section className="dashboard-search-region" aria-labelledby="dashboard-search-title">
                <div className="dashboard-search-heading">
                    <h2 id="dashboard-search-title">{t('dashboard.search_panel.title')}</h2>
                    <Link to="/vault" className="dashboard-vault-link">
                        <KeyRound className="h-4 w-4" />
                        <span>{t('navigation.personal_vault')}</span>
                    </Link>
                </div>

                <form onSubmit={handleSearch} className="dashboard-search-form">
                    <Search className="dashboard-search-icon" aria-hidden="true" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('dashboard.search_panel.placeholder')}
                        aria-label={t('dashboard.search_panel.placeholder')}
                    />
                    <button type="submit" className="dashboard-search-submit" aria-label={t('dashboard.search_panel.submit')}>
                        <Search className="h-4 w-4" />
                        <span>{t('dashboard.search_panel.submit')}</span>
                    </button>
                </form>
            </section>

            {/* Warning and Notification Banners */}
            {hasVisibleAlerts && (
                <div className="dashboard-alerts space-y-3">
                    {showExpiredAlert && (
                        <NoticeBanner
                            className="dashboard-notice"
                            tone="danger"
                            icon={AlertTriangle}
                            title={t('dashboard.alerts.expired_title', { defaultValue: 'Son Kullanma Tarihi Geçmiş Eşyalar Var!' })}
                            description={t('dashboard.alerts.expired_desc', {
                                count: expiredItemIds.length,
                                defaultValue: '{{count}} eşyanın son kullanma tarihi geçti.'
                            })}
                            action={renderAlertAction('expired',
                                <Link to="/alerts/expired" className="dashboard-notice-link text-red-500">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            )}
                        />
                    )}

                    {showMaintenanceAlert && (
                        <NoticeBanner
                            className="dashboard-notice"
                            tone="warning"
                            icon={Wrench}
                            title={t('dashboard.alerts.maintenance_title', { defaultValue: 'Gecikmiş Bakım Görevleri Var!' })}
                            description={t('dashboard.alerts.maintenance_desc', {
                                count: overdueMaintenanceTaskIds.length,
                                defaultValue: '{{count}} bakım görevi gecikmiş.'
                            })}
                            action={renderAlertAction('maintenance',
                                <Link to="/alerts/maintenance" className="dashboard-notice-link">
                                    {t('dashboard.alerts.go_to_maintenance', { defaultValue: 'Bakıma Git' })}
                                </Link>
                            )}
                        />
                    )}

                    {showLowStockAlert && (
                        <NoticeBanner
                            className="dashboard-notice"
                            tone="info"
                            icon={ShoppingCart}
                            title={t('dashboard.alerts.low_stock_title', { defaultValue: 'Azalan Stok Uyarısı' })}
                            description={t('dashboard.alerts.low_stock_desc', {
                                count: lowStockItemIds.length,
                                defaultValue: '{{count}} ürün belirlediğiniz asgari stok limitinin altına düştü.'
                            })}
                            action={renderAlertAction('lowStock',
                                <Link to="/alerts/low-stock" className="dashboard-notice-link text-[var(--hi-accent)]">
                                    {t('dashboard.alerts.view_low_stock_items', { defaultValue: 'Azalan Stokları Gör' })}
                                </Link>
                            )}
                        />
                    )}

                    {showCloseToExpiryAlert && (
                        <NoticeBanner
                            className="dashboard-notice"
                            tone="info"
                            icon={Calendar}
                            title={t('dashboard.alerts.close_expiry_title', { defaultValue: 'Yaklaşan Son Kullanma Tarihleri' })}
                            description={t('dashboard.alerts.close_expiry_desc', {
                                count: closeToExpiryItemIds.length,
                                defaultValue: '{{count}} ürünün son kullanma tarihi 30 gün içinde dolacak.'
                            })}
                            action={renderAlertAction('closeToExpiry',
                                <Link to="/alerts/expiring" className="dashboard-notice-link">
                                    {t('dashboard.alerts.view_items', { defaultValue: 'Eşyaları Gör' })}
                                </Link>
                            )}
                        />
                    )}
                </div>
            )}

            <section className="dashboard-feed">
                <SectionHeader
                    title={t('dashboard.content.title')}
                    className="dashboard-feed-header"
                    action={hasItems ? (
                        <Link to="/items" className="dashboard-see-all">
                            <span>{t('dashboard.content.see_all')}</span>
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    ) : null}
                />

                {recentItems.length > 0 ? (
                    <div className="dashboard-recent-list">
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
                                    className="dashboard-recent-item group grid gap-3 sm:grid-cols-[58px_minmax(0,1fr)_20px] sm:items-center"
                                >
                                    <div className="dashboard-item-media">
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
                    <div className="dashboard-empty-feed">
                        <span className="dashboard-empty-icon" aria-hidden="true">
                            <Package className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                            <h3>{t('dashboard.content.empty_title', { defaultValue: 'No recent additions yet' })}</h3>
                            <p>{t('dashboard.content.empty_description', { defaultValue: 'İlk eşyayı eklediğinizde bu alan otomatik dolacak.' })}</p>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
