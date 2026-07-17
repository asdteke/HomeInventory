import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SecureImage from './SecureImage';
import '../admin-overlays-v25.css';

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
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
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
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
                return;
            }

            if (event.key === 'Tab' && dialogRef.current) {
                const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
                const firstControl = controls[0];
                const lastControl = controls.at(-1);

                if (!firstControl || !lastControl) {
                    event.preventDefault();
                    return;
                }

                if (event.shiftKey && document.activeElement === firstControl) {
                    event.preventDefault();
                    lastControl.focus();
                } else if (!event.shiftKey && document.activeElement === lastControl) {
                    event.preventDefault();
                    firstControl.focus();
                }
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            previousFocusRef.current?.focus();
            previousFocusRef.current = null;
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
                className={`fullscreen-image-v25-trigger group/fullscreen relative block cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] ${className}`}
                aria-label={openLabel}
                title={openLabel}
            >
                {children}
                <span className="fullscreen-image-v25-open absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition group-hover/fullscreen:scale-105">
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </span>
            </button>

            {open && createPortal(
                <div
                    ref={dialogRef}
                    className="fullscreen-image-v25 fixed inset-0 z-[100] flex flex-col"
                    role="dialog"
                    aria-modal="true"
                    aria-label={alt}
                    onClick={close}
                >
                    <div className="fullscreen-image-v25-safe flex min-h-0 flex-1 flex-col">
                        <div
                            className="fullscreen-image-v25-toolbar mx-3 mt-3 flex min-h-16 items-center justify-between gap-3 rounded-[1.5rem] px-3 py-2.5 text-white sm:mx-5 sm:mt-5 sm:px-4"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium sm:text-base">{alt}</p>
                            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" onClick={(event) => event.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setZoom((value) => Math.max(1, value - 0.5));
                                    }}
                                    disabled={zoom <= 1}
                                    className="fullscreen-image-v25-tool"
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
                                    className="fullscreen-image-v25-tool"
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
                                    className="fullscreen-image-v25-tool"
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
                                    className="fullscreen-image-v25-tool fullscreen-image-v25-close"
                                    aria-label={t('common.close')}
                                    title={t('common.close')}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="fullscreen-image-v25-stage flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6" onClick={close}>
                            <div
                                className="fullscreen-image-v25-media flex items-center justify-center"
                                style={{ transform: `scale(${zoom})` }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                {secure ? (
                                    <SecureImage
                                        src={src}
                                        alt={alt}
                                        className="max-h-[calc(100dvh-7.5rem)] max-w-full object-contain"
                                        fallback={<div className="spinner" />}
                                    />
                                ) : (
                                    <img
                                        src={src}
                                        alt={alt}
                                        className="max-h-[calc(100dvh-7.5rem)] max-w-full object-contain"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
