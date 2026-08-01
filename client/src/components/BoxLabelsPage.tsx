import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Box, Lock, Printer, QrCode } from 'lucide-react';
import { ASSET_VERSION, QR_LOGO_PATH } from '../constants/branding';
import { LoadingState } from './ProductUI';
import '../operations-v25.css';

const LABEL_LOGO_SRC = `${QR_LOGO_PATH}?v=${ASSET_VERSION}`;

export default function BoxLabelsPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [boxes, setBoxes] = useState<any[]>([]);
    const [qrMarkupById, setQrMarkupById] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const selectedBoxId = searchParams.get('box_id');

    useEffect(() => {
        let active = true;
        axios.get('/api/boxes')
            .then((response) => {
                if (active) setBoxes(response.data.boxes || []);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    const labels = useMemo(() => selectedBoxId
        ? boxes.filter((box) => String(box.id) === selectedBoxId)
        : boxes, [boxes, selectedBoxId]);
    const singleLabelPrint = Boolean(selectedBoxId && labels.length === 1);

    useEffect(() => {
        let active = true;
        const render = async () => {
            const { generateQrMarkup } = await import('../utils/itemQrRuntime');
            const next: Record<number, string> = {};
            for (let index = 0; index < labels.length; index += 1) {
                if (!active) return;
                const box = labels[index];
                next[box.id] = generateQrMarkup(new URL(`/boxes/${box.id}`, window.location.origin).toString(), {
                    width: 154,
                    logoDataUrl: LABEL_LOGO_SRC
                });
                if ((index + 1) % 24 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            }
            if (active) setQrMarkupById(next);
        };
        render();
        return () => { active = false; };
    }, [labels]);

    if (loading) return <LoadingState title={t('boxes.loading')} />;

    return (
        <div className="operations-page-v25 operations-label-page-v25 animate-fade-in print:bg-white print:text-black">
            {singleLabelPrint && (
                <style>{'@media print { @page { size: 90mm 50mm; margin: 0; } }'}</style>
            )}
            <header className="operations-intro-v25 print:hidden">
                <div className="operations-intro-copy-v25">
                    <span className="operations-hero-icon-v25 is-info" aria-hidden="true"><QrCode /></span>
                    <div>
                        <nav className="operations-breadcrumb-v25" aria-label="Breadcrumb"><Link to="/organize/boxes">{t('navigation.boxes')}</Link></nav>
                        <h1>{t('box_labels.title')}</h1>
                        <p>{t('box_labels.description', { count: labels.length })}</p>
                    </div>
                </div>
                <div className="operations-intro-actions-v25">
                    <button type="button" onClick={() => window.print()} className="btn-primary">
                        <Printer className="h-4 w-4" /> {t('common.print')}
                    </button>
                </div>
            </header>

            {labels.length === 0 ? (
                <section className="operations-workspace-v25 print:hidden">
                    <div className="operations-inline-empty-v25">
                        <span className="operations-empty-icon-v25"><Box /></span>
                        <div>
                            <h2>{t('box_labels.empty_title')}</h2>
                            <p>{t('box_labels.empty_body')}</p>
                        </div>
                        <Link to="/organize/boxes" className="btn-secondary">{t('navigation.boxes')}</Link>
                    </div>
                </section>
            ) : (
                <section className="operations-workspace-v25 operations-label-preview-v25">
                    <article className={`label-print-page box-label-print-page-v26 ${singleLabelPrint ? 'is-single-label-v26' : ''}`}>
                        <header className="label-sheet-header operations-sheet-toolbar-v25 print:hidden">
                            <div className="flex items-center gap-3">
                                <img src={LABEL_LOGO_SRC} alt="" className="h-11 w-11 object-contain" />
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('box_labels.sheet_label')}</p>
                                    <h2 className="mt-1 text-xl font-bold">{t('box_labels.title')}</h2>
                                    <p className="label-sheet-hint">{t('box_labels.scan_hint')}</p>
                                </div>
                            </div>
                            <p className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('common.record_count', { count: labels.length })}</p>
                        </header>
                        <section className="label-print-grid box-label-print-grid-v26">
                            {labels.map((box) => {
                                const privateBox = box.is_public !== undefined && !Boolean(box.is_public);
                                const place = [box.room_name, box.location_name].filter(Boolean).join(' / ') || t('boxes.location_unknown');
                                return (
                                    <article key={box.id} className="label-cut-card box-label-cut-card-v26">
                                        <div className="label-cut-header">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <img src={LABEL_LOGO_SRC} alt="" className="h-6 w-6 shrink-0 object-contain" />
                                                <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{t('box_labels.box_label')}</span>
                                            </div>
                                            <span className="rounded-full border border-slate-300 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">{box.code}</span>
                                        </div>
                                        <div className="label-cut-body">
                                            <div className="label-qr-box" dangerouslySetInnerHTML={{ __html: qrMarkupById[box.id] || '' }} />
                                            <div className="min-w-0">
                                                <h3 className="label-title">{privateBox ? t('box_labels.private_box') : box.name}</h3>
                                                {privateBox ? (
                                                    <p className="label-pill"><Lock className="h-3 w-3" /> {t('box_labels.private_box_hint')}</p>
                                                ) : (
                                                    <>
                                                        <p className="label-subtitle">{place}</p>
                                                        <p className="label-pill"><Box className="h-3 w-3" /> {t('boxes.item_count', { count: box.total_item_count || 0 })}</p>
                                                    </>
                                                )}
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
