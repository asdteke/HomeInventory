import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, CheckCircle2, Filter, ShieldCheck, Wrench } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader, SectionHeader } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(value: string) {
    if (!value) return '';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value;
    return `${match[3]}.${match[2]}.${match[1]}`;
}

function TaskRow({ task, overdue, t }: { task: any; overdue: boolean; t: any }) {
    return (
        <Link
            to="/maintenance"
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-3 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)]"
        >
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--hi-text)]">{task.task_name}</span>
                <span className="mt-1 block text-xs text-[var(--hi-text-soft)]">
                    {task.item_name || t('inventory.untitled_item')} · {formatDisplayDate(task.next_due_date)}
                </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                {overdue ? t('service.overdue', { defaultValue: 'Geçti' }) : t('service.upcoming', { defaultValue: 'Yakın' })}
            </span>
        </Link>
    );
}

function SummaryTile({ icon: Icon, label, value, tone = 'default' }: { icon: any; label: string; value: string | number; tone?: 'default' | 'warning' | 'danger' }) {
    const toneClass = tone === 'danger'
        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
        : tone === 'warning'
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]';

    return (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
                <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">{label}</span>
                <span className="mt-1 block text-lg font-semibold text-[var(--hi-text)]">{value}</span>
            </span>
        </div>
    );
}

function WarrantyRow({ item, expired, t }: { item: any; expired: boolean; t: any }) {
    const title = resolveVisibleItemTitle(item, t('inventory.untitled_item'));
    return (
        <Link
            to={`/items/${item.id}/edit`}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-3 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)]"
        >
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--hi-text)]">{title}</span>
                <span className="mt-1 block text-xs text-[var(--hi-text-soft)]">
                    {item.room_name || t('inventory.no_room', { defaultValue: 'Odasız' })} · {formatDisplayDate(item.warranty_expiry_date)}
                </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${expired ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                {expired ? t('service.expired', { defaultValue: 'Doldu' }) : t('service.upcoming', { defaultValue: 'Yakın' })}
            </span>
        </Link>
    );
}

export default function ServiceCenterPage() {
    const { t } = useTranslation();
    const [warrantyExpired, setWarrantyExpired] = useState<any[]>([]);
    const [warrantyClose, setWarrantyClose] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const [expiredResponse, closeResponse, maintenanceResponse] = await Promise.all([
                    axios.get('/api/items?warranty=expired&sort=updated_desc'),
                    axios.get('/api/items?warranty=close&sort=updated_desc'),
                    axios.get('/api/maintenance')
                ]);
                if (mounted) {
                    setWarrantyExpired(expiredResponse.data.items || []);
                    setWarrantyClose(closeResponse.data.items || []);
                    setTasks(maintenanceResponse.data.tasks || []);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, []);

    const today = todayIsoDate();
    const overdueTasks = useMemo(() => tasks.filter((task) => task.next_due_date && task.next_due_date < today), [tasks, today]);
    const upcomingTasks = useMemo(() => tasks.filter((task) => task.next_due_date && task.next_due_date >= today).slice(0, 12), [tasks, today]);
    const totalActionCount = warrantyExpired.length + warrantyClose.length + overdueTasks.length + upcomingTasks.length;
    const warrantyCount = warrantyExpired.length + warrantyClose.length;
    const taskCount = overdueTasks.length + upcomingTasks.length;

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('service.title', { defaultValue: 'Servis ve Garanti Merkezi' })}
                description={t('service.description', { defaultValue: 'Garanti süresi, bakım takvimi ve servis aksiyonlarını tek yerden takip edin.' })}
                meta={[
                    { label: t('service.meta_warranty', { count: warrantyExpired.length + warrantyClose.length, defaultValue: '{{count}} garanti kaydı' }), tone: 'default' },
                    { label: t('service.meta_tasks', { count: overdueTasks.length + upcomingTasks.length, defaultValue: '{{count}} bakım görevi' }), tone: overdueTasks.length ? 'warning' : 'default' }
                ]}
                actions={(
                    <Link to="/maintenance" className="btn-secondary shrink-0">
                        <Wrench className="h-4 w-4" />
                        <span>{t('navigation.maintenance', { defaultValue: 'Bakım Takvimi' })}</span>
                    </Link>
                )}
            />

            <div className="grid gap-3 md:grid-cols-3">
                <SummaryTile
                    icon={ShieldCheck}
                    label={t('service.summary_warranty', { defaultValue: 'Garanti takibi' })}
                    value={warrantyCount}
                    tone={warrantyExpired.length ? 'danger' : warrantyClose.length ? 'warning' : 'default'}
                />
                <SummaryTile
                    icon={Wrench}
                    label={t('service.summary_tasks', { defaultValue: 'Bakım görevi' })}
                    value={taskCount}
                    tone={overdueTasks.length ? 'danger' : taskCount ? 'warning' : 'default'}
                />
                <Link
                    to="/items?warranty=active&sort=expiry_asc"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-3 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)]"
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                            <Filter className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[var(--hi-text)]">{t('service.open_warranty_filter', { defaultValue: 'Garanti filtresini aç' })}</span>
                            <span className="mt-1 block truncate text-xs text-[var(--hi-text-soft)]">{t('service.open_warranty_filter_desc', { defaultValue: 'Aktif garantili eşyaları envanterde filtreler.' })}</span>
                        </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--hi-text-soft)] transition group-hover:translate-x-0.5 group-hover:text-[var(--hi-accent)]" />
                </Link>
            </div>

            {totalActionCount === 0 ? (
                <EmptyState
                    icon={CheckCircle2}
                    title={t('service.empty_title', { defaultValue: 'Servis veya garanti aksiyonu yok' })}
                    description={t('service.empty_desc', { defaultValue: 'Garanti tarihi yaklaşan ürünler ve bakım görevleri burada toplanır.' })}
                    actions={<Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>}
                />
            ) : (
                <div className="grid items-start gap-5 xl:grid-cols-2">
                    <div
                        role="region"
                        aria-label={t('service.warranty_section', { defaultValue: 'Garanti Takibi' })}
                        className="space-y-4 rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)]"
                    >
                        <SectionHeader
                            title={t('service.warranty_section', { defaultValue: 'Garanti Takibi' })}
                            description={t('service.warranty_desc', { defaultValue: 'Süresi dolan veya 30 gün içinde dolacak garanti kayıtları.' })}
                            action={<ShieldCheck className="h-5 w-5 text-[var(--hi-accent)]" />}
                        />
                        <div className="space-y-2">
                            {warrantyExpired.map((item) => <WarrantyRow key={`expired-${item.id}`} item={item} expired t={t} />)}
                            {warrantyClose.map((item) => <WarrantyRow key={`close-${item.id}`} item={item} expired={false} t={t} />)}
                            {warrantyExpired.length + warrantyClose.length === 0 && (
                                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-6 text-sm text-[var(--hi-text-soft)]">
                                    {t('service.no_warranty', { defaultValue: 'Yaklaşan garanti aksiyonu yok.' })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        role="region"
                        aria-label={t('service.maintenance_section', { defaultValue: 'Bakım Aksiyonları' })}
                        className="space-y-4 rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-4 shadow-[var(--hi-shadow-soft)]"
                    >
                        <SectionHeader
                            title={t('service.maintenance_section', { defaultValue: 'Bakım Aksiyonları' })}
                            description={t('service.maintenance_desc', { defaultValue: 'Geciken ve sıradaki bakım görevleri.' })}
                            action={<CalendarDays className="h-5 w-5 text-[var(--hi-accent)]" />}
                        />
                        <div className="space-y-2">
                            {overdueTasks.map((task) => <TaskRow key={`overdue-${task.id}`} task={task} overdue t={t} />)}
                            {upcomingTasks.map((task) => <TaskRow key={`upcoming-${task.id}`} task={task} overdue={false} t={t} />)}
                            {overdueTasks.length + upcomingTasks.length === 0 && (
                                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-6 text-sm text-[var(--hi-text-soft)]">
                                    {t('service.no_tasks', { defaultValue: 'Planlanmış bakım görevi yok.' })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
