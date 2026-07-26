import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, CheckCircle2, Filter, ShieldCheck, Wrench } from 'lucide-react';
import { LoadingState } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import '../operations-v25.css';

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
            className="operations-compact-row-v25 group"
        >
            <span className="operations-row-copy-v25">
                <strong>{task.task_name}</strong>
                <span>
                    {task.item_name || t('inventory.untitled_item')} · {formatDisplayDate(task.next_due_date)}
                </span>
            </span>
            <span className={`operations-status-v25 ${overdue ? 'is-danger' : 'is-warning'}`}>
                {overdue ? t('service.overdue', { defaultValue: 'Geçti' }) : t('service.upcoming', { defaultValue: 'Yakın' })}
            </span>
        </Link>
    );
}

function SummaryTile({ icon: Icon, label, value, tone = 'default' }: { icon: any; label: string; value: string | number; tone?: 'default' | 'warning' | 'danger' }) {
    const toneClass = tone === 'danger' ? 'is-danger' : tone === 'warning' ? 'is-warning' : 'is-info';

    return (
        <div className={`operations-metric-v25 ${toneClass}`}>
            <span className="operations-metric-icon-v25">
                <Icon />
            </span>
            <span>
                <small>{label}</small>
                <strong>{value}</strong>
            </span>
        </div>
    );
}

function WarrantyRow({ item, expired, t }: { item: any; expired: boolean; t: any }) {
    const title = resolveVisibleItemTitle(item, t('inventory.untitled_item'));
    return (
        <Link
            to={`/items/${item.id}/edit`}
            className="operations-compact-row-v25 group"
        >
            <span className="operations-row-copy-v25">
                <strong>{title}</strong>
                <span>
                    {item.room_name || t('inventory.no_room', { defaultValue: 'Odasız' })} · {formatDisplayDate(item.warranty_expiry_date)}
                </span>
            </span>
            <span className={`operations-status-v25 ${expired ? 'is-danger' : 'is-warning'}`}>
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
        <div className="operations-page-v25 animate-fade-in">
            <header className="operations-intro-v25">
                <div className="operations-intro-copy-v25">
                    <span className="operations-hero-icon-v25 is-info" aria-hidden="true"><Wrench /></span>
                    <div>
                        <h1>{t('service.title', { defaultValue: 'Servis ve Garanti Merkezi' })}</h1>
                        <p>{t('service.description', { defaultValue: 'Garanti süresi, bakım takvimi ve servis aksiyonlarını tek yerden takip edin.' })}</p>
                    </div>
                </div>
                <div className="operations-intro-actions-v25">
                    <Link to="/maintenance" className="btn-secondary shrink-0">
                        <Wrench className="h-4 w-4" />
                        <span>{t('navigation.maintenance', { defaultValue: 'Bakım Takvimi' })}</span>
                    </Link>
                </div>
            </header>

            <section className="operations-workspace-v25">
                <div className="operations-metrics-v25">
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
                    <Link to="/items?warranty=active&sort=expiry_asc" className="operations-metric-v25 operations-metric-link-v25 is-info group">
                        <span className="operations-metric-icon-v25">
                            <Filter />
                        </span>
                        <span>
                            <small>{t('service.open_warranty_filter', { defaultValue: 'Garanti filtresini aç' })}</small>
                            <strong className="operations-metric-label-v25">{t('navigation.inventory')}</strong>
                        </span>
                        <ArrowRight className="operations-metric-arrow-v25" />
                    </Link>
                </div>

                {totalActionCount === 0 ? (
                    <div className="operations-inline-empty-v25 operations-inline-empty-bordered-v25">
                        <span className="operations-empty-icon-v25"><CheckCircle2 /></span>
                        <div>
                            <h2>{t('service.empty_title', { defaultValue: 'Servis veya garanti aksiyonu yok' })}</h2>
                            <p>{t('service.empty_desc', { defaultValue: 'Garanti tarihi yaklaşan ürünler ve bakım görevleri burada toplanır.' })}</p>
                        </div>
                        <Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>
                    </div>
                ) : (
                    <div className="operations-columns-v25">
                        <div role="region" aria-label={t('service.warranty_section', { defaultValue: 'Garanti Takibi' })} className="operations-column-v25">
                            <div className="operations-section-heading-v25">
                                <span className="operations-section-icon-v25 is-info"><ShieldCheck /></span>
                                <div>
                                    <h2>{t('service.warranty_section', { defaultValue: 'Garanti Takibi' })}</h2>
                                    <p>{t('service.warranty_desc', { defaultValue: 'Süresi dolan veya 30 gün içinde dolacak garanti kayıtları.' })}</p>
                                </div>
                            </div>
                            <div className="operations-compact-list-v25">
                                {warrantyExpired.map((item) => <WarrantyRow key={`expired-${item.id}`} item={item} expired t={t} />)}
                                {warrantyClose.map((item) => <WarrantyRow key={`close-${item.id}`} item={item} expired={false} t={t} />)}
                                {warrantyExpired.length + warrantyClose.length === 0 && (
                                    <p className="operations-quiet-message-v25">{t('service.no_warranty', { defaultValue: 'Yaklaşan garanti aksiyonu yok.' })}</p>
                                )}
                            </div>
                        </div>

                        <div role="region" aria-label={t('service.maintenance_section', { defaultValue: 'Bakım Aksiyonları' })} className="operations-column-v25">
                            <div className="operations-section-heading-v25">
                                <span className="operations-section-icon-v25 is-warning"><CalendarDays /></span>
                                <div>
                                    <h2>{t('service.maintenance_section', { defaultValue: 'Bakım Aksiyonları' })}</h2>
                                    <p>{t('service.maintenance_desc', { defaultValue: 'Geciken ve sıradaki bakım görevleri.' })}</p>
                                </div>
                            </div>
                            <div className="operations-compact-list-v25">
                                {overdueTasks.map((task) => <TaskRow key={`overdue-${task.id}`} task={task} overdue t={t} />)}
                                {upcomingTasks.map((task) => <TaskRow key={`upcoming-${task.id}`} task={task} overdue={false} t={t} />)}
                                {overdueTasks.length + upcomingTasks.length === 0 && (
                                    <p className="operations-quiet-message-v25">{t('service.no_tasks', { defaultValue: 'Planlanmış bakım görevi yok.' })}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
