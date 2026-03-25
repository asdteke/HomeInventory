function buildValidatedIsoDate(yearValue, monthValue, dayValue) {
    const year = String(yearValue || '').padStart(4, '0');
    const month = String(monthValue || '').padStart(2, '0');
    const day = String(dayValue || '').padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return '';
    }

    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
        return '';
    }

    return isoDate;
}

export function normalizeOptionalDate(value, fieldLabel) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    let match = normalized.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (match) {
        const isoDate = buildValidatedIsoDate(match[1], match[2], match[3]);
        if (isoDate) {
            return isoDate;
        }
        throw new Error(`${fieldLabel} geçersiz`);
    }

    match = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
        const isoDate = buildValidatedIsoDate(match[3], match[2], match[1]);
        if (isoDate) {
            return isoDate;
        }
        throw new Error(`${fieldLabel} geçersiz`);
    }

    throw new Error(`${fieldLabel} geçersiz`);
}

export { buildValidatedIsoDate };
