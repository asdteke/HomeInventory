import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertTriangle,
    Ban,
    CheckCircle2,
    House,
    HousePlus,
    LayoutDashboard,
    Mail,
    MailCheck,
    Package,
    RefreshCw,
    Search,
    Send,
    Server,
    Shield,
    ShieldAlert,
    Trash2,
    UserRound,
    Users,
    LucideIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import FloatingToast from './FloatingToast';
import { ConfirmDialog } from './ModalDialog';
import { EmptyState, NoticeBanner, PageHeader, SectionHeader } from './ProductUI';
import { formatDateForLanguage, formatNumberForLanguage } from '../utils/appFormatting';
import '../admin-overlays-v25.css';

interface TabItem {
    id: 'dashboard' | 'users' | 'logs' | 'email';
    icon: LucideIcon;
}

const TAB_ITEMS: TabItem[] = [
    { id: 'dashboard', icon: LayoutDashboard },
    { id: 'users', icon: Users },
    { id: 'logs', icon: Activity },
    { id: 'email', icon: Mail }
];

const USER_FILTERS = ['all', 'active', 'banned', 'admin'] as const;
type UserFilterType = typeof USER_FILTERS[number];

function toSafeNumber(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

interface AdminStats {
    users: {
        total: number;
        admins: number;
        banned: number;
        locked: number;
        new_today: number;
        new_week: number;
    };
    households: {
        total: number;
        memberships: number;
        pending_requests: number;
    };
    inventory: {
        items: number;
        public_items: number;
        private_items: number;
        active_borrows: number;
        rooms: number;
        categories: number;
        locations: number;
    };
    server: {
        memory_percent: number;
        uptime_hours: number;
        uploads_mb: number;
        node_version: string;
        email_configured: boolean;
        error_log_count: number;
    };
    recent_activity: any[];
    recent_users: any[];
}

function normalizeAdminStats(raw: any): AdminStats {
    const source = raw && typeof raw === 'object' ? raw : {};
    const users = source.users && typeof source.users === 'object' ? source.users : {};
    const households = source.households && typeof source.households === 'object' ? source.households : {};
    const inventory = source.inventory && typeof source.inventory === 'object' ? source.inventory : {};
    const server = source.server && typeof source.server === 'object' ? source.server : {};

    return {
        users: {
            total: toSafeNumber(users.total),
            admins: toSafeNumber(users.admins),
            banned: toSafeNumber(users.banned),
            locked: toSafeNumber(users.locked),
            new_today: toSafeNumber(users.new_today),
            new_week: toSafeNumber(users.new_week)
        },
        households: {
            total: toSafeNumber(households.total),
            memberships: toSafeNumber(households.memberships),
            pending_requests: toSafeNumber(households.pending_requests)
        },
        inventory: {
            items: toSafeNumber(inventory.items),
            public_items: toSafeNumber(inventory.public_items),
            private_items: toSafeNumber(inventory.private_items),
            active_borrows: toSafeNumber(inventory.active_borrows),
            rooms: toSafeNumber(inventory.rooms),
            categories: toSafeNumber(inventory.categories),
            locations: toSafeNumber(inventory.locations)
        },
        server: {
            memory_percent: toSafeNumber(server.memory_percent),
            uptime_hours: toSafeNumber(server.uptime_hours),
            uploads_mb: toSafeNumber(server.uploads_mb),
            node_version: server.node_version || '',
            email_configured: Boolean(server.email_configured),
            error_log_count: toSafeNumber(server.error_log_count)
        },
        recent_activity: Array.isArray(source.recent_activity) ? source.recent_activity : [],
        recent_users: Array.isArray(source.recent_users) ? source.recent_users : []
    };
}

interface AdminUser {
    id: string;
    username: string;
    role: string;
    created_at: string;
    last_login: string | null;
    is_banned: boolean;
    failed_login_count: number;
    house_count: number;
    owned_item_count: number;
    pending_house_requests: number;
}

function normalizeAdminUsers(rawUsers: any[]): AdminUser[] {
    return Array.isArray(rawUsers)
        ? rawUsers.map((user) => ({
            id: String(user?.id || ''),
            username: String(user?.username || ''),
            role: String(user?.role || ''),
            created_at: String(user?.created_at || ''),
            last_login: user?.last_login ? String(user.last_login) : null,
            is_banned: Boolean(user?.is_banned),
            failed_login_count: toSafeNumber(user?.failed_login_count),
            house_count: toSafeNumber(user?.house_count),
            owned_item_count: toSafeNumber(user?.owned_item_count),
            pending_house_requests: toSafeNumber(user?.pending_house_requests)
        }))
        : [];
}

interface AdminLogEntry {
    id: string;
    created_at?: string;
    timestamp?: string;
    type?: string;
    file?: string;
    action?: string;
    details?: string;
    error?: string;
}

interface ErrorLogEntry {
    timestamp: string;
    error: string;
    file: string;
}

interface AdminLogs {
    adminLogs: AdminLogEntry[];
    errorLogs: ErrorLogEntry[];
}

function normalizeAdminLogs(raw: any): AdminLogs {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        adminLogs: Array.isArray(source.adminLogs) ? source.adminLogs : [],
        errorLogs: Array.isArray(source.errorLogs) ? source.errorLogs : []
    };
}

interface EmailStatus {
    configured: boolean;
    from: string;
    rateLimit: string;
    provider: string;
}

function normalizeEmailStatus(raw: any): EmailStatus {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        configured: Boolean(source.configured),
        from: source.from || '',
        rateLimit: source.rateLimit || '',
        provider: source.provider || ''
    };
}

function formatAdminDate(
    value: any,
    locale: string,
    options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }
): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return formatDateForLanguage(date, locale, options, { fallback: 'datetime' });
}

function maskAdminEmail(value: any): string {
    const email = String(value || '').trim();
    const [local, domain] = email.split('@');

    if (!local || !domain) {
        return email;
    }

    const domainParts = domain.split('.');
    const tld = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';

    return `${local.charAt(0)}•••@•••${tld}`;
}

function sanitizeAdminLogDetailText(details: any): string {
    return String(details || '').replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        (email) => maskAdminEmail(email)
    );
}

function parseAdminLogDetails(details: any): any {
    if (!details) {
        return null;
    }

    if (typeof details === 'object') {
        return details;
    }

    const text = String(details).trim();
    if (!text || (!text.startsWith('{') && !text.startsWith('['))) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function formatAdminLogDetails(item: any, t: any): string {
    const details = String(item?.details || '');
    if (!details) {
        return '';
    }

    const structuredDetails = parseAdminLogDetails(item?.details);
    if (structuredDetails && typeof structuredDetails === 'object') {
        if (structuredDetails.kind === 'user_deleted') {
            return t('admin.logs.audit.user_deleted', {
                username: structuredDetails.username || '',
                deletedHouses: structuredDetails.deletedHouses ?? 0,
                transferredOwnerships: structuredDetails.transferredOwnerships ?? 0,
                defaultValue: 'User deleted: {{username}} | Deleted households: {{deletedHouses}} | Transferred ownerships: {{transferredOwnerships}}'
            });
        }

        if (structuredDetails.kind === 'user_target') {
            return t('admin.logs.audit.user_target', {
                username: structuredDetails.username || '',
                defaultValue: 'User: {{username}}'
            });
        }

        if (structuredDetails.kind === 'email_sent') {
            return t('admin.logs.audit.email_sent', {
                recipient: maskAdminEmail(structuredDetails.recipient || ''),
                subject: structuredDetails.subject || '',
                defaultValue: 'Recipient: {{recipient}} | Subject: {{subject}}'
            });
        }

        if (structuredDetails.kind === 'indexnow_submit') {
            return t('admin.logs.audit.indexnow_submitted', {
                count: structuredDetails.count ?? 0,
                defaultValue: 'IndexNow submission successful. URL count: {{count}}'
            });
        }
    }

    const deletedUserMatch = details.match(/^(?:Kullanıcı silindi|User deleted):\s*(.+?)\s*\|\s*(?:Silinen evler|Deleted households):\s*(\d+)\s*\|\s*(?:Devredilen sahiplikler|Transferred ownerships):\s*(\d+)$/i);
    if (deletedUserMatch) {
        const [, username, deletedHouses, transferredOwnerships] = deletedUserMatch;
        return t('admin.logs.audit.user_deleted', {
            username,
            deletedHouses,
            transferredOwnerships,
            defaultValue: 'User deleted: {{username}} | Deleted households: {{deletedHouses}} | Transferred ownerships: {{transferredOwnerships}}'
        });
    }

    const userTargetMatch = details.match(/^(?:Kullanıcı|User):\s*(.+)$/i);
    if (userTargetMatch) {
        return t('admin.logs.audit.user_target', {
            username: userTargetMatch[1],
            defaultValue: 'User: {{username}}'
        });
    }

    const emailSentMatch = details.match(/^(?:Alıcı|Recipient):\s*(.+?)\s*,\s*(?:Konu|Subject):\s*(.+)$/i);
    if (emailSentMatch) {
        const [, recipient, subject] = emailSentMatch;
        return t('admin.logs.audit.email_sent', {
            recipient: maskAdminEmail(recipient),
            subject,
            defaultValue: 'Recipient: {{recipient}} | Subject: {{subject}}'
        });
    }

    const indexNowMatch = details.match(/^IndexNow submission successful\.\s*URL count:\s*(\d+)$/i);
    if (indexNowMatch) {
        return t('admin.logs.audit.indexnow_submitted', {
            count: indexNowMatch[1],
            defaultValue: 'IndexNow submission successful. URL count: {{count}}'
        });
    }

    return sanitizeAdminLogDetailText(details);
}

function formatAdminLogType(item: any, t: any): string {
    const rawType = String(item?.type || item?.file || '').trim().toLowerCase();
    if (!rawType) {
        return t('admin.logs.type.event', { defaultValue: 'Event' });
    }

    return t(`admin.logs.type.${rawType}`, {
        defaultValue: rawType.replaceAll('_', ' ')
    });
}

function formatAdminLogAction(item: any, t: any): string {
    const rawAction = String(item?.action || '').trim().toLowerCase();
    if (!rawAction) {
        return '';
    }

    return t(`admin.logs.action.${rawAction}`, {
        defaultValue: rawAction.replaceAll('_', ' ')
    });
}

function getInitials(value: any): string {
    return String(value || '?').trim().charAt(0).toUpperCase() || '?';
}

interface AdminTabButtonProps {
    active: boolean;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}

function AdminTabButton({ active, icon: Icon, label, onClick }: AdminTabButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`admin-v25-tab inline-flex min-h-[52px] items-center gap-2 rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${
                active
                    ? 'is-active bg-[var(--hi-accent)] text-white shadow-[0_16px_32px_rgba(45,82,65,0.18)]'
                    : 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]'
            }`}
        >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
        </button>
    );
}

interface OverviewMetricCardProps {
    icon: LucideIcon;
    label: string;
    value: string;
    description?: string;
    tone?: 'accent' | 'secondary' | 'warning';
    chips?: string[];
}

function OverviewMetricCard({ icon: Icon, label, value, description, tone = 'accent', chips = [] }: OverviewMetricCardProps) {
    const toneMap = {
        accent: {
            icon: 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
        },
        secondary: {
            icon: 'bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]'
        },
        warning: {
            icon: 'bg-[var(--hi-warning-soft)] text-[var(--hi-warning)]'
        }
    };

    const style = toneMap[tone] || toneMap.accent;

    return (
        <div className={`admin-v25-metric admin-v25-metric-${tone} relative overflow-hidden rounded-[1.65rem] border border-[var(--hi-border)] bg-[linear-gradient(180deg,var(--hi-panel-strong),var(--hi-panel))] p-5 shadow-[var(--hi-shadow-soft)]`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--hi-text-soft)]">{label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--hi-text)]">{value}</p>
                    {description && <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>}
                </div>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] ${style.icon}`}>
                    <Icon className="h-5 w-5" />
                </span>
            </div>
            {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {chips.map((chip) => (
                        <span key={chip} className="app-meta-pill">
                            {chip}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SummaryListItem {
    label: string;
    description?: string;
    value: string | number;
    toneClass?: string;
}

interface SummaryListProps {
    items: SummaryListItem[];
}

function SummaryList({ items }: SummaryListProps) {
    return (
        <div className="admin-v25-list grid auto-rows-fr gap-3">
            {items.map((item) => (
                <div
                    key={item.label}
                    className="admin-v25-row flex h-full items-start justify-between gap-4 rounded-[1.1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3"
                >
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--hi-text)]">{item.label}</p>
                        {item.description && <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">{item.description}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${item.toneClass || 'bg-[var(--hi-panel-strong)] text-[var(--hi-text)]'}`}>
                        {item.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

interface ActivityFeedProps {
    items: any[];
    locale: string;
    t: any;
    emptyTitle: string;
    emptyDescription: string;
}

function ActivityFeed({ items, locale, t, emptyTitle, emptyDescription }: ActivityFeedProps) {
    if (!items.length) {
        return (
            <EmptyState
                icon={Activity}
                title={emptyTitle}
                description={emptyDescription}
                align="left"
                className="!rounded-[1.5rem] !border !border-dashed !border-[var(--hi-border-strong)] !bg-transparent !p-5"
            />
        );
    }

    return (
        <div className="admin-v25-feed space-y-3">
            {items.map((item) => (
                (() => {
                    const formattedDetails = formatAdminLogDetails(item, t);

                    return (
                        <div
                            key={`${item.id}-${item.created_at || item.timestamp || item.error}`}
                            className="admin-v25-feed-item rounded-[1.15rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--hi-text-muted)]">
                                        {formatAdminLogType(item, t)}
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-[var(--hi-text)]">
                                        {item.action ? formatAdminLogAction(item, t) : item.error}
                                    </p>
                                </div>
                                <span className="app-meta-pill">
                                    {formatAdminDate(item.created_at || item.timestamp, locale)}
                                </span>
                            </div>
                            {formattedDetails && <p className="mt-3 text-sm leading-6 text-[var(--hi-text-soft)]">{formattedDetails}</p>}
                            {item.error && !item.action && <p className="mt-3 text-sm leading-6 text-[var(--hi-text-soft)]">{item.error}</p>}
                        </div>
                    );
                })()
            ))}
        </div>
    );
}

interface UserActionButtonProps {
    icon: LucideIcon;
    label: string;
    tone?: 'default' | 'warning' | 'danger';
    onClick: () => void;
}

function UserActionButton({ icon: Icon, label, tone = 'default', onClick }: UserActionButtonProps) {
    const toneClass = tone === 'danger'
        ? 'border-red-500/18 bg-red-500/8 text-red-400 hover:bg-red-500/12'
        : tone === 'warning'
            ? 'border-[var(--hi-warning)]/18 bg-[var(--hi-warning-soft)] text-[var(--hi-warning)] hover:bg-[var(--hi-warning-soft)]/80'
            : 'border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]';

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={`inline-flex items-center gap-2 rounded-[0.95rem] border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)] ${toneClass}`}
        >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
        </button>
    );
}

interface UserCardProps {
    user: AdminUser;
    locale: string;
    t: any;
    onBanToggle: () => void;
    onDelete: () => void;
}

function UserCard({
    user,
    locale,
    t,
    onBanToggle,
    onDelete
}: UserCardProps) {
    const joinedAt = formatAdminDate(user.created_at, locale, { month: 'short', day: 'numeric', year: 'numeric' });
    const lastLogin = formatAdminDate(user.last_login, locale);
    const isAdminAccount = user.role === 'admin';

    return (
        <article className="admin-v25-user-card rounded-[1.65rem] border border-[var(--hi-border)] bg-[linear-gradient(180deg,var(--hi-panel-strong),var(--hi-panel))] p-5 shadow-[var(--hi-shadow-soft)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.1rem] bg-[linear-gradient(135deg,var(--hi-accent-soft),var(--hi-secondary-soft))] text-xl font-semibold text-[var(--hi-text)]">
                            {getInitials(user.username)}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--hi-text)]">{user.username}</h3>
                                <span className={`app-meta-pill ${isAdminAccount ? 'app-meta-pill-warning' : ''}`}>
                                    {isAdminAccount
                                        ? t('admin.users.role_admin', { defaultValue: 'Admin' })
                                        : t('admin.users.role_user', { defaultValue: 'User' })}
                                </span>
                                {user.is_banned && <span className="app-meta-pill app-meta-pill-warning">{t('admin.users.banned')}</span>}
                                {!user.is_banned && !isAdminAccount && <span className="app-meta-pill app-meta-pill-accent">{t('admin.users.active')}</span>}
                            </div>
                            <p className="mt-1 text-sm text-[var(--hi-text-soft)]">
                                {t('admin.users.private_contact_hidden', { defaultValue: 'Private contact details stay hidden from the admin overview.' })}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="admin-v25-inline-stat rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">
                                {t('admin.users.joined_label', { defaultValue: 'Joined' })}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--hi-text)]">{joinedAt || t('admin.users.no_date', { defaultValue: 'Unknown' })}</p>
                        </div>
                        <div className="admin-v25-inline-stat rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">
                                {t('admin.users.last_seen_label', { defaultValue: 'Last sign-in' })}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--hi-text)]">{lastLogin || t('admin.users.no_last_login', { defaultValue: 'No sign-in yet' })}</p>
                        </div>
                        <div className="admin-v25-inline-stat rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">
                                {t('admin.users.households_label', { defaultValue: 'Households' })}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--hi-text)]">{formatNumberForLanguage(user.house_count || 0, locale)}</p>
                        </div>
                        <div className="admin-v25-inline-stat rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">
                                {t('admin.users.items_label', { defaultValue: 'Owned items' })}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--hi-text)]">{formatNumberForLanguage(user.owned_item_count || 0, locale)}</p>
                        </div>
                    </div>

                    {(user.failed_login_count > 0 || user.pending_house_requests > 0) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {user.failed_login_count > 0 && (
                                <span className="app-meta-pill app-meta-pill-warning">
                                    {t('admin.users.failed_logins', {
                                        count: formatNumberForLanguage(user.failed_login_count, locale),
                                        defaultValue: '{{count}} failed sign-ins'
                                    })}
                                </span>
                            )}
                            {user.pending_house_requests > 0 && (
                                <span className="app-meta-pill">
                                    {t('admin.users.pending_requests', {
                                        count: formatNumberForLanguage(user.pending_house_requests, locale),
                                        defaultValue: '{{count}} pending house requests'
                                    })}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                    {isAdminAccount ? (
                        <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm font-medium text-[var(--hi-text-soft)]">
                            {t('admin.users.protected_admin', { defaultValue: 'Protected admin account' })}
                        </div>
                    ) : (
                        <>
                            <UserActionButton
                                icon={user.is_banned ? CheckCircle2 : Ban}
                                label={user.is_banned ? t('admin.users.unban') : t('admin.users.ban')}
                                tone="warning"
                                onClick={onBanToggle}
                            />
                            <UserActionButton
                                icon={Trash2}
                                label={t('admin.users.delete', { defaultValue: 'Delete Account' })}
                                tone="danger"
                                onClick={onDelete}
                            />
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}

interface PendingUserAction {
    type: 'ban' | 'delete';
    userId: string;
    username: string;
    isBanned: boolean;
}

interface ToastState {
    title: string;
    description: string;
    tone?: 'success' | 'danger' | 'info';
}

export default function AdminPanel() {
    const { t: tRaw, i18n } = useTranslation();
    const t = tRaw as any;
    const { isAdmin } = useAuth();
    const locale = i18n.language || 'en';

    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'email'>('dashboard');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [logs, setLogs] = useState<AdminLogs>({ adminLogs: [], errorLogs: [] });
    const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [loadingSection, setLoadingSection] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewError, setOverviewError] = useState<string | null>(null);
    const [sectionError, setSectionError] = useState<string | null>(null);
    const [pendingUserAction, setPendingUserAction] = useState<PendingUserAction | null>(null);
    const [actionSubmitting, setActionSubmitting] = useState(false);
    const [toast, setToast] = useState<ToastState | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [userFilter, setUserFilter] = useState<UserFilterType>('all');
    const [emailForm, setEmailForm] = useState({ to: '', subject: '', message: '' });
    const [sending, setSending] = useState(false);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const fetchOverview = async () => {
        const response = await axios.get('/api/admin/stats');
        setStats(normalizeAdminStats(response.data.stats));
        setOverviewError(null);
    };

    const fetchUsers = async () => {
        const response = await axios.get('/api/admin/users');
        setUsers(normalizeAdminUsers(response.data.users));
        setSectionError(null);
    };

    const fetchLogs = async () => {
        const response = await axios.get('/api/admin/logs');
        setLogs(normalizeAdminLogs(response.data));
        setSectionError(null);
    };

    const fetchEmailStatus = async () => {
        const response = await axios.get('/api/admin/email/status');
        setEmailStatus(normalizeEmailStatus(response.data));
        setSectionError(null);
    };

    const loadActiveSection = async (tabId: string, { forceRefresh = false } = {}) => {
        if (!forceRefresh) {
            setLoadingSection(tabId);
        }

        try {
            if (tabId === 'users') {
                await fetchUsers();
            } else if (tabId === 'logs') {
                await fetchLogs();
            } else if (tabId === 'email') {
                await fetchEmailStatus();
            }
        } catch (error: any) {
            const message = error.response?.data?.error || t('common.error', { defaultValue: 'Something went wrong' });
            setSectionError(message);
        } finally {
            if (!forceRefresh) {
                setLoadingSection(null);
            }
        }
    };

    useEffect(() => {
        const bootstrap = async () => {
            setLoadingOverview(true);
            try {
                await fetchOverview();
            } catch (error: any) {
                const message = error.response?.data?.error || t('common.error', { defaultValue: 'Something went wrong' });
                setOverviewError(message);
            } finally {
                setLoadingOverview(false);
            }
        };

        bootstrap();
    }, [t]);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            return;
        }

        loadActiveSection(activeTab);
    }, [activeTab]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchOverview();
            if (activeTab !== 'dashboard') {
                await loadActiveSection(activeTab, { forceRefresh: true });
            }
            setToast({
                title: t('admin.refresh_complete_title', { defaultValue: 'Admin data refreshed' }),
                description: t('admin.refresh_complete_body', { defaultValue: 'The latest admin data is now on screen.' }),
                tone: 'info'
            });
        } catch (error: any) {
            setToast({
                title: t('common.error', { defaultValue: 'Something went wrong' }),
                description: error.response?.data?.error || t('common.error', { defaultValue: 'Something went wrong' }),
                tone: 'danger'
            });
        } finally {
            setRefreshing(false);
        }
    };

    const handleConfirmUserAction = async () => {
        if (!pendingUserAction) {
            return;
        }

        setActionSubmitting(true);

        try {
            if (pendingUserAction.type === 'ban') {
                await axios.post(`/api/admin/users/${pendingUserAction.userId}/ban`, { ban: !pendingUserAction.isBanned });
                setToast({
                    title: pendingUserAction.isBanned
                        ? t('admin.users.unban_success_title', { defaultValue: 'Access restored' })
                        : t('admin.users.ban_success_title', { defaultValue: 'User banned' }),
                    description: pendingUserAction.isBanned
                        ? t('admin.users.unban_success_body', { username: pendingUserAction.username, defaultValue: '{{username}} can sign in again.' })
                        : t('admin.users.ban_success_body', { username: pendingUserAction.username, defaultValue: '{{username}} has been blocked from signing in.' })
                });
            } else if (pendingUserAction.type === 'delete') {
                await axios.delete(`/api/admin/users/${pendingUserAction.userId}`);
                setToast({
                    title: t('admin.users.delete_success_title', { defaultValue: 'Account deleted' }),
                    description: t('admin.users.delete_success_body', { username: pendingUserAction.username, defaultValue: '{{username}} and the related owned data were permanently removed.' })
                });
            }

            setPendingUserAction(null);
            await Promise.all([fetchOverview(), fetchUsers()]);
        } catch (error: any) {
            setToast({
                title: t('common.error', { defaultValue: 'Something went wrong' }),
                description: error.response?.data?.error || t('common.error', { defaultValue: 'Something went wrong' }),
                tone: 'danger'
            });
        } finally {
            setActionSubmitting(false);
        }
    };

    const handleSendEmail = async (event: React.FormEvent) => {
        event.preventDefault();
        setSending(true);

        try {
            await axios.post('/api/admin/email/send', emailForm);
            setToast({
                title: t('admin.email.success_title', { defaultValue: 'Email sent' }),
                description: t('admin.email.success', { defaultValue: 'Email sent successfully!' })
            });
            setEmailForm({ to: '', subject: '', message: '' });
        } catch (error: any) {
            setToast({
                title: t('admin.email.error_title', { defaultValue: 'Email failed' }),
                description: error.response?.data?.error || t('admin.email.error', { defaultValue: 'Sending failed' }),
                tone: 'danger'
            });
        } finally {
            setSending(false);
        }
    };

    const filteredUsers = useMemo(() => {
        return users.filter((user) => {
            const haystack = `${user.username}`.toLowerCase();
            const query = userSearch.trim().toLowerCase();
            const matchesSearch = !query || haystack.includes(query);
            const matchesFilter = userFilter === 'all'
                || (userFilter === 'admin' && user.role === 'admin')
                || (userFilter === 'banned' && user.is_banned)
                || (userFilter === 'active' && !user.is_banned && user.role !== 'admin');

            return matchesSearch && matchesFilter;
        });
    }, [userFilter, userSearch, users]);

    const pageMeta = useMemo(() => {
        if (!stats) {
            return [];
        }

        return [
            {
                label: t('admin.meta.users_total', {
                    count: formatNumberForLanguage(stats.users.total, locale),
                    defaultValue: '{{count}} accounts'
                }),
                tone: 'accent' as const
            },
            {
                label: t('admin.meta.households_total', {
                    count: formatNumberForLanguage(stats.households.total, locale),
                    defaultValue: '{{count}} households'
                }),
                tone: 'secondary' as const
            },
            stats.households.pending_requests > 0
                ? {
                    label: t('admin.meta.pending_requests', {
                        count: formatNumberForLanguage(stats.households.pending_requests, locale),
                        defaultValue: '{{count}} pending approvals'
                    }),
                    tone: 'warning' as const
                }
                : {
                    label: t('admin.meta.pending_requests_clear', { defaultValue: 'No pending approvals' }),
                    tone: 'secondary' as const
                }
        ];
    }, [locale, stats, t]);

    const shouldShowOverviewLoader = loadingOverview && !stats;
    const shouldShowUsersLoader = activeTab === 'users' && loadingSection === 'users' && users.length === 0;
    const shouldShowLogsLoader = activeTab === 'logs' && loadingSection === 'logs' && !logs.adminLogs.length && !logs.errorLogs.length;
    const shouldShowEmailLoader = activeTab === 'email' && loadingSection === 'email' && !emailStatus;
    const effectiveEmailRateLimit = emailStatus?.rateLimit || t('admin.email.rate_limit_fallback', { defaultValue: '3 emails per minute' });
    const emailUsageNote = emailStatus?.configured
        ? t('admin.email.notes_body_with_rate_limit', {
            rateLimit: effectiveEmailRateLimit,
            defaultValue: 'Use this for operational support or account-related outreach. Sensitive content should stay inside the app whenever possible. Current sending safeguard: {{rateLimit}}.'
        })
        : t('admin.email.notes_body', {
            defaultValue: 'Use this for operational support or account-related outreach. Sensitive content should stay inside the app whenever possible.'
        });

    return (
        <div className="admin-v25 space-y-6 pb-20">
            <PageHeader
                className="admin-v25-hero"
                title={t('admin.title', { defaultValue: 'Admin Control' })}
                description={t('admin.subtitle', { defaultValue: 'Review platform health, user access, audit activity, and communication from one calm control surface.' })}
                meta={pageMeta}
                actions={(
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="admin-v25-refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                    </button>
                )}
            >
                <div className="admin-v25-tabs flex flex-wrap gap-2">
                    {TAB_ITEMS.map((tab) => (
                        <AdminTabButton
                            key={tab.id}
                            active={activeTab === tab.id}
                            icon={tab.icon}
                            label={t(`admin.tabs.${tab.id}`, {
                                defaultValue: tab.id === 'dashboard'
                                    ? 'Overview'
                                    : tab.id === 'users'
                                        ? 'Users'
                                        : tab.id === 'logs'
                                            ? 'Activity'
                                            : 'Email'
                            })}
                            onClick={() => setActiveTab(tab.id)}
                        />
                    ))}
                </div>
            </PageHeader>

            {activeTab === 'dashboard' && (
                shouldShowOverviewLoader ? (
                    <div className="flex justify-center py-20">
                        <div className="spinner" />
                    </div>
                ) : stats ? (
                    <div className="space-y-6">
                        {(!stats.server.email_configured || stats.users.locked > 0 || stats.households.pending_requests > 0) && (
                            <div className="grid gap-3 xl:grid-cols-3">
                                {!stats.server.email_configured && (
                                    <NoticeBanner
                                        icon={MailCheck}
                                        tone="warning"
                                        title={t('admin.overview.email_warning_title', { defaultValue: 'Email delivery is not configured' })}
                                        description={t('admin.overview.email_warning_body', { defaultValue: 'Admins can still review the platform, but outbound mail actions are currently unavailable until Resend is configured.' })}
                                    />
                                )}
                                {stats.users.locked > 0 && (
                                    <NoticeBanner
                                        icon={ShieldAlert}
                                        tone="warning"
                                        title={t('admin.overview.locked_users_title', { defaultValue: 'Locked accounts need review' })}
                                        description={t('admin.overview.locked_users_body', {
                                            count: formatNumberForLanguage(stats.users.locked, locale),
                                            defaultValue: '{{count}} account(s) are currently login-locked.'
                                        })}
                                    />
                                )}
                                {stats.households.pending_requests > 0 && (
                                    <NoticeBanner
                                        icon={HousePlus}
                                        tone="info"
                                        title={t('admin.overview.pending_requests_title', { defaultValue: 'There are pending household approvals' })}
                                        description={t('admin.overview.pending_requests_body', {
                                            count: formatNumberForLanguage(stats.households.pending_requests, locale),
                                            defaultValue: '{{count}} join request(s) are still waiting for an owner decision.'
                                        })}
                                    />
                                )}
                            </div>
                        )}

                        <div className="admin-v25-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <OverviewMetricCard
                                icon={Users}
                                label={t('admin.overview.cards.accounts', { defaultValue: 'Accounts' })}
                                value={formatNumberForLanguage(stats.users.total, locale)}
                                description={t('admin.overview.cards.accounts_body', {
                                    count: formatNumberForLanguage(stats.users.new_week, locale),
                                    defaultValue: '{{count}} new signups in the last 7 days'
                                })}
                                tone="accent"
                                chips={[
                                    t('admin.overview.cards.admins_chip', {
                                        count: formatNumberForLanguage(stats.users.admins, locale),
                                        defaultValue: '{{count}} admins'
                                    }),
                                    t('admin.overview.cards.banned_chip', {
                                        count: formatNumberForLanguage(stats.users.banned, locale),
                                        defaultValue: '{{count}} banned'
                                    })
                                ]}
                            />
                            <OverviewMetricCard
                                icon={House}
                                label={t('admin.overview.cards.households', { defaultValue: 'Households' })}
                                value={formatNumberForLanguage(stats.households.total, locale)}
                                description={t('admin.overview.cards.households_body', {
                                    count: formatNumberForLanguage(stats.households.memberships, locale),
                                    defaultValue: '{{count}} active memberships across the platform'
                                })}
                                tone="secondary"
                                chips={[
                                    t('admin.overview.cards.pending_chip', {
                                        count: formatNumberForLanguage(stats.households.pending_requests, locale),
                                        defaultValue: '{{count}} pending requests'
                                    })
                                ]}
                            />
                            <OverviewMetricCard
                                icon={Package}
                                label={t('admin.overview.cards.inventory', { defaultValue: 'Inventory records' })}
                                value={formatNumberForLanguage(stats.inventory.items, locale)}
                                description={t('admin.overview.cards.inventory_body', {
                                    count: formatNumberForLanguage(stats.inventory.active_borrows, locale),
                                    defaultValue: '{{count}} active borrows currently open'
                                })}
                                tone="accent"
                                chips={[
                                    t('admin.overview.cards.public_items_chip', {
                                        count: formatNumberForLanguage(stats.inventory.public_items, locale),
                                        defaultValue: '{{count}} shared'
                                    }),
                                    t('admin.overview.cards.private_items_chip', {
                                        count: formatNumberForLanguage(stats.inventory.private_items, locale),
                                        defaultValue: '{{count}} private'
                                    })
                                ]}
                            />
                            <OverviewMetricCard
                                icon={Server}
                                label={t('admin.overview.cards.system', { defaultValue: 'System health' })}
                                value={`${formatNumberForLanguage(stats.server.memory_percent, locale)}%`}
                                description={t('admin.overview.cards.system_body', {
                                    count: formatNumberForLanguage(stats.server.uptime_hours, locale),
                                    defaultValue: '{{count}} hours uptime'
                                })}
                                tone={stats.server.email_configured ? 'accent' : 'warning'}
                                chips={[
                                    t('admin.overview.cards.storage_chip', {
                                        count: formatNumberForLanguage(stats.server.uploads_mb, locale, {
                                            maximumFractionDigits: 2
                                        }),
                                        defaultValue: '{{count}} MB uploads'
                                    }),
                                    stats.server.node_version || 'Node'
                                ]}
                            />
                        </div>

                        <div className="admin-v25-section-grid grid items-stretch gap-6 xl:auto-rows-fr xl:grid-cols-2">
                            <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                                <SectionHeader
                                    eyebrow={t('admin.overview.sections.governance_eyebrow', { defaultValue: 'Access' })}
                                    title={t('admin.overview.sections.governance_title', { defaultValue: 'Governance snapshot' })}
                                    description={t('admin.overview.sections.governance_body', { defaultValue: 'Focus on moderation pressure, protected admin seats, and household access requests without leaving the page.' })}
                                />
                                <SummaryList
                                    items={[
                                        {
                                            label: t('admin.overview.summary.admin_seats', { defaultValue: 'Protected admin seats' }),
                                            description: t('admin.overview.summary.admin_seats_body', { defaultValue: 'Accounts that can access the admin surface.' }),
                                            value: formatNumberForLanguage(stats.users.admins, locale),
                                            toneClass: 'bg-[var(--hi-warning-soft)] text-[var(--hi-warning)]'
                                        },
                                        {
                                            label: t('admin.overview.summary.banned_accounts', { defaultValue: 'Banned accounts' }),
                                            description: t('admin.overview.summary.banned_accounts_body', { defaultValue: 'Users currently blocked from signing in.' }),
                                            value: formatNumberForLanguage(stats.users.banned, locale)
                                        },
                                        {
                                            label: t('admin.overview.summary.locked_accounts', { defaultValue: 'Temporarily locked' }),
                                            description: t('admin.overview.summary.locked_accounts_body', { defaultValue: 'Accounts locked by repeated failed sign-in attempts.' }),
                                            value: formatNumberForLanguage(stats.users.locked, locale)
                                        },
                                        {
                                            label: t('admin.overview.summary.pending_households', { defaultValue: 'Pending household approvals' }),
                                            description: t('admin.overview.summary.pending_households_body', { defaultValue: 'Join requests waiting for an owner decision.' }),
                                            value: formatNumberForLanguage(stats.households.pending_requests, locale)
                                        }
                                    ]}
                                />
                            </section>

                            <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                                <SectionHeader
                                    eyebrow={t('admin.overview.sections.footprint_eyebrow', { defaultValue: 'Inventory' })}
                                    title={t('admin.overview.sections.footprint_title', { defaultValue: 'Inventory footprint' })}
                                    description={t('admin.overview.sections.footprint_body', { defaultValue: 'A global view of how much structure and content currently exists across the product.' })}
                                />
                                <SummaryList
                                    items={[
                                        {
                                            label: t('admin.overview.summary.rooms_global', { defaultValue: 'Configured room records' }),
                                            description: t('admin.overview.summary.rooms_global_body', { defaultValue: 'All room definitions stored across every household.' }),
                                            value: formatNumberForLanguage(stats.inventory.rooms, locale)
                                        },
                                        {
                                            label: t('admin.overview.summary.categories_global', { defaultValue: 'Configured category records' }),
                                            description: t('admin.overview.summary.categories_global_body', { defaultValue: 'All category definitions stored across every household.' }),
                                            value: formatNumberForLanguage(stats.inventory.categories, locale)
                                        },
                                        {
                                            label: t('admin.overview.summary.locations_global', { defaultValue: 'Saved locations' }),
                                            description: t('admin.overview.summary.locations_global_body', { defaultValue: 'Named location records created inside rooms.' }),
                                            value: formatNumberForLanguage(stats.inventory.locations, locale)
                                        },
                                        {
                                            label: t('admin.overview.summary.active_borrows', { defaultValue: 'Active borrows' }),
                                            description: t('admin.overview.summary.active_borrows_body', { defaultValue: 'Borrow records that are still open.' }),
                                            value: formatNumberForLanguage(stats.inventory.active_borrows, locale)
                                        }
                                    ]}
                                />
                            </section>
                        </div>

                        <div className="admin-v25-section-grid grid items-stretch gap-6 xl:auto-rows-fr xl:grid-cols-[1.15fr_0.85fr]">
                            <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                                <SectionHeader
                                    eyebrow={t('admin.overview.sections.activity_eyebrow', { defaultValue: 'Audit' })}
                                    title={t('admin.overview.sections.activity_title', { defaultValue: 'Recent admin activity' })}
                                    description={t('admin.overview.sections.activity_body', { defaultValue: 'The latest moderation and operational actions recorded by the platform.' })}
                                />
                                <ActivityFeed
                                    items={stats.recent_activity || []}
                                    locale={locale}
                                    t={t}
                                    emptyTitle={t('admin.logs.no_logs_title', { defaultValue: 'No admin actions yet' })}
                                    emptyDescription={t('admin.logs.no_logs', { defaultValue: 'There are no recorded admin actions yet.' })}
                                />
                            </section>

                            <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                                <SectionHeader
                                    eyebrow={t('admin.overview.sections.recent_users_eyebrow', { defaultValue: 'New accounts' })}
                                    title={t('admin.overview.sections.recent_users_title', { defaultValue: 'Latest signups' })}
                                    description={t('admin.overview.sections.recent_users_body', { defaultValue: 'A quick sense of who joined recently and whether they have signed in yet.' })}
                                />
                                {(stats.recent_users || []).length > 0 ? (
                                    <div className="space-y-3">
                                        {stats.recent_users.map((user) => (
                                            <div
                                                key={user.id}
                                                className="admin-v25-row flex items-center gap-3 rounded-[1.15rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3"
                                            >
                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-[linear-gradient(135deg,var(--hi-accent-soft),var(--hi-secondary-soft))] text-sm font-semibold text-[var(--hi-text)]">
                                                    {getInitials(user.username)}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-[var(--hi-text)]">{user.username}</p>
                                                    <p className="text-sm text-[var(--hi-text-soft)]">
                                                        {t('admin.overview.sections.recent_users_private_note', { defaultValue: 'Private contact details stay hidden.' })}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hi-text-muted)]">
                                                        {user.last_login
                                                            ? t('admin.users.last_seen_short', { defaultValue: 'Seen' })
                                                            : t('admin.users.last_seen_short_never', { defaultValue: 'New' })}
                                                    </p>
                                                    <p className="mt-1 text-sm text-[var(--hi-text)]">
                                                        {formatAdminDate(user.last_login || user.created_at, locale) || t('admin.users.no_last_login', { defaultValue: 'No sign-in yet' })}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon={UserRound}
                                        title={t('admin.overview.sections.recent_users_empty_title', { defaultValue: 'No users yet' })}
                                        description={t('admin.overview.sections.recent_users_empty_body', { defaultValue: 'As people sign up, the newest accounts will appear here.' })}
                                        align="left"
                                        className="!rounded-[1.5rem] !border !border-dashed !border-[var(--hi-border-strong)] !bg-transparent !p-5"
                                    />
                                )}
                            </section>
                        </div>
                    </div>
                ) : (
                    <EmptyState
                        icon={Shield}
                        title={t('admin.load_failed_title', { defaultValue: 'Admin overview could not load' })}
                        description={overviewError || t('admin.load_failed_body', { defaultValue: 'The admin route is open, but the overview data did not arrive. You can retry without leaving the page.' })}
                        actions={(
                            <button type="button" onClick={handleRefresh} className="btn-primary">
                                <RefreshCw className="h-4 w-4" />
                                <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                            </button>
                        )}
                        align="left"
                    />
                )
            )}

            {activeTab === 'users' && (
                shouldShowUsersLoader ? (
                    <div className="flex justify-center py-20">
                        <div className="spinner" />
                    </div>
                ) : sectionError && users.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title={t('admin.users.load_failed_title', { defaultValue: 'Users could not load' })}
                        description={sectionError || ''}
                        actions={(
                            <button type="button" onClick={() => loadActiveSection('users')} className="btn-primary">
                                <RefreshCw className="h-4 w-4" />
                                <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                            </button>
                        )}
                        align="left"
                    />
                ) : (
                    <div className="space-y-6">
                        <section className="card !mt-0 !p-5">
                            <SectionHeader
                                eyebrow={t('admin.users.section_eyebrow', { defaultValue: 'Moderation' })}
                                title={t('admin.users.section_title', { defaultValue: 'User access control' })}
                                description={t('admin.users.section_body', { defaultValue: 'Search accounts, review their current state, and take action without losing context.' })}
                            />

                            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">
                                        {t('admin.users.search_label', { defaultValue: 'Search users' })}
                                    </span>
                                    <span className="relative block">
                                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hi-text-muted)]" />
                                        <input
                                            type="search"
                                            value={userSearch}
                                            onChange={(event) => setUserSearch(event.target.value)}
                                            placeholder={t('admin.users.search_placeholder', { defaultValue: 'Search by username' })}
                                            className="input-field !pl-11"
                                        />
                                    </span>
                                </label>

                                <div className="flex flex-wrap gap-2">
                                    {USER_FILTERS.map((filterId) => (
                                        <button
                                            key={filterId}
                                            type="button"
                                            onClick={() => setUserFilter(filterId)}
                                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                                userFilter === filterId
                                                    ? 'border-[var(--hi-accent)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                                                    : 'border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:text-[var(--hi-text)]'
                                            }`}
                                        >
                                            {t(`admin.users.filters.${filterId}`, {
                                                defaultValue: filterId === 'all'
                                                    ? 'All'
                                                    : filterId === 'active'
                                                        ? 'Active'
                                                        : filterId === 'banned'
                                                            ? 'Banned'
                                                            : 'Admins'
                                            })}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="app-meta-pill app-meta-pill-accent">
                                    {t('admin.users.filtered_total', {
                                        count: formatNumberForLanguage(filteredUsers.length, locale),
                                        defaultValue: '{{count}} visible accounts'
                                    })}
                                </span>
                                <span className="app-meta-pill">
                                    {t('admin.users.total_platform', {
                                        count: formatNumberForLanguage(users.length, locale),
                                        defaultValue: '{{count}} total accounts'
                                    })}
                                </span>
                            </div>
                        </section>

                        {filteredUsers.length > 0 ? (
                            <div className="grid gap-4">
                                {filteredUsers.map((user) => (
                                    <UserCard
                                        key={user.id}
                                        user={user}
                                        locale={locale}
                                        t={t}
                                        onBanToggle={() => setPendingUserAction({
                                            type: 'ban',
                                            userId: user.id,
                                            username: user.username,
                                            isBanned: user.is_banned
                                        })}
                                        onDelete={() => setPendingUserAction({
                                            type: 'delete',
                                            userId: user.id,
                                            username: user.username,
                                            isBanned: user.is_banned
                                        })}
                                    />
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={Users}
                                title={t('admin.users.empty_title', { defaultValue: 'No matching accounts' })}
                                description={t('admin.users.empty_body', { defaultValue: 'Try a different search or filter to bring users back into view.' })}
                                align="left"
                            />
                        )}
                    </div>
                )
            )}

            {activeTab === 'logs' && (
                shouldShowLogsLoader ? (
                    <div className="flex justify-center py-20">
                        <div className="spinner" />
                    </div>
                ) : sectionError && !logs.adminLogs.length && !logs.errorLogs.length ? (
                    <EmptyState
                        icon={Activity}
                        title={t('admin.logs.load_failed_title', { defaultValue: 'Activity could not load' })}
                        description={sectionError || ''}
                        actions={(
                            <button type="button" onClick={() => loadActiveSection('logs')} className="btn-primary">
                                <RefreshCw className="h-4 w-4" />
                                <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                            </button>
                        )}
                        align="left"
                    />
                ) : (
                    <div className="grid items-stretch gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                        <section className="admin-v25-surface card !mt-0 !flex !h-full !flex-col !p-5">
                            <SectionHeader
                                eyebrow={t('admin.logs.section_eyebrow', { defaultValue: 'Audit trail' })}
                                title={t('admin.logs.title', { defaultValue: 'Admin activity' })}
                                description={t('admin.logs.section_body', { defaultValue: 'Every moderation or operational change recorded by the admin layer.' })}
                            />
                            <ActivityFeed
                                items={logs.adminLogs}
                                locale={locale}
                                t={t}
                                emptyTitle={t('admin.logs.no_logs_title', { defaultValue: 'No admin actions yet' })}
                                emptyDescription={t('admin.logs.no_logs', { defaultValue: 'There are no recorded admin actions yet.' })}
                            />
                        </section>

                        <section className="admin-v25-surface card !mt-0 !flex !h-full !flex-col !p-5">
                            <SectionHeader
                                eyebrow={t('admin.logs.errors_eyebrow', { defaultValue: 'Diagnostics' })}
                                title={t('admin.logs.errors_title', { defaultValue: 'Recent system errors' })}
                                description={t('admin.logs.errors_body', { defaultValue: 'The latest parsed error lines from the server log files.' })}
                            />
                            {logs.errorLogs.length > 0 ? (
                                <div className="space-y-3">
                                    {logs.errorLogs.map((entry, index) => (
                                        <div
                                            key={`${entry.timestamp}-${index}`}
                                            className="rounded-[1.15rem] border border-red-500/12 bg-red-500/6 p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-[var(--hi-text)]">{entry.error}</p>
                                                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--hi-text-muted)]">{entry.file}</p>
                                                </div>
                                                <span className="app-meta-pill app-meta-pill-warning">
                                                    {formatAdminDate(entry.timestamp, locale)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={CheckCircle2}
                                    title={t('admin.logs.no_errors_title', { defaultValue: 'No recent system errors' })}
                                    description={t('admin.logs.no_errors', { defaultValue: 'System healthy, no recent error logs were found.' })}
                                    align="left"
                                />
                            )}
                        </section>
                    </div>
                )
            )}

            {activeTab === 'email' && (
                shouldShowEmailLoader ? (
                    <div className="flex justify-center py-20">
                        <div className="spinner" />
                    </div>
                ) : sectionError && !emailStatus ? (
                    <EmptyState
                        icon={Mail}
                        title={t('admin.email.load_failed_title', { defaultValue: 'Email tools could not load' })}
                        description={sectionError || ''}
                        actions={(
                            <button type="button" onClick={() => loadActiveSection('email')} className="btn-primary">
                                <RefreshCw className="h-4 w-4" />
                                <span>{t('admin.refresh', { defaultValue: 'Refresh' })}</span>
                            </button>
                        )}
                        align="left"
                    />
                ) : (
                    <div className="grid items-stretch gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                        <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                            <SectionHeader
                                eyebrow={t('admin.email.status_eyebrow', { defaultValue: 'Delivery' })}
                                title={t('admin.email.status_title', { defaultValue: 'Outbound email status' })}
                                description={t('admin.email.status_body', { defaultValue: 'A quick confidence check before sending operational communication.' })}
                            />

                            {emailStatus?.configured ? (
                                <NoticeBanner
                                    icon={MailCheck}
                                    tone="success"
                                    title={t('admin.email.configured_title', { defaultValue: 'Email delivery is configured' })}
                                    description={t('admin.email.configured_body', { defaultValue: 'Resend is available for admin-triggered outbound messages.' })}
                                />
                            ) : (
                                <NoticeBanner
                                    icon={AlertTriangle}
                                    tone="warning"
                                    title={t('admin.email.unconfigured_title', { defaultValue: 'Email delivery is not configured' })}
                                    description={t('admin.email.unconfigured_body', { defaultValue: 'The send form stays visible for setup review, but delivery will fail until the mail provider is configured.' })}
                                />
                            )}

                            <div className="mt-5 space-y-3">
                                <div className="admin-v25-row rounded-[1.1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hi-text-muted)]">
                                        {t('admin.email.from_label', { defaultValue: 'Sender' })}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-[var(--hi-text)]">
                                        {emailStatus?.configured
                                            ? (emailStatus?.from || '—')
                                            : t('admin.email.from_unconfigured', { defaultValue: 'Available after mail setup' })}
                                    </p>
                                </div>
                                <div className="admin-v25-row rounded-[1.1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hi-text-muted)]">
                                        {t('admin.email.notes_label', { defaultValue: 'Usage note' })}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">
                                        {emailUsageNote}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="card !mt-0 !flex !h-full !flex-col !p-5">
                            <SectionHeader
                                eyebrow={t('admin.email.compose_eyebrow', { defaultValue: 'Message' })}
                                title={t('admin.email.title', { defaultValue: 'Send Email' })}
                                description={t('admin.email.compose_body', { defaultValue: 'Compose a single outbound email with safe HTML formatting and platform branding.' })}
                            />

                            <form onSubmit={handleSendEmail} className="mt-5 space-y-4">
                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">{t('admin.email.to', { defaultValue: 'Recipient (To)' })}</span>
                                    <input
                                        type="email"
                                        required
                                        value={emailForm.to}
                                        onChange={(event) => setEmailForm((current) => ({ ...current, to: event.target.value }))}
                                        className="input-field"
                                        placeholder={t('admin.email.placeholder_to', { defaultValue: 'name@example.com' })}
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">{t('admin.email.subject', { defaultValue: 'Subject' })}</span>
                                    <input
                                        type="text"
                                        required
                                        maxLength={200}
                                        value={emailForm.subject}
                                        onChange={(event) => setEmailForm((current) => ({ ...current, subject: event.target.value }))}
                                        className="input-field"
                                        placeholder={t('admin.email.placeholder_subject', { defaultValue: 'Message subject' })}
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">{t('admin.email.message', { defaultValue: 'Message' })}</span>
                                    <textarea
                                        required
                                        rows={8}
                                        value={emailForm.message}
                                        onChange={(event) => setEmailForm((current) => ({ ...current, message: event.target.value }))}
                                        className="input-field resize-none"
                                        placeholder={t('admin.email.placeholder_message', { defaultValue: 'Write your message here...' })}
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={sending}
                                    className="btn-primary w-full"
                                >
                                    {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    <span>{sending ? t('admin.email.sending', { defaultValue: 'Sending...' }) : t('admin.email.send', { defaultValue: 'Send' })}</span>
                                </button>
                            </form>
                        </section>
                    </div>
                )
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingUserAction)}
                title={
                    pendingUserAction?.type === 'delete'
                        ? t('admin.users.delete_title', { defaultValue: 'Delete this account?' })
                        : pendingUserAction?.isBanned
                            ? t('admin.users.unban_title', { defaultValue: 'Restore this user?' })
                            : t('admin.users.ban_title', { defaultValue: 'Ban this user?' })
                }
                description={
                    pendingUserAction?.type === 'delete'
                        ? t('admin.users.delete_description', {
                            username: pendingUserAction?.username,
                            defaultValue: 'Deleting {{username}} permanently removes the account and its owned inventory data.'
                        })
                        : pendingUserAction?.isBanned
                            ? t('admin.users.unban_description', { defaultValue: 'Restoring access allows this user to sign in again.' })
                            : t('admin.users.ban_description', { defaultValue: 'Banning a user immediately blocks access until an admin restores it.' })
                }
                confirmLabel={
                    pendingUserAction?.type === 'delete'
                        ? (actionSubmitting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('admin.users.delete', { defaultValue: 'Delete Account' }))
                        : (actionSubmitting
                            ? t('common.loading', { defaultValue: 'Loading...' })
                            : (pendingUserAction?.isBanned ? t('admin.users.unban', { defaultValue: 'Unban' }) : t('admin.users.ban', { defaultValue: 'Ban' })))
                }
                cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
                confirmButtonClassName={pendingUserAction?.type === 'delete' ? 'btn-danger' : 'btn-primary'}
                tone={pendingUserAction?.type === 'delete' ? 'danger' : 'warning'}
                confirming={actionSubmitting}
                onClose={() => !actionSubmitting && setPendingUserAction(null)}
                onConfirm={handleConfirmUserAction}
            >
                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="font-medium text-[var(--hi-text)]">{pendingUserAction?.username}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {pendingUserAction?.type === 'delete'
                            ? t('admin.users.delete_warning', { defaultValue: 'This action is irreversible and removes rooms, categories, items, and related ownership history tied to this account.' })
                            : pendingUserAction?.isBanned
                                ? t('admin.users.unban_warning', { defaultValue: 'The user regains access on the next successful sign-in.' })
                                : t('admin.users.ban_warning', { defaultValue: 'The user loses access until another admin explicitly restores it.' })}
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
