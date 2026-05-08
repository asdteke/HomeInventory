export function resolveVisibleItemTitle(item, fallbackLabel) {
    const candidates = [
        item?.name,
        item?.item_name,
        item?.title,
        item?.label
    ];

    for (const candidate of candidates) {
        const normalized = typeof candidate === 'string' || typeof candidate === 'number'
            ? String(candidate).trim()
            : '';

        if (!normalized) {
            continue;
        }

        if (/^\d+$/.test(normalized)) {
            continue;
        }

        return normalized;
    }

    return fallbackLabel;
}
