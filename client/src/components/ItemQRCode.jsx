import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Tooltip from './Tooltip';
import FloatingToast from './FloatingToast';
import { copyTextToClipboard } from '../utils/clipboard';
import { SITE_URL } from '../constants/branding';

const QR_LOGO_ASSET = '/brand/logo-symbol-light.png';

function slugifyFilePart(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function isLocalhostLike(value) {
    if (!value) {
        return true;
    }

    try {
        const hostname = new URL(value).hostname;
        return hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname === '::1'
            || hostname.endsWith('.localhost');
    } catch {
        return true;
    }
}

function getPreferredPublicOrigin() {
    if (typeof window !== 'undefined' && window.location?.origin && !isLocalhostLike(window.location.origin)) {
        return window.location.origin;
    }

    if (!isLocalhostLike(SITE_URL)) {
        return SITE_URL;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    return SITE_URL;
}

function formatItemLinkPreview(value) {
    if (!value) {
        return '';
    }

    try {
        const url = new URL(value);
        return `${url.pathname}${url.search}${url.hash}` || '/';
    } catch {
        return value;
    }
}

export default function ItemQRCode({ itemId, size = 280 }) {
    const { t } = useTranslation();
    const qrRuntimePromiseRef = useRef(null);
    const linkPreviewRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [copyFallbackVisible, setCopyFallbackVisible] = useState(false);
    const [toast, setToast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [qrError, setQrError] = useState('');
    const [qrMarkup, setQrMarkup] = useState('');
    const [logoDataUrl, setLogoDataUrl] = useState('');
    const [publicOrigin, setPublicOrigin] = useState(() => getPreferredPublicOrigin());
    const qrRenderSize = useMemo(() => Math.min(Math.max(size + 70, 330), 380), [size]);
    const qrDisplaySize = useMemo(() => Math.min(Math.max(size - 24, 220), 252), [size]);
    const itemUrl = useMemo(() => {
        if (!itemId || !publicOrigin) {
            return '';
        }

        return new URL(`/items/${itemId}/edit`, publicOrigin).toString();
    }, [itemId, publicOrigin]);
    const itemUrlPreview = useMemo(() => formatItemLinkPreview(itemUrl), [itemUrl]);

    useEffect(() => {
        let cancelled = false;

        if (typeof window === 'undefined') {
            return undefined;
        }

        const loadLogo = async () => {
            try {
                const response = await fetch(QR_LOGO_ASSET);
                if (!response.ok) {
                    throw new Error(`QR logo asset returned ${response.status}`);
                }
                const blob = await response.blob();

                if (cancelled) {
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    if (!cancelled && typeof reader.result === 'string') {
                        setLogoDataUrl(reader.result);
                    }
                };
                reader.readAsDataURL(blob);
            } catch (error) {
                console.error('Logo asset could not be loaded for QR badge:', error);
            }
        };

        loadLogo();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const resolveReachableOrigin = async () => {
            const preferredOrigin = getPreferredPublicOrigin();
            setPublicOrigin(preferredOrigin);

            if (!isLocalhostLike(preferredOrigin)) {
                return;
            }

            try {
                const response = await fetch('/api/server-info');
                if (!response.ok) {
                    return;
                }

                const payload = await response.json();
                const reachableOrigin = String(payload?.frontendUrl || '').trim();

                if (!cancelled && reachableOrigin && !isLocalhostLike(reachableOrigin)) {
                    setPublicOrigin(reachableOrigin);
                }
            } catch (error) {
                console.error('Public QR origin could not be resolved from server info:', error);
            }
        };

        resolveReachableOrigin();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const renderQrCode = async () => {
            if (!itemUrl) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setQrError('');
            setQrMarkup('');

            try {
                if (!qrRuntimePromiseRef.current) {
                    qrRuntimePromiseRef.current = import('../utils/itemQrRuntime');
                }

                const { generateItemQrMarkup } = await qrRuntimePromiseRef.current;
                const markup = generateItemQrMarkup(itemUrl, {
                    width: qrRenderSize,
                    logoDataUrl
                });

                if (!cancelled) {
                    setQrMarkup(markup);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('QR Code error:', error);
                    setQrError(t('item_qr.render_error', { defaultValue: 'The QR code could not be generated right now.' }));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        renderQrCode();

        return () => {
            cancelled = true;
        };
    }, [itemUrl, logoDataUrl, qrRenderSize, t]);

    const handleCopyUrl = async () => {
        try {
            await copyTextToClipboard(itemUrl);
            setCopied(true);
            setCopyFallbackVisible(false);
            window.setTimeout(() => setCopied(false), 2000);
            setToast({
                title: t('item_qr.copy_success_title', { defaultValue: 'QR link copied' }),
                description: t('item_qr.copy_success_body', { defaultValue: 'The item edit link is ready to share when you need it.' })
            });
        } catch {
            setCopied(false);
            setCopyFallbackVisible(true);
            window.setTimeout(() => {
                linkPreviewRef.current?.focus();
                const selection = window.getSelection?.();
                if (!selection || !linkPreviewRef.current) {
                    return;
                }
                const range = document.createRange();
                range.selectNodeContents(linkPreviewRef.current);
                selection.removeAllRanges();
                selection.addRange(range);
            }, 0);
            setToast({
                tone: 'danger',
                title: t('item_qr.copy_error_title', { defaultValue: 'Bağlantı otomatik kopyalanamadı' }),
                description: t('item_qr.copy_error', { defaultValue: 'Bağlantıyı elle kopyalayabilirsiniz.' })
            });
        }
    };

    const handleDownloadQr = () => {
        if (!qrMarkup) {
            return;
        }

        const link = document.createElement('a');
        const safeSlug = slugifyFilePart(itemId) || 'item';
        const blob = new Blob([qrMarkup], { type: 'image/svg+xml;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        link.download = `${safeSlug}-${itemId}.svg`;
        link.href = blobUrl;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);

        setToast({
            title: t('item_qr.download_success_title', { defaultValue: 'QR downloaded' }),
            description: t('item_qr.download_success_body', { defaultValue: 'The QR image was saved with a share-friendly filename.' })
        });
    };

    if (!itemId) return null;

    return (
        <div className="border-t border-[var(--hi-border)] pt-4">
            <div className="grid gap-4 md:grid-cols-[minmax(180px,228px)_minmax(0,1fr)] md:items-center">
                <div className="mx-auto w-full max-w-[228px]">
                    <div className="rounded-[1.2rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-3 shadow-[var(--hi-shadow-soft)]">
                        <div
                            className="group relative mx-auto aspect-square w-full transition duration-300 hover:-translate-y-0.5"
                            style={{ maxWidth: `${qrDisplaySize}px` }}
                        >
                            {!loading && !qrError && qrMarkup ? (
                                <div
                                    className="w-full max-w-full drop-shadow-[0_16px_36px_rgba(28,41,32,0.1)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                                    dangerouslySetInnerHTML={{ __html: qrMarkup }}
                                />
                            ) : null}

                            {!loading && !qrError ? null : (
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 rounded-[1.6rem] bg-white shadow-[0_16px_36px_rgba(28,41,32,0.1)]"
                                />
                            )}

                            {loading ? (
                                <div className="absolute inset-0 z-10 flex items-center justify-center">
                                    <RefreshCw className="h-8 w-8 animate-spin text-[var(--hi-accent)]" />
                                </div>
                            ) : qrError ? (
                                <p className="absolute inset-0 z-10 flex items-center justify-center px-5 text-center text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {qrError}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="min-w-0 space-y-2.5">
                    <div className="grid gap-2 sm:max-w-[216px]">
                        <Tooltip label={t('item_qr.copy_url_safe', { defaultValue: 'Copy link' })} className="w-full">
                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                aria-label={t('item_qr.copy_url_aria', { defaultValue: 'Copy item link' })}
                                disabled={!itemUrl || loading || Boolean(qrError)}
                                className="btn-secondary min-h-[44px] w-full justify-center rounded-[1rem] py-2.5"
                            >
                                {copied ? <Check className="h-4 w-4 text-[var(--hi-accent)]" /> : <Copy className="h-4 w-4" />}
                                {copied ? t('item_qr.copied') : t('item_qr.copy_url_safe', { defaultValue: 'Copy link' })}
                            </button>
                        </Tooltip>

                        <Tooltip label={t('item_qr.download', { defaultValue: 'Download QR' })} className="w-full">
                            <button
                                type="button"
                                onClick={handleDownloadQr}
                                aria-label={t('item_qr.download_aria', { defaultValue: 'Download QR code' })}
                                disabled={loading || Boolean(qrError)}
                                className="btn-primary min-h-[44px] w-full justify-center rounded-[1rem] py-2.5"
                            >
                                <Download className="h-4 w-4" />
                                {t('item_qr.download')}
                            </button>
                        </Tooltip>
                    </div>

                    <div className="max-w-[24rem] rounded-[0.9rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                            {t('item_qr.link_preview_label', { defaultValue: 'Direct item link' })}
                        </p>
                        <div
                            ref={linkPreviewRef}
                            role="textbox"
                            tabIndex={0}
                            aria-readonly="true"
                            aria-label={t('item_qr.link_preview_aria', { defaultValue: 'Preview of the direct item link' })}
                            title={itemUrl}
                            className="mt-1 truncate rounded-[0.72rem] bg-[var(--hi-bg-strong)] px-2.5 py-1.5 font-mono text-[11px] leading-5 text-[var(--hi-text-soft)] outline-none focus-visible:ring-2 focus-visible:ring-[rgba(45,82,65,0.18)]"
                        >
                            {(copyFallbackVisible ? itemUrl : itemUrlPreview) || t('item_qr.url_loading', { defaultValue: 'Loading URL...' })}
                        </div>
                    </div>

                    {copyFallbackVisible && (
                        <p className="max-w-[24rem] rounded-[0.8rem] border border-[var(--hi-secondary)] bg-[var(--hi-secondary-soft)] px-3 py-2 text-xs leading-5 text-[var(--hi-text)]">
                            {t('item_qr.copy_manual_help', { defaultValue: 'Tarayıcı otomatik kopyalamaya izin vermedi. Bağlantı seçildi; elle kopyalayabilirsiniz.' })}
                        </p>
                    )}

                    <p className="max-w-[28rem] text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('item_qr.helper', { defaultValue: 'Scan to open this item instantly, or copy the direct link when needed.' })}
                    </p>
                </div>
            </div>

            <FloatingToast
                open={Boolean(toast)}
                title={toast?.title}
                description={toast?.description}
                tone={toast?.tone}
                onClose={() => setToast(null)}
            />
        </div>
    );
}
