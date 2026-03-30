import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Search, Grid3X3, List, Plus, Trash2, Edit3, Lock, Globe, MapPin, Package, Clock3 } from 'lucide-react';
import SecureImage from './SecureImage';
import { BorrowItemDialog, BorrowOfferDialog, ReturnItemDialog } from './BorrowDialogs';
import { formatBorrowDate, isBorrowOverdue } from '../utils/borrowFormatting';
import {
    ACTION_REQUEST_TIMEOUT_MS,
    createRequestConfig,
    getRequestErrorMessage
} from '../utils/httpRequests';

export default function ItemList() {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const isActiveRef = useRef(false);
    const didHydrateRef = useRef(false);
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [houseMembers, setHouseMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [filters, setFilters] = useState({ search: '', category_id: '', room_id: '' });
    const [borrowDialogItem, setBorrowDialogItem] = useState(null);
    const [offerDialogItem, setOfferDialogItem] = useState(null);
    const [returnDialogItem, setReturnDialogItem] = useState(null);
    const [borrowSubmitting, setBorrowSubmitting] = useState(false);
    const [offerSubmitting, setOfferSubmitting] = useState(false);
    const [returnSubmitting, setReturnSubmitting] = useState(false);

    useEffect(() => {
        isActiveRef.current = true;

        const fetchData = async () => {
            try {
                setLoading(true);

                const [itemsRes, catRes, roomRes, membersRes] = await Promise.all([
                    axios.get('/api/items'),
                    axios.get('/api/categories'),
                    axios.get('/api/rooms'),
                    axios.get('/api/houses/members').catch(() => ({ data: { members: [] } }))
                ]);

                if (!isActiveRef.current) {
                    return;
                }

                setItems(itemsRes.data.items || []);
                setCategories(catRes.data.categories || []);
                setRooms(roomRes.data.rooms || []);
                setHouseMembers(membersRes.data.members || []);
                didHydrateRef.current = true;
            } catch (error) {
                if (isActiveRef.current) {
                    console.error(error);
                    setItems([]);
                    setCategories([]);
                    setRooms([]);
                    setHouseMembers([]);
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
        if (!didHydrateRef.current) {
            return;
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
            const params = new URLSearchParams();
            if (activeFilters.search) params.append('search', activeFilters.search);
            if (activeFilters.category_id) params.append('category_id', activeFilters.category_id);
            if (activeFilters.room_id) params.append('room_id', activeFilters.room_id);

            const res = await axios.get(`/api/items?${params.toString()}`);

            if (!isActiveRef.current) {
                return;
            }

            setItems(res.data.items || []);
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

    const handleDelete = async (id) => {
        if (!confirm(t('inventory.delete_confirm'))) return;
        try {
            await axios.delete(
                `/api/items/${id}`,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            setItems((currentItems) => currentItems.filter((item) => item.id !== id));
        } catch (error) {
            alert(getRequestErrorMessage(error, t('inventory.delete_error')));
        }
    };

    const handleBorrowSubmit = async (payload) => {
        if (!borrowDialogItem) {
            return;
        }

        setBorrowSubmitting(true);
        try {
            await axios.post(
                `/api/items/${borrowDialogItem.id}/borrow`,
                payload,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            await fetchItems();
            setBorrowDialogItem(null);
        } catch (error) {
            const message = getRequestErrorMessage(error, t('inventory.borrow.actions_error'));
            alert(message);
            throw error;
        } finally {
            setBorrowSubmitting(false);
        }
    };

    const handleReturnSubmit = async (payload) => {
        if (!returnDialogItem) {
            return;
        }

        setReturnSubmitting(true);
        try {
            await axios.post(
                `/api/items/${returnDialogItem.id}/return`,
                payload,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            await fetchItems();
            setReturnDialogItem(null);
        } catch (error) {
            const message = getRequestErrorMessage(error, t('inventory.borrow.actions_error'));
            alert(message);
            throw error;
        } finally {
            setReturnSubmitting(false);
        }
    };

    const handleOfferSubmit = async (payload) => {
        if (!offerDialogItem) {
            return;
        }

        setOfferSubmitting(true);
        try {
            await axios.post(
                '/api/borrow-requests',
                {
                    ...payload,
                    item_id: offerDialogItem.id
                },
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            setOfferDialogItem(null);
        } catch (error) {
            const message = getRequestErrorMessage(error, t('borrow_requests.messages.action_error'));
            alert(message);
            throw error;
        } finally {
            setOfferSubmitting(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('inventory.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('inventory.subtitle', { count: items.length })}</p>
                </div>
                <Link to="/items/new" className="btn-primary inline-flex items-center justify-center gap-2">
                    <Plus className="w-5 h-5" /> {t('inventory.new_item')}
                </Link>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="text" placeholder={t('inventory.search_placeholder')} value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="input-field pl-12" />
                    </div>
                    <select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })} className="input-field">
                        <option value="">{t('inventory.all_categories')}</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                    <select value={filters.room_id} onChange={(e) => setFilters({ ...filters, room_id: e.target.value })} className="input-field">
                        <option value="">{t('inventory.all_rooms')}</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>
                {/* View Toggle - Hidden on mobile */}
                <div className="hidden sm:flex justify-end mt-4 gap-1">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <Grid3X3 className="w-5 h-5" />
                    </button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <List className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {filtersLoading && (
                <div className="flex justify-center py-4">
                    <div className="spinner"></div>
                </div>
            )}

            {/* Items */}
            {items.length === 0 ? (
                <div className="card text-center py-16">
                    <Package className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t('inventory.empty_title')}</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">{filters.search || filters.category_id || filters.room_id ? t('inventory.empty_filter') : t('inventory.empty_msg')}</p>
                    <Link to="/items/new" className="btn-primary inline-flex items-center gap-2"><Plus className="w-5 h-5" /> {t('inventory.add_first')}</Link>
                </div>
            ) : (
                <>
                    {/* Mobile: Always cards / Desktop: Grid or List */}
                    <div className={`
            grid gap-4
            grid-cols-1 sm:grid-cols-2
            ${viewMode === 'grid' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-1'}
          `}>
                        {items.map((item) => {
                            const activeBorrow = item.active_borrow;
                            const overdue = isBorrowOverdue(activeBorrow);

                            return (
                                <div key={item.id} className={`
                card p-0 overflow-hidden group hover:shadow-lg transition-all duration-300
                ${viewMode === 'list' ? 'lg:flex lg:items-center' : ''}
              `}>
                                    {/* Image */}
                                    <div className={`
                  bg-slate-100 dark:bg-slate-800 overflow-hidden relative
                  ${viewMode === 'list' ? 'lg:w-24 lg:h-24 lg:flex-shrink-0' : 'aspect-square'}
                `}>
                                        {item.photo_path ? (
                                            <SecureImage
                                                src={item.photo_path}
                                                alt={item.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                fallback={
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <span className={`opacity-40 ${viewMode === 'list' ? 'text-3xl lg:text-2xl' : 'text-5xl'}`}>{item.category_icon || '📦'}</span>
                                                    </div>
                                                }
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className={`opacity-40 ${viewMode === 'list' ? 'text-3xl lg:text-2xl' : 'text-5xl'}`}>{item.category_icon || '📦'}</span>
                                            </div>
                                        )}

                                        <div className="absolute top-2 left-2 flex gap-1">
                                            {activeBorrow && (
                                                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold text-white ${overdue ? 'bg-rose-500/95' : 'bg-sky-500/95'}`}>
                                                    {overdue ? t('inventory.borrow.overdue_badge') : t('inventory.borrow.borrowed_badge')}
                                                </span>
                                            )}
                                        </div>

                                        <div className="absolute top-2 right-2 flex gap-1">
                                            {item.is_public ? <span className="p-1.5 rounded-full bg-green-500/90 text-white"><Globe className="w-3 h-3" /></span>
                                                : <span className="p-1.5 rounded-full bg-amber-500/90 text-white"><Lock className="w-3 h-3" /></span>}
                                        </div>
                                        {item.user_id !== user.id && (
                                            <div className="absolute bottom-2 left-2">
                                                <span className="px-2 py-1 rounded-full bg-blue-500/90 text-white text-xs font-medium">{item.owner_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={`p-4 ${viewMode === 'list' ? 'lg:flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4' : ''}`}>
                                        <div className={viewMode === 'list' ? 'lg:flex-1' : ''}>
                                            <div className="flex items-start justify-between mb-2">
                                                <h3 className="font-semibold text-slate-900 dark:text-white line-clamp-1">{item.name}</h3>
                                                <span className="text-sm text-slate-500 dark:text-slate-400 ml-2 flex-shrink-0">×{item.quantity}</span>
                                            </div>

                                            {item.description && viewMode !== 'list' && (
                                                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{item.description}</p>
                                            )}

                                            {activeBorrow && (
                                                <div className={`mb-3 rounded-2xl border px-3 py-2 ${overdue
                                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                                                    : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                                                    }`}>
                                                    <p className="text-sm font-medium">
                                                        {t('inventory.borrow.borrowed_to', { name: activeBorrow.borrower_display_name || t('inventory.borrow.unknown') })}
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
                                                {item.category_name && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${item.category_color}15`, color: item.category_color }}>
                                                        {item.category_icon} {item.category_name}
                                                    </span>
                                                )}
                                                {item.room_name && <span className="badge text-xs py-0.5">🚪 {item.room_name}</span>}
                                                {item.location_name && <span className="badge text-xs py-0.5"><MapPin className="w-3 h-3" /> {item.location_name}</span>}
                                            </div>
                                        </div>

                                        {/* Actions - Available for all house members */}
                                        <div className={`flex gap-2 flex-wrap ${viewMode === 'list' ? 'lg:flex-shrink-0 lg:flex-nowrap' : ''}`}>
                                            {activeBorrow ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setReturnDialogItem(item)}
                                                    className="flex-1 lg:flex-none px-4 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors"
                                                >
                                                    {t('inventory.borrow.mark_returned')}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setBorrowDialogItem(item)}
                                                    className="flex-1 lg:flex-none px-4 py-2 rounded-xl text-sm font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20 transition-colors"
                                                >
                                                    {t('inventory.borrow.lend')}
                                                </button>
                                            )}
                                            {!activeBorrow && item.user_id === user.id && (
                                                <button
                                                    type="button"
                                                    onClick={() => setOfferDialogItem(item)}
                                                    className="flex-1 lg:flex-none px-4 py-2 rounded-xl text-sm font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 transition-colors"
                                                >
                                                    {t('borrow_requests.actions.send_offer')}
                                                </button>
                                            )}
                                            <Link to={`/items/${item.id}/edit`} className="flex-1 lg:flex-none btn-secondary py-2 px-4 text-sm flex items-center justify-center gap-2">
                                                <Edit3 className="w-4 h-4" /> <span className={viewMode === 'list' ? 'lg:hidden xl:inline' : ''}>{t('common.edit')}</span>
                                            </Link>
                                            <button onClick={() => handleDelete(item.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <BorrowItemDialog
                item={borrowDialogItem}
                members={houseMembers}
                currentUserId={user?.id}
                submitting={borrowSubmitting}
                onClose={() => !borrowSubmitting && setBorrowDialogItem(null)}
                onSubmit={handleBorrowSubmit}
            />

            <ReturnItemDialog
                item={returnDialogItem}
                submitting={returnSubmitting}
                onClose={() => !returnSubmitting && setReturnDialogItem(null)}
                onSubmit={handleReturnSubmit}
            />

            <BorrowOfferDialog
                isOpen={Boolean(offerDialogItem)}
                item={offerDialogItem}
                submitting={offerSubmitting}
                onClose={() => !offerSubmitting && setOfferDialogItem(null)}
                onSubmit={handleOfferSubmit}
            />
        </div>
    );
}
