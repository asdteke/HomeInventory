function parseBorrowDate(value, endOfDay = false) {
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

export function formatBorrowDate(value, locale = 'tr') {
    const parsed = parseBorrowDate(value);
    if (!parsed) {
        return '';
    }

    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
}

export function formatBorrowDateTime(value, locale = 'tr') {
    const parsed = parseBorrowDate(value);
    if (!parsed) {
        return '';
    }

    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(parsed);
}

export function isBorrowOverdue(borrow) {
    const dueDate = parseBorrowDate(borrow?.due_date, true);
    return Boolean(dueDate && !borrow?.returned_at && dueDate.getTime() < Date.now());
}
