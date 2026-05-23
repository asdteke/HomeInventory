export interface ItemLike {
    name?: string | number | null;
    item_name?: string | number | null;
    title?: string | number | null;
    label?: string | number | null;
    [key: string]: any;
}

export function resolveVisibleItemTitle(item: ItemLike | null | undefined, fallbackLabel: string): string {
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
