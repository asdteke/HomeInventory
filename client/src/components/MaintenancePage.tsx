import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    Wrench,
    Calendar,
    Plus,
    Trash2,
    Edit,
    CheckCircle2,
    AlertTriangle,
    Clock,
    Info,
    Package,
    Loader2
} from 'lucide-react';
import { SectionHeader, LoadingState, NoticeBanner } from './ProductUI';
import ModalDialog, { ConfirmDialog } from './ModalDialog';
import { FloatingToastStack, ToastTone } from './FloatingToast';
import { formatDateForLanguage } from '../utils/appFormatting';
import { useToastQueue } from '../hooks/useToastQueue';

interface MaintenanceTask {
    id: number;
    item_id: number;
    task_name: string;
    description?: string;
    frequency_value?: number;
    frequency_unit?: string;
    last_performed_at?: string;
    next_due_date: string;
    house_key: string;
    created_by: number;
    item_name?: string;
    is_overdue?: boolean;
}

interface InventoryItem {
    id: number;
    name: string;
    room_name?: string;
}

interface TaskCardProps {
    task: MaintenanceTask;
    isOverdue: boolean;
    isPerforming: boolean;
    onEdit: (task: MaintenanceTask) => void;
    onPerform: (task: MaintenanceTask) => void;
    onDelete: (task: MaintenanceTask) => void;
    formatFreqText: (val: number | undefined, unit: string | undefined) => string;
    t: any;
    locale: string;
}

import { fetchWithCache, getCachedData, hasCache, invalidateCache } from '../utils/apiCache';

const MAINTENANCE_URL = '/api/maintenance';
const ITEM_OPTIONS_URL = '/api/items/options';
const DASHBOARD_SUMMARY_URL = '/api/items/dashboard-summary';

export default function MaintenancePage() {
    const { t, i18n } = useTranslation();

    // Initialize states from SWR cache
    const [tasks, setTasks] = useState<MaintenanceTask[]>(() => getCachedData(MAINTENANCE_URL)?.tasks || []);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getCachedData(ITEM_OPTIONS_URL)?.items || []);

    const isInitiallyLoaded = hasCache(MAINTENANCE_URL) && hasCache(ITEM_OPTIONS_URL);
    const [loading, setLoading] = useState(!isInitiallyLoaded);

    // Modal & Action states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);
    const [deletingTask, setDeletingTask] = useState<MaintenanceTask | null>(null);
    const [performingTask, setPerformingTask] = useState<MaintenanceTask | null>(null);
    const [performingIds, setPerformingIds] = useState<Set<number>>(new Set());
    const { toasts, showToast: enqueueToast, closeToast } = useToastQueue();

    const isActiveRef = useRef(true);
    const performTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Form inputs
    const [itemId, setItemId] = useState('');
    const [taskName, setTaskName] = useState('');
    const [description, setDescription] = useState('');
    const [freqValue, setFreqValue] = useState('');
    const [freqUnit, setFreqUnit] = useState('months');
    const [nextDueDate, setNextDueDate] = useState('');

    const showToast = (msg: string, type: ToastTone = 'success') => {
        enqueueToast({
            title: type === 'danger' ? t('common.error', { defaultValue: 'Something went wrong' }) : t('common.success', { defaultValue: 'Updated' }),
            description: msg,
            tone: type
        });
    };

    const fetchTasksAndItems = async () => {
        try {
            await Promise.all([
                fetchWithCache(MAINTENANCE_URL, (data) => {
                    if (isActiveRef.current) setTasks(data.tasks || []);
                }),
                fetchWithCache(ITEM_OPTIONS_URL, (data) => {
                    if (isActiveRef.current) setInventoryItems(data.items || []);
                })
            ]);
        } catch (error) {
            if (!isActiveRef.current) return;
            console.error('Fetch maintenance data error:', error);
            showToast(t('maintenance.toast.fetch_error', { defaultValue: 'Bilgiler yüklenirken hata oluştu' }), 'danger');
        } finally {
            if (isActiveRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        isActiveRef.current = true;
        fetchTasksAndItems();

        return () => {
            isActiveRef.current = false;
            if (performTimeoutRef.current) {
                clearTimeout(performTimeoutRef.current);
            }
        };
    }, []);

    const handleOpenCreateModal = () => {
        setEditingTask(null);
        setItemId(inventoryItems[0]?.id?.toString() || '');
        setTaskName('');
        setDescription('');
        setFreqValue('6');
        setFreqUnit('months');
        setNextDueDate(new Date().toISOString().split('T')[0]);
        setIsFormOpen(true);
    };

    const handleOpenEditModal = (task: MaintenanceTask) => {
        setEditingTask(task);
        setItemId(task.item_id?.toString() || '');
        setTaskName(task.task_name || '');
        setDescription(task.description || '');
        setFreqValue(task.frequency_value?.toString() || '');
        setFreqUnit(task.frequency_unit || 'months');
        setNextDueDate(task.next_due_date || '');
        setIsFormOpen(true);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!itemId) {
            showToast(t('maintenance.toast.select_item_error', { defaultValue: 'Lütfen bir eşya seçin.' }), 'danger');
            return;
        }
        if (!taskName.trim()) {
            showToast(t('maintenance.toast.task_name_error', { defaultValue: 'Görev adı gereklidir.' }), 'danger');
            return;
        }
        if (!nextDueDate) {
            showToast(t('maintenance.toast.date_error', { defaultValue: 'Planlanan tarih gereklidir.' }), 'danger');
            return;
        }

        const payload = {
            item_id: parseInt(itemId, 10),
            task_name: taskName,
            description: description,
            frequency_value: freqValue ? parseInt(freqValue, 10) : null,
            frequency_unit: freqValue ? freqUnit : null,
            next_due_date: nextDueDate
        };

        try {
            if (editingTask) {
                await axios.put(`/api/maintenance/${editingTask.id}`, payload);
                if (!isActiveRef.current) return;
                showToast(t('maintenance.toast.updated', { defaultValue: 'Bakım görevi güncellendi' }));
            } else {
                await axios.post('/api/maintenance', payload);
                if (!isActiveRef.current) return;
                showToast(t('maintenance.toast.created', { defaultValue: 'Yeni bakım görevi eklendi' }));
            }
            setIsFormOpen(false);
            invalidateCache(MAINTENANCE_URL);
            invalidateCache(DASHBOARD_SUMMARY_URL);
            fetchTasksAndItems();
        } catch (error: any) {
            if (!isActiveRef.current) return;
            const errorMsg = error.response?.data?.error || t('maintenance.toast.save_error', { defaultValue: 'Kaydederken hata oluştu' });
            showToast(errorMsg, 'danger');
        }
    };

    const handleDeleteTask = async () => {
        if (!deletingTask) return;
        try {
            await axios.delete(`/api/maintenance/${deletingTask.id}`);
            if (!isActiveRef.current) return;
            showToast(t('maintenance.toast.deleted', { defaultValue: 'Bakım görevi başarıyla silindi.' }));
            setDeletingTask(null);
            invalidateCache(MAINTENANCE_URL);
            invalidateCache(DASHBOARD_SUMMARY_URL);
            fetchTasksAndItems();
        } catch (error) {
            if (!isActiveRef.current) return;
            showToast(t('maintenance.toast.delete_error', { defaultValue: 'Silme işlemi sırasında bir hata oluştu.' }), 'danger');
        }
    };

    const handlePerformTask = async () => {
        if (!performingTask) return;
        const taskId = performingTask.id;

        // Add to performingIds immediately
        setPerformingIds(prev => {
            const next = new Set(prev);
            next.add(taskId);
            return next;
        });

        // Close the dialog immediately
        setPerformingTask(null);

        // Detect reduced motion for animation timing
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const animDuration = prefersReducedMotion ? 0 : 400;
        const startTime = Date.now();

        try {
            await axios.post(`/api/maintenance/${taskId}/perform`);

            // Calculate remaining animation time to guarantee visual transition
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, animDuration - elapsedTime);

            performTimeoutRef.current = setTimeout(() => {
                if (!isActiveRef.current) return;

                showToast(t('maintenance.toast.performed', { defaultValue: 'Bakım tamamlandı olarak kaydedildi. Bir sonraki tarih planlandı.' }));
                // Remove from performingIds and refresh data
                setPerformingIds(prev => {
                    const next = new Set(prev);
                    next.delete(taskId);
                    return next;
                });
                invalidateCache(MAINTENANCE_URL);
                invalidateCache(DASHBOARD_SUMMARY_URL);
                fetchTasksAndItems();
            }, remainingTime);
        } catch (error) {
            if (!isActiveRef.current) return;
            setPerformingIds(prev => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
            showToast(t('maintenance.toast.perform_error', { defaultValue: 'Kaydedilirken bir hata oluştu.' }), 'danger');
        }
    };

    // Classify tasks into overdue and upcoming
    const classifiedTasks = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const overdue: MaintenanceTask[] = [];
        const upcoming: MaintenanceTask[] = [];
        const oneTime: MaintenanceTask[] = [];

        tasks.forEach(task => {
            if (task.next_due_date < todayStr) {
                overdue.push(task);
            } else if (task.frequency_value && task.frequency_unit) {
                upcoming.push(task);
            } else {
                oneTime.push(task);
            }
        });

        return { overdue, upcoming, oneTime };
    }, [tasks]);

    const formatFreqText = (val: number | undefined, unit: string | undefined): string => {
        if (!val || !unit) return t('maintenance.freq.one_time', { defaultValue: 'Tek Seferlik' });
        const unitTranslation = t(`maintenance.freq.unit.${unit}`, {
            defaultValue: unit === 'days' ? 'Gün' : unit === 'weeks' ? 'Hafta' : unit === 'months' ? 'Ay' : 'Yıl'
        });
        return t('maintenance.freq.format', { val, unit: unitTranslation, defaultValue: `Her ${val} ${unitTranslation}` });
    };

    if (loading) {
        return <LoadingState title={t('common.loading')} description={t('maintenance.loading_desc', { defaultValue: 'Bakım takvimi yükleniyor...' })} />;
    }

    return (
        <div className="maintenance-page-v25 animate-fade-in">
            <header className="workspace-intro workspace-intro-with-action">
                <div>
                    <p className="workspace-eyebrow">{t('navigation.service', { defaultValue: 'Maintenance' })}</p>
                    <h1>{t('maintenance.page.title', { defaultValue: 'Bakım & Periyodik Takip' })}</h1>
                    <p>{t('maintenance.page.description', {
                        defaultValue: 'Ev envanterinizdeki cihazların, filtrelerin veya güvenlik ekipmanlarının periyodik bakım takvimlerini yönetin.'
                    })}</p>
                </div>
                <button onClick={handleOpenCreateModal} className="btn-primary maintenance-desktop-add cursor-pointer">
                    <Plus className="h-4 w-4" />
                    <span>{t('maintenance.actions.add_task', { defaultValue: 'Yeni Görev Ekle' })}</span>
                </button>
            </header>

            {/* Overdue alerts */}
            {classifiedTasks.overdue.length > 0 && (
                <NoticeBanner
                    tone="danger"
                    icon={AlertTriangle}
                    title={t('maintenance.alerts.overdue_title', { defaultValue: 'Süresi Geçmiş Görevleriniz Var!' })}
                    description={t('maintenance.alerts.overdue_desc', {
                        count: classifiedTasks.overdue.length,
                        defaultValue: 'Zamanı geçmiş {{count}} bakım görevi bulunuyor. Gecikmeler cihaz ömrünü azaltabilir.'
                    })}
                />
            )}

            {tasks.length === 0 ? (
                <section className="workspace-empty maintenance-empty">
                    <span className="workspace-empty-icon"><Wrench /></span>
                    <div>
                        <h2>{t('maintenance.empty.title', { defaultValue: 'Planlanmış bakım görevi bulunmuyor' })}</h2>
                        <p>{t('maintenance.empty.desc', {
                            defaultValue: 'Klima filtresi temizliği, kombi bakımı veya yangın dedektörü pil kontrolü gibi tekrarlayan görevleri ekleyerek başlayın.'
                        })}</p>
                    </div>
                </section>
            ) : (
                <div className="grid gap-6 lg:grid-cols-12">
                    {/* Overdue Tasks Column */}
                    {classifiedTasks.overdue.length > 0 && (
                        <div className="lg:col-span-12 space-y-4">
                            <SectionHeader
                                title={t('maintenance.sections.overdue', { defaultValue: 'Zamanı Geçen Görevler' })}
                                description={t('maintenance.sections.overdue_desc', { defaultValue: 'Hemen yapılması gereken acil bakımlar.' })}
                            />
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {classifiedTasks.overdue.map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        isOverdue={true}
                                        isPerforming={performingIds.has(task.id)}
                                        onEdit={handleOpenEditModal}
                                        onPerform={setPerformingTask}
                                        onDelete={setDeletingTask}
                                        formatFreqText={formatFreqText}
                                        t={t}
                                        locale={i18n.language}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Tasks Column */}
                    <div className="lg:col-span-12 space-y-4">
                        <SectionHeader
                            title={t('maintenance.sections.upcoming', { defaultValue: 'Planlı / Gelecek Görevler' })}
                            description={t('maintenance.sections.upcoming_desc', { defaultValue: 'Önümüzdeki günlerde yaklaşan bakımlar.' })}
                        />
                        {classifiedTasks.upcoming.length === 0 && classifiedTasks.oneTime.length === 0 ? (
                            <div className="card !p-5 text-center text-[var(--hi-text-muted)] text-sm">
                                {t('maintenance.sections.no_upcoming', { defaultValue: 'Gelecekte planlanmış aktif görev yok.' })}
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {[...classifiedTasks.upcoming, ...classifiedTasks.oneTime].map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        isOverdue={false}
                                        isPerforming={performingIds.has(task.id)}
                                        onEdit={handleOpenEditModal}
                                        onPerform={setPerformingTask}
                                        onDelete={setDeletingTask}
                                        formatFreqText={formatFreqText}
                                        t={t}
                                        locale={i18n.language}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Task Create / Edit Modal Dialog */}
            <ModalDialog
                isOpen={isFormOpen}
                title={editingTask ? t('maintenance.modal.edit_title', { defaultValue: 'Görevi Düzenle' }) : t('maintenance.modal.create_title', { defaultValue: 'Yeni Bakım Görevi Planla' })}
                onClose={() => setIsFormOpen(false)}
                icon={Wrench}
                tone="default"
                footer={
                    <>
                        <button type="button" onClick={() => setIsFormOpen(false)} className="btn-secondary px-5 py-2.5 cursor-pointer">
                            {t('common.cancel', { defaultValue: 'İptal' })}
                        </button>
                        <button type="submit" form="maintenance-form" className="btn-primary px-5 py-2.5 cursor-pointer">
                            {t('common.save', { defaultValue: 'Kaydet' })}
                        </button>
                    </>
                }
            >
                <form id="maintenance-form" onSubmit={handleFormSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                            {t('maintenance.form.item', { defaultValue: 'İlgili Eşya' })} *
                        </label>
                        {inventoryItems.length === 0 ? (
                            <div className="text-sm text-red-500">
                                {t('maintenance.form.no_items', { defaultValue: 'Bakım planlamak için önce envantere bir eşya eklemelisiniz.' })}
                            </div>
                        ) : (
                            <select
                                value={itemId}
                                onChange={(e) => setItemId(e.target.value)}
                                className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition text-sm cursor-pointer"
                            >
                                <option value="" disabled>-- {t('maintenance.form.select_item_placeholder', { defaultValue: 'Bir Eşya Seçin' })} --</option>
                                {inventoryItems.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} {item.room_name ? `(${item.room_name})` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                            {t('maintenance.form.task_name', { defaultValue: 'Görev / İşlem Adı' })} *
                        </label>
                        <input
                            type="text"
                            value={taskName}
                            onChange={(e) => setTaskName(e.target.value)}
                            placeholder={t('maintenance.form.task_name_placeholder', { defaultValue: 'Örn: Filtre Değişimi, Periyodik Kontrol...' })}
                            className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition text-sm"
                            required
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                            {t('maintenance.form.description', { defaultValue: 'Detay / Açıklama' })}
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('maintenance.form.description_placeholder', { defaultValue: 'Görevin detayları, kullanılacak malzemeler vb...' })}
                            className="w-full h-24 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition text-sm resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                                {t('maintenance.form.frequency_value', { defaultValue: 'Tekrar Sıklığı' })}
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={freqValue}
                                onChange={(e) => setFreqValue(e.target.value)}
                                placeholder={t('maintenance.form.frequency_placeholder', { defaultValue: 'Örn: 6 (Boş bırakılırsa tek seferlik)' })}
                                className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-sm text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition-all duration-300"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                                {t('maintenance.form.frequency_unit', { defaultValue: 'Sıklık Birimi' })}
                            </label>
                            <select
                                value={freqUnit}
                                onChange={(e) => setFreqUnit(e.target.value)}
                                disabled={!freqValue}
                                className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition text-sm disabled:opacity-50 cursor-pointer"
                            >
                                <option value="days">{t('maintenance.freq.unit.days', { defaultValue: 'Gün' })}</option>
                                <option value="weeks">{t('maintenance.freq.unit.weeks', { defaultValue: 'Hafta' })}</option>
                                <option value="months">{t('maintenance.freq.unit.months', { defaultValue: 'Ay' })}</option>
                                <option value="years">{t('maintenance.freq.unit.years', { defaultValue: 'Yıl' })}</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--hi-text)]">
                            {t('maintenance.form.next_due_date', { defaultValue: 'Sıradaki Planlanan Tarih' })} *
                        </label>
                        <input
                            type="date"
                            value={nextDueDate}
                            onChange={(e) => setNextDueDate(e.target.value)}
                            className="w-full rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-3 text-[var(--hi-text)] outline-none focus:border-[var(--hi-accent)] transition text-sm cursor-pointer"
                            required
                        />
                    </div>
                </form>
            </ModalDialog>

            {/* Confirm Log Performance Modal */}
            <ConfirmDialog
                isOpen={!!performingTask}
                title={t('maintenance.modal.perform_title', { defaultValue: 'Bakımı Tamamla' })}
                description={t('maintenance.modal.perform_desc', {
                    name: performingTask?.task_name,
                    defaultValue: `"${performingTask?.task_name}" görevini bugün yapılmış olarak kaydetmek istiyor musunuz?`
                })}
                confirmLabel={t('maintenance.modal.perform_confirm', { defaultValue: 'Evet, Tamamlandı' })}
                cancelLabel={t('common.cancel')}
                onClose={() => setPerformingTask(null)}
                onConfirm={handlePerformTask}
                tone="default"
                icon={CheckCircle2}
            >
                {performingTask?.frequency_value && (
                    <p className="mt-2 text-xs text-[var(--hi-text-muted)]">
                        {t('maintenance.modal.perform_recurrence_info', {
                            defaultValue: 'Bu periyodik bir görevdir. Kaydettiğinizde sistem otomatik olarak bir sonraki bakım tarihini hesaplayacaktır.'
                        })}
                    </p>
                )}
            </ConfirmDialog>

            {/* Confirm Delete Modal */}
            <ConfirmDialog
                isOpen={!!deletingTask}
                title={t('maintenance.modal.delete_title', { defaultValue: 'Bakım Görevini Sil?' })}
                description={t('maintenance.modal.delete_desc', {
                    name: deletingTask?.task_name,
                    defaultValue: `"${deletingTask?.task_name}" periyodik bakım programını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`
                })}
                confirmLabel={t('common.delete', { defaultValue: 'Sil' })}
                cancelLabel={t('common.cancel')}
                onClose={() => setDeletingTask(null)}
                onConfirm={handleDeleteTask}
                tone="danger"
                icon={Trash2}
            />

            <FloatingToastStack toasts={toasts} onClose={closeToast} />
        </div>
    );
}

function TaskCard({ task, isOverdue, isPerforming, onEdit, onPerform, onDelete, formatFreqText, t, locale }: TaskCardProps) {
    const nextDue = new Date(task.next_due_date);
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = !isNaN(nextDue.getTime())
        ? formatDateForLanguage(nextDue, locale, options)
        : task.next_due_date;

    const performStyle = isOverdue
        ? 'border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5'
        : 'border-[var(--hi-border)] bg-[var(--hi-panel-strong)]';

    const borderLeftStyle = isOverdue
        ? { borderLeft: '4px solid var(--hi-danger, #ef4444)' }
        : { borderLeft: '4px solid var(--hi-border)' };

    const completingClass = isPerforming ? 'is-completing' : '';

    return (
        <div
            style={borderLeftStyle}
            className={`group maintenance-task-card flex flex-col justify-between rounded-2xl border p-5 shadow-[var(--hi-shadow-soft)] transition-all duration-200 hover:scale-[1.008] hover:shadow-[var(--hi-shadow)] active:scale-[0.99] ${performStyle} ${completingClass}`}
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--hi-accent)]">
                            <Clock className="w-3 h-3" />
                            {formatFreqText(task.frequency_value, task.frequency_unit)}
                        </span>
                        <h3 className="mt-1 truncate text-base font-semibold leading-snug text-[var(--hi-text)]" title={task.task_name}>
                            {task.task_name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-[var(--hi-text-soft)] flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-[var(--hi-text-muted)] shrink-0" />
                            <span>{task.item_name || t('maintenance.card.untitled_item', { defaultValue: 'İsimsiz Eşya' })}</span>
                        </p>
                    </div>

                    <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                            onClick={() => onEdit(task)}
                            disabled={isPerforming}
                            aria-label={t('common.edit', { defaultValue: 'Düzenle' })}
                            className="rounded-lg p-1.5 text-[var(--hi-text-muted)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] transition cursor-pointer active:scale-[0.98] disabled:opacity-50"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onDelete(task)}
                            disabled={isPerforming}
                            aria-label={t('common.delete', { defaultValue: 'Sil' })}
                            className="rounded-lg p-1.5 text-[var(--hi-text-muted)] hover:bg-red-500/10 hover:text-red-500 transition cursor-pointer active:scale-[0.98] disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {task.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-[var(--hi-text-muted)]">
                        {task.description}
                    </p>
                )}

                {task.last_performed_at && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--hi-bg-strong)] px-2.5 py-1.5 w-fit border border-[var(--hi-border)]/40 shadow-sm mt-2 animate-fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] font-bold text-[var(--hi-text-soft)] uppercase tracking-wider">
                            {t('maintenance.card.last_performed', { defaultValue: 'Son Yapılma:' })}
                        </span>
                        <span className="text-[10px] font-extrabold text-[var(--hi-text)] tracking-wider">
                            {task.last_performed_at}
                        </span>
                    </div>
                )}
            </div>

            <div className="mt-5 border-t border-[var(--hi-border)] pt-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--hi-text-muted)] font-medium">
                        {t('maintenance.card.next_due_label', { defaultValue: 'Planlanan Tarih' })}
                    </p>
                    <p className={`text-sm font-semibold truncate flex items-center gap-1 ${isOverdue ? 'text-red-500 dark:text-red-400' : 'text-[var(--hi-text)]'}`}>
                        {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        <span>{formattedDate}</span>
                    </p>
                </div>

                <button
                    onClick={() => onPerform(task)}
                    disabled={isPerforming}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)] hover:bg-[var(--hi-accent)] hover:text-white transition shadow-[var(--hi-shadow-soft)] cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    title={t('maintenance.card.complete_tooltip', { defaultValue: 'Bakımı Bugün Yapıldı Olarak İşaretle' })}
                >
                    {isPerforming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
