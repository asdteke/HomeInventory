import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SecureImage from './SecureImage';

interface FullscreenImageProps {
    src: string;
    alt: string;
    secure?: boolean;
    children: React.ReactNode;
    className?: string;
}

export default function FullscreenImage({
    src,
    alt,
    secure = false,
    children,
    className = ''
}: FullscreenImageProps) {
    const { t } = useTranslation();
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const openLabel = t('vault.photo.open_full_action', { defaultValue: 'Open full size' });

    const close = () => {
        setOpen(false);
        setZoom(1);
    };

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    useEffect(() => {
        close();
    }, [src]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`group/fullscreen relative block cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] ${className}`}
                aria-label={openLabel}
                title={openLabel}
            >
                {children}
                <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-black/55 text-white opacity-90 shadow-lg backdrop-blur-sm transition group-hover/fullscreen:scale-105 group-hover/fullscreen:bg-black/70">
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </span>
            </button>

            {open && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex flex-col bg-black/95"
                    role="dialog"
                    aria-modal="true"
                    aria-label={alt}
                    onClick={close}
                >
                    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/15 px-4 py-3 text-white sm:px-6">
                        <p className="min-w-0 truncate text-sm font-medium sm:text-base">{alt}</p>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setZoom((value) => Math.max(1, value - 0.5));
                                }}
                                disabled={zoom <= 1}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={t('common.zoom_out', { defaultValue: 'Zoom out' })}
                                title={t('common.zoom_out', { defaultValue: 'Zoom out' })}
                            >
                                <ZoomOut className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setZoom(1);
                                }}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                                aria-label={t('common.reset', { defaultValue: 'Reset' })}
                                title={t('common.reset', { defaultValue: 'Reset' })}
                            >
                                <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setZoom((value) => Math.min(3, value + 0.5));
                                }}
                                disabled={zoom >= 3}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={t('common.zoom_in', { defaultValue: 'Zoom in' })}
                                title={t('common.zoom_in', { defaultValue: 'Zoom in' })}
                            >
                                <ZoomIn className="h-5 w-5" />
                            </button>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    close();
                                }}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                                aria-label={t('common.close')}
                                title={t('common.close')}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6" onClick={close}>
                        <div
                            className="flex items-center justify-center transition-transform duration-200"
                            style={{ transform: `scale(${zoom})` }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            {secure ? (
                                <SecureImage
                                    src={src}
                                    alt={alt}
                                    className="max-h-[calc(100vh-7rem)] max-w-full object-contain transition-transform duration-200"
                                    fallback={<div className="spinner" />}
                                />
                            ) : (
                                <img
                                    src={src}
                                    alt={alt}
                                    className="max-h-[calc(100vh-7rem)] max-w-full object-contain transition-transform duration-200"
                                />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
