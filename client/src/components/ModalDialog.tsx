import * as React from 'react';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';

interface ToneStyle {
    badge: string;
    icon: React.ComponentType<{ className?: string }>;
}

const TONE_STYLES: Record<'default' | 'warning' | 'danger', ToneStyle> = {
    default: {
        badge: 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]',
        icon: Info
    },
    warning: {
        badge: 'bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]',
        icon: AlertTriangle
    },
    danger: {
        badge: 'bg-[var(--hi-danger-soft)] text-[var(--hi-danger)]',
        icon: ShieldAlert
    }
};

export interface ModalDialogProps {
    isOpen: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    onClose?: () => void;
    icon?: React.ComponentType<{ className?: string }>;
    tone?: 'default' | 'warning' | 'danger';
    widthClassName?: string;
    closeLabel?: string;
}

export default function ModalDialog({
    isOpen,
    title,
    description,
    children,
    footer,
    onClose,
    icon: Icon,
    tone = 'default',
    widthClassName = 'max-w-lg',
    closeLabel
}: ModalDialogProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const descriptionId = useId();
    const resolvedCloseLabel = closeLabel || t('common.close', { defaultValue: 'Kapat' });

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
        };

        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') {
        return null;
    }

    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.default;
    const LeadingIcon = Icon || toneStyle.icon;

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose?.();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                className={`w-full overflow-hidden rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)] ${widthClassName}`.trim()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-[var(--hi-border)] px-6 py-5">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneStyle.badge}`}>
                            <LeadingIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-xl font-semibold text-[var(--hi-text)]">
                                {title}
                            </h2>
                            {description && (
                                <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        aria-label={resolvedCloseLabel}
                        className="rounded-xl p-2 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    {children}
                </div>

                {footer && (
                    <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--hi-border)] px-6 py-5">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export interface ConfirmDialogProps {
    isOpen: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    confirmLabel: React.ReactNode;
    cancelLabel?: string;
    onClose?: () => void;
    onConfirm?: () => void;
    confirming?: boolean;
    confirmDisabled?: boolean;
    confirmButtonClassName?: string;
    tone?: 'default' | 'warning' | 'danger';
    icon?: React.ComponentType<{ className?: string }>;
}

export function ConfirmDialog({
    isOpen,
    title,
    description,
    children,
    confirmLabel,
    cancelLabel,
    onClose,
    onConfirm,
    confirming = false,
    confirmDisabled = false,
    confirmButtonClassName = 'btn-primary',
    tone = 'warning',
    icon
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    const resolvedCancelLabel = cancelLabel || t('common.cancel', { defaultValue: 'İptal' });

    return (
        <ModalDialog
            isOpen={isOpen}
            title={title}
            description={description}
            onClose={onClose}
            tone={tone}
            icon={icon}
            footer={(
                <>
                    <button type="button" onClick={onClose} className="btn-secondary px-5 py-3" disabled={confirming}>
                        {resolvedCancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`${confirmButtonClassName} px-5 py-3 disabled:opacity-60`}
                        disabled={confirming || confirmDisabled}
                    >
                        {confirmLabel}
                    </button>
                </>
            )}
        >
            {children}
        </ModalDialog>
    );
}
