import { formatDateForLanguage } from './appFormatting';

interface BorrowLike {
    due_date?: string | Date | null;
    returned_at?: string | Date | null;
}

function parseBorrowDate(value: any, endOfDay = false): Date | null {
    if (!value) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        const timePart = endOfDay ? 'T23:59:59' : 'T00:00:00';
        const date = new Date(`${value}${timePart}`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBorrowDate(value: any, locale = 'tr'): string {
    const parsed = parseBorrowDate(value);
    if (!parsed) {
        return '';
    }

    return formatDateForLanguage(parsed, locale, { dateStyle: 'medium' });
}

export function formatBorrowDateTime(value: any, locale = 'tr'): string {
    const parsed = parseBorrowDate(value);
    if (!parsed) {
        return '';
    }

    return formatDateForLanguage(parsed, locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }, { fallback: 'datetime' });
}

export function isBorrowOverdue(borrow: BorrowLike | null | undefined): boolean {
    const dueDate = parseBorrowDate(borrow?.due_date, true);
    return Boolean(dueDate && !borrow?.returned_at && dueDate.getTime() < Date.now());
}
