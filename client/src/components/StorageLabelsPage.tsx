import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, MapPin, Printer, QrCode } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader } from './ProductUI';
import { getRoomPresentation } from '../utils/roomDisplay';

const LABEL_LOGO_SRC = '/brand/logo-symbol-light.svg';

function buildInventoryUrl(origin: string, params: Record<string, string | number | null | undefined>) {
    const url = new URL('/items', origin);
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

export default function StorageLabelsPage() {
    const { t, i18n } = useTranslation();
    const language = i18n.resolvedLanguage || i18n.language;
    const [rooms, setRooms] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [qrMarkupByKey, setQrMarkupByKey] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const [roomsResponse, locationsResponse] = await Promise.all([
                    axios.get('/api/rooms'),
                    axios.get('/api/locations')
                ]);
                if (mounted) {
                    setRooms(roomsResponse.data.rooms || []);
                    setLocations(locationsResponse.data.locations || []);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, []);

    const labels = useMemo(() => ([
        ...rooms.map((room) => ({
            key: `room-${room.id}`,
            type: 'room',
            title: getRoomPresentation(room, language).name,
            subtitle: t('storage_labels.room', { defaultValue: 'Oda' }),
            target: buildInventoryUrl(window.location.origin, { room_id: room.id })
        })),
        ...locations.map((location) => ({
            key: `location-${location.id}`,
            type: 'location',
            title: location.name,
            subtitle: location.room_name
                ? getRoomPresentation({ name: location.room_name }, language).name
                : t('inventory.no_room', { defaultValue: 'Odasız' }),
            target: buildInventoryUrl(window.location.origin, {
                room_id: location.room_id,
                location_id: location.id
            })
        }))
    ]), [language, locations, rooms, t]);

    useEffect(() => {
        let mounted = true;
        const renderCodes = async () => {
            const { generateItemQrMarkup } = await import('../utils/itemQrRuntime');
            const next: Record<string, string> = {};
            for (const label of labels) {
                next[label.key] = generateItemQrMarkup(label.target, {
                    width: 154,
                    logoDataUrl: LABEL_LOGO_SRC
                });
            }
            if (mounted) {
                setQrMarkupByKey(next);
            }
        };

        if (labels.length) {
            renderCodes();
        } else {
            setQrMarkupByKey({});
        }

        return () => {
            mounted = false;
        };
    }, [labels]);

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    return (
        <div className="space-y-5 print:bg-white print:text-black">
            <PageHeader
                className="print:hidden"
                breadcrumbs={[{ label: t('navigation.inventory'), to: '/items' }]}
                title={t('storage_labels.title', { defaultValue: 'Raf ve Oda Etiketleri' })}
                description={t('storage_labels.description', {
                    count: labels.length,
                    defaultValue: '{{count}} oda/raf etiketi düzenli çıktı sayfası olarak hazır.'
                })}
                actions={(
                    <button type="button" onClick={() => window.print()} className="btn-primary print:hidden">
                        <Printer className="h-4 w-4" />
                        <span>{t('common.print', { defaultValue: 'Yazdır' })}</span>
                    </button>
                )}
            />

            {labels.length === 0 ? (
                <EmptyState
                    icon={QrCode}
                    title={t('storage_labels.empty_title', { defaultValue: 'Etiket üretilecek oda veya raf yok' })}
                    description={t('storage_labels.empty_desc', { defaultValue: 'Önce oda veya konum ekleyin, sonra buradan QR etiket basın.' })}
                    actions={<Link to="/rooms" className="btn-secondary">{t('navigation.rooms')}</Link>}
                />
            ) : (
                <article className="label-print-page">
                    <header className="label-sheet-header print:hidden">
                        <div className="flex items-center gap-3">
                            <img src={LABEL_LOGO_SRC} alt="" className="h-11 w-11 object-contain" />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {t('storage_labels.sheet_label', { defaultValue: 'Yerleşim Etiket Sayfası' })}
                                </p>
                                <h2 className="mt-1 text-xl font-bold">{t('storage_labels.title', { defaultValue: 'Raf ve Oda Etiketleri' })}</h2>
                                <p className="label-sheet-hint">
                                    {t('storage_labels.scan_hint', { defaultValue: 'QR kodu taranınca ilgili oda veya rafın filtrelenmiş envanteri açılır.' })}
                                </p>
                            </div>
                        </div>
                        <p className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {t('common.record_count', { count: labels.length, defaultValue: '{{count}} kayıt' })}
                        </p>
                    </header>

                    <section className="label-print-grid">
                        {labels.map((label) => {
                            const Icon = label.type === 'room' ? FolderOpen : MapPin;
                            const typeLabel = label.type === 'room'
                                ? t('storage_labels.room', { defaultValue: 'Oda' })
                                : t('storage_labels.location', { defaultValue: 'Raf/Kutu' });
                            return (
                                <article key={label.key} className="label-cut-card">
                                    <div className="label-cut-header">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <img src={LABEL_LOGO_SRC} alt="" className="h-6 w-6 shrink-0 object-contain" />
                                            <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                                {typeLabel}
                                            </span>
                                        </div>
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                                            <Icon className="h-3.5 w-3.5" />
                                        </span>
                                    </div>
                                    <div className="label-cut-body">
                                        <div
                                            className="label-qr-box"
                                            dangerouslySetInnerHTML={{ __html: qrMarkupByKey[label.key] || '' }}
                                        />
                                        <div className="min-w-0">
                                            <h3 className="label-title">{label.title}</h3>
                                            <p className="label-subtitle">{label.subtitle}</p>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                </article>
            )}
        </div>
    );
}
