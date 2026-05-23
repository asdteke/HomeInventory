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
import FloatingToast from './FloatingToast';
import SegmentedToggle from './SegmentedToggle';

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

export default function ShoppingListPage() {
    const { t } = useTranslation();
    const [items, setItems] = useState<ShoppingItem[]>([]);
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Form inputs
    const [itemName, setItemName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [addingItem, setAddingItem] = useState(false);
    const [addType, setAddType] = useState<'inventory' | 'custom'>('inventory');
    const [selectedItemId, setSelectedItemId] = useState('');

    // Modal & Toast states
    const [deletingItem, setDeletingItem] = useState<ShoppingItem | null>(null);
    const [isCompletedOpen, setIsCompletedOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');
    const [isBulkAdding, setIsBulkAdding] = useState(false);

    const showToast = (msg: string, type = 'success') => {
        setToastMessage(msg);
        setToastType(type);
    };

    const fetchShoppingData = async () => {
        try {
            const [shoppingRes, itemsRes] = await Promise.all([
                axios.get('/api/shopping'),
                axios.get('/api/items')
            ]);
            setItems(shoppingRes.data.items || []);
            setSuggestions(shoppingRes.data.suggestions || []);
            setInventoryItems(itemsRes.data.items || []);
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
        const newStatus = item.is_completed === 1 ? 0 : 1;
        try {
            await axios.put(`/api/shopping/${item.id}`, {
                is_completed: newStatus
            });
            if (newStatus === 1) {
                showToast(t('shopping.toast.completed', { name: item.item_name, defaultValue: `"${item.item_name}" alındı olarak işaretlendi.` }));
            } else {
                showToast(t('shopping.toast.reactivated', { name: item.item_name, defaultValue: `"${item.item_name}" aktif listeye geri taşındı.` }));
            }
            fetchShoppingData();
        } catch (error) {
            console.error('Toggle complete error:', error);
            showToast(t('shopping.toast.update_error', { defaultValue: 'Güncelleme sırasında hata oluştu.' }), 'danger');
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
                            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                                {activeItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] hover:border-[var(--hi-accent)]/30 hover:bg-[var(--hi-panel-strong)]/80 hover:shadow-md hover:scale-[1.008] transition-all duration-300"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            {/* Beautiful custom check circle */}
                                            <button
                                                onClick={() => handleToggleComplete(item)}
                                                className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--hi-accent)]/40 text-transparent hover:border-[var(--hi-accent)] hover:bg-[var(--hi-accent-soft)] transition-all duration-300"
                                                aria-label="Tamamlandı olarak işaretle"
                                            >
                                                <span className="absolute inset-0 flex items-center justify-center rounded-full scale-0 group-hover:scale-75 transition-all duration-300 bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                </span>
                                            </button>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-[var(--hi-text)] truncate group-hover:text-[var(--hi-accent)] transition-colors" title={item.item_name}>
                                                    {item.item_name}
                                                </p>
                                                {item.item_id && (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--hi-secondary-strong)] font-semibold bg-[var(--hi-secondary-soft)] px-2 py-0.5 rounded-md border border-[var(--hi-secondary)]/20 mt-1">
                                                        <Package className="h-3 w-3 animate-pulse" />
                                                        {t('shopping.card.linked_inventory', { defaultValue: 'Envanterde Kayıtlı' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            {/* Premium Quantity controls */}
                                            <div className="flex items-center rounded-lg border border-[var(--hi-border)] bg-[var(--hi-bg)] overflow-hidden p-0.5 shadow-inner">
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, -1)}
                                                    disabled={item.quantity <= 1}
                                                    className="p-1 rounded-md hover:bg-[var(--hi-panel-strong)] text-[var(--hi-text-soft)] disabled:opacity-25 transition cursor-pointer"
                                                    aria-label="Azalt"
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="px-3 text-xs font-extrabold text-[var(--hi-text)] min-w-[28px] text-center tracking-wider">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => handleUpdateQuantity(item, 1)}
                                                    className="p-1 rounded-md hover:bg-[var(--hi-panel-strong)] text-[var(--hi-text-soft)] transition cursor-pointer"
                                                    aria-label="Arttır"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>

                                            {/* Delete Action */}
                                            <button
                                                onClick={() => setDeletingItem(item)}
                                                className="rounded-lg p-2 text-[var(--hi-text-muted)] hover:bg-red-500/10 hover:text-red-500 transition duration-300 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                                                aria-label="Sil"
                                            >
                                                <Trash2 className="h-4.5 w-4.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
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
                                    {completedItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="group flex items-center justify-between gap-4 p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)]/50 opacity-80 hover:opacity-100 transition-all duration-200"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                {/* Glowing Emerald Check Ring */}
                                                <button
                                                    onClick={() => handleToggleComplete(item)}
                                                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] hover:scale-95 transition-all duration-200"
                                                    aria-label="Aktif listeye geri taşı"
                                                >
                                                    <Check className="h-3.5 w-3.5 stroke-[3.5]" />
                                                </button>
                                                <p className="text-sm font-semibold line-through text-[var(--hi-text-muted)] decoration-[var(--hi-accent)] decoration-2 truncate" title={item.item_name}>
                                                    {item.item_name}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-xs font-extrabold text-[var(--hi-text-muted)] bg-[var(--hi-bg)] px-2.5 py-1 rounded-md border border-[var(--hi-border)]">
                                                    x{item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => setDeletingItem(item)}
                                                    className="rounded-lg p-2 text-[var(--hi-text-muted)] hover:bg-red-500/10 hover:text-red-500 transition duration-200 cursor-pointer"
                                                    aria-label="Sil"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
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

            {toastMessage && (
                <FloatingToast
                    message={toastMessage}
                    type={toastType}
                    onClose={() => setToastMessage('')}
                />
            )}
        </div>
    );
}
