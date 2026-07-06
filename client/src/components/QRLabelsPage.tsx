import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, Printer, QrCode, Tags } from 'lucide-react';
import { PageHeader, LoadingState, EmptyState } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getCategoryPresentation } from '../utils/categoryDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';

const LABEL_LOGO_SRC = '/brand/logo-symbol-light.svg';

export default function QRLabelsPage() {
    const { t, i18n } = useTranslation();
    const [searchParams] = useSearchParams();
    const [items, setItems] = useState<any[]>([]);
    const [qrMarkupById, setQrMarkupById] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const queryString = searchParams.toString();
    const language = i18n.resolvedLanguage || i18n.language;

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get(queryString ? `/api/items?${queryString}` : '/api/items');
                if (mounted) {
                    setItems(response.data.items || []);
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
    }, [queryString]);

    useEffect(() => {
        let mounted = true;
        const renderCodes = async () => {
            const { generateItemQrMarkup } = await import('../utils/itemQrRuntime');
            const origin = window.location.origin;
            const next: Record<number, string> = {};
            for (const item of items) {
                next[item.id] = generateItemQrMarkup(new URL(`/items/${item.id}/edit`, origin).toString(), {
                    width: 154,
                    logoDataUrl: LABEL_LOGO_SRC
                });
            }
            if (mounted) {
                setQrMarkupById(next);
            }
        };

        if (items.length) {
            renderCodes();
        } else {
            setQrMarkupById({});
        }

        return () => {
            mounted = false;
        };
    }, [items]);

    if (loading) {
        return <LoadingState title={t('common.loading')} />;
    }

    return (
        <div className="space-y-5 print:bg-white print:text-black">
            <PageHeader
                className="print:hidden"
                breadcrumbs={[{ label: t('navigation.inventory'), to: '/items' }]}
                title={t('inventory.qr_labels.title', { defaultValue: 'QR Etiketleri' })}
                description={t('inventory.qr_labels.description', { count: items.length, defaultValue: '{{count}} eşya etiketi düzenli çıktı sayfası olarak hazır.' })}
                actions={(
                    <div className="flex flex-wrap gap-2 print:hidden">
                        <Link to="/storage-labels" className="btn-secondary">
                            <Tags className="h-4 w-4" />
                            <span>{t('storage_labels.title', { defaultValue: 'Raf ve Oda Etiketleri' })}</span>
                        </Link>
                        <button type="button" onClick={() => window.print()} className="btn-primary">
                            <Printer className="h-4 w-4" />
                            <span>{t('common.print', { defaultValue: 'Yazdır' })}</span>
                        </button>
                    </div>
                )}
            />

            {items.length === 0 ? (
                <EmptyState
                    icon={QrCode}
                    title={t('inventory.empty_filter_title', { defaultValue: 'Aramanıza uygun eşya bulunamadı' })}
                    description={t('inventory.qr_labels.empty', { defaultValue: 'Etiket basmak için filtreleri değiştirin veya envantere eşya ekleyin.' })}
                    actions={<Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>}
                />
            ) : (
                <article className="label-print-page">
                    <header className="label-sheet-header print:hidden">
                        <div className="flex items-center gap-3">
                            <img src={LABEL_LOGO_SRC} alt="" className="h-11 w-11 object-contain" />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {t('inventory.qr_labels.sheet_label', { defaultValue: 'Eşya Etiket Sayfası' })}
                                </p>
                                <h2 className="mt-1 text-xl font-bold">{t('inventory.qr_labels.title', { defaultValue: 'QR Etiketleri' })}</h2>
                            </div>
                        </div>
                        <p className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {t('common.record_count', { count: items.length, defaultValue: '{{count}} kayıt' })}
                        </p>
                    </header>

                    <section className="label-print-grid">
                        {items.map((item) => {
                            const title = resolveVisibleItemTitle(item, t('inventory.untitled_item'));
                            const roomName = item.room_name
                                ? getRoomPresentation({ name: item.room_name }, language).name
                                : '';
                            const categoryName = item.category_name
                                ? getCategoryPresentation({ name: item.category_name }, language).name
                                : '';
                            const place = [roomName, item.location_name].filter(Boolean).join(' / ')
                                || t('inventory.no_room', { defaultValue: 'Odasız' });
                            return (
                                <article key={item.id} className="label-cut-card">
                                    <div className="label-cut-header">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <img src={LABEL_LOGO_SRC} alt="" className="h-6 w-6 shrink-0 object-contain" />
                                            <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                                {t('inventory.qr_labels.item_label', { defaultValue: 'Eşya Etiketi' })}
                                            </span>
                                        </div>
                                        <span className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                            #{item.id}
                                        </span>
                                    </div>
                                    <div className="label-cut-body">
                                        <div
                                            className="label-qr-box"
                                            dangerouslySetInnerHTML={{ __html: qrMarkupById[item.id] || '' }}
                                        />
                                        <div className="min-w-0">
                                            <h3 className="label-title">{title}</h3>
                                            <p className="label-subtitle">{place}</p>
                                            <p className="label-pill">
                                                <Package className="h-3 w-3" />
                                                {categoryName || t('items.form.category', { defaultValue: 'Kategori' })}
                                            </p>
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
