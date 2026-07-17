import * as React from 'react';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';

interface ToneStyle {
    className: string;
    icon: React.ComponentType<{ className?: string }>;
}

const TONE_STYLES: Record<'default' | 'warning' | 'danger', ToneStyle> = {
    default: {
        className: 'app-modal-icon--default',
        icon: Info
    },
    warning: {
        className: 'app-modal-icon--warning',
        icon: AlertTriangle
    },
    danger: {
        className: 'app-modal-icon--danger',
        icon: ShieldAlert
    }
};

let bodyScrollLockCount = 0;
let bodyOverflowBeforeLock = '';

function lockBodyScroll() {
    if (bodyScrollLockCount === 0) {
        bodyOverflowBeforeLock = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }

    bodyScrollLockCount += 1;

    return () => {
        bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);

        if (bodyScrollLockCount === 0) {
            document.body.style.overflow = bodyOverflowBeforeLock;
            bodyOverflowBeforeLock = '';
        }
    };
}

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
            if (event.key === 'Escape' && !event.defaultPrevented) {
                onClose?.();
            }
        };

        const unlockBodyScroll = lockBodyScroll();
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
            unlockBodyScroll();
        };
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') {
        return null;
    }

    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.default;
    const LeadingIcon = Icon || toneStyle.icon;

    return createPortal(
        <div
            className="app-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4"
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
                className={`app-modal-dialog w-full ${widthClassName}`.trim()}
                data-tone={tone}
            >
                <header className="app-modal-header">
                    <div className="app-modal-heading">
                        <span className={`app-modal-icon ${toneStyle.className}`} aria-hidden="true">
                            <LeadingIcon className="app-modal-icon-svg" />
                        </span>
                        <div className="app-modal-copy">
                            <h2 id={titleId} className="app-modal-title">
                                {title}
                            </h2>
                            {description && (
                                <p id={descriptionId} className="app-modal-description">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        aria-label={resolvedCloseLabel}
                        className="app-modal-close"
                    >
                        <X className="app-modal-close-icon" aria-hidden="true" />
                    </button>
                </header>

                <div className="app-modal-scroll-region">
                    <div className="app-modal-body">
                        {children}
                    </div>
                </div>

                {footer && (
                    <footer className="app-modal-footer">
                        {footer}
                    </footer>
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
