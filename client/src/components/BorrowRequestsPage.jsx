import { useEffect, useMemo, useRef, useState } from 'react';
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
    Undo2
} from 'lucide-react';
import {
    BorrowRequestCreateDialog,
    FulfillBorrowRequestDialog,
    ReturnBorrowRecordDialog
} from './BorrowDialogs';
import { formatBorrowDate, formatBorrowDateTime, isBorrowOverdue } from '../utils/borrowFormatting';
import {
    ACTION_REQUEST_TIMEOUT_MS,
    createRequestConfig,
    getRequestErrorMessage,
    isRequestCanceled
} from '../utils/httpRequests';
import { EmptyState, LoadingState, NoticeBanner, PageHeader } from './ProductUI';

const EMPTY_STATE_BUTTON_CLASS = 'btn-secondary min-w-[170px] justify-center';
const REQUEST_EMPTY_STATE_CLASS = 'h-[17rem] justify-center';
const POSITIVE_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20';
const NEGATIVE_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-xl border border-rose-500/20 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20';
const MUTED_ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-[12px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-2 text-sm font-medium text-[var(--hi-text-soft)] transition-colors hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]';

function StatCard({ icon: Icon, label, value, accent = 'text-[var(--hi-accent)] bg-[var(--hi-accent-soft)]' }) {
    return (
        <div className="stat-card border border-[var(--hi-border)] p-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm text-[var(--hi-text-soft)]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--hi-text)]">{value}</p>
                </div>
                <div className={`rounded-lg border border-[var(--hi-border)] p-3 ${accent}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
}

function BorrowPanel({ title, description, children, className = '' }) {
    return (
        <section className={`card flex h-full flex-col gap-4 p-5 ${className}`.trim()}>
            <div className="border-b border-[var(--hi-border)] pb-3.5">
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

function StatusBadge({ status, t }) {
    const styles = {
        pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
        accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
        rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
        cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        returned: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
    };

    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || styles.pending}`}>
            {t(`borrow_requests.status.${status}`)}
        </span>
    );
}

function RequestCard({ request, t, i18n, onAccept, onReject, onCancel }) {
    const effectiveStatus = request.borrow?.returned_at ? 'returned' : request.status;

    return (
        <div className="card p-4 space-y-3.5">
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
                <p className="text-xs text-[var(--hi-text-muted)]">
                    {t('borrow_requests.labels.created_at', { date: formatBorrowDateTime(request.created_at, i18n.language) })}
                </p>
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
        </div>
    );
}

function ActiveBorrowCard({ borrow, t, i18n, onReturn }) {
    const overdue = isBorrowOverdue(borrow);

    return (
        <div className="card p-4 space-y-3.5">
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
                {borrow.due_date && (
                    <StatusBadge status={overdue ? 'expired' : 'accepted'} t={t} />
                )}
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

            {borrow.can_mark_returned && (
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => onReturn(borrow)}
                        className={POSITIVE_ACTION_BUTTON_CLASS}
                    >
                        {t('inventory.borrow.mark_returned')}
                    </button>
                </div>
            )}
        </div>
    );
}

export default function BorrowRequestsPage() {
    const { t, i18n } = useTranslation();
    const isMountedRef = useRef(true);
    const overviewAbortRef = useRef(null);
    const overviewRequestIdRef = useRef(0);
    const [requests, setRequests] = useState([]);
    const [activeBorrows, setActiveBorrows] = useState([]);
    const [availableItems, setAvailableItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [backendReady, setBackendReady] = useState(true);
    const [actionError, setActionError] = useState('');
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);
    const [fulfillRequest, setFulfillRequest] = useState(null);
    const [returnBorrow, setReturnBorrow] = useState(null);
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
            setLoading(true);
        }

        try {
            const response = await axios.get(
                '/api/borrow-requests',
                createRequestConfig({ signal: controller.signal })
            );

            if (!isMountedRef.current || overviewRequestIdRef.current !== requestId) {
                return;
            }

            setRequests(response.data.requests || []);
            setActiveBorrows(response.data.activeBorrows || []);
            setAvailableItems(response.data.availableItems || []);
            setBackendReady(true);
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

    const runAction = async (task) => {
        setSubmitting(true);
        setActionError('');
        try {
            await task();
            await fetchOverview({ silent: true });
        } finally {
            if (isMountedRef.current) {
                setSubmitting(false);
            }
        }
    };

    const handleRequestSubmit = async (payload) => {
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
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            }
            throw error;
        }
    };

    const handleAccept = async (request) => {
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
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            }
        }
    };

    const handleFulfillSubmit = async (payload) => {
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
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            }
            throw error;
        }
    };

    const handleReject = async (request) => {
        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/${request.id}/reject`,
                    undefined,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            }
        }
    };

    const handleCancel = async (request) => {
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
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            }
        }
    };

    const handleReturnSubmit = async (payload) => {
        if (!returnBorrow) {
            return;
        }

        const returnedBorrowId = returnBorrow.id;
        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/active-borrows/${returnBorrow.id}/return`,
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
                if (isMountedRef.current) {
                    setActiveBorrows((currentBorrows) => currentBorrows.filter((borrow) => borrow.id !== returnedBorrowId));
                    setRequests((currentRequests) => currentRequests.map((request) => (
                        request.borrow?.id === returnedBorrowId
                            ? { ...request, borrow: { ...request.borrow, returned_at: new Date().toISOString() } }
                            : request
                    )));
                }
            });
            if (isMountedRef.current) {
                setReturnBorrow(null);
            }
        } catch (error) {
            if (isMountedRef.current) {
                setActionError(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
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
        <div className="space-y-5 animate-fade-in">
            <PageHeader
                title={t('borrow_requests.title')}
                description={t('borrow_requests.subtitle_compact', {
                    defaultValue: 'Track requests you sent, requests waiting on you, and items currently out.'
                })}
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => fetchOverview({ silent: true })}
                            className="btn-secondary inline-flex items-center gap-2"
                            disabled={refreshing}
                        >
                            <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {t('common.refresh')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setRequestDialogOpen(true)}
                            className="btn-primary inline-flex items-center gap-2"
                            disabled={!backendReady}
                        >
                            <Inbox className="w-4 h-4" />
                            {t('borrow_requests.actions.send_request')}
                        </button>
                    </>
                )}
            />

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
                />
            )}

            {refreshing && (
                <div aria-live="polite" className="flex items-center gap-2 text-sm text-[var(--hi-text-soft)]">
                    <RefreshCcw className="h-4 w-4 animate-spin text-[var(--hi-accent)]" />
                    <span>{t('borrow_requests.refreshing', { defaultValue: 'Refreshing requests and active borrows...' })}</span>
                </div>
            )}

            <div aria-busy={refreshing} className={`space-y-8 transition-opacity ${refreshing ? 'opacity-80' : 'opacity-100'}`}>
                <div className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${refreshing ? 'animate-pulse' : ''}`}>
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
        </div>
    );
}
