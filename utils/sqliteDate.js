function padNumber(value) {
    return String(value).padStart(2, '0');
}

export function toSqliteUtcTimestamp(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date value for SQLite timestamp conversion.');
    }

    return [
        `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}-${padNumber(date.getUTCDate())}`,
        `${padNumber(date.getUTCHours())}:${padNumber(date.getUTCMinutes())}:${padNumber(date.getUTCSeconds())}`
    ].join(' ');
}

export function parseSqliteUtcTimestamp(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    const utcCandidate = normalized.includes('T')
        ? normalized
        : `${normalized.replace(' ', 'T')}Z`;
    const date = new Date(utcCandidate);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.getTime();
}
