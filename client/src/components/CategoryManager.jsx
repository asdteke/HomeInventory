import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Plus, Edit3, Trash2, X } from 'lucide-react';

export default function CategoryManager() {
    const { t } = useTranslation();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', icon: '📦', color: '#6366f1' });
    const [error, setError] = useState('');

    useEffect(() => { fetchCategories(); }, []);

    const fetchCategories = async () => {
        try { const res = await axios.get('/api/categories'); setCategories(res.data.categories); }
        catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        try {
            if (editingId) await axios.put(`/api/categories/${editingId}`, formData);
            else await axios.post('/api/categories', formData);
            fetchCategories(); resetForm();
        } catch (err) { setError(err.response?.data?.error || t('common.error')); }
    };

    const handleEdit = (cat) => {
        setFormData({ name: cat.name, icon: cat.icon, color: cat.color });
        setEditingId(cat.id); setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm(t('categories.delete_confirm'))) return;
        try { await axios.delete(`/api/categories/${id}`); setCategories(categories.filter(c => c.id !== id)); }
        catch (e) { alert(t('categories.delete_error')); }
    };

    const resetForm = () => { setFormData({ name: '', icon: '📦', color: '#6366f1' }); setEditingId(null); setShowForm(false); };

    const emojis = ['📦', '🍳', '💻', '🎨', '🛋️', '👕', '📚', '🔧', '⚽', '🎮', '🎸', '🌱', '💡', '🔌', '🧹', '🛠️', '🎒', '💊', '🧸', '🎁'];

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('categories.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('categories.subtitle', { count: categories.length })}</p>
                </div>
                <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
                    <Plus className="w-5 h-5" /> {t('categories.new_category')}
                </button>
            </div>

            {showForm && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editingId ? t('categories.edit_title') : t('categories.new_title')}</h3>
                        <button onClick={resetForm} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-5 h-5" /></button>
                    </div>
                    {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl mb-4">{error}</div>}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('categories.name_label')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('categories.icon_label')}</label>
                            <div className="flex flex-wrap gap-2">
                                {emojis.map(e => (
                                    <button key={e} type="button" onClick={() => setFormData({ ...formData, icon: e })}
                                        className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${formData.icon === e ? 'bg-primary-100 dark:bg-primary-500/20 ring-2 ring-primary-500' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('categories.color_label')}</label>
                            <div className="flex items-center gap-3">
                                <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-12 h-10 rounded-lg cursor-pointer border-0" />
                                <span className="text-sm text-slate-500 dark:text-slate-400">{formData.color}</span>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="submit" className="btn-primary">{editingId ? t('common.save') : t('common.add')}</button>
                            <button type="button" onClick={resetForm} className="btn-secondary">{t('common.cancel')}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map(cat => (
                    <div key={cat.id} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${cat.color}20` }}>
                            {cat.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-900 dark:text-white truncate">{cat.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{cat.color}</span>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handleEdit(cat)} className="p-2 text-slate-400 hover:text-primary-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(cat.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
