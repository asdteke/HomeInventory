import { buildValidatedIsoDate, normalizeOptionalDate } from './dateValidation.js';

const WARRANTY_DURATION_UNITS = new Set(['months', 'years']);

function parseIsoDateParts(isoDate) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
}

function getLastDayOfMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(isoDate, monthDelta) {
    const parts = parseIsoDateParts(isoDate);
    if (!parts) {
        return null;
    }

    const baseMonthIndex = (parts.year * 12) + (parts.month - 1);
    const targetMonthIndex = baseMonthIndex + monthDelta;
    const targetYear = Math.floor(targetMonthIndex / 12);
    const targetMonth = (targetMonthIndex % 12) + 1;
    const targetDay = Math.min(parts.day, getLastDayOfMonth(targetYear, targetMonth));

    return buildValidatedIsoDate(targetYear, targetMonth, targetDay);
}

export function normalizeOptionalWarrantyDurationValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    if (!/^\d{1,4}$/.test(normalized)) {
        throw new Error('Garanti süresi geçersiz');
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1200) {
        throw new Error('Garanti süresi geçersiz');
    }

    return parsed;
}

export function normalizeOptionalWarrantyDurationUnit(value, durationValue = null) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!durationValue) {
        return null;
    }

    if (!normalized) {
        throw new Error('Garanti süresi birimi gerekli');
    }

    if (!WARRANTY_DURATION_UNITS.has(normalized)) {
        throw new Error('Garanti süresi birimi geçersiz');
    }

    return normalized;
}

export function calculateWarrantyExpiryDate(startDate, durationValue, durationUnit) {
    const normalizedStartDate = normalizeOptionalDate(startDate, 'Garanti başlangıç tarihi');
    const normalizedDurationValue = normalizeOptionalWarrantyDurationValue(durationValue);
    const normalizedDurationUnit = normalizeOptionalWarrantyDurationUnit(durationUnit, normalizedDurationValue);

    if (!normalizedStartDate || !normalizedDurationValue || !normalizedDurationUnit) {
        return null;
    }

    const monthDelta = normalizedDurationUnit === 'years'
        ? normalizedDurationValue * 12
        : normalizedDurationValue;

    return addMonthsClamped(normalizedStartDate, monthDelta);
}

export function normalizeWarrantyDetails({
    invoice_date,
    warranty_start_date,
    warranty_duration_value,
    warranty_duration_unit,
    warranty_expiry_date
}) {
    const hasExplicitWarrantyStartDate = String(warranty_start_date || '').trim() !== '';
    const hasWarrantyDurationInput = [
        warranty_duration_value,
        warranty_duration_unit
    ].some((value) => String(value || '').trim() !== '');
    const hasCalculatedWarrantyInput = [
        hasExplicitWarrantyStartDate,
        hasWarrantyDurationInput
    ].some(Boolean);

    if (!hasCalculatedWarrantyInput) {
        return {
            warranty_start_date: null,
            warranty_duration_value: null,
            warranty_duration_unit: null,
            warranty_expiry_date: normalizeOptionalDate(warranty_expiry_date, 'Garanti bitiş tarihi')
        };
    }

    const normalizedStartDate = normalizeOptionalDate(
        hasExplicitWarrantyStartDate ? warranty_start_date : invoice_date,
        'Garanti başlangıç tarihi'
    );
    if (!normalizedStartDate) {
        throw new Error('Garanti başlangıç tarihi gerekli');
    }

    const normalizedDurationValue = normalizeOptionalWarrantyDurationValue(warranty_duration_value);
    if (!normalizedDurationValue) {
        throw new Error('Garanti süresi gerekli');
    }

    const normalizedDurationUnit = normalizeOptionalWarrantyDurationUnit(
        warranty_duration_unit,
        normalizedDurationValue
    );

    return {
        warranty_start_date: normalizedStartDate,
        warranty_duration_value: String(normalizedDurationValue),
        warranty_duration_unit: normalizedDurationUnit,
        warranty_expiry_date: calculateWarrantyExpiryDate(
            normalizedStartDate,
            normalizedDurationValue,
            normalizedDurationUnit
        )
    };
}
