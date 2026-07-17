import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ToastTone = 'success' | 'danger' | 'warning' | 'info';

export interface FloatingToastItem {
    id: number | string;
    title?: string;
    message?: string;
    description?: string;
    tone?: ToastTone | string;
    type?: ToastTone | string;
    duration?: number;
}

interface ToastStyle {
    icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
}

const TOAST_STYLES: Record<ToastTone, ToastStyle> = {
    success: {
        icon: CheckCircle2
    },
    danger: {
        icon: AlertCircle
    },
    warning: {
        icon: AlertTriangle
    },
    info: {
        icon: Info
    }
};

const isToastTone = (value: unknown): value is ToastTone => (
    value === 'success' || value === 'danger' || value === 'warning' || value === 'info'
);

interface FloatingToastProps {
    open?: boolean;
    title?: string;
    message?: string; // legacy fallback
    description?: string;
    tone?: ToastTone | string;
    type?: ToastTone | string; // legacy fallback
    onClose?: () => void;
    duration?: number;
}

interface ToastSurfaceProps extends Omit<FloatingToastProps, 'open' | 'onClose'> {
    onClose?: () => void;
}

interface FloatingToastStackProps {
    toasts: FloatingToastItem[];
    onClose: (id: FloatingToastItem['id']) => void;
}

function ToastSurface({
    title,
    message,
    description,
    tone = 'success',
    type,
    onClose,
    duration
}: ToastSurfaceProps) {
    const { t } = useTranslation();

    const toastTitle = title || message;
    const requestedTone = tone || type;
    const toastTone = isToastTone(requestedTone) ? requestedTone : 'success';
    const autoDismissMs = duration ?? (toastTone === 'danger' ? 5200 : 3200);
    const [isExiting, setIsExiting] = useState(false);
    const closeTimerRef = useRef<number | null>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const beginClose = useCallback(() => {
        if (closeTimerRef.current !== null) {
            return;
        }

        setIsExiting(true);
        closeTimerRef.current = window.setTimeout(() => {
            onCloseRef.current?.();
            closeTimerRef.current = null;
        }, 260);
    }, []);

    useEffect(() => {
        if (!autoDismissMs) {
            return undefined;
        }

        const timerId = window.setTimeout(() => {
            beginClose();
        }, autoDismissMs);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [autoDismissMs, beginClose]);

    useEffect(() => () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
        }
    }, []);

    const style = TOAST_STYLES[toastTone as ToastTone] || TOAST_STYLES.success;
    const Icon = style.icon;
    const toastStyle = {
        '--toast-duration': `${autoDismissMs}ms`
    } as CSSProperties;

    return (
        <div
            role={toastTone === 'danger' ? 'alert' : 'status'}
            aria-live={toastTone === 'danger' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`app-liquid-glass-toast toast-${toastTone}${isExiting ? ' is-exiting' : ''}`}
            style={toastStyle}
        >
            <div className="app-floating-toast-main">
                <span className="app-floating-toast-icon" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                </span>
                <div className="app-floating-toast-content">
                    {toastTitle && (
                        <p className="app-floating-toast-title">{toastTitle}</p>
                    )}
                    {description && (
                        <p className="app-floating-toast-description">{description}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={beginClose}
                    aria-label={t('common.close') || 'Close'}
                    className="app-floating-toast-close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            {autoDismissMs > 0 && <span className="app-floating-toast-progress" aria-hidden="true" />}
        </div>
    );
}

export function FloatingToastStack({ toasts, onClose }: FloatingToastStackProps) {
    if (!toasts.length || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div className="app-floating-toast-region">
            {toasts.map((toast) => (
                <ToastSurface
                    key={toast.id}
                    title={toast.title}
                    message={toast.message}
                    description={toast.description}
                    tone={toast.tone}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={() => onClose(toast.id)}
                />
            ))}
        </div>,
        document.body
    );
}

export default function FloatingToast({
    open,
    title,
    message,
    description,
    tone = 'success',
    type,
    onClose,
    duration
}: FloatingToastProps) {
    const toastOpen = open !== undefined ? open : Boolean(title || message || description);

    if (!toastOpen || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div className="app-floating-toast-region">
            <ToastSurface
                title={title}
                message={message}
                description={description}
                tone={tone}
                type={type}
                duration={duration}
                onClose={onClose}
            />
        </div>,
        document.body
    );
}
