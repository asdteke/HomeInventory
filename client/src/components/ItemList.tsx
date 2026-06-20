import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Search, Grid3X3, List, Plus, Trash2, Eye, Lock, Globe, MapPin, Package, Clock3, ArrowRightLeft, AlertTriangle, TrendingDown, DoorOpen } from 'lucide-react';
import SecureImage from './SecureImage';
import { BorrowItemDialog, ReturnItemDialog } from './BorrowDialogs';
import { ConfirmDialog } from './ModalDialog';
import { formatBorrowDate, isBorrowOverdue } from '../utils/borrowFormatting';
import {
    ACTION_REQUEST_TIMEOUT_MS,
    createRequestConfig,
    getRequestErrorMessage
} from '../utils/httpRequests';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { EmptyState, LoadingState, PageHeader } from './ProductUI';
import FloatingToast from './FloatingToast';
import IconActionButton from './IconActionButton';
import SegmentedToggle from './SegmentedToggle';
import { getRoomPresentation } from '../utils/roomDisplay';
import { getCategoryPresentation } from '../utils/categoryDisplay';

import { fetchWithCache, getCachedData, hasCache, invalidateCache } from '../utils/apiCache';

const ITEM_CACHE_PATTERN = /^\/api\/items/;

export default function ItemList() {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const isActiveRef = useRef(false);
    const didHydrateRef = useRef(false);

    // Determine initial query URL dynamically
    const getInitialQueryUrl = () => {
        const params = new URLSearchParams();
        const search = searchParams.get('search') || '';
        const cat = searchParams.get('category_id') || '';
        const room = searchParams.get('room_id') || '';
        if (search) params.append('search', search);
        if (cat) params.append('category_id', cat);
        if (room) params.append('room_id', room);
        const queryStr = params.toString();
        return queryStr ? `/api/items?${queryStr}` : '/api/items';
    };

    const initialQueryUrl = getInitialQueryUrl();

    // Initialize states from SWR cache
    const [items, setItems] = useState<any[]>(() => getCachedData(initialQueryUrl)?.items || []);
    const [categories, setCategories] = useState<any[]>(() => getCachedData('/api/categories')?.categories || []);
    const [rooms, setRooms] = useState<any[]>(() => getCachedData('/api/rooms')?.rooms || []);
    const [houseMembers, setHouseMembers] = useState<any[]>(() => getCachedData('/api/auth/house-members')?.members || []);

    const isInitiallyLoaded = hasCache(initialQueryUrl) &&
                               hasCache('/api/categories') &&
                               hasCache('/api/rooms') &&
                               hasCache('/api/auth/house-members');
    const [loading, setLoading] = useState(!isInitiallyLoaded);
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filters, setFilters] = useState({
        search: searchParams.get('search') || '',
        category_id: searchParams.get('category_id') || '',
        room_id: searchParams.get('room_id') || ''
    });
    const [lendDialogItem, setLendDialogItem] = useState<any | null>(null);
    const [lendSubmitting, setLendSubmitting] = useState(false);
    const [returnDialogItem, setReturnDialogItem] = useState<any | null>(null);
    const [returnSubmitting, setReturnSubmitting] = useState(false);
    const [pendingDeleteItem, setPendingDeleteItem] = useState<any | null>(null);
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
    const [toast, setToast] = useState<{ title: string; description: string; tone?: any } | null>(null);
    const hasActiveFilters = Boolean(filters.search || filters.category_id || filters.room_id);
    const secondaryActionButtonClass = 'flex-1 lg:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-2 text-sm font-medium text-[var(--hi-text)] transition-all duration-200 hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]';
    const currentLanguage = i18n.resolvedLanguage || i18n.language;

    const getVisibleRoomName = (roomLike: any) => {
        if (!roomLike) {
            return '';
        }

        const fullRoom = roomLike.id
            ? rooms.find((room) => String(room.id) === String(roomLike.id))
            : null;

        return getRoomPresentation(fullRoom || roomLike, currentLanguage).name;
    };

    const getVisibleCategoryName = (categoryLike: any) => {
        if (!categoryLike) {
            return '';
        }

        const fullCategory = categoryLike.id
            ? categories.find((category) => String(category.id) === String(categoryLike.id))
            : null;

        return getCategoryPresentation(fullCategory || categoryLike, currentLanguage).name;
    };

    const buildQueryString = (activeFilters = filters) => {
        const params = new URLSearchParams();
        if (activeFilters.search) params.append('search', activeFilters.search);
        if (activeFilters.category_id) params.append('category_id', activeFilters.category_id);
        if (activeFilters.room_id) params.append('room_id', activeFilters.room_id);
        return params.toString();
    };

    useEffect(() => {
        isActiveRef.current = true;

        const fetchData = async () => {
            try {
                const initialQuery = buildQueryString({
                    search: searchParams.get('search') || '',
                    category_id: searchParams.get('category_id') || '',
                    room_id: searchParams.get('room_id') || ''
                });
                const queryUrl = initialQuery ? `/api/items?${initialQuery}` : '/api/items';

                await Promise.all([
                    fetchWithCache(queryUrl, (data) => {
                        if (isActiveRef.current) setItems(data.items || []);
                    }),
                    fetchWithCache('/api/categories', (data) => {
                        if (isActiveRef.current) setCategories(data.categories || []);
                    }),
                    fetchWithCache('/api/rooms', (data) => {
                        if (isActiveRef.current) setRooms(data.rooms || []);
                    }),
                    fetchWithCache('/api/auth/house-members', (data) => {
                        if (isActiveRef.current) setHouseMembers(data.members || []);
                    }).catch(() => {
                        if (isActiveRef.current) setHouseMembers([]);
                    })
                ]);

                if (isActiveRef.current) {
                    setFilters({
                        search: searchParams.get('search') || '',
                        category_id: searchParams.get('category_id') || '',
                        room_id: searchParams.get('room_id') || ''
                    });
                    didHydrateRef.current = true;
                }
            } catch (error) {
                if (isActiveRef.current) {
                    console.error(error);
                }
            } finally {
                if (isActiveRef.current) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isActiveRef.current = false;
        };
    }, []);

    useEffect(() => {
        const nextFilters = {
            search: searchParams.get('search') || '',
            category_id: searchParams.get('category_id') || '',
            room_id: searchParams.get('room_id') || ''
        };

        setFilters((current) => {
            if (
                current.search === nextFilters.search &&
                current.category_id === nextFilters.category_id &&
                current.room_id === nextFilters.room_id
            ) {
                return current;
            }
            return nextFilters;
        });
    }, [searchParams]);

    useEffect(() => {
        if (!didHydrateRef.current) {
            return;
        }

        const nextQuery = buildQueryString(filters);
        const currentQuery = searchParams.toString();
        if (nextQuery !== currentQuery) {
            setSearchParams(nextQuery ? new URLSearchParams(nextQuery) : new URLSearchParams(), { replace: true });
        }

        const timerId = setTimeout(() => {
            fetchItems(filters);
        }, 300);

        return () => {
            clearTimeout(timerId);
        };
    }, [filters.search, filters.category_id, filters.room_id]);

    const fetchItems = async (activeFilters = filters) => {
        if (!isActiveRef.current) {
            return;
        }

        setFiltersLoading(true);
        try {
            const query = buildQueryString(activeFilters);
            const queryUrl = query ? `/api/items?${query}` : '/api/items';

            await fetchWithCache(queryUrl, (data) => {
                if (isActiveRef.current) {
                    setItems(data.items || []);
                }
            });
        } catch (error) {
            if (isActiveRef.current) {
                console.error(error);
                setItems([]);
            }
        } finally {
            if (isActiveRef.current) {
                setFiltersLoading(false);
            }
        }
    };

    const handleDelete = async () => {
        if (!pendingDeleteItem) {
            return;
        }

        const itemToDelete = pendingDeleteItem;
        const itemIdToDelete = itemToDelete.id;

        // Immediately close the confirmation modal
        setPendingDeleteItem(null);

        // 1. Mark item as deleting to trigger exit animation in CSS (.inventory-item-card.is-deleting)
        if (isActiveRef.current) {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.add(itemIdToDelete);
                return next;
            });
        }

        // 2. Determine exit delay based on reduced motion setting with safe window environment detection
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const exitDelay = prefersReducedMotion ? 0 : 400;

        // 3. Start API request immediately in background
        const apiPromise = axios.delete(
            `/api/items/${itemIdToDelete}`,
            createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
        );

        // Wait for the exit animation duration to complete before removing from local list
        await new Promise((resolve) => setTimeout(resolve, exitDelay));

        if (isActiveRef.current) {
            // Optimistically remove the item from the local items list so user doesn't see a blank gap
            setItems((currentItems) => currentItems.filter((item) => item.id !== itemIdToDelete));
        }

        try {
            await apiPromise;
            invalidateCache(ITEM_CACHE_PATTERN);

            if (isActiveRef.current) {
                setDeletingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(itemIdToDelete);
                    return next;
                });
                setToast({
                    title: t('inventory.delete_success_title', { defaultValue: 'Item deleted' }),
                    description: t('inventory.delete_success_body', { defaultValue: 'The item was removed from the active household inventory.' }),
                    tone: 'success'
                });
            }
        } catch (error) {
            console.error('Delete item failed:', error);

            if (isActiveRef.current) {
                // Remove deleting status so it is no longer marked in is-deleting
                setDeletingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(itemIdToDelete);
                    return next;
                });
                // Re-fetch items from the server. This perfectly and safely restores the item (if deletion failed)
                // in the correct order and respects all active search query or category filters.
                await fetchItems();

                setToast({
                    title: t('inventory.delete_error_title', { defaultValue: 'Delete failed' }),
                    description: getRequestErrorMessage(error, t('inventory.delete_error')),
                    tone: 'danger'
                });
            }
        }
    };

    const clearFilters = () => {
        setFilters({ search: '', category_id: '', room_id: '' });
    };

    const handleLendSubmit = async (payload: any) => {
        if (!lendDialogItem) {
            return;
        }

        const lendItemTitle = resolveVisibleItemTitle(lendDialogItem, t('inventory.untitled_item'));
        setLendSubmitting(true);
        try {
            const response = await axios.post(
                `/api/items/${lendDialogItem.id}/borrow`,
                payload,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );

            if (!isActiveRef.current) {
                return;
            }

            const isPendingMemberOffer = Boolean(response.data?.request)
                && ['member', 'site_member'].includes(payload.borrower_type);
            invalidateCache(ITEM_CACHE_PATTERN);
            if (response.data?.item) {
                setItems((currentItems) => currentItems.map((item) => (
                    item.id === lendDialogItem.id
                        ? response.data.item
                        : item
                )));
            }
            setToast(isPendingMemberOffer ? {
                title: t('inventory.borrow.offer_sent_title', { defaultValue: 'Borrow offer sent' }),
                description: response.data?.message || t('inventory.borrow.offer_sent_body', {
                    item: lendItemTitle,
                    defaultValue: '{{item}} will be marked as borrowed after the other member accepts.'
                })
            } : {
                title: t('inventory.borrow.lend_success_title', { defaultValue: 'Item lent' }),
                description: t('inventory.borrow.lend_success_body', {
                    item: lendItemTitle,
                    defaultValue: '{{item}} is now marked as borrowed.'
                })
            });
            setLendDialogItem(null);
        } catch (error: any) {
            if (isActiveRef.current) {
                const message = getRequestErrorMessage(error, t('inventory.borrow.actions_error'));
                setToast({
                    title: t('common.error', { defaultValue: 'Error' }),
                    description: message,
                    tone: 'danger'
                });
            }
            throw error;
        } finally {
            if (isActiveRef.current) {
                setLendSubmitting(false);
            }
        }
    };

    const handleReturnSubmit = async (payload: any) => {
        if (!returnDialogItem) {
            return;
        }

        setReturnSubmitting(true);
        try {
            const activeBorrowId = returnDialogItem.active_borrow?.id;
            const response = await axios.post(
                activeBorrowId
                    ? `/api/borrow-requests/active-borrows/${activeBorrowId}/return`
                    : `/api/items/${returnDialogItem.id}/return`,
                payload,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            if (isActiveRef.current && response.data?.item) {
                setItems((currentItems) => currentItems.map((item) => (
                    item.id === returnDialogItem.id ? response.data.item : item
                )));
            }
            invalidateCache(ITEM_CACHE_PATTERN);
            await fetchItems();
            if (isActiveRef.current) {
                setReturnDialogItem(null);
            }
        } catch (error: any) {
            if (isActiveRef.current) {
                const message = getRequestErrorMessage(error, t('inventory.borrow.actions_error'));
                setToast({
                    title: t('common.error', { defaultValue: 'Error' }),
                    description: message,
                    tone: 'danger'
                });
            }
            throw error;
        } finally {
            if (isActiveRef.current) {
                setReturnSubmitting(false);
            }
        }
    };

    if (loading) {
        return (
            <LoadingState
                title={t('common.loading')}
                description={t('inventory.loading_description', {
                    defaultValue: 'Eşyalar, odalar ve filtreler hazırlaştırılıyor.'
                })}
            />
        );
    }

    return (
        <div className="space-y-5 animate-fade-in">
            <PageHeader
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={t('inventory.title')}
                description={t('inventory.subtitle', { count: items.length })}
                meta={hasActiveFilters ? [{ label: t('dashboard.filters.remove', { defaultValue: 'Clear filters available' }), tone: 'secondary' }] : []}
                actions={items.length > 0 ? (
                    <Link to="/items/new" className="btn-primary inline-flex items-center justify-center gap-2 self-start">
                        <Plus className="w-5 h-5" /> {t('inventory.new_item')}
                    </Link>
                ) : null}
            >
                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="app-kicker">{t('common.search', { defaultValue: 'Search' })}</p>
                            <p className="mt-2 text-sm text-[var(--hi-text-soft)]">
                                {t('dashboard.search_panel.description', { defaultValue: 'Find an item, room, location, or barcode from one place.' })}
                            </p>
                        </div>
                        <SegmentedToggle
                            ariaLabel={t('inventory.view_mode', { defaultValue: 'Item layout' })}
                            value={viewMode}
                            onChange={(val) => setViewMode(val as 'grid' | 'list')}
                            className="hidden sm:inline-flex"
                            activeClassName="bg-[var(--hi-accent)] text-white shadow-[var(--hi-shadow-soft)]"
                            options={[
                                { value: 'grid', label: t('inventory.grid_view', { defaultValue: 'Grid' }), icon: Grid3X3 },
                                { value: 'list', label: t('inventory.list_view', { defaultValue: 'List' }), icon: List }
                            ]}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="relative sm:col-span-2">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--hi-text-muted)]" />
                            <input
                                type="text"
                                placeholder={t('inventory.search_placeholder')}
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                aria-label={t('inventory.search_placeholder')}
                                className="input-field pl-12"
                            />
                        </div>
                        <select
                            value={filters.category_id}
                            onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
                            aria-label={t('inventory.category_filter_label', { defaultValue: 'Kategoriye göre filtrele' })}
                            className="input-field"
                        >
                            <option value="">{t('inventory.all_categories')}</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.icon} {getVisibleCategoryName(category)}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.room_id}
                            onChange={(e) => setFilters({ ...filters, room_id: e.target.value })}
                            aria-label={t('inventory.room_filter_label', { defaultValue: 'Odaya göre filtrele' })}
                            className="input-field"
                        >
                            <option value="">{t('inventory.all_rooms')}</option>
                            {rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                    {getVisibleRoomName(room)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </PageHeader>

            {filtersLoading && (
                <div className="flex justify-center py-3">
                    <LoadingState
                        compact
                        title={t('inventory.refreshing_results', { defaultValue: 'Liste güncelleniyor...' })}
                    />
                </div>
            )}

            {/* Items */}
            <div aria-busy={filtersLoading}>
                {items.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title={hasActiveFilters
                        ? t('inventory.empty_filter_title', { defaultValue: 'Aramanıza uygun eşya bulunamadı' })
                        : t('inventory.empty_title')}
                    description={hasActiveFilters ? t('inventory.empty_filter') : t('inventory.empty_msg')}
                    className="!py-10"
                    actions={(
                        <>
                            {hasActiveFilters && (
                                <button type="button" onClick={clearFilters} className="btn-secondary">
                                    <Search className="w-4 h-4" />
                                    <span>{t('dashboard.filters.remove', { defaultValue: 'Clear Filter' })}</span>
                                </button>
                            )}
                            <Link to="/items/new" className="btn-primary inline-flex items-center gap-2">
                                <Plus className="w-5 h-5" /> {t('inventory.add_first')}
                            </Link>
                        </>
                    )}
                />
            ) : (
                <>
                    {/* Mobile: Always cards / Desktop: Grid or List */}
                    <div className={`
            grid gap-4
            grid-cols-1 sm:grid-cols-2
            ${viewMode === 'grid' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-1'}
          `}>
                        {items.map((item) => {
                            const itemTitle = resolveVisibleItemTitle(item, t('inventory.untitled_item'));
                            const activeBorrow = item.active_borrow;
                            const overdue = isBorrowOverdue(activeBorrow);
                            const returnPending = Boolean(activeBorrow?.return_requested_at);
                            const canManageItem = item.can_edit !== undefined
                                ? Boolean(item.can_edit)
                                : item.user_id === user?.id;
                            const canLendItem = !activeBorrow && canManageItem;
                            const visibleCategoryName = item.category_name
                                ? getVisibleCategoryName({ id: item.category_id, name: item.category_name })
                                : '';
                            const visibleRoomName = item.room_name
                                ? getVisibleRoomName({ id: item.room_id, name: item.room_name })
                                : '';

                            const isDeleting = deletingIds.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        borderLeft: `4px solid ${item.category_color || 'var(--hi-border)'}`
                                    }}
                                    className={`
                                        inventory-item-card card flex h-full flex-col p-0 overflow-hidden group hover:scale-[1.002] hover:-translate-y-[1.5px] hover:shadow-[var(--hi-shadow-soft)]
                                        ${isDeleting ? 'is-deleting' : ''}
                                        ${viewMode === 'list' ? 'lg:flex lg:items-center' : ''}
                                    `.trim()}
                                >
                                    {/* Image */}
                                    <div className={`
                  overflow-hidden relative bg-[var(--hi-panel-muted)]
                  ${viewMode === 'list' ? 'lg:w-24 lg:h-24 lg:flex-shrink-0' : 'aspect-[4/3] sm:aspect-square'}
                `}>
                                        {item.photo_path ? (
                                            <SecureImage
                                                src={item.photo_path}
                                                alt={itemTitle}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                fallback={
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <span className={`opacity-40 ${viewMode === 'list' ? 'text-3xl lg:text-2xl' : 'text-4xl sm:text-5xl'}`}>{item.category_icon || '📦'}</span>
                                                    </div>
                                                }
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className={`opacity-40 ${viewMode === 'list' ? 'text-3xl lg:text-2xl' : 'text-4xl sm:text-5xl'}`}>{item.category_icon || '📦'}</span>
                                            </div>
                                        )}

                                        <div className="absolute top-2 left-2 flex gap-1">
                                            {activeBorrow && (
                                                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold text-white ${overdue ? 'bg-rose-500/95' : 'bg-[var(--hi-accent)]'}`}>
                                                    {overdue ? t('inventory.borrow.overdue_badge') : t('inventory.borrow.borrowed_badge')}
                                                </span>
                                            )}
                                        </div>

                                        <div className="absolute top-2 right-2 flex gap-1">
                                            {item.is_public ? <span className="p-1.5 rounded-full bg-[var(--hi-accent)] text-white"><Globe className="w-3 h-3" /></span>
                                                : <span className="p-1.5 rounded-full bg-[var(--hi-secondary)] text-white"><Lock className="w-3 h-3" /></span>}
                                        </div>
                                        {user && item.user_id !== user.id && (
                                            <div className="absolute bottom-2 left-2">
                                                <span className="px-2 py-1 rounded-full bg-black/70 text-white text-xs font-medium backdrop-blur">{item.owner_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={`flex flex-1 flex-col p-4 ${viewMode === 'list' ? 'lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-4' : ''}`}>
                                        <div className={`${viewMode === 'list' ? 'lg:flex-1' : 'flex-1'}`}>
                                            <div className="mb-2 flex items-start justify-between gap-3">
                                                <h3 className="min-w-0 flex-1 font-semibold leading-tight text-[var(--hi-text)] [overflow-wrap:anywhere]">
                                                    {itemTitle}
                                                </h3>
                                                <span className="ml-2 flex-shrink-0 text-sm text-[var(--hi-text-soft)]">×{item.quantity}</span>
                                            </div>

                                            {item.description && viewMode !== 'list' && (
                                                <p className="mb-3 text-sm text-[var(--hi-text-soft)] line-clamp-2">{item.description}</p>
                                            )}

                                            {activeBorrow && (
                                                <div className={`mb-3 rounded-2xl border px-3 py-2 ${returnPending
                                                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                                                    : overdue
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                                                    : 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                                                    }`}>
                                                    <p className="text-sm font-medium">
                                                        {returnPending
                                                            ? (
                                                                activeBorrow.role === 'borrower'
                                                                    ? t('borrow_requests.active.return_pending_borrower')
                                                                    : t('borrow_requests.active.return_pending_lender', { name: activeBorrow.borrower_display_name || activeBorrow.counterpart_display_name || t('inventory.borrow.unknown') })
                                                            )
                                                            : t('inventory.borrow.borrowed_to', { name: activeBorrow.borrower_display_name || t('inventory.borrow.unknown') })}
                                                    </p>
                                                    {activeBorrow.due_date && (
                                                        <p className="mt-1 inline-flex items-center gap-1 text-xs">
                                                            <Clock3 className="w-3.5 h-3.5" />
                                                            {t('inventory.borrow.due_date_short', { date: formatBorrowDate(activeBorrow.due_date, i18n.language) })}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Tags */}
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {visibleCategoryName && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${item.category_color}15`, color: item.category_color }}>
                                                        <span className="truncate max-w-[11rem]">{item.category_icon} {visibleCategoryName}</span>
                                                    </span>
                                                )}
                                                {visibleRoomName && (
                                                    <span className="badge max-w-full text-xs py-0.5 inline-flex items-center gap-1">
                                                        <DoorOpen className="w-3 h-3 text-[var(--hi-text-muted)] shrink-0" />
                                                        <span className="truncate">{visibleRoomName}</span>
                                                    </span>
                                                )}
                                                {item.location_name && (
                                                    <span className="badge max-w-full text-xs py-0.5 inline-flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-[var(--hi-text-muted)] shrink-0" />
                                                        <span className="truncate">{item.location_name}</span>
                                                    </span>
                                                )}
                                                {item.is_expired && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-red-200 bg-red-100/60 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                                                        <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
                                                        <span>{t('items.status.expired', { defaultValue: 'Son Kullanma Geçti' })}</span>
                                                    </span>
                                                )}
                                                {!item.is_expired && item.is_close_to_expiry && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-amber-200 bg-amber-100/60 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                                                        <Clock3 className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                                        <span>{t('items.status.close_to_expiry', { defaultValue: 'Yakında Sona Erecek' })}</span>
                                                    </span>
                                                )}
                                                {item.is_low_stock && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-orange-200 bg-orange-100/60 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
                                                        <TrendingDown className="w-3 h-3 text-orange-600 dark:text-orange-400 shrink-0" />
                                                        <span>{t('items.status.low_stock', { defaultValue: 'Azalan Stok' })}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className={`mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2 ${viewMode === 'list' ? 'lg:mt-0 lg:w-[28rem] lg:flex-shrink-0' : ''}`}>
                                            <div className="min-w-0">
                                                {activeBorrow && activeBorrow.can_mark_returned !== false ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setReturnDialogItem({ ...item, name: itemTitle })}
                                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--hi-accent-border)] bg-[var(--hi-accent-soft)] px-3 text-sm font-medium text-[var(--hi-accent)] transition-all duration-200 hover:bg-[var(--hi-accent)] hover:text-white hover:border-transparent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                                >
                                                    {activeBorrow.role === 'borrower'
                                                        ? t('borrow_requests.actions.mark_delivered')
                                                        : t('borrow_requests.actions.mark_received')}
                                                </button>
                                                ) : !activeBorrow && canLendItem ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setLendDialogItem({ ...item, name: itemTitle })}
                                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-3 text-sm font-medium text-[var(--hi-text)] transition-all duration-200 hover:border-[var(--hi-accent)] hover:text-[var(--hi-accent)] hover:bg-[var(--hi-accent-soft)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4 text-[var(--hi-accent)]" />
                                                    <span>{t('inventory.borrow.lend')}</span>
                                                </button>
                                                ) : (
                                                    <span aria-hidden="true" className="block h-11" />
                                                )}
                                            </div>
                                            <Link to={`/items/${item.id}/edit`} className={`${secondaryActionButtonClass} h-11 w-full justify-center px-3`}>
                                                <Eye className="w-4 h-4 text-[var(--hi-text-muted)]" /> <span className={viewMode === 'list' ? 'lg:hidden xl:inline' : ''}>{t('common.details', { defaultValue: 'Details' })}</span>
                                            </Link>
                                            {canManageItem ? (
                                                <IconActionButton
                                                    label={t('inventory.delete_action', { defaultValue: 'Delete item' })}
                                                    icon={Trash2}
                                                    tone="danger"
                                                    onClick={() => setPendingDeleteItem(item)}
                                                    className="h-11 w-11 shrink-0 border border-[var(--hi-border)] bg-[var(--hi-panel)] active:scale-[0.98] transition-all duration-200 hover:border-red-500/20"
                                                />
                                            ) : (
                                                <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
            </div>

            <BorrowItemDialog
                item={lendDialogItem}
                members={houseMembers}
                currentUserId={user?.id}
                submitting={lendSubmitting}
                onClose={() => !lendSubmitting && setLendDialogItem(null)}
                onSubmit={handleLendSubmit}
            />

            <ReturnItemDialog
                item={returnDialogItem}
                submitting={returnSubmitting}
                onClose={() => !returnSubmitting && setReturnDialogItem(null)}
                onSubmit={handleReturnSubmit}
            />

            <ConfirmDialog
                isOpen={Boolean(pendingDeleteItem)}
                title={t('inventory.delete_title', { defaultValue: 'Delete this item?' })}
                description={t('inventory.delete_description', { defaultValue: 'This removes the item from the household inventory. Use this only when you are sure it should not stay in history.' })}
                tone="danger"
                confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
                cancelLabel={t('common.cancel')}
                confirmButtonClassName="btn-danger"
                onClose={() => setPendingDeleteItem(null)}
                onConfirm={handleDelete}
                confirming={false}
            >
                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="font-medium text-[var(--hi-text)]">{pendingDeleteItem?.name}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('inventory.delete_warning', { defaultValue: 'Photos, description, and placement details tied to this record will be removed from the active inventory view.' })}
                    </p>
                </div>
            </ConfirmDialog>

            <FloatingToast
                open={Boolean(toast)}
                title={toast?.title}
                description={toast?.description}
                tone={toast?.tone}
                onClose={() => setToast(null)}
            />
        </div>
    );
}
