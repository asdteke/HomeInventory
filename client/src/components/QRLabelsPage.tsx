import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Package, Printer, QrCode, Tags } from 'lucide-react';
import { LoadingState } from './ProductUI';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getCategoryPresentation } from '../utils/categoryDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';
import { ASSET_VERSION, QR_LOGO_PATH } from '../constants/branding';
import '../operations-v25.css';

const LABEL_LOGO_SRC = `${QR_LOGO_PATH}?v=${ASSET_VERSION}`;

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
            for (let index = 0; index < items.length; index += 1) {
                if (!mounted) return;
                const item = items[index];
                next[item.id] = generateItemQrMarkup(new URL(`/items/${item.id}/edit`, origin).toString(), {
                    width: 154,
                    logoDataUrl: LABEL_LOGO_SRC
                });
                if ((index + 1) % 24 === 0) {
                    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
                }
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
        <div className="operations-page-v25 operations-label-page-v25 animate-fade-in print:bg-white print:text-black">
            <header className="operations-intro-v25 print:hidden">
                <div className="operations-intro-copy-v25">
                    <span className="operations-hero-icon-v25 is-info" aria-hidden="true"><QrCode /></span>
                    <div>
                        <nav className="operations-breadcrumb-v25" aria-label="Breadcrumb">
                            <Link to="/items">{t('navigation.inventory')}</Link>
                        </nav>
                        <h1>{t('inventory.qr_labels.title', { defaultValue: 'QR Etiketleri' })}</h1>
                        <p>{t('inventory.qr_labels.description', { count: items.length, defaultValue: '{{count}} eşya etiketi düzenli çıktı sayfası olarak hazır.' })}</p>
                    </div>
                </div>
                <div className="operations-intro-actions-v25">
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
                </div>
            </header>

            {items.length === 0 ? (
                <section className="operations-workspace-v25 print:hidden">
                    <div className="operations-inline-empty-v25">
                        <span className="operations-empty-icon-v25"><QrCode /></span>
                        <div>
                            <h2>{t('inventory.empty_filter_title', { defaultValue: 'Aramanıza uygun eşya bulunamadı' })}</h2>
                            <p>{t('inventory.qr_labels.empty', { defaultValue: 'Etiket basmak için filtreleri değiştirin veya envantere eşya ekleyin.' })}</p>
                        </div>
                        <Link to="/items" className="btn-secondary">{t('navigation.inventory')}</Link>
                    </div>
                </section>
            ) : (
                <section className="operations-workspace-v25 operations-label-preview-v25">
                    <article className="label-print-page">
                    <header className="label-sheet-header operations-sheet-toolbar-v25 print:hidden">
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
                </section>
            )}
        </div>
    );
}
