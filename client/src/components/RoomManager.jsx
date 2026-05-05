import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Plus, Edit3, Trash2, X, FolderOpen } from 'lucide-react';
import { EmptyState, NoticeBanner, PageHeader } from './ProductUI';
import FloatingToast from './FloatingToast';
import IconActionButton from './IconActionButton';
import { ConfirmDialog } from './ModalDialog';
import { getRoomPresentation } from '../utils/roomDisplay';

export default function RoomManager() {
    const { t, i18n } = useTranslation();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [error, setError] = useState('');
    const [pendingDeleteRoom, setPendingDeleteRoom] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [toast, setToast] = useState(null);

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
        setError('');
        const roomPresentation = getRoomPresentation(room, i18n.resolvedLanguage || i18n.language);
        setFormData({
            name: roomPresentation.name,
            description: roomPresentation.description || ''
        });
        setEditingId(room.id); setShowForm(true);
    };

    const handleDelete = async () => {
        if (!pendingDeleteRoom) return;

        setDeleteSubmitting(true);
        setError('');
        try {
            await axios.delete(`/api/rooms/${pendingDeleteRoom.id}`);
            setRooms((currentRooms) => currentRooms.filter((room) => room.id !== pendingDeleteRoom.id));
            setToast({
                title: t('rooms.delete_success_title', { defaultValue: 'Room deleted' }),
                description: t('rooms.delete_success_body', { defaultValue: 'The room was removed and related items can now be reassigned.' })
            });
            setPendingDeleteRoom(null);
        } catch (deleteError) {
            setError(deleteError.response?.data?.error || t('rooms.delete_error'));
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', description: '' });
        setEditingId(null);
        setShowForm(false);
        setError('');
    };

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                breadcrumbs={[{ label: t('navigation.home'), to: '/' }]}
                title={t('rooms.title')}
                description={t('rooms.subtitle', { count: rooms.length })}
                actions={(
                    <button type="button" onClick={() => setShowForm(true)} aria-label={t('rooms.new_room')} className="btn-secondary inline-flex items-center gap-2">
                        <Plus className="w-5 h-5" /> {t('rooms.new_room')}
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
                        <h3 className="text-lg font-semibold text-[var(--hi-text)]">{editingId ? t('rooms.edit_title') : t('rooms.new_title')}</h3>
                        <button type="button" onClick={resetForm} aria-label={t('common.close')} className="rounded-xl p-2 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"><X className="w-5 h-5" /></button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('rooms.name_label')}</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder={t('rooms.name_placeholder')} required />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('rooms.description_label')}</label>
                            <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input-field" placeholder={t('rooms.desc_placeholder')} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="submit" className="btn-secondary">{editingId ? t('common.save') : t('common.add')}</button>
                            <button type="button" onClick={resetForm} className="btn-secondary">{t('common.cancel')}</button>
                        </div>
                    </form>
                </div>
            )}

            {rooms.length === 0 ? (
                <EmptyState
                    icon={FolderOpen}
                    title={t('rooms.empty_title', { defaultValue: 'No rooms yet' })}
                    description={t('rooms.empty_description', { defaultValue: 'Create rooms like kitchen, storage, or garage so item locations stay consistent and easier to search.' })}
                    actions={(
                        <button type="button" onClick={() => setShowForm(true)} className="btn-secondary">
                            <Plus className="w-4 h-4" />
                            <span>{t('rooms.new_room')}</span>
                        </button>
                    )}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rooms.map((room) => {
                        const roomPresentation = getRoomPresentation(room, i18n.resolvedLanguage || i18n.language);

                        return (
                        <div key={room.id} className="card p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--hi-shadow-soft)]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex flex-1 items-start gap-3">
                                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                        <FolderOpen className="h-[18px] w-[18px]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-base font-semibold leading-6 text-[var(--hi-text)]">
                                            {roomPresentation.name}
                                        </h3>
                                        {roomPresentation.description && (
                                            <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                                {roomPresentation.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-1">
                                    <IconActionButton
                                        label={t('rooms.edit_action', { defaultValue: 'Edit room' })}
                                        icon={Edit3}
                                        onClick={() => handleEdit(room)}
                                        className="rounded-full"
                                    />
                                    <IconActionButton
                                        label={t('rooms.delete_action', { defaultValue: 'Delete room' })}
                                        icon={Trash2}
                                        tone="danger"
                                        onClick={() => setPendingDeleteRoom(room)}
                                        className="rounded-full"
                                    />
                                </div>
                            </div>
                        </div>
                    )})}
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingDeleteRoom)}
                title={t('rooms.delete_title', { defaultValue: 'Delete this room?' })}
                description={t('rooms.delete_description', { defaultValue: 'Deleting a room can make item locations less clear until they are reassigned.' })}
                confirmLabel={deleteSubmitting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete')}
                cancelLabel={t('common.cancel')}
                confirmButtonClassName="btn-danger"
                tone="danger"
                confirming={deleteSubmitting}
                onClose={() => !deleteSubmitting && setPendingDeleteRoom(null)}
                onConfirm={handleDelete}
            >
                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="font-medium text-[var(--hi-text)]">
                        {pendingDeleteRoom ? getRoomPresentation(pendingDeleteRoom, i18n.resolvedLanguage || i18n.language).name : ''}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('rooms.delete_warning', { defaultValue: 'Items assigned here may need a new room so search, counts, and placement history stay trustworthy.' })}
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
