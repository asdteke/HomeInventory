export function normalizeOptionalCurrency(value, amountValue = null) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!amountValue) {
        return null;
    }

    if (!normalized) {
        return 'TRY';
    }

    if (!/^[A-Z0-9]{2,10}$/.test(normalized)) {
        throw new Error('Para birimi geçersiz');
    }

    return normalized;
}
