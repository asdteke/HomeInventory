import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { EmptyState, NoticeBanner, PageHeader } from './ProductUI';
import FloatingToast from './FloatingToast';
import IconActionButton from './IconActionButton';
import { ConfirmDialog } from './ModalDialog';
import { getCategoryPresentation } from '../utils/categoryDisplay';
import { BRAND_NAME } from '../constants/branding';

const DEFAULT_CATEGORY_COLOR = BRAND_NAME === 'HomeInventory' ? '#129e9a' : '#6f9978';

export default function CategoryManager() {
    const { t, i18n } = useTranslation();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', icon: '📦', color: DEFAULT_CATEGORY_COLOR });
    const [error, setError] = useState('');
    const [pendingDeleteCategory, setPendingDeleteCategory] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => { fetchCategories(); }, []);

    const fetchCategories = async () => {
        try { const res = await axios.get('/api/categories'); setCategories(res.data.categories); }
        catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        try {
            if (!formData.name.trim()) {
                setError(t('categories.name_required', { defaultValue: 'Kategori adı gerekli' }));
                return;
            }
            if (editingId) await axios.put(`/api/categories/${editingId}`, formData);
            else await axios.post('/api/categories', formData);
            fetchCategories(); resetForm();
        } catch (err) { setError(err.response?.data?.error || t('common.error')); }
    };

    const handleEdit = (cat) => {
        setError('');
        const categoryPresentation = getCategoryPresentation(cat, i18n.resolvedLanguage || i18n.language);
        setFormData({ name: categoryPresentation.name, icon: cat.icon, color: cat.color });
        setEditingId(cat.id); setShowForm(true);
    };

    const handleDelete = async () => {
        if (!pendingDeleteCategory) return;

        setDeleteSubmitting(true);
        setError('');
        try {
            await axios.delete(`/api/categories/${pendingDeleteCategory.id}`);
            setCategories((currentCategories) => currentCategories.filter((category) => category.id !== pendingDeleteCategory.id));
            setToast({
                title: t('categories.delete_success_title', { defaultValue: 'Category deleted' }),
                description: t('categories.delete_success_body', { defaultValue: 'The category was removed from your inventory structure.' })
            });
            setPendingDeleteCategory(null);
        } catch (deleteError) {
            setError(deleteError.response?.data?.error || t('categories.delete_error'));
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', icon: '📦', color: DEFAULT_CATEGORY_COLOR });
        setEditingId(null);
        setShowForm(false);
        setError('');
    };

    const emojis = ['📦', '🍳', '💻', '🎨', '🛋️', '👕', '📚', '🔧', '⚽', '🎮', '🎸', '🌱', '💡', '🔌', '🧹', '🛠️', '🎒', '💊', '🧸', '🎁'];

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={t('categories.title')}
                description={t('categories.subtitle', { count: categories.length })}
                actions={(
                    <button type="button" onClick={() => setShowForm(true)} aria-label={t('categories.new_category')} className="btn-secondary inline-flex items-center gap-2">
                        <Plus className="w-5 h-5" /> {t('categories.new_category')}
                    </button>
                )}
            />

            {error && (
                <NoticeBanner
                    tone="danger"
                    title={t('common.error', { defaultValue: 'Something went wrong' })}
                    description={error}
                />
            )}

            {showForm && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-[var(--hi-text)]">{editingId ? t('categories.edit_title') : t('categories.new_title')}</h3>
                        <button type="button" onClick={resetForm} aria-label={t('common.close')} className="rounded-xl p-2 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"><X className="w-5 h-5" /></button>
                    </div>
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('categories.name_label')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" aria-required="true" />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('categories.icon_label')}</label>
                            <div className="flex flex-wrap gap-2">
                                {emojis.map(e => (
                                    <button key={e} type="button" onClick={() => setFormData({ ...formData, icon: e })}
                                    className={`flex h-11 w-11 items-center justify-center rounded-lg text-[1.35rem] leading-none text-[var(--hi-text)] transition-all [font-family:"Apple_Color_Emoji","Segoe_UI_Emoji","Noto_Color_Emoji",sans-serif] ${formData.icon === e ? 'border border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] shadow-[var(--hi-shadow-soft)]' : 'border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] hover:bg-[var(--hi-panel-strong)]'}`}>
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('categories.color_label')}</label>
                            <div className="flex items-center gap-3">
                                <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="h-12 w-12 cursor-pointer rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-1" />
                                <span className="text-sm text-[var(--hi-text-soft)]">{formData.color}</span>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="submit" className="btn-secondary">{editingId ? t('common.save') : t('common.add')}</button>
                            <button type="button" onClick={resetForm} className="btn-secondary">{t('common.cancel')}</button>
                        </div>
                    </form>
                </div>
            )}

            {categories.length === 0 ? (
                <EmptyState
                    icon={Plus}
                    title={t('categories.empty_title', { defaultValue: 'No categories yet' })}
                    description={t('categories.empty_description', { defaultValue: 'Create a few categories so new items follow the same structure and are easier to scan later.' })}
                    actions={(
                        <button type="button" onClick={() => setShowForm(true)} className="btn-secondary">
                            <Plus className="w-4 h-4" />
                            <span>{t('categories.new_category')}</span>
                        </button>
                    )}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map((cat) => {
                        const categoryPresentation = getCategoryPresentation(cat, i18n.resolvedLanguage || i18n.language);

                        return (
                        <div key={cat.id} className="card flex items-center gap-4 p-4 hover:shadow-md transition-shadow">
                            <div
                                className="flex h-12 w-12 items-center justify-center rounded-[0.95rem] border text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                                style={{
                                    background: `linear-gradient(180deg, color-mix(in srgb, ${cat.color} 14%, var(--hi-panel-strong)) 0%, color-mix(in srgb, ${cat.color} 10%, var(--hi-panel-muted)) 100%)`,
                                    borderColor: `color-mix(in srgb, ${cat.color} 22%, var(--hi-border))`
                                }}
                            >
                                {cat.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="truncate font-medium text-[var(--hi-text)]">{categoryPresentation.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                                    <span className="text-xs text-[var(--hi-text-soft)]">{cat.color}</span>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <IconActionButton
                                    label={t('categories.edit_action', { defaultValue: 'Edit category' })}
                                    icon={Edit3}
                                    onClick={() => handleEdit(cat)}
                                />
                                <IconActionButton
                                    label={t('categories.delete_action', { defaultValue: 'Delete category' })}
                                    icon={Trash2}
                                    tone="danger"
                                    onClick={() => setPendingDeleteCategory(cat)}
                                />
                            </div>
                        </div>
                    )})}
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingDeleteCategory)}
                title={t('categories.delete_title', { defaultValue: 'Delete this category?' })}
                description={t('categories.delete_description', { defaultValue: 'Deleting a category can affect how items are grouped and found later.' })}
                confirmLabel={deleteSubmitting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete')}
                cancelLabel={t('common.cancel')}
                confirmButtonClassName="btn-danger"
                tone="danger"
                confirming={deleteSubmitting}
                onClose={() => !deleteSubmitting && setPendingDeleteCategory(null)}
                onConfirm={handleDelete}
            >
                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="font-medium text-[var(--hi-text)]">
                        {pendingDeleteCategory ? getCategoryPresentation(pendingDeleteCategory, i18n.resolvedLanguage || i18n.language).name : ''}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('categories.delete_warning', { defaultValue: 'Items already using this category may need to be reassigned to keep filters and counts clear.' })}
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
