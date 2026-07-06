import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Search, Grid3X3, List, Plus, Minus, Trash2, Eye, Lock, Globe, MapPin, Package, Clock3, ArrowRightLeft, AlertTriangle, TrendingDown, DoorOpen, CheckSquare, Square, QrCode, Layers, Tags, ShieldCheck, Bell, SlidersHorizontal } from 'lucide-react';
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
const DEFAULT_ITEM_SORT = 'updated_desc';

interface InventoryFilters {
    search: string;
    category_id: string;
    room_id: string;
    location_id: string;
    visibility: string;
    stock: string;
    expiry: string;
    borrowed: string;
    warranty: string;
    sort: string;
}

function createFiltersFromSearchParams(searchParams: URLSearchParams): InventoryFilters {
    return {
        search: searchParams.get('search') || '',
        category_id: searchParams.get('category_id') || '',
        room_id: searchParams.get('room_id') || '',
        location_id: searchParams.get('location_id') || '',
        visibility: searchParams.get('visibility') || '',
        stock: searchParams.get('stock') || '',
        expiry: searchParams.get('expiry') || '',
        borrowed: searchParams.get('borrowed') || '',
        warranty: searchParams.get('warranty') || '',
        sort: searchParams.get('sort') || DEFAULT_ITEM_SORT
    };
}

function areFiltersEqual(a: InventoryFilters, b: InventoryFilters) {
    return (
        a.search === b.search &&
        a.category_id === b.category_id &&
        a.room_id === b.room_id &&
        a.location_id === b.location_id &&
        a.visibility === b.visibility &&
        a.stock === b.stock &&
        a.expiry === b.expiry &&
        a.borrowed === b.borrowed &&
        a.warranty === b.warranty &&
        a.sort === b.sort
    );
}

export default function ItemList() {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const isActiveRef = useRef(false);
    const didHydrateRef = useRef(false);

    // Determine initial query URL dynamically
    const getInitialQueryUrl = () => {
        const params = new URLSearchParams();
        const initialFilters = createFiltersFromSearchParams(searchParams);
        Object.entries(initialFilters).forEach(([key, value]) => {
            if (!value || (key === 'sort' && value === DEFAULT_ITEM_SORT)) {
                return;
            }
            params.append(key, value);
        });
        const queryStr = params.toString();
        return queryStr ? `/api/items?${queryStr}` : '/api/items';
    };

    const initialQueryUrl = getInitialQueryUrl();

    // Initialize states from SWR cache
    const [items, setItems] = useState<any[]>(() => getCachedData(initialQueryUrl)?.items || []);
    const [categories, setCategories] = useState<any[]>(() => getCachedData('/api/categories')?.categories || []);
    const [rooms, setRooms] = useState<any[]>(() => getCachedData('/api/rooms')?.rooms || []);
    const [locations, setLocations] = useState<any[]>(() => getCachedData('/api/locations')?.locations || []);
    const [houseMembers, setHouseMembers] = useState<any[]>(() => getCachedData('/api/auth/house-members')?.members || []);

    const isInitiallyLoaded = hasCache(initialQueryUrl) &&
                               hasCache('/api/categories') &&
                               hasCache('/api/rooms') &&
                               hasCache('/api/locations') &&
                               hasCache('/api/auth/house-members');
    const [loading, setLoading] = useState(!isInitiallyLoaded);
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filters, setFilters] = useState<InventoryFilters>(() => createFiltersFromSearchParams(searchParams));
    const [lendDialogItem, setLendDialogItem] = useState<any | null>(null);
    const [lendSubmitting, setLendSubmitting] = useState(false);
    const [returnDialogItem, setReturnDialogItem] = useState<any | null>(null);
    const [returnSubmitting, setReturnSubmitting] = useState(false);
    const [pendingDeleteItem, setPendingDeleteItem] = useState<any | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
    const [bulkSubmitting, setBulkSubmitting] = useState(false);
    const [bulkCategoryId, setBulkCategoryId] = useState('');
    const [bulkRoomId, setBulkRoomId] = useState('');
    const [bulkLocationId, setBulkLocationId] = useState('');
    const [bulkVisibility, setBulkVisibility] = useState('');
    const [stockAdjustingIds, setStockAdjustingIds] = useState<Set<number>>(new Set());
    const [showDetailedFilters, setShowDetailedFilters] = useState(false);
    const [toast, setToast] = useState<{ title: string; description: string; tone?: any } | null>(null);
    const hasDetailedFilters = Boolean(
        filters.location_id ||
        filters.visibility ||
        filters.stock ||
        filters.expiry ||
        filters.borrowed ||
        filters.warranty
    );
    const shouldShowDetailedFilters = showDetailedFilters || hasDetailedFilters;
    const hasActiveFilters = Boolean(
        filters.search ||
        filters.category_id ||
        filters.room_id ||
        filters.location_id ||
        filters.visibility ||
        filters.stock ||
        filters.expiry ||
        filters.borrowed ||
        filters.warranty ||
        filters.sort !== DEFAULT_ITEM_SORT
    );
    const secondaryActionButtonClass = 'flex-1 lg:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-2 text-sm font-medium text-[var(--hi-text)] transition-all duration-200 hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]';
    const compactFilterInputClass = 'input-field !h-10 !rounded-xl !px-3 !py-2 text-sm';
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
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (!value || (key === 'sort' && value === DEFAULT_ITEM_SORT)) {
                return;
            }
            params.append(key, value);
        });
        return params.toString();
    };

    useEffect(() => {
        isActiveRef.current = true;

        const fetchData = async () => {
            try {
                const initialQuery = buildQueryString(createFiltersFromSearchParams(searchParams));
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
                    fetchWithCache('/api/locations', (data) => {
                        if (isActiveRef.current) setLocations(data.locations || []);
                    }),
                    fetchWithCache('/api/auth/house-members', (data) => {
                        if (isActiveRef.current) setHouseMembers(data.members || []);
                    }).catch(() => {
                        if (isActiveRef.current) setHouseMembers([]);
                    })
                ]);

                if (isActiveRef.current) {
                    setFilters(createFiltersFromSearchParams(searchParams));
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
        const nextFilters = createFiltersFromSearchParams(searchParams);

        setFilters((current) => {
            if (areFiltersEqual(current, nextFilters)) {
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
    }, [
        filters.search,
        filters.category_id,
        filters.room_id,
        filters.location_id,
        filters.visibility,
        filters.stock,
        filters.expiry,
        filters.borrowed,
        filters.warranty,
        filters.sort
    ]);

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

    const availableLocations = React.useMemo(() => {
        if (!filters.room_id) {
            return locations;
        }

        return locations.filter((location) => String(location.room_id || '') === String(filters.room_id));
    }, [locations, filters.room_id]);

    const selectedEditableItems = React.useMemo(() => {
        return items.filter((item) => selectedItemIds.has(item.id) && (item.can_edit !== undefined ? Boolean(item.can_edit) : item.user_id === user?.id));
    }, [items, selectedItemIds, user?.id]);
    const selectableItemIds = React.useMemo(() => {
        return items
            .filter((item) => item.can_edit !== undefined ? Boolean(item.can_edit) : item.user_id === user?.id)
            .map((item) => item.id);
    }, [items, user?.id]);
    const selectedCount = selectedEditableItems.length;
    const allSelectableSelected = selectableItemIds.length > 0 && selectableItemIds.every((id) => selectedItemIds.has(id));

    useEffect(() => {
        setSelectedItemIds((current) => {
            const visibleIds = new Set(items.map((item) => item.id));
            const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [items]);

    const toggleItemSelection = (itemId: number) => {
        setSelectedItemIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const toggleSelectAllVisible = () => {
        setSelectedItemIds((current) => {
            const next = new Set(current);
            if (allSelectableSelected) {
                selectableItemIds.forEach((id) => next.delete(id));
            } else {
                selectableItemIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedItemIds(new Set());
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

    const handleBulkUpdate = async () => {
        if (!selectedCount || bulkSubmitting) {
            return;
        }

        const payload: Record<string, any> = {};
        if (bulkCategoryId) payload.category_id = bulkCategoryId;
        if (bulkRoomId) payload.room_id = bulkRoomId;
        if (bulkLocationId) payload.location_id = bulkLocationId;
        if (bulkVisibility) payload.is_public = bulkVisibility === 'public';

        if (!Object.keys(payload).length) {
            setToast({
                title: t('common.error', { defaultValue: 'Error' }),
                description: t('inventory.bulk.no_fields', { defaultValue: 'Toplu işlem için en az bir alan seçin.' }),
                tone: 'warning'
            });
            return;
        }

        setBulkSubmitting(true);
        try {
            const response = await axios.post('/api/items/bulk', {
                action: 'update',
                item_ids: selectedEditableItems.map((item) => item.id),
                payload
            }, createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS }));

            invalidateCache(ITEM_CACHE_PATTERN);
            await fetchItems();
            clearSelection();
            setBulkCategoryId('');
            setBulkRoomId('');
            setBulkLocationId('');
            setBulkVisibility('');
            setToast({
                title: t('inventory.bulk.updated_title', { defaultValue: 'Toplu güncelleme tamamlandı' }),
                description: t('inventory.bulk.updated_body', {
                    count: response.data?.updatedCount || selectedCount,
                    skipped: response.data?.skippedCount || 0,
                    defaultValue: '{{count}} eşya güncellendi. {{skipped}} eşya atlandı.'
                }),
                tone: 'success'
            });
        } catch (error) {
            setToast({
                title: t('common.error', { defaultValue: 'Error' }),
                description: getRequestErrorMessage(error, t('inventory.bulk.update_error', { defaultValue: 'Toplu güncelleme tamamlanamadı.' })),
                tone: 'danger'
            });
        } finally {
            setBulkSubmitting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedCount || bulkSubmitting) {
            return;
        }

        setPendingBulkDelete(false);
        setBulkSubmitting(true);
        try {
            const response = await axios.post('/api/items/bulk', {
                action: 'delete',
                item_ids: selectedEditableItems.map((item) => item.id)
            }, createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS }));

            invalidateCache(ITEM_CACHE_PATTERN);
            await fetchItems();
            clearSelection();
            setToast({
                title: t('inventory.bulk.deleted_title', { defaultValue: 'Toplu silme tamamlandı' }),
                description: t('inventory.bulk.deleted_body', {
                    count: response.data?.updatedCount || selectedCount,
                    skipped: response.data?.skippedCount || 0,
                    defaultValue: '{{count}} eşya silindi. {{skipped}} eşya atlandı.'
                }),
                tone: 'success'
            });
        } catch (error) {
            setToast({
                title: t('common.error', { defaultValue: 'Error' }),
                description: getRequestErrorMessage(error, t('inventory.bulk.delete_error', { defaultValue: 'Toplu silme tamamlanamadı.' })),
                tone: 'danger'
            });
        } finally {
            setBulkSubmitting(false);
        }
    };

    const handleStockAdjust = async (item: any, delta: number) => {
        if (!item?.id || stockAdjustingIds.has(item.id)) {
            return;
        }

        setStockAdjustingIds((current) => new Set(current).add(item.id));
        try {
            const response = await axios.post(`/api/items/${item.id}/stock-adjust`, {
                delta
            }, createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS }));

            invalidateCache(ITEM_CACHE_PATTERN);
            if (response.data?.item) {
                setItems((currentItems) => currentItems.map((currentItem) => (
                    currentItem.id === item.id ? response.data.item : currentItem
                )));
            }
        } catch (error) {
            setToast({
                title: t('common.error', { defaultValue: 'Error' }),
                description: getRequestErrorMessage(error, t('inventory.stock_adjust_error', { defaultValue: 'Stok güncellenemedi.' })),
                tone: 'danger'
            });
        } finally {
            setStockAdjustingIds((current) => {
                const next = new Set(current);
                next.delete(item.id);
                return next;
            });
        }
    };

    const clearFilters = () => {
        setFilters({
            search: '',
            category_id: '',
            room_id: '',
            location_id: '',
            visibility: '',
            stock: '',
            expiry: '',
            borrowed: '',
            warranty: '',
            sort: DEFAULT_ITEM_SORT
        });
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

    const currentQueryString = buildQueryString(filters);
    const qrLabelsLink = currentQueryString ? `/qr-labels?${currentQueryString}` : '/qr-labels';
    const storageLabelsLink = '/storage-labels';
    const inventoryTools = [
        {
            to: qrLabelsLink,
            label: t('inventory.qr_labels.open', { defaultValue: 'Eşya Etiketleri' }),
            icon: QrCode
        },
        {
            to: storageLabelsLink,
            label: t('storage_labels.title', { defaultValue: 'Raf Etiketleri' }),
            icon: Tags
        },
        {
            to: '/service',
            label: t('navigation.service', { defaultValue: 'Servis' }),
            icon: ShieldCheck
        },
        {
            to: '/notifications',
            label: t('navigation.notifications', { defaultValue: 'Bildirimler' }),
            icon: Bell
        }
    ];

    return (
        <div className="space-y-4 animate-fade-in">
            <PageHeader
                className="inventory-page-header"
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={t('inventory.title')}
                description={t('inventory.subtitle', { count: items.length })}
                meta={hasActiveFilters ? [{ label: t('common.filter', { defaultValue: 'Filter' }), tone: 'secondary' }] : []}
                actions={(
                    <Link to="/items/new" className="btn-primary inline-flex items-center justify-center gap-2 self-start">
                        <Plus className="w-5 h-5" /> {t('inventory.new_item')}
                    </Link>
                )}
            >
                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-2.5 shadow-[var(--hi-shadow-soft)]">
                    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
                        <p className="sr-only">{t('common.filter', { defaultValue: 'Filter' })}</p>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                                type="button"
                                onClick={() => setShowDetailedFilters((current) => !current)}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold transition ${shouldShowDetailedFilters ? 'border-[var(--hi-accent-border)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]' : 'border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]'}`}
                                aria-expanded={shouldShowDetailedFilters}
                                aria-label={t('common.details', { defaultValue: 'Details' })}
                                title={t('common.details', { defaultValue: 'Details' })}
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                            </button>
                            {items.length > 0 && inventoryTools.map((tool) => {
                                const ToolIcon = tool.icon;
                                return (
                                    <Link
                                        key={tool.to}
                                        to={tool.to}
                                        className="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text)] transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]"
                                        aria-label={tool.label}
                                        title={tool.label}
                                    >
                                        <ToolIcon className="h-4 w-4 text-[var(--hi-accent)]" />
                                    </Link>
                                );
                            })}
                            <SegmentedToggle
                                ariaLabel={t('inventory.view_mode', { defaultValue: 'Item layout' })}
                                value={viewMode}
                                onChange={(val) => setViewMode(val as 'grid' | 'list')}
                                className="hidden sm:inline-flex"
                                buttonClassName="h-7 w-8 p-0 text-sm"
                                activeClassName="bg-[var(--hi-accent)] text-white shadow-[var(--hi-shadow-soft)]"
                                options={[
                                    {
                                        value: 'grid',
                                        label: '',
                                        ariaLabel: t('inventory.grid_view', { defaultValue: 'Grid' }),
                                        tooltip: t('inventory.grid_view', { defaultValue: 'Grid' }),
                                        icon: Grid3X3
                                    },
                                    {
                                        value: 'list',
                                        label: '',
                                        ariaLabel: t('inventory.list_view', { defaultValue: 'List' }),
                                        tooltip: t('inventory.list_view', { defaultValue: 'List' }),
                                        icon: List
                                    }
                                ]}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hi-text-muted)]" />
                            <input
                                type="text"
                                placeholder={t('inventory.search_placeholder')}
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                aria-label={t('inventory.search_placeholder')}
                                className={`${compactFilterInputClass} !pl-10`}
                            />
                        </div>
                        <select
                            value={filters.category_id}
                            onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
                            aria-label={t('inventory.category_filter_label', { defaultValue: 'Kategoriye göre filtrele' })}
                            className={compactFilterInputClass}
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
                            onChange={(e) => setFilters({ ...filters, room_id: e.target.value, location_id: '' })}
                            aria-label={t('inventory.room_filter_label', { defaultValue: 'Odaya göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.all_rooms')}</option>
                            {rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                    {getVisibleRoomName(room)}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.sort}
                            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
                            aria-label={t('inventory.sort_label', { defaultValue: 'Sıralama' })}
                            className={compactFilterInputClass}
                        >
                            <option value="updated_desc">{t('inventory.sort_updated_desc', { defaultValue: 'Son güncellenen' })}</option>
                            <option value="updated_asc">{t('inventory.sort_updated_asc', { defaultValue: 'En eski güncelleme' })}</option>
                            <option value="created_desc">{t('inventory.sort_created_desc', { defaultValue: 'Yeni eklenen' })}</option>
                            <option value="created_asc">{t('inventory.sort_created_asc', { defaultValue: 'İlk eklenen' })}</option>
                            <option value="name_asc">{t('inventory.sort_name_asc', { defaultValue: 'Ada göre A-Z' })}</option>
                            <option value="name_desc">{t('inventory.sort_name_desc', { defaultValue: 'Ada göre Z-A' })}</option>
                            <option value="quantity_desc">{t('inventory.sort_quantity_desc', { defaultValue: 'Adet yüksekten düşüğe' })}</option>
                            <option value="quantity_asc">{t('inventory.sort_quantity_asc', { defaultValue: 'Adet düşükten yükseğe' })}</option>
                            <option value="expiry_asc">{t('inventory.sort_expiry_asc', { defaultValue: 'Son kullanma yakından uzağa' })}</option>
                            <option value="expiry_desc">{t('inventory.sort_expiry_desc', { defaultValue: 'Son kullanma uzaktan yakına' })}</option>
                        </select>
                    </div>

                    {shouldShowDetailedFilters && (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <select
                            value={filters.location_id}
                            onChange={(e) => setFilters({ ...filters, location_id: e.target.value })}
                            aria-label={t('inventory.location_filter_label', { defaultValue: 'Konuma göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.all_locations', { defaultValue: 'Tüm konumlar' })}</option>
                            {availableLocations.map((location) => (
                                <option key={location.id} value={location.id}>
                                    {location.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.visibility}
                            onChange={(e) => setFilters({ ...filters, visibility: e.target.value })}
                            aria-label={t('inventory.visibility_filter_label', { defaultValue: 'Görünürlüğe göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.visibility_all', { defaultValue: 'Tüm görünürlükler' })}</option>
                            <option value="public">{t('items.form.visibility_public', { defaultValue: 'Paylaşılan' })}</option>
                            <option value="private">{t('items.form.visibility_private', { defaultValue: 'Özel' })}</option>
                            <option value="mine">{t('inventory.visibility_mine', { defaultValue: 'Benim eşyalarım' })}</option>
                            <option value="others">{t('inventory.visibility_others', { defaultValue: 'Başkalarının eşyaları' })}</option>
                        </select>
                        <select
                            value={filters.borrowed}
                            onChange={(e) => setFilters({ ...filters, borrowed: e.target.value })}
                            aria-label={t('inventory.borrow_filter_label', { defaultValue: 'Ödünç durumuna göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.borrow_filter_all', { defaultValue: 'Tüm ödünç durumları' })}</option>
                            <option value="borrowed">{t('inventory.borrow.borrowed_badge', { defaultValue: 'Ödünçte' })}</option>
                            <option value="available">{t('inventory.borrow.available', { defaultValue: 'Müsait' })}</option>
                            <option value="overdue">{t('inventory.borrow.overdue_badge', { defaultValue: 'Gecikmiş' })}</option>
                        </select>
                        <select
                            value={filters.stock}
                            onChange={(e) => setFilters({ ...filters, stock: e.target.value })}
                            aria-label={t('inventory.stock_filter_label', { defaultValue: 'Stok durumuna göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.stock_filter_all', { defaultValue: 'Tüm stok durumları' })}</option>
                            <option value="low">{t('items.status.low_stock', { defaultValue: 'Azalan Stok' })}</option>
                            <option value="ok">{t('inventory.stock_filter_ok', { defaultValue: 'Stok yeterli' })}</option>
                        </select>
                        <select
                            value={filters.expiry}
                            onChange={(e) => setFilters({ ...filters, expiry: e.target.value })}
                            aria-label={t('inventory.expiry_filter_label', { defaultValue: 'Son kullanma durumuna göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.expiry_filter_all', { defaultValue: 'Tüm son kullanma durumları' })}</option>
                            <option value="expired">{t('items.status.expired', { defaultValue: 'Son Kullanma Geçti' })}</option>
                            <option value="close">{t('items.status.close_to_expiry', { defaultValue: 'Yakında Sona Erecek' })}</option>
                            <option value="dated">{t('inventory.expiry_filter_dated', { defaultValue: 'Tarihi olanlar' })}</option>
                            <option value="none">{t('inventory.expiry_filter_none', { defaultValue: 'Tarihi olmayanlar' })}</option>
                        </select>
                        <select
                            value={filters.warranty}
                            onChange={(e) => setFilters({ ...filters, warranty: e.target.value })}
                            aria-label={t('inventory.warranty_filter_label', { defaultValue: 'Garanti durumuna göre filtrele' })}
                            className={compactFilterInputClass}
                        >
                            <option value="">{t('inventory.warranty_filter_all', { defaultValue: 'Tüm garanti durumları' })}</option>
                            <option value="expired">{t('inventory.warranty_filter_expired', { defaultValue: 'Garantisi bitenler' })}</option>
                            <option value="close">{t('inventory.warranty_filter_close', { defaultValue: 'Garantisi yakında bitecekler' })}</option>
                            <option value="active">{t('inventory.warranty_filter_active', { defaultValue: 'Garantisi devam edenler' })}</option>
                            <option value="none">{t('inventory.warranty_filter_none', { defaultValue: 'Garanti bilgisi olmayanlar' })}</option>
                        </select>
                        </div>
                    )}
                </div>
            </PageHeader>

            {items.length > 0 && (
                <section className={`bulk-action-bar ${selectedCount > 0 ? 'bulk-action-bar-active' : ''}`}>
                    <div className="bulk-action-summary">
                        <button
                            type="button"
                            onClick={toggleSelectAllVisible}
                            disabled={!selectableItemIds.length}
                            className="bulk-action-select"
                        >
                            {allSelectableSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            <span>
                                {allSelectableSelected
                                    ? t('inventory.bulk.clear_visible', { defaultValue: 'Listedekilerin seçimini kaldır' })
                                    : t('inventory.bulk.select_visible', { defaultValue: 'Listedekileri seç' })}
                            </span>
                        </button>
                        <div className="bulk-action-count">
                            <span className="bulk-action-count-number">{selectedCount}</span>
                            <span>{t('inventory.bulk.selected_short', { defaultValue: 'seçili' })}</span>
                        </div>
                        {selectedCount > 0 && (
                            <button type="button" onClick={clearSelection} className="bulk-action-clear">
                                {t('common.clear', { defaultValue: 'Temizle' })}
                            </button>
                        )}
                    </div>
                    {selectedCount > 0 && (
                        <div className="bulk-action-controls">
                            <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="input-field bulk-action-input">
                                <option value="">{t('inventory.bulk.keep_category', { defaultValue: 'Kategori değişmesin' })}</option>
                                {categories.map((category) => (
                                    <option key={category.id} value={category.id}>{category.icon} {getVisibleCategoryName(category)}</option>
                                ))}
                            </select>
                            <select value={bulkRoomId} onChange={(e) => { setBulkRoomId(e.target.value); setBulkLocationId(''); }} className="input-field bulk-action-input">
                                <option value="">{t('inventory.bulk.keep_room', { defaultValue: 'Oda değişmesin' })}</option>
                                {rooms.map((room) => (
                                    <option key={room.id} value={room.id}>{getVisibleRoomName(room)}</option>
                                ))}
                            </select>
                            <select value={bulkLocationId} onChange={(e) => setBulkLocationId(e.target.value)} className="input-field bulk-action-input">
                                <option value="">{t('inventory.bulk.keep_location', { defaultValue: 'Konum değişmesin' })}</option>
                                {locations
                                    .filter((location) => !bulkRoomId || String(location.room_id || '') === String(bulkRoomId))
                                    .map((location) => (
                                        <option key={location.id} value={location.id}>{location.name}</option>
                                    ))}
                            </select>
                            <select value={bulkVisibility} onChange={(e) => setBulkVisibility(e.target.value)} className="input-field bulk-action-input">
                                <option value="">{t('inventory.bulk.keep_visibility', { defaultValue: 'Görünürlük değişmesin' })}</option>
                                <option value="public">{t('items.form.visibility_public', { defaultValue: 'Paylaşılan' })}</option>
                                <option value="private">{t('items.form.visibility_private', { defaultValue: 'Özel' })}</option>
                            </select>
                            <button type="button" onClick={handleBulkUpdate} disabled={bulkSubmitting} className="bulk-action-apply">
                                <Layers className="h-4 w-4" />
                                <span>{bulkSubmitting ? t('common.loading') : t('inventory.bulk.apply', { defaultValue: 'Uygula' })}</span>
                            </button>
                            <button type="button" onClick={() => setPendingBulkDelete(true)} disabled={bulkSubmitting} className="bulk-action-delete" aria-label={t('common.delete', { defaultValue: 'Sil' })}>
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </section>
            )}

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
                                        ${viewMode === 'list' ? 'lg:min-h-[148px] lg:flex-row lg:items-stretch' : ''}
                                    `.trim()}
                                >
                                    {/* Image */}
                                    <div className={`
                  overflow-hidden relative bg-[var(--hi-panel-muted)]
                  ${viewMode === 'list' ? 'lg:w-36 lg:min-h-[148px] lg:flex-shrink-0 lg:self-stretch' : 'aspect-[4/3] sm:aspect-square'}
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
                                            <div className="flex h-full min-h-[132px] w-full items-center justify-center bg-gradient-to-br from-[var(--hi-panel-muted)] to-[var(--hi-bg-strong)]">
                                                <div className={`flex items-center justify-center rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] text-[var(--hi-text-muted)] shadow-sm ${viewMode === 'list' ? 'h-16 w-16 text-3xl' : 'h-20 w-20 text-4xl sm:h-24 sm:w-24 sm:text-5xl'}`}>
                                                    <span className="opacity-75">{item.category_icon || '📦'}</span>
                                                </div>
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
                                        {canManageItem && (
                                            <button
                                                type="button"
                                                onClick={() => toggleItemSelection(item.id)}
                                                className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/35 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70"
                                                aria-label={selectedItemIds.has(item.id)
                                                    ? t('inventory.bulk.unselect_item', { defaultValue: 'Seçimi kaldır' })
                                                    : t('inventory.bulk.select_item', { defaultValue: 'Eşyayı seç' })}
                                            >
                                                {selectedItemIds.has(item.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                            </button>
                                        )}
                                        {user && item.user_id !== user.id && (
                                            <div className="absolute bottom-2 left-2">
                                                <span className="px-2 py-1 rounded-full bg-black/70 text-white text-xs font-medium backdrop-blur">{item.owner_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={`flex flex-1 flex-col p-4 ${viewMode === 'list' ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] lg:items-center lg:gap-5 lg:px-5 lg:py-4 xl:grid-cols-[minmax(0,1fr)_minmax(23rem,31rem)]' : ''}`}>
                                        <div className={`${viewMode === 'list' ? 'min-w-0' : 'flex-1'}`}>
                                            <div className="mb-2 flex items-start justify-between gap-3">
                                                <h3 className="min-w-0 flex-1 font-semibold leading-tight text-[var(--hi-text)] [overflow-wrap:anywhere]">
                                                    {itemTitle}
                                                </h3>
                                                {canManageItem ? (
                                                    <div className="ml-2 inline-flex shrink-0 items-center rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)]">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStockAdjust(item, -1)}
                                                            disabled={stockAdjustingIds.has(item.id) || Number(item.quantity || 0) <= 0}
                                                            className="flex h-8 w-8 items-center justify-center text-[var(--hi-text-soft)] transition hover:text-[var(--hi-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                                                            aria-label={t('inventory.stock_decrease', { defaultValue: 'Stok azalt' })}
                                                        >
                                                            <Minus className="h-3.5 w-3.5" />
                                                        </button>
                                                        <span className="min-w-8 px-2 text-center text-sm font-semibold text-[var(--hi-text)]">×{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStockAdjust(item, 1)}
                                                            disabled={stockAdjustingIds.has(item.id)}
                                                            className="flex h-8 w-8 items-center justify-center text-[var(--hi-text-soft)] transition hover:text-[var(--hi-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                                                            aria-label={t('inventory.stock_increase', { defaultValue: 'Stok artır' })}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="ml-2 flex-shrink-0 text-sm text-[var(--hi-text-soft)]">×{item.quantity}</span>
                                                )}
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
                                            <div className={`flex flex-wrap gap-2 ${viewMode === 'list' ? 'mb-0' : 'mb-3'}`}>
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
                                        <div className={`mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2 ${viewMode === 'list' ? 'lg:mt-0 lg:w-full lg:flex-shrink-0' : ''}`}>
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

            <ConfirmDialog
                isOpen={pendingBulkDelete}
                title={t('inventory.bulk.delete_title', { defaultValue: 'Seçili eşyalar silinsin mi?' })}
                description={t('inventory.bulk.delete_description', {
                    count: selectedCount,
                    defaultValue: '{{count}} seçili eşya envanterden kaldırılacak. Bu işlem fotoğraf ve fatura görsellerini de kaldırır.'
                })}
                tone="danger"
                confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
                cancelLabel={t('common.cancel')}
                confirmButtonClassName="btn-danger"
                onClose={() => setPendingBulkDelete(false)}
                onConfirm={handleBulkDelete}
                confirming={bulkSubmitting}
            />

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
