import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Plus, Edit3, Trash2, X, FolderOpen } from 'lucide-react';

export default function RoomManager() {
    const { t } = useTranslation();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [error, setError] = useState('');

    useEffect(() => { fetchRooms(); }, []);

    const fetchRooms = async () => {
        try { const res = await axios.get('/api/rooms'); setRooms(res.data.rooms); }
        catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        try {
            if (editingId) await axios.put(`/api/rooms/${editingId}`, formData);
            else await axios.post('/api/rooms', formData);
            fetchRooms(); resetForm();
        } catch (err) { setError(err.response?.data?.error || t('common.error')); }
    };

    const handleEdit = (room) => {
        setFormData({ name: room.name, description: room.description || '' });
        setEditingId(room.id); setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm(t('rooms.delete_confirm'))) return;
        try { await axios.delete(`/api/rooms/${id}`); setRooms(rooms.filter(r => r.id !== id)); }
        catch (e) { alert(t('rooms.delete_error')); }
    };

    const resetForm = () => { setFormData({ name: '', description: '' }); setEditingId(null); setShowForm(false); };

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('rooms.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('rooms.subtitle', { count: rooms.length })}</p>
                </div>
                <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
                    <Plus className="w-5 h-5" /> {t('rooms.new_room')}
                </button>
            </div>

            {showForm && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editingId ? t('rooms.edit_title') : t('rooms.new_title')}</h3>
                        <button onClick={resetForm} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-5 h-5" /></button>
                    </div>
                    {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl mb-4">{error}</div>}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('rooms.name_label')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder={t('rooms.name_placeholder')} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('rooms.description_label')}</label>
                            <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input-field" placeholder={t('rooms.desc_placeholder')} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="submit" className="btn-primary">{editingId ? t('common.save') : t('common.add')}</button>
                            <button type="button" onClick={resetForm} className="btn-secondary">{t('common.cancel')}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map(room => (
                    <div key={room.id} className="card p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                                    <FolderOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <h3 className="font-medium text-slate-900 dark:text-white">{room.name}</h3>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(room)} className="p-2 text-slate-400 hover:text-primary-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                    <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(room.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        {room.description && <p className="text-sm text-slate-500 dark:text-slate-400 ml-13">{room.description}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
