import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

const EMPTY_OPTIONS: any[] = [];

interface DialogShellProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onClose: () => void;
}

function DialogShell({ title, subtitle, children, onClose }: DialogShellProps) {
    const { t } = useTranslation();

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg overflow-hidden rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-[var(--hi-border)] px-6 py-5">
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--hi-text)]">{title}</h2>
                        {subtitle && <p className="mt-1 text-sm text-[var(--hi-text-soft)]">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close', { defaultValue: 'Kapat' }) || undefined}
                        className="rounded-xl p-2 text-[var(--hi-text-soft)] transition-colors hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-5">{children}</div>
            </div>
        </div>
    );
}

interface Member {
    id: string | number;
    username: string;
    [key: string]: any;
}

interface Item {
    id: string | number;
    name: string;
    category_icon?: string;
    active_borrow?: {
        role?: 'borrower' | 'lender';
        counterpart_display_name?: string;
        borrower_display_name?: string;
        lender_display_name?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

interface BorrowItemDialogProps {
    item: Item | null | undefined;
    members?: Member[];
    currentUserId?: string | number | null;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function BorrowItemDialog({
    item,
    members = EMPTY_OPTIONS,
    currentUserId,
    submitting = false,
    onClose,
    onSubmit
}: BorrowItemDialogProps) {
    const { t } = useTranslation();
    const selectableMembers = members.filter((member) => member.id !== currentUserId);
    const [formData, setFormData] = useState({
        borrower_type: selectableMembers.length > 0 ? 'member' : 'external',
        borrower_user_id: selectableMembers[0]?.id ? String(selectableMembers[0].id) : '',
        borrower_identifier: '',
        borrower_name: '',
        borrower_contact: '',
        due_date: '',
        note: ''
    });

    useEffect(() => {
        if (!item) {
            return;
        }

        const nextSelectableMembers = members.filter((member) => member.id !== currentUserId);
        setFormData({
            borrower_type: nextSelectableMembers.length > 0 ? 'member' : 'external',
            borrower_user_id: nextSelectableMembers[0]?.id ? String(nextSelectableMembers[0].id) : '',
            borrower_identifier: '',
            borrower_name: '',
            borrower_contact: '',
            due_date: '',
            note: ''
        });
    }, [item, members, currentUserId]);

    if (!item) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({
                ...formData,
                borrower_user_id: formData.borrower_type === 'member' ? formData.borrower_user_id : '',
                borrower_identifier: formData.borrower_type === 'site_member' ? formData.borrower_identifier : '',
                borrower_name: formData.borrower_type === 'external' ? formData.borrower_name : '',
                borrower_contact: formData.borrower_type === 'external' ? formData.borrower_contact : ''
            });
        } catch {
            // Parent already surfaces the error message.
        }
    };

    return (
        <DialogShell
            title={t('inventory.borrow.dialog_lend_title')}
            subtitle={t('inventory.borrow.dialog_lend_subtitle', { item: item.name }) || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, borrower_type: 'member' }))}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${formData.borrower_type === 'member'
                            ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                            : 'border-[var(--hi-border)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)]'
                            }`}
                        disabled={selectableMembers.length === 0}
                    >
                        {t('inventory.borrow.member')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, borrower_type: 'site_member' }))}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${formData.borrower_type === 'site_member'
                            ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                            : 'border-[var(--hi-border)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)]'
                            }`}
                    >
                        {t('inventory.borrow.site_member')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, borrower_type: 'external' }))}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${formData.borrower_type === 'external'
                            ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                            : 'border-[var(--hi-border)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)]'
                            }`}
                    >
                        {t('inventory.borrow.external')}
                    </button>
                </div>

                {formData.borrower_type === 'member' ? (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {t('inventory.borrow.borrower_member')}
                        </label>
                        <select
                            value={formData.borrower_user_id}
                            onChange={(event) => setFormData((prev) => ({ ...prev, borrower_user_id: event.target.value }))}
                            className="input-field"
                            required
                        >
                            <option value="">{t('common.select')}</option>
                            {selectableMembers.map((member) => (
                                <option key={member.id} value={member.id}>
                                    {member.username}
                                </option>
                            ))}
                        </select>
                        {selectableMembers.length === 0 && (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                {t('inventory.borrow.no_members')}
                            </p>
                        )}
                    </div>
                ) : formData.borrower_type === 'site_member' ? (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {t('inventory.borrow.site_member_identifier')}
                        </label>
                        <input
                            type="text"
                            value={formData.borrower_identifier}
                            onChange={(event) => setFormData((prev) => ({ ...prev, borrower_identifier: event.target.value }))}
                            className="input-field"
                            placeholder={t('inventory.borrow.site_member_identifier_placeholder') || ''}
                            autoCapitalize="none"
                            autoComplete="off"
                            spellCheck={false}
                            required
                        />
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {t('inventory.borrow.site_member_privacy_hint')}
                        </p>
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                {t('inventory.borrow.borrower_name')}
                            </label>
                            <input
                                type="text"
                                value={formData.borrower_name}
                                onChange={(event) => setFormData((prev) => ({ ...prev, borrower_name: event.target.value }))}
                                className="input-field"
                                placeholder={t('inventory.borrow.borrower_name_placeholder') || ''}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                {t('inventory.borrow.borrower_contact')}
                            </label>
                            <input
                                type="text"
                                value={formData.borrower_contact}
                                onChange={(event) => setFormData((prev) => ({ ...prev, borrower_contact: event.target.value }))}
                                className="input-field"
                                placeholder={t('inventory.borrow.borrower_contact_placeholder') || ''}
                            />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('inventory.borrow.external_privacy_hint')}
                        </p>
                    </>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.due_date')}
                    </label>
                    <input
                        type="date"
                        value={formData.due_date}
                        onChange={(event) => setFormData((prev) => ({ ...prev, due_date: event.target.value }))}
                        className="input-field"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.note')}
                    </label>
                    <textarea
                        value={formData.note}
                        onChange={(event) => setFormData((prev) => ({ ...prev, note: event.target.value }))}
                        className="input-field min-h-[110px] resize-none"
                        placeholder={t('inventory.borrow.note_placeholder') || ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting}>
                        {submitting ? t('inventory.borrow.submitting_lend') : t('inventory.borrow.lend')}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface ReturnItemDialogProps {
    item: Item | null | undefined;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function ReturnItemDialog({ item, submitting = false, onClose, onSubmit }: ReturnItemDialogProps) {
    const { t } = useTranslation();
    const [returnNote, setReturnNote] = useState('');

    useEffect(() => {
        setReturnNote('');
    }, [item]);

    if (!item) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({ return_note: returnNote });
        } catch {
            // Parent already surfaces the error message.
        }
    };

    const activeBorrow = item.active_borrow || {};
    const isBorrowerReturn = activeBorrow.role === 'borrower';

    return (
        <DialogShell
            title={isBorrowerReturn
                ? t('borrow_requests.dialogs.return_title_borrower')
                : t('borrow_requests.dialogs.return_title_lender')}
            subtitle={isBorrowerReturn
                ? t('borrow_requests.dialogs.return_subtitle_borrower', { item: item.name }) || ''
                : t('borrow_requests.dialogs.return_subtitle_lender', { item: item.name }) || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="text-sm text-[var(--hi-text-soft)]">
                        {isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_target_borrower', { name: activeBorrow.counterpart_display_name || activeBorrow.lender_display_name || t('inventory.borrow.unknown') })
                            : t('borrow_requests.dialogs.return_target_lender', { name: activeBorrow.borrower_display_name || activeBorrow.counterpart_display_name || t('inventory.borrow.unknown') })}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_note_borrower')
                            : t('borrow_requests.dialogs.return_note_lender')}
                    </label>
                    <textarea
                        value={returnNote}
                        onChange={(event) => setReturnNote(event.target.value)}
                        className="input-field min-h-[110px] resize-none"
                        placeholder={isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_note_placeholder_borrower') || ''
                            : t('borrow_requests.dialogs.return_note_placeholder_lender') || ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting}>
                        {submitting
                            ? t('borrow_requests.dialogs.return_submitting')
                            : (
                                isBorrowerReturn
                                    ? t('borrow_requests.actions.mark_delivered')
                                    : t('borrow_requests.actions.mark_received')
                            )}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface BorrowOfferDialogProps {
    isOpen?: boolean;
    item?: Item | null;
    items?: Item[];
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function BorrowOfferDialog({
    isOpen = false,
    item = null,
    items = EMPTY_OPTIONS,
    submitting = false,
    onClose,
    onSubmit
}: BorrowOfferDialogProps) {
    const { t } = useTranslation();
    const hasSelectableItems = Boolean(item) || items.length > 0;
    const [formData, setFormData] = useState({
        item_id: item?.id ? String(item.id) : '',
        recipient_identifier: '',
        due_date: '',
        note: ''
    });

    useEffect(() => {
        setFormData({
            item_id: item?.id ? String(item.id) : (items[0]?.id ? String(items[0].id) : ''),
            recipient_identifier: '',
            due_date: '',
            note: ''
        });
    }, [item, items, isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({
                direction: 'offer',
                ...formData
            });
        } catch {
            // Parent already handles the error.
        }
    };

    return (
        <DialogShell
            title={t('borrow_requests.dialogs.offer_title')}
            subtitle={item
                ? t('borrow_requests.dialogs.offer_subtitle_item', { item: item.name }) || ''
                : t('borrow_requests.dialogs.offer_subtitle_general') || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {!item && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {t('borrow_requests.dialogs.item_label')}
                        </label>
                        <select
                            value={formData.item_id}
                            onChange={(event) => setFormData((prev) => ({ ...prev, item_id: event.target.value }))}
                            className="input-field"
                            required={hasSelectableItems}
                        >
                            <option value="">{t('borrow_requests.dialogs.item_placeholder')}</option>
                            {items.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.category_icon} {entry.name}
                                </option>
                            ))}
                        </select>
                        {!hasSelectableItems && (
                            <div className="mt-3 rounded-[20px] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm text-[var(--hi-secondary-strong)]">
                                {t('borrow_requests.dialogs.no_available_items')}
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.target_label')}
                    </label>
                    <input
                        type="text"
                        value={formData.recipient_identifier}
                        onChange={(event) => setFormData((prev) => ({ ...prev, recipient_identifier: event.target.value }))}
                        className="input-field"
                        placeholder={t('borrow_requests.dialogs.target_placeholder') || ''}
                        required
                    />
                    <p className="mt-2 text-xs text-[var(--hi-text-soft)]">
                        {t('borrow_requests.dialogs.target_help')}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.due_date')}
                    </label>
                    <input
                        type="date"
                        value={formData.due_date}
                        onChange={(event) => setFormData((prev) => ({ ...prev, due_date: event.target.value }))}
                        className="input-field"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.note')}
                    </label>
                    <textarea
                        value={formData.note}
                        onChange={(event) => setFormData((prev) => ({ ...prev, note: event.target.value }))}
                        className="input-field min-h-[110px] resize-none"
                        placeholder={t('borrow_requests.dialogs.offer_note_placeholder') || ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting || !hasSelectableItems}>
                        {submitting ? t('borrow_requests.dialogs.offer_submitting') : t('borrow_requests.actions.send_offer')}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface BorrowRequestCreateDialogProps {
    isOpen?: boolean;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function BorrowRequestCreateDialog({
    isOpen = false,
    submitting = false,
    onClose,
    onSubmit
}: BorrowRequestCreateDialogProps) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        recipient_identifier: '',
        requested_item_label: '',
        due_date: '',
        note: ''
    });

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setFormData({
            recipient_identifier: '',
            requested_item_label: '',
            due_date: '',
            note: ''
        });
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({
                direction: 'request',
                ...formData
            });
        } catch {
            // Parent already handles the error.
        }
    };

    return (
        <DialogShell
            title={t('borrow_requests.dialogs.request_title')}
            subtitle={t('borrow_requests.dialogs.request_subtitle') || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.target_label')}
                    </label>
                    <input
                        type="text"
                        value={formData.recipient_identifier}
                        onChange={(event) => setFormData((prev) => ({ ...prev, recipient_identifier: event.target.value }))}
                        className="input-field"
                        placeholder={t('borrow_requests.dialogs.target_placeholder') || ''}
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.requested_item_label')}
                    </label>
                    <input
                        type="text"
                        value={formData.requested_item_label}
                        onChange={(event) => setFormData((prev) => ({ ...prev, requested_item_label: event.target.value }))}
                        className="input-field"
                        placeholder={t('borrow_requests.dialogs.requested_item_placeholder') || ''}
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.due_date')}
                    </label>
                    <input
                        type="date"
                        value={formData.due_date}
                        onChange={(event) => setFormData((prev) => ({ ...prev, due_date: event.target.value }))}
                        className="input-field"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('inventory.borrow.note')}
                    </label>
                    <textarea
                        value={formData.note}
                        onChange={(event) => setFormData((prev) => ({ ...prev, note: event.target.value }))}
                        className="input-field min-h-[110px] resize-none"
                        placeholder={t('borrow_requests.dialogs.request_note_placeholder') || ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting}>
                        {submitting ? t('borrow_requests.dialogs.request_submitting') : t('borrow_requests.actions.send_request')}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface FulfillBorrowRequestDialogProps {
    request: any;
    items?: Item[];
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function FulfillBorrowRequestDialog({
    request = null,
    items = EMPTY_OPTIONS,
    submitting = false,
    onClose,
    onSubmit
}: FulfillBorrowRequestDialogProps) {
    const { t } = useTranslation();
    const [itemId, setItemId] = useState('');
    const [dueDate, setDueDate] = useState('');

    useEffect(() => {
        setItemId(items[0]?.id ? String(items[0].id) : '');
        setDueDate('');
    }, [items, request]);

    if (!request) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({
                item_id: itemId,
                due_date: dueDate || undefined
            });
        } catch {
            // Parent already handles the error.
        }
    };

    return (
        <DialogShell
            title={t('borrow_requests.dialogs.fulfill_title')}
            subtitle={t('borrow_requests.dialogs.fulfill_subtitle', { item: request.requested_item_label }) || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="text-sm text-[var(--hi-text-soft)]">
                        {t('borrow_requests.dialogs.fulfill_target', { name: request.counterparty_display_name })}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.item_label')}
                    </label>
                    <select
                        value={itemId}
                        onChange={(event) => setItemId(event.target.value)}
                        className="input-field"
                        required
                    >
                        <option value="">{t('borrow_requests.dialogs.item_placeholder')}</option>
                        {items.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.category_icon} {entry.name}
                            </option>
                        ))}
                    </select>
                    {items.length === 0 && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                            {t('borrow_requests.dialogs.no_available_items')}
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.due_date_label', { defaultValue: 'Planlanan iade tarihi' })}
                    </label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        className="input-field"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting || items.length === 0}>
                        {submitting ? t('borrow_requests.dialogs.fulfill_submitting') : t('borrow_requests.actions.fulfill_request')}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface ReturnBorrowRecordDialogProps {
    borrow: any;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<any> | void;
}

export function ReturnBorrowRecordDialog({
    borrow = null,
    submitting = false,
    onClose,
    onSubmit
}: ReturnBorrowRecordDialogProps) {
    const { t } = useTranslation();
    const [returnNote, setReturnNote] = useState('');

    useEffect(() => {
        setReturnNote('');
    }, [borrow]);

    if (!borrow) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({ return_note: returnNote });
        } catch {
            // Parent already handles the error.
        }
    };

    const isBorrowerReturn = borrow.role === 'borrower';

    return (
        <DialogShell
            title={isBorrowerReturn
                ? t('borrow_requests.dialogs.return_title_borrower')
                : t('borrow_requests.dialogs.return_title_lender')}
            subtitle={isBorrowerReturn
                ? t('borrow_requests.dialogs.return_subtitle_borrower', { item: borrow.item?.name || '' }) || ''
                : t('borrow_requests.dialogs.return_subtitle_lender', { item: borrow.item?.name || '' }) || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="text-sm text-[var(--hi-text-soft)]">
                        {isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_target_borrower', { name: borrow.counterpart_display_name })
                            : t('borrow_requests.dialogs.return_target_lender', { name: borrow.counterpart_display_name })}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_note_borrower')
                            : t('borrow_requests.dialogs.return_note_lender')}
                    </label>
                    <textarea
                        value={returnNote}
                        onChange={(event) => setReturnNote(event.target.value)}
                        className="input-field min-h-[110px] resize-none"
                        placeholder={isBorrowerReturn
                            ? t('borrow_requests.dialogs.return_note_placeholder_borrower') || ''
                            : t('borrow_requests.dialogs.return_note_placeholder_lender') || ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60" disabled={submitting}>
                        {submitting
                            ? t('borrow_requests.dialogs.return_submitting')
                            : (
                                isBorrowerReturn
                                    ? t('borrow_requests.actions.mark_delivered')
                                    : t('borrow_requests.actions.mark_received')
                            )}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}

interface RejectBorrowRequestDialogProps {
    request: any;
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (payload: { reason: string }) => Promise<any> | void;
}

export function RejectBorrowRequestDialog({
    request = null,
    submitting = false,
    onClose,
    onSubmit
}: RejectBorrowRequestDialogProps) {
    const { t } = useTranslation();
    const [reason, setReason] = useState('rejected');

    useEffect(() => {
        setReason('rejected');
    }, [request]);

    if (!request) {
        return null;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await onSubmit({ reason });
        } catch {
            // Parent handles the error.
        }
    };

    return (
        <DialogShell
            title={t('borrow_requests.dialogs.reject_title', { defaultValue: 'İsteği Reddet' })}
            subtitle={t('borrow_requests.dialogs.reject_subtitle', {
                item: request.item?.name || request.requested_item_label || '',
                defaultValue: '"{{item}}" talebini reddetmek üzeresiniz.'
            }) || ''}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="text-sm text-[var(--hi-text-soft)]">
                        {t('borrow_requests.dialogs.reject_target', { name: request.counterparty_display_name, defaultValue: '{{name}} tarafından gönderilen ödünç talebini reddetmek üzeresiniz.' })}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {t('borrow_requests.dialogs.reject_reason_label', { defaultValue: 'Reddetme Nedeni' })}
                    </label>
                    <div className="space-y-2">
                        {[
                            { value: 'rejected', label: t('borrow_requests.reasons.rejected', { defaultValue: 'Reddet (Normal ret)' }) },
                            { value: 'not_available', label: t('borrow_requests.reasons.not_available', { defaultValue: 'Eşyam yok / uygun değil' }) },
                            { value: 'blocked', label: t('borrow_requests.reasons.blocked', { defaultValue: 'Engelle ve reddet (Kullanıcıyı engeller)' }) }
                        ].map((option) => (
                            <label
                                key={option.value}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition
                                    ${reason === option.value
                                        ? 'bg-[var(--hi-accent-soft)] border-[var(--hi-accent)] text-[var(--hi-accent)] font-semibold'
                                        : 'bg-[var(--hi-panel-strong)] border-[var(--hi-border)] hover:border-[var(--hi-border-strong)] text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="rejectReason"
                                    value={option.value}
                                    checked={reason === option.value}
                                    onChange={() => setReason(option.value)}
                                    className="accent-[var(--hi-accent)]"
                                />
                                <span className="text-sm font-medium">{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={submitting}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary px-5 py-3 disabled:opacity-60 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white animate-fade-in" disabled={submitting}>
                        {submitting ? t('borrow_requests.dialogs.reject_submitting', { defaultValue: 'Reddediliyor...' }) : t('borrow_requests.actions.reject', { defaultValue: 'Reddet' })}
                    </button>
                </div>
            </form>
        </DialogShell>
    );
}
