import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    ShoppingCart,
    Plus,
    Minus,
    Trash2,
    CheckCircle2,
    ListPlus,
    Sparkles,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Package,
    Check
} from 'lucide-react';
import { PageHeader, SectionHeader, LoadingState, EmptyState } from './ProductUI';
import { ConfirmDialog } from './ModalDialog';
import { FloatingToastStack, ToastTone } from './FloatingToast';
import SegmentedToggle from './SegmentedToggle';
import { useToastQueue } from '../hooks/useToastQueue';

interface ShoppingItem {
    id: number;
    item_id?: number;
    item_name: string;
    quantity: number;
    is_completed: number;
    house_key?: string;
    created_at?: string;
}

interface SuggestionItem {
    item_id: number;
    item_name: string;
    current_quantity: number;
    min_quantity: number;
    suggested_quantity: number;
}

interface InventoryItem {
    id: number;
    name: string;
    quantity: number;
    min_quantity: number;
    room_name?: string;
}

const SHOPPING_ITEM_EXIT_MS = 220;

import { fetchWithCache, getCachedData, hasCache } from '../utils/apiCache';

export default function ShoppingListPage() {
    const { t } = useTranslation();

    // Initialize states from SWR cache
    const [items, setItems] = useState<ShoppingItem[]>(() => getCachedData('/api/shopping')?.items || []);
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>(() => getCachedData('/api/shopping')?.suggestions || []);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getCachedData('/api/items')?.items || []);

    const isInitiallyLoaded = hasCache('/api/shopping') && hasCache('/api/items');
    const [loading, setLoading] = useState(!isInitiallyLoaded);
    const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());

    // Form inputs
    const [itemName, setItemName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [addingItem, setAddingItem] = useState(false);
    const [addType, setAddType] = useState<'inventory' | 'custom'>('inventory');
    const [selectedItemId, setSelectedItemId] = useState('');

    // Modal & Toast states
    const [deletingItem, setDeletingItem] = useState<ShoppingItem | null>(null);
    const [isCompletedOpen, setIsCompletedOpen] = useState(false);
    const { toasts, showToast: enqueueToast, closeToast } = useToastQueue();
    const [isBulkAdding, setIsBulkAdding] = useState(false);

    const showToast = (msg: string, type: ToastTone = 'success') => {
        enqueueToast({
            title: type === 'danger' ? t('common.error', { defaultValue: 'Something went wrong' }) : t('common.success', { defaultValue: 'Updated' }),
            description: msg,
            tone: type
        });
    };

    const fetchShoppingData = async () => {
        try {
            await Promise.all([
                fetchWithCache('/api/shopping', (data) => {
                    setItems(data.items || []);
                    setSuggestions(data.suggestions || []);
                }),
                fetchWithCache('/api/items', (data) => {
                    setInventoryItems(data.items || []);
                })
            ]);
        } catch (error) {
            console.error('Fetch shopping list error:', error);
            showToast(t('shopping.toast.fetch_error', { defaultValue: 'Alışveriş listesi yüklenirken hata oluştu.' }), 'danger');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchShoppingData();
    }, []);

    const activeItems = useMemo(() => items.filter(item => item.is_completed === 0), [items]);
    const completedItems = useMemo(() => items.filter(item => item.is_completed === 1), [items]);

    const handleAddManualItem = async (e: React.FormEvent) => {
        e.preventDefault();

        let payload: { item_name: string; quantity: number; item_id?: number } = {
            item_name: '',
            quantity: Math.max(1, quantity)
        };

        if (addType === 'inventory') {
            if (!selectedItemId) {
                showToast(t('shopping.toast.select_item_error', { defaultValue: 'Lütfen envanterden bir ürün seçin.' }), 'danger');
                return;
            }
            const selectedItem = inventoryItems.find(item => item.id.toString() === selectedItemId);
            if (!selectedItem) return;
            payload.item_id = selectedItem.id;
            payload.item_name = selectedItem.name;
        } else {
            if (!itemName.trim()) {
                showToast(t('shopping.toast.empty_name', { defaultValue: 'Lütfen ürün adı girin.' }), 'danger');
                return;
            }
            payload.item_name = itemName.trim();
        }

        setAddingItem(true);
        try {
            await axios.post('/api/shopping', payload);
            showToast(t('shopping.toast.added', { defaultValue: 'Ürün alışveriş listesine eklendi.' }));
            setItemName('');
            setSelectedItemId('');
            setQuantity(1);
            fetchShoppingData();
        } catch (error) {
            console.error('Add manual item error:', error);
            showToast(t('shopping.toast.add_error', { defaultValue: 'Ürün eklenirken bir hata oluştu.' }), 'danger');
        } finally {
            setAddingItem(false);
        }
    };

    const handleAddSuggestion = async (suggestion: SuggestionItem) => {
        try {
            await axios.post('/api/shopping', {
                item_id: suggestion.item_id,
                item_name: suggestion.item_name,
                quantity: suggestion.suggested_quantity
            });
            showToast(t('shopping.toast.added_suggestion', {
                name: suggestion.item_name,
                defaultValue: `"${suggestion.item_name}" alışveriş listesine eklendi.`
            }));
            fetchShoppingData();
        } catch (error) {
            console.error('Add suggestion error:', error);
            showToast(t('shopping.toast.add_error', { defaultValue: 'Ürün eklenirken bir hata oluştu.' }), 'danger');
        }
    };

    const handleBulkAddLowStock = async () => {
        if (suggestions.length === 0) return;
        setIsBulkAdding(true);
        try {
            const res = await axios.post('/api/shopping/add-low-stock');
            showToast(t('shopping.toast.bulk_added', {
                count: res.data.addedCount,
                defaultValue: `${res.data.addedCount} adet eksik stoklu ürün listeye eklendi.`
            }));
            fetchShoppingData();
        } catch (error) {
            console.error('Bulk add low stock error:', error);
            showToast(t('shopping.toast.bulk_error', { defaultValue: 'Eksik stoklu ürünler eklenirken hata oluştu.' }), 'danger');
        } finally {
            setIsBulkAdding(false);
        }
    };

    const handleToggleComplete = async (item: ShoppingItem) => {
        if (completingIds.has(item.id)) return;

        const newStatus = item.is_completed === 1 ? 0 : 1;

        setCompletingIds(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });

        const transitionTimer = window.setTimeout(() => {
            setItems(prevItems => prevItems.map(currentItem => (
                currentItem.id === item.id
                    ? { ...currentItem, is_completed: newStatus }
                    : currentItem
            )));
        }, SHOPPING_ITEM_EXIT_MS);

        const cleanupTimer = window.setTimeout(() => {
            setCompletingIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }, SHOPPING_ITEM_EXIT_MS + 90);

        try {
            await axios.put(`/api/shopping/${item.id}`, {
                is_completed: newStatus
            });
            if (newStatus === 1) {
                showToast(t('shopping.toast.completed', { name: item.item_name, defaultValue: `"${item.item_name}" alındı olarak işaretlendi.` }));
            } else {
                showToast(t('shopping.toast.reactivated', { name: item.item_name, defaultValue: `"${item.item_name}" aktif listeye geri taşındı.` }));
            }
        } catch (error) {
            console.error('Toggle complete error:', error);
            window.clearTimeout(transitionTimer);
            window.clearTimeout(cleanupTimer);
            setItems(prevItems => prevItems.map(currentItem => (
                currentItem.id === item.id
                    ? { ...currentItem, is_completed: item.is_completed }
                    : currentItem
            )));
            showToast(t('shopping.toast.update_error', { defaultValue: 'Güncelleme sırasında hata oluştu.' }), 'danger');
            setCompletingIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }
    };

    const handleUpdateQuantity = async (item: ShoppingItem, delta: number) => {
        const newQty = Math.max(1, item.quantity + delta);
        if (newQty === item.quantity) return;

        try {
            await axios.put(`/api/shopping/${item.id}`, {
                quantity: newQty
            });
            fetchShoppingData();
        } catch (error) {
            console.error('Update quantity error:', error);
            showToast(t('shopping.toast.update_error', { defaultValue: 'Miktar güncellenirken hata oluştu.' }), 'danger');
        }
    };

    const handleDeleteItem = async () => {
        if (!deletingItem) return;
        try {
            await axios.delete(`/api/shopping/${deletingItem.id}`);
            showToast(t('shopping.toast.deleted', { defaultValue: 'Ürün listeden silindi.' }));
            setDeletingItem(null);
            fetchShoppingData();
        } catch (error) {
            console.error('Delete item error:', error);
            showToast(t('shopping.toast.delete_error', { defaultValue: 'Silme işlemi sırasında hata oluştu.' }), 'danger');
        }
    };

    const handleClearCompleted = async () => {
        if (completedItems.length === 0) return;
        try {
            setLoading(true);
            await Promise.all(completedItems.map(item => axios.delete(`/api/shopping/${item.id}`)));
            showToast(t('shopping.toast.cleared_completed', { defaultValue: 'Alınan ürünler temizlendi.' }));
            fetchShoppingData();
        } catch (error) {
            console.error('Clear completed error:', error);
            showToast(t('shopping.toast.clear_error', { defaultValue: 'Temizleme sırasında hata oluştu.' }), 'danger');
            setLoading(false);
        }
    };

    if (loading) {
        return <LoadingState title={t('common.loading')} description={t('shopping.loading_desc', { defaultValue: 'Alışveriş listesi hazırlanıyor...' })} />;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('shopping.page.title', { defaultValue: 'Alışveriş Listesi' })}
                description={t('shopping.page.description', {
                    defaultValue: 'Ev envanterinde azalan stoklu ürünleri görün ve kolayca alışveriş listenizi yönetin.'
                })}
            />

            {/* Premium Glowing "Akıllı Envanter Önerileri" Panel */}
            {suggestions.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl border border-[var(--hi-secondary)]/20 bg-gradient-to-br from-[var(--hi-secondary-soft)]/20 via-transparent to-transparent p-5 shadow-[var(--hi-shadow-soft)] backdrop-blur-[8px] transition duration-300">
                    {/* Background Soft Glow Effect */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-[var(--hi-secondary-soft)]/40 blur-[60px]" />
                    <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-40 w-40 rounded-full bg-[var(--hi-secondary-soft)]/20 blur-[50px]" />

                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)] shadow-sm">
                                <Sparkles className="h-5.5 w-5.5" />
                            </span>
                            <div>
                                <h3 className="text-base font-bold text-[var(--hi-text)] flex items-center gap-1.5">
                                    {t('shopping.suggestions.title', { defaultValue: 'Akıllı Envanter Önerileri' })}
                                </h3>
                                <p className="text-xs text-[var(--hi-text-muted)] font-medium">
                                    {t('shopping.suggestions.desc', { defaultValue: 'Stoku asgari sınırın altına düşen envanter öğeleri.' })}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleBulkAddLowStock}
                            disabled={isBulkAdding}
                            className="btn-primary !bg-[var(--hi-secondary)] hover:!bg-[var(--hi-secondary-strong)] !shadow-none !border-none text-xs px-4 py-2 self-start sm:self-auto cursor-pointer"
                        >
                            {isBulkAdding ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <ListPlus className="h-4 w-4" />
                            )}
                            <span>{t('shopping.suggestions.add_all', { defaultValue: 'Tüm Eksikleri Ekle' })}</span>
                        </button>
                    </div>

                    <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {suggestions.map((suggestion) => (
                            <div
                                key={suggestion.item_id}
                                className="group flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)]/60 hover:bg-[var(--hi-panel-strong)] hover:border-[var(--hi-secondary)]/30 hover:-translate-y-0.5 shadow-sm hover:shadow-md transition-all duration-300"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold truncate text-[var(--hi-text)] group-hover:text-[var(--hi-secondary-strong)] transition-colors" title={suggestion.item_name}>
                                        {suggestion.item_name}
                                    </p>
                                    <p className="text-[11px] text-[var(--hi-text-muted)] font-medium mt-0.5">
                                        {t('shopping.suggestions.stock_status', {
                                            current: suggestion.current_quantity,
                                            min: suggestion.min_quantity,
                                            defaultValue: `Mevcut: ${suggestion.current_quantity} / Hedef: ${suggestion.min_quantity}`
                                        })}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleAddSuggestion(suggestion)}
                                    className="flex h-7 items-center justify-center gap-1 rounded-lg bg-[var(--hi-bg)] hover:bg-[var(--hi-secondary-soft)] border border-[var(--hi-border)] hover:border-[var(--hi-secondary)]/20 text-xs font-semibold px-2.5 text-[var(--hi-text-soft)] hover:text-[var(--hi-secondary-strong)] transition-all duration-200 shrink-0 cursor-pointer"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span>{t('shopping.suggestions.add_qty', { qty: suggestion.suggested_quantity, defaultValue: `${suggestion.suggested_quantity} Ekle` })}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main 2-Column Premium Grid Layout */}
            <div className="grid gap-6 lg:grid-cols-12">
                {/* LEFT COLUMN: Shopping List Section & History */}
                <div className="lg:col-span-8 space-y-5">
                    <div className="card !p-5 space-y-4 shadow-[var(--hi-shadow-soft)] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)]/40 backdrop-blur-[4px]">
                        <div className="flex items-center justify-between pb-2 border-b border-[var(--hi-border)]/60">
                            <SectionHeader
                                title={t('shopping.sections.active_list', { defaultValue: 'Alınacak Ürünler' })}
                                description={t('shopping.sections.active_desc', { defaultValue: 'Sepetinize ekleyeceğiniz güncel alışveriş öğeleri.' })}
                            />
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--hi-accent-soft)] text-[var(--hi-accent)] border border-[var(--hi-accent)]/20">
                                {t('shopping.sections.active_count', { count: activeItems.length, defaultValue: `${activeItems.length} Ürün` })}
                            </span>
                        </div>

                        {activeItems.length === 0 ? (
                            <EmptyState
                                icon={ShoppingCart}
                                title={t('shopping.empty.title', { defaultValue: 'Alışveriş listeniz boş' })}
                                description={t('shopping.empty.desc', {
                                    defaultValue: 'Yukarıdaki önerilerden eksik stokları ekleyebilir veya sağdaki form ile manuel ürün ekleyebilirsiniz.'
                                })}
                            />
                        ) : (
                            <div className="shopping-list-scroll">
                                {activeItems.map((item) => {
                                    const isCompleting = completingIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            className={`shopping-item-card shopping-item-card-active ${isCompleting ? 'is-checking-off' : ''} group`}
                                        >
                                        <div className="shopping-item-main">
                                            <button
                                                onClick={() => handleToggleComplete(item)}
                                                disabled={isCompleting}
                                                className="shopping-check-button"
                                                aria-label="Tamamlandı olarak işaretle"
                                            >
                                                <span className="shopping-check-glyph">
                                                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                </span>
                                            </button>
                                            <div className="min-w-0">
                                                <p className="shopping-item-title" title={item.item_name}>
                                                    {item.item_name}
                                                </p>
                                                {item.item_id && (
                                                    <span className="shopping-inventory-badge">
                                                        <Package className="h-3 w-3" />
                                                        {t('shopping.card.linked_inventory', { defaultValue: 'Envanterde Kayıtlı' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="shopping-item-actions">
                                            <div className="shopping-quantity-stepper">
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, -1)}
                                                    disabled={item.quantity <= 1}
                                                    className="shopping-quantity-button"
                                                    aria-label="Azalt"
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="shopping-quantity-value">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, 1)}
                                                    className="shopping-quantity-button"
                                                    aria-label="Arttır"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => setDeletingItem(item)}
                                                className="shopping-delete-button"
                                                aria-label="Sil"
                                            >
                                                <Trash2 className="h-4.5 w-4.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        )}
                    </div>

                    {/* Completed Drawer with custom emerald checked animations */}
                    {completedItems.length > 0 && (
                        <div className="card !p-5 space-y-3 shadow-[var(--hi-shadow-soft)] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)]/30">
                            <div
                                onClick={() => setIsCompletedOpen(!isCompletedOpen)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setIsCompletedOpen(!isCompletedOpen);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                className="flex w-full items-center justify-between focus:outline-none cursor-pointer group/accordion select-none"
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shadow-sm border border-emerald-500/15">
                                        <CheckCircle2 className="h-4.5 w-4.5" />
                                    </span>
                                    <span className="text-sm font-bold text-[var(--hi-text)] group-hover/accordion:text-emerald-500 transition-colors">
                                        {t('shopping.sections.completed_list', { count: completedItems.length, defaultValue: `Alınan Ürünler (${completedItems.length})` })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleClearCompleted();
                                        }}
                                        className="text-xs font-bold text-red-500/80 hover:text-red-500 transition-all cursor-pointer bg-red-500/5 px-2.5 py-1 rounded-md border border-red-500/10 hover:bg-red-500/10"
                                    >
                                        {t('shopping.actions.clear_completed', { defaultValue: 'Geçmişi Temizle' })}
                                    </button>
                                    <span className="text-[var(--hi-text-muted)] group-hover/accordion:text-[var(--hi-text-soft)] transition-colors">
                                        {isCompletedOpen ? (
                                            <ChevronUp className="h-4.5 w-4.5" />
                                        ) : (
                                            <ChevronDown className="h-4.5 w-4.5" />
                                        )}
                                    </span>
                                </div>
                            </div>

                            {isCompletedOpen && (
                                <div className="space-y-2 pt-3 border-t border-[var(--hi-border)]/60 transition-all duration-300">
                                    {completedItems.map((item) => {
                                        const isCompleting = completingIds.has(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                className={`shopping-item-card shopping-item-card-completed ${isCompleting ? 'is-restoring' : ''} group`}
                                            >
                                            <div className="shopping-item-main">
                                                <button
                                                    onClick={() => handleToggleComplete(item)}
                                                    disabled={isCompleting}
                                                    className="shopping-check-button is-checked"
                                                    aria-label="Aktif listeye geri taşı"
                                                >
                                                    <span className="shopping-check-glyph">
                                                        <Check className="h-3.5 w-3.5 stroke-[3.5]" />
                                                    </span>
                                                </button>
                                                <p className="shopping-item-title shopping-item-title-completed" title={item.item_name}>
                                                    {item.item_name}
                                                </p>
                                            </div>
                                            <div className="shopping-item-actions">
                                                <span className="shopping-completed-quantity">
                                                    x{item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => setDeletingItem(item)}
                                                    className="shopping-delete-button is-visible"
                                                    aria-label="Sil"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Glassmorphic Floating Controller Form */}
                <div className="lg:col-span-4">
                    <div className="card !p-5 space-y-5 border border-[var(--hi-border)] shadow-[var(--hi-shadow-soft)] bg-gradient-to-b from-[var(--hi-panel-strong)] to-[var(--hi-panel-strong)]/60 backdrop-blur-[8px] sticky top-6">
                        <div className="pb-2 border-b border-[var(--hi-border)]/60">
                            <SectionHeader
                                title={t('shopping.sections.add_item', { defaultValue: 'Manuel Ürün Ekle' })}
                                description={t('shopping.sections.add_desc', { defaultValue: 'Listeye el ile özel bir ürün ekleyin.' })}
                            />
                        </div>

                        <div className="space-y-4">
                            <SegmentedToggle
                                ariaLabel={t('shopping.form.add_type', { defaultValue: 'Ekleme Yöntemi' })}
                                value={addType}
                                onChange={(val) => {
                                    setAddType(val as 'inventory' | 'custom');
                                    setSelectedItemId('');
                                    setItemName('');
                                    setQuantity(1);
                                }}
                                fullWidth
                                options={[
                                    {
                                        value: 'inventory',
                                        label: t('shopping.form.add_type_inventory', { defaultValue: 'Envanter Eşyası' }),
                                        icon: Package
                                    },
                                    {
                                        value: 'custom',
                                        label: t('shopping.form.add_type_custom', { defaultValue: 'Özel Ürün' }),
                                        icon: Plus
                                    }
                                ]}
                            />

                            <form onSubmit={handleAddManualItem} className="space-y-4">
                                {addType === 'inventory' ? (
                                    <div className="space-y-1.5">
                                        <label className="block text-[11px] font-bold text-[var(--hi-text-soft)] uppercase tracking-wider">
                                            {t('shopping.form.select_inventory_item', { defaultValue: 'Envanterden Eşya Seç' })} <span className="text-[var(--hi-accent)]">*</span>
                                        </label>
                                        {inventoryItems.length === 0 ? (
                                            <p className="text-xs text-[var(--hi-danger)] font-medium">
                                                {t('shopping.form.no_inventory_items', { defaultValue: 'Envanterinizde henüz eşya yok.' })}
                                            </p>
                                        ) : (
                                            <select
                                                value={selectedItemId}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectedItemId(val);
                                                    const item = inventoryItems.find(i => i.id.toString() === val);
                                                    if (item) {
                                                        const diff = Math.max(1, item.min_quantity - item.quantity);
                                                        setQuantity(diff);
                                                    }
                                                }}
                                                className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-sm text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] focus:ring-2 focus:ring-[var(--hi-accent)]/20 transition-all duration-300 cursor-pointer"
                                                required
                                            >
                                                <option value="" disabled>-- {t('shopping.form.select_item_placeholder', { defaultValue: 'Bir eşya seçin' })} --</option>
                                                {inventoryItems.map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} {item.room_name ? `(${item.room_name})` : ''} - ({t('shopping.form.current_stock', { defaultValue: 'Mevcut' })}: {item.quantity})
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <label className="block text-[11px] font-bold text-[var(--hi-text-soft)] uppercase tracking-wider">
                                            {t('shopping.form.item_name', { defaultValue: 'Ürün Adı' })} <span className="text-[var(--hi-accent)]">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={itemName}
                                            onChange={(e) => setItemName(e.target.value)}
                                            placeholder={t('shopping.form.item_name_placeholder', { defaultValue: 'Örn: Süt, Deterjan, Filtre Kahve...' })}
                                            className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-sm text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] focus:ring-2 focus:ring-[var(--hi-accent)]/20 transition-all duration-300"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="block text-[11px] font-bold text-[var(--hi-text-soft)] uppercase tracking-wider">
                                        {t('shopping.form.quantity', { defaultValue: 'Adet / Miktar' })}
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={quantity}
                                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                        className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-sm text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] focus:ring-2 focus:ring-[var(--hi-accent)]/20 transition-all duration-300"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={addingItem}
                                    className="btn-primary !w-full cursor-pointer"
                                >
                                    <Plus className="h-5 w-5" />
                                    <span className="text-sm">
                                        {addingItem
                                            ? t('common.saving', { defaultValue: 'Ekleme yapılıyor...' })
                                            : t('shopping.actions.add_item', { defaultValue: 'Alışveriş Listesine Ekle' })}
                                    </span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirm Delete Item Modal */}
            <ConfirmDialog
                isOpen={!!deletingItem}
                title={t('shopping.modal.delete_title', { defaultValue: 'Ürünü Listeden Sil?' })}
                description={t('shopping.modal.delete_desc', {
                    name: deletingItem?.item_name,
                    defaultValue: `"${deletingItem?.item_name}" ürününü alışveriş listenizden kaldırmak istediğinizden emin misiniz?`
                })}
                confirmLabel={t('common.delete', { defaultValue: 'Sil' })}
                cancelLabel={t('common.cancel')}
                onClose={() => setDeletingItem(null)}
                onConfirm={handleDeleteItem}
                tone="danger"
                icon={Trash2}
            />

            <FloatingToastStack toasts={toasts} onClose={closeToast} />
        </div>
    );
}
