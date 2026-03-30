import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
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
    BorrowOfferDialog,
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

function StatCard({ icon: Icon, label, value, accent = 'text-primary-500' }) {
    return (
        <div className="card p-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
                </div>
                <div className={`rounded-2xl p-3 bg-slate-100 dark:bg-slate-800 ${accent}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </div>
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
        <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {request.direction === 'offer'
                                ? t('borrow_requests.labels.offer')
                                : t('borrow_requests.labels.request')}
                        </span>
                        <StatusBadge status={effectiveStatus} t={t} />
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                        {request.item?.name || request.requested_item_label || t('borrow_requests.labels.unspecified_item')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {t('borrow_requests.labels.counterparty', { name: request.counterparty_display_name })}
                    </p>
                </div>
                <p className="text-xs text-slate-400">
                    {t('borrow_requests.labels.created_at', { date: formatBorrowDateTime(request.created_at, i18n.language) })}
                </p>
            </div>

            {request.note && (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {request.note}
                </div>
            )}

            <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
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
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
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
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors"
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
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 transition-colors"
                    >
                        {t('borrow_requests.actions.reject')}
                    </button>
                )}
                {request.can_cancel && (
                    <button
                        type="button"
                        onClick={() => onCancel(request)}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
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
        <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{borrow.item?.category_icon || '📦'}</span>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {borrow.item?.name || t('borrow_requests.labels.unspecified_item')}
                        </h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {borrow.role === 'borrower'
                            ? t('borrow_requests.active.borrowed_from', { name: borrow.counterpart_display_name })
                            : t('borrow_requests.active.lent_to', { name: borrow.counterpart_display_name })}
                    </p>
                </div>
                {borrow.due_date && (
                    <StatusBadge status={overdue ? 'expired' : 'accepted'} t={t} />
                )}
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
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
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {borrow.note}
                </div>
            )}

            {borrow.can_mark_returned && (
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => onReturn(borrow)}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors"
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
    const [counts, setCounts] = useState({ incomingPending: 0, outgoingPending: 0, activeBorrows: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [backendReady, setBackendReady] = useState(true);
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);
    const [offerDialogOpen, setOfferDialogOpen] = useState(false);
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
            setCounts(response.data.counts || { incomingPending: 0, outgoingPending: 0, activeBorrows: 0 });
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
            setCounts({ incomingPending: 0, outgoingPending: 0, activeBorrows: 0 });
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
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            throw error;
        }
    };

    const handleOfferSubmit = async (payload) => {
        try {
            await runAction(async () => {
                await axios.post(
                    '/api/borrow-requests',
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
            if (isMountedRef.current) {
                setOfferDialogOpen(false);
            }
        } catch (error) {
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
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
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
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
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
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
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
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
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
        }
    };

    const handleReturnSubmit = async (payload) => {
        if (!returnBorrow) {
            return;
        }

        try {
            await runAction(async () => {
                await axios.post(
                    `/api/borrow-requests/active-borrows/${returnBorrow.id}/return`,
                    payload,
                    createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
                );
            });
            if (isMountedRef.current) {
                setReturnBorrow(null);
            }
        } catch (error) {
            alert(getRequestErrorMessage(error, t('borrow_requests.messages.action_error')));
            throw error;
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><div className="spinner"></div></div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('borrow_requests.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('borrow_requests.subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-3">
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
                        className="btn-secondary inline-flex items-center gap-2"
                        disabled={!backendReady}
                    >
                        <Inbox className="w-4 h-4" />
                        {t('borrow_requests.actions.send_request')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOfferDialogOpen(true)}
                        className="btn-primary inline-flex items-center gap-2"
                        disabled={!backendReady || availableItems.length === 0}
                    >
                        <Send className="w-4 h-4" />
                        {t('borrow_requests.actions.send_offer')}
                    </button>
                </div>
            </div>

            {!backendReady && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                        <div>
                            <p className="font-semibold">{t('borrow_requests.preview.title')}</p>
                            <p className="mt-1 text-sm">{t('borrow_requests.preview.body')}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard icon={Inbox} label={t('borrow_requests.stats.incoming')} value={counts.incomingPending} accent="text-amber-500" />
                <StatCard icon={Send} label={t('borrow_requests.stats.outgoing')} value={counts.outgoingPending} accent="text-violet-500" />
                <StatCard icon={Package} label={t('borrow_requests.stats.active')} value={counts.activeBorrows} accent="text-emerald-500" />
            </div>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('borrow_requests.active.title')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('borrow_requests.active.subtitle')}</p>
                    </div>
                </div>

                {activeBorrows.length === 0 ? (
                    <div className="card py-12 text-center">
                        <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                        <p className="mt-4 text-slate-500 dark:text-slate-400">{t('borrow_requests.active.empty')}</p>
                    </div>
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
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('borrow_requests.incoming_title')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('borrow_requests.incoming_subtitle')}</p>
                    </div>

                    {incomingRequests.length === 0 ? (
                        <div className="card py-12 text-center">
                            <Inbox className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                            <p className="mt-4 text-slate-500 dark:text-slate-400">{t('borrow_requests.empty_incoming')}</p>
                        </div>
                    ) : (
                        incomingRequests.map((request) => (
                            <RequestCard
                                key={request.id}
                                request={request}
                                t={t}
                                i18n={i18n}
                                onAccept={handleAccept}
                                onReject={handleReject}
                                onCancel={handleCancel}
                            />
                        ))
                    )}
                </section>

                <section className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('borrow_requests.outgoing_title')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('borrow_requests.outgoing_subtitle')}</p>
                    </div>

                    {outgoingRequests.length === 0 ? (
                        <div className="card py-12 text-center">
                            <Send className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                            <p className="mt-4 text-slate-500 dark:text-slate-400">{t('borrow_requests.empty_outgoing')}</p>
                        </div>
                    ) : (
                        outgoingRequests.map((request) => (
                            <RequestCard
                                key={request.id}
                                request={request}
                                t={t}
                                i18n={i18n}
                                onAccept={handleAccept}
                                onReject={handleReject}
                                onCancel={handleCancel}
                            />
                        ))
                    )}
                </section>
            </div>

            <BorrowRequestCreateDialog
                isOpen={requestDialogOpen}
                submitting={submitting}
                onClose={() => !submitting && setRequestDialogOpen(false)}
                onSubmit={handleRequestSubmit}
            />

            <BorrowOfferDialog
                isOpen={offerDialogOpen}
                items={availableItems}
                submitting={submitting}
                onClose={() => !submitting && setOfferDialogOpen(false)}
                onSubmit={handleOfferSubmit}
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
