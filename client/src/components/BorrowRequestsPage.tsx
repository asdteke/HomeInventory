import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
    ArrowRightLeft,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Inbox,
    Package,
    RefreshCcw,
    Send,
    X
} from 'lucide-react';
import {
    BorrowRequestCreateDialog,
    FulfillBorrowRequestDialog,
    ReturnBorrowRecordDialog,
    RejectBorrowRequestDialog
} from './BorrowDialogs';
import { formatBorrowDate, formatBorrowDateTime, isBorrowOverdue } from '../utils/borrowFormatting';
import {
    ACTION_REQUEST_TIMEOUT_MS,
    createRequestConfig,
    getRequestErrorMessage,
    isRequestCanceled
} from '../utils/httpRequests';
import { EmptyState, LoadingState, NoticeBanner } from './ProductUI';

const EMPTY_STATE_BUTTON_CLASS = 'btn-secondary min-w-[170px] justify-center';
const REQUEST_EMPTY_STATE_CLASS = 'h-[17rem] justify-center';
const POSITIVE_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20';
const NEGATIVE_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-xl border border-rose-500/20 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20';
const MUTED_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-[12px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-2 text-sm font-medium text-[var(--hi-text-soft)] transition-colors hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]';

interface StatCardProps {
    icon: React.ComponentType<any>;
    label: string;
    value: string | number;
    accent?: string;
}

function StatCard({ icon: Icon, label, value, accent = 'text-[var(--hi-accent)] bg-[var(--hi-accent-soft)]' }: StatCardProps) {
    return (
        <div className="borrow-stat-v25">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm text-[var(--hi-text-soft)]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--hi-text)]">{value}</p>
                </div>
                <div className={`borrow-stat-icon-v25 ${accent}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
}

interface BorrowPanelProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

function BorrowPanel({ title, description, children, className = '' }: BorrowPanelProps) {
    return (
        <section className={`borrow-panel-v25 ${className}`.trim()}>
            <div className="borrow-panel-heading-v25">
                <h2 className="section-title text-xl text-[var(--hi-text)]">{title}</h2>
                {description && (
                    <p className="mt-1.5 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex-1">
                {children}
            </div>
        </section>
    );
}

function getTranslatedActionErrorMessage(error: any, t: any) {
    const fallback = t('borrow_requests.messages.action_error');
    const errorCode = String(error?.response?.data?.code || '').trim();
    if (errorCode) {
        const translated = t(`borrow_requests.messages.errors.${errorCode}`, { defaultValue: '' });
        if (translated) {
            return translated;
        }
    }

    const rawMessage = getRequestErrorMessage(error, fallback);

    if (/aktif ödünç kaydı bulunamadı|active borrow/i.test(String(rawMessage || ''))) {
        return t('borrow_requests.messages.active_borrow_not_found');
    }

    return rawMessage || fallback;
}

interface StatusBadgeProps {
    status: string;
    t: any;
}

function StatusBadge({ status, t }: StatusBadgeProps) {
    const styles: Record<string, string> = {
        pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
        accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
        rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
        cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        returned: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
        return_pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
    };

    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || styles.pending}`}>
            {t(`borrow_requests.status.${status}`)}
        </span>
    );
}

interface RequestCardProps {
    request: any;
    t: any;
    i18n: any;
    onAccept: (request: any) => void;
    onReject: (request: any) => void;
    onCancel: (request: any) => void;
}

function RequestCard({ request, t, i18n, onAccept, onReject, onCancel }: RequestCardProps) {
    const effectiveStatus = request.borrow?.returned_at ? 'returned' : request.status;

    return (
        <article className="borrow-entry-v25 space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--hi-text-soft)]">
                            {request.direction === 'offer'
                                ? t('borrow_requests.labels.offer')
                                : t('borrow_requests.labels.request')}
                        </span>
                        <StatusBadge status={effectiveStatus} t={t} />
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--hi-text)] [overflow-wrap:anywhere]">
                        {request.item?.name || request.requested_item_label || t('borrow_requests.labels.unspecified_item')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--hi-text-soft)]">
                        {t('borrow_requests.labels.counterparty', { name: request.counterparty_display_name })}
                    </p>
                </div>
                <div className="text-xs text-[var(--hi-text-muted)]">
                    {t('borrow_requests.labels.created_at', { date: formatBorrowDateTime(request.created_at, i18n.language) })}
                </div>
            </div>

            {request.note && (
                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                    {request.note}
                </div>
            )}

            <div className="flex flex-wrap gap-3 text-sm text-[var(--hi-text-soft)]">
                {request.due_date && (
                    <span className="inline-flex items-center gap-1">
                        <Clock3 className="w-4 h-4" />
                        {t('borrow_requests.labels.due_date', { date: formatBorrowDate(request.due_date, i18n.language) })}
                    </span>
                )}
                {request.recipient_hint && request.viewer_role === 'initiator' && request.status === 'pending' && (
                    <span>{t('borrow_requests.labels.waiting_delivery')}</span>
                )}
            </div>

            {request.borrow && (
                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="text-sm font-medium text-[var(--hi-text)]">
                        {request.borrow.returned_at
                            ? t('borrow_requests.labels.returned_on', { date: formatBorrowDateTime(request.borrow.returned_at, i18n.language) })
                            : t('borrow_requests.labels.borrow_started', { date: formatBorrowDateTime(request.borrow.borrowed_at, i18n.language) })}
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {request.can_accept && (
                    <button
                        type="button"
                        onClick={() => onAccept(request)}
                        className={POSITIVE_ACTION_BUTTON_CLASS}
                    >
                        {request.needs_item_selection
                            ? t('borrow_requests.actions.fulfill_request')
                            : t('borrow_requests.actions.accept')}
                    </button>
                )}
                {request.can_reject && (
                    <button
                        type="button"
                        onClick={() => onReject(request)}
                        className={NEGATIVE_ACTION_BUTTON_CLASS}
                    >
                        {t('borrow_requests.actions.reject')}
                    </button>
                )}
                {request.can_cancel && (
                    <button
                        type="button"
                        onClick={() => onCancel(request)}
                        className={MUTED_ACTION_BUTTON_CLASS}
                    >
                        {t('borrow_requests.actions.cancel')}
                    </button>
                )}
            </div>
        </article>
    );
}

interface ActiveBorrowCardProps {
    borrow: any;
    t: any;
    i18n: any;
    onReturn: (borrow: any) => void;
}

function ActiveBorrowCard({ borrow, t, i18n, onReturn }: ActiveBorrowCardProps) {
    const overdue = isBorrowOverdue(borrow);
    const isReturnPending = Boolean(borrow.return_requested_at);
    const returnActionLabel = borrow.role === 'borrower'
        ? t('borrow_requests.actions.mark_delivered')
        : t('borrow_requests.actions.mark_received');

    return (
        <article className="borrow-entry-v25 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{borrow.item?.category_icon || '📦'}</span>
                        <h3 className="text-lg font-semibold text-[var(--hi-text)] [overflow-wrap:anywhere]">
                            {borrow.item?.name || t('borrow_requests.labels.unspecified_item')}
                        </h3>
                    </div>
                    <p className="mt-2 text-sm text-[var(--hi-text-soft)]">
                        {borrow.role === 'borrower'
                            ? t('borrow_requests.active.borrowed_from', { name: borrow.counterpart_display_name })
                            : t('borrow_requests.active.lent_to', { name: borrow.counterpart_display_name })}
                    </p>
                </div>
                <StatusBadge status={isReturnPending ? 'return_pending' : (overdue ? 'expired' : 'accepted')} t={t} />
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-[var(--hi-text-soft)]">
                <span className="inline-flex items-center gap-1">
                    <ArrowRightLeft className="w-4 h-4" />
                    {t('borrow_requests.labels.borrow_started', { date: formatBorrowDateTime(borrow.borrowed_at, i18n.language) })}
                </span>
                {borrow.due_date && (
                    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-600 dark:text-rose-300' : ''}`}>
                        <Clock3 className="w-4 h-4" />
                        {t('borrow_requests.labels.due_date', { date: formatBorrowDate(borrow.due_date, i18n.language) })}
                    </span>
                )}
            </div>

            {borrow.note && (
                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                    {borrow.note}
                </div>
            )}

            {isReturnPending && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    {borrow.role === 'borrower'
                        ? t('borrow_requests.active.return_pending_borrower')
                        : t('borrow_requests.active.return_pending_lender', { name: borrow.borrower_display_name || borrow.counterpart_display_name })}
                </div>
            )}

            {borrow.can_mark_returned && (
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => onReturn(borrow)}
                        className={POSITIVE_ACTION_BUTTON_CLASS}
                    >
                        {returnActionLabel}
                    </button>
                </div>
            )}
        </article>
    );
}

import { fetchWithCache, getCachedData, hasCache, invalidateCache } from '../utils/apiCache';

const BORROW_REQUESTS_CACHE_URL = '/api/borrow-requests';
const ITEM_CACHE_PATTERN = /^\/api\/items/;

export default function BorrowRequestsPage() {
    const { t, i18n } = useTranslation();
    const isMountedRef = useRef(true);
    const overviewAbortRef = useRef<AbortController | null>(null);
    const overviewRequestIdRef = useRef(0);

    // Initialize states from SWR cache
    const [requests, setRequests] = useState<any[]>(() => getCachedData(BORROW_REQUESTS_CACHE_URL)?.requests || []);
    const [activeBorrows, setActiveBorrows] = useState<any[]>(() => getCachedData(BORROW_REQUESTS_CACHE_URL)?.activeBorrows || []);
    const [availableItems, setAvailableItems] = useState<any[]>(() => getCachedData(BORROW_REQUESTS_CACHE_URL)?.availableItems || []);

    const isInitiallyLoaded = hasCache(BORROW_REQUESTS_CACHE_URL);
    const [loading, setLoading] = useState(!isInitiallyLoaded);
    const [refreshing, setRefreshing] = useState(false);
    const [backendReady, setBackendReady] = useState(true);
    const [actionError, setActionError] = useState('');
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);
    const [fulfillRequest, setFulfillRequest] = useState<any | null>(null);
    const [rejectRequest, setRejectRequest] = useState<any | null>(null);
    const [returnBorrow, setReturnBorrow] = useState<any | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const incomingRequests = useMemo(
        () => requests.filter((request) => request.viewer_role === 'recipient'),
        [requests]
    );
    const outgoingRequests = useMemo(
        () => requests.filter((request) => request.viewer_role === 'initiator'),
        [requests]
    );
    const borrowedByMe = useMemo(
        () => activeBorrows.filter((borrow) => borrow.role === 'borrower'),
        [activeBorrows]
    );
    const lentByMe = useMemo(
        () => activeBorrows.filter((borrow) => borrow.role !== 'borrower'),
        [activeBorrows]
    );
    const sectionCounts = useMemo(
        () => ({
            active: activeBorrows.length,
            incoming: incomingRequests.length,
            outgoing: outgoingRequests.length
        }),
        [activeBorrows.length, incomingRequests.length, outgoingRequests.length]
    );

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            overviewAbortRef.current?.abort();
        };
    }, []);

    const fetchOverview = async ({ silent = false } = {}) => {
        overviewAbortRef.current?.abort();
        const controller = new AbortController();
        overviewAbortRef.current = controller;
        const requestId = ++overviewRequestIdRef.current;

        if (silent) {
            setRefreshing(true);
        } else {
            if (!hasCache(BORROW_REQUESTS_CACHE_URL)) {
                setLoading(true);
            }
        }

        try {
            await fetchWithCache(BORROW_REQUESTS_CACHE_URL, (data) => {
                if (!isMountedRef.current || overviewRequestIdRef.current !== requestId) {
                    return;
                }

                setRequests(data.requests || []);
                setActiveBorrows(data.activeBorrows || []);
                setAvailableItems(data.availableItems || []);
                setBackendReady(true);
            });
        } catch (error) {
            if (isRequestCanceled(error) || !isMountedRef.current || overviewRequestIdRef.current !== requestId) {
                return;
            }

            console.error(error);
            setBackendReady(false);
            setRequests([]);
            setActiveBorrows([]);
            setAvailableItems([]);
        } finally {
            if (!isMountedRef.current || overviewRequestIdRef.current !== requestId) {
                return;
            }

            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, []);

    const runAction = async (task: () => Promise<void>) => {
        setSubmitting(true);
        setActionError('');
        try {
            await task();
            invalidateCache(BORROW_REQUESTS_CACHE_URL);
            invalidateCache(ITEM_CACHE_PATTERN);
            await fetchOverview({ silent: true });
        } finally {
            if (isMountedRef.current) {
                setSubmitting(false);
            }
        }
    };

    const handleRequestSubmit = async (payload: any) => {
        try {
            await runAction(async () => {
                await axios.post(
                    '/api/borrow-requests',
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
            if (isMountedRef.current) {
                setRequestDialogOpen(false);
            }
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
            throw error;
        }
    };

    const handleAccept = async (request: any) => {
        if (request.needs_item_selection) {
            setFulfillRequest(request);
            return;
        }

        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/${request.id}/accept`,
                    undefined,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
        }
    };

    const handleFulfillSubmit = async (payload: any) => {
        if (!fulfillRequest) {
            return;
        }

        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/${fulfillRequest.id}/accept`,
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
            if (isMountedRef.current) {
                setFulfillRequest(null);
            }
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
            throw error;
        }
    };

    const handleReject = (request: any) => {
        setRejectRequest(request);
    };

    const handleRejectSubmit = async (payload: { reason: string }) => {
        if (!rejectRequest) {
            return;
        }

        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/${rejectRequest.id}/reject`,
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
            if (isMountedRef.current) {
                setRejectRequest(null);
            }
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
            throw error;
        }
    };

    const handleCancel = async (request: any) => {
        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/${request.id}/cancel`,
                    undefined,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
        }
    };

    const handleReturnSubmit = async (payload: any) => {
        if (!returnBorrow) {
            return;
        }

        const returnedBorrowId = returnBorrow.id;
        try {
            await runAction(async () => {
                const response = await axios.post(
                    `/api/borrow-requests/active-borrows/${returnBorrow.id}/return`,
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
                if (isMountedRef.current) {
                    const updatedBorrow = response.data?.borrow;
                    if (updatedBorrow?.returned_at) {
                        setActiveBorrows((currentBorrows) => currentBorrows.filter((borrow) => borrow.id !== returnedBorrowId));
                        setRequests((currentRequests) => currentRequests.map((request) => (
                            request.borrow?.id === returnedBorrowId
                                ? { ...request, borrow: { ...request.borrow, returned_at: updatedBorrow.returned_at } }
                                : request
                        )));
                    } else if (updatedBorrow) {
                        setActiveBorrows((currentBorrows) => currentBorrows.map((borrow) => (
                            borrow.id === returnedBorrowId ? updatedBorrow : borrow
                        )));
                    }
                }
            });
            if (isMountedRef.current) {
                setReturnBorrow(null);
            }
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getTranslatedActionErrorMessage(error, t));
            }
            throw error;
        }
    };

    if (loading) {
        return (
            <LoadingState
                title={t('common.loading')}
                description={t('borrow_requests.loading_description', {
                    defaultValue: 'İstekler ve aktif ödünç hareketleri hazırlanıyor.'
                })}
            />
        );
    }

    return (
        <div className="borrow-page-v25 animate-fade-in">
            <header className="workspace-intro workspace-intro-with-action borrow-intro-v25">
                <div>
                    <h1>{t('borrow_requests.title')}</h1>
                    <p>{t('borrow_requests.subtitle_compact', {
                        defaultValue: 'Track requests you sent, requests waiting on you, and items currently out.'
                    })}</p>
                </div>
                <div className="borrow-header-actions-v25">
                    <button
                        type="button"
                        onClick={() => fetchOverview({ silent: true })}
                        className="btn-secondary borrow-refresh-v25"
                        disabled={refreshing}
                        aria-label={t('common.refresh')}
                    >
                        <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        <span>{t('common.refresh')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setRequestDialogOpen(true)}
                        className="btn-primary"
                        disabled={!backendReady}
                    >
                        <Inbox className="w-4 h-4" />
                        <span>{t('borrow_requests.actions.send_request')}</span>
                    </button>
                </div>
            </header>

            {!backendReady && (
                <NoticeBanner
                    icon={AlertTriangle}
                    tone="warning"
                    title={t('borrow_requests.preview.title')}
                    description={t('borrow_requests.preview.body')}
                />
            )}

            {actionError && (
                <NoticeBanner
                    icon={AlertTriangle}
                    tone="danger"
                    title={t('borrow_requests.messages.action_error')}
                    description={actionError}
                    action={
                        <button
                            type="button"
                            onClick={() => setActionError('')}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200/70 text-red-500 transition hover:bg-red-100/70 dark:border-red-400/20 dark:text-red-300 dark:hover:bg-red-500/10"
                            aria-label={t('common.close')}
                            title={t('common.close')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    }
                />
            )}

            {refreshing && (
                <div aria-live="polite" className="flex items-center gap-2 text-sm text-[var(--hi-text-soft)]">
                    <RefreshCcw className="h-4 w-4 animate-spin text-[var(--hi-accent)]" />
                    <span>{t('borrow_requests.refreshing', { defaultValue: 'Refreshing requests and active borrows...' })}</span>
                </div>
            )}

            <div aria-busy={refreshing} className={`borrow-content-v25 transition-opacity ${refreshing ? 'opacity-80' : 'opacity-100'}`}>
                <div className={`borrow-stats-v25 ${refreshing ? 'animate-pulse' : ''}`}>
                    <StatCard icon={Package} label={t('borrow_requests.stats.active')} value={sectionCounts.active} accent="bg-[rgba(111,153,120,0.16)] text-[#6f9978]" />
                    <StatCard icon={Inbox} label={t('borrow_requests.stats.incoming')} value={sectionCounts.incoming} accent="bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]" />
                    <StatCard icon={Send} label={t('borrow_requests.stats.outgoing')} value={sectionCounts.outgoing} accent="bg-[var(--hi-panel-muted)] text-[var(--hi-accent)]" />
                </div>

                <BorrowPanel
                    title={t('borrow_requests.active.title')}
                    description={t('borrow_requests.active.subtitle')}
                >
                    {activeBorrows.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title={t('borrow_requests.active.empty_title', { defaultValue: 'Nothing is currently out' })}
                            description={t('borrow_requests.active.empty_description', { defaultValue: 'As soon as an item is borrowed or lent, it will appear here with due date and return status details.' })}
                            className="min-h-[17.5rem]"
                            actions={(
                                <Link to="/items" className={EMPTY_STATE_BUTTON_CLASS}>
                                    <Package className="w-4 h-4" />
                                    <span>{t('borrow_requests.actions.open_inventory', { defaultValue: 'Open inventory' })}</span>
                                </Link>
                            )}
                        />
                    ) : (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {borrowedByMe.map((borrow) => (
                                <ActiveBorrowCard key={borrow.id} borrow={borrow} t={t} i18n={i18n} onReturn={setReturnBorrow} />
                            ))}
                            {lentByMe.map((borrow) => (
                                <ActiveBorrowCard key={borrow.id} borrow={borrow} t={t} i18n={i18n} onReturn={setReturnBorrow} />
                            ))}
                        </div>
                    )}
                </BorrowPanel>

                <div className="borrow-requests-columns grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
                    <BorrowPanel
                        title={t('borrow_requests.incoming_title')}
                        description={t('borrow_requests.incoming_subtitle')}
                    >
                        {incomingRequests.length === 0 ? (
                            <EmptyState
                                icon={Inbox}
                                title={t('borrow_requests.incoming_empty_title', { defaultValue: 'No requests need your review' })}
                                description={t('borrow_requests.empty_incoming')}
                                className={REQUEST_EMPTY_STATE_CLASS}
                                actions={(
                                    <Link to="/items" className={EMPTY_STATE_BUTTON_CLASS}>
                                        <Package className="w-4 h-4" />
                                        <span>{t('borrow_requests.actions.open_inventory', { defaultValue: 'Review inventory' })}</span>
                                    </Link>
                                )}
                            />
                        ) : (
                            <div className="space-y-4">
                                {incomingRequests.map((request) => (
                                    <RequestCard
                                        key={request.id}
                                        request={request}
                                        t={t}
                                        i18n={i18n}
                                        onAccept={handleAccept}
                                        onReject={handleReject}
                                        onCancel={handleCancel}
                                    />
                                ))}
                            </div>
                        )}
                    </BorrowPanel>

                    <BorrowPanel
                        title={t('borrow_requests.outgoing_title')}
                        description={t('borrow_requests.outgoing_subtitle')}
                    >
                        {outgoingRequests.length === 0 ? (
                            <EmptyState
                                icon={Send}
                                title={t('borrow_requests.outgoing_empty_title', { defaultValue: 'No outgoing requests yet' })}
                                description={t('borrow_requests.empty_outgoing')}
                                className={REQUEST_EMPTY_STATE_CLASS}
                            />
                        ) : (
                            <div className="space-y-4">
                                {outgoingRequests.map((request) => (
                                    <RequestCard
                                        key={request.id}
                                        request={request}
                                        t={t}
                                        i18n={i18n}
                                        onAccept={handleAccept}
                                        onReject={handleReject}
                                        onCancel={handleCancel}
                                    />
                                ))}
                            </div>
                        )}
                    </BorrowPanel>
                </div>
            </div>

            <BorrowRequestCreateDialog
                isOpen={requestDialogOpen}
                submitting={submitting}
                onClose={() => !submitting && setRequestDialogOpen(false)}
                onSubmit={handleRequestSubmit}
            />

            <FulfillBorrowRequestDialog
                request={fulfillRequest}
                items={availableItems}
                submitting={submitting}
                onClose={() => !submitting && setFulfillRequest(null)}
                onSubmit={handleFulfillSubmit}
            />

            <ReturnBorrowRecordDialog
                borrow={returnBorrow}
                submitting={submitting}
                onClose={() => !submitting && setReturnBorrow(null)}
                onSubmit={handleReturnSubmit}
            />

            <RejectBorrowRequestDialog
                request={rejectRequest}
                submitting={submitting}
                onClose={() => !submitting && setRejectRequest(null)}
                onSubmit={handleRejectSubmit}
            />
        </div>
    );
}
