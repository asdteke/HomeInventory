import { useEffect } from 'react';
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
    iconClassName: string;
}

const TOAST_STYLES: Record<ToastTone, ToastStyle> = {
    success: {
        icon: CheckCircle2,
        iconClassName: 'bg-[var(--hi-success-soft)] text-[var(--hi-success)]'
    },
    danger: {
        icon: AlertCircle,
        iconClassName: 'bg-[var(--hi-danger-soft)] text-[var(--hi-danger)]'
    },
    warning: {
        icon: AlertTriangle,
        iconClassName: 'bg-[var(--hi-warning-soft)] text-[var(--hi-warning)]'
    },
    info: {
        icon: Info,
        iconClassName: 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
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

    useEffect(() => {
        if (!autoDismissMs) {
            return undefined;
        }

        const timerId = window.setTimeout(() => {
            onClose?.();
        }, autoDismissMs);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [autoDismissMs, onClose]);

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
            className={`app-liquid-glass-toast toast-${toastTone}`}
            style={toastStyle}
        >
            <div className="flex items-start gap-3">
                <span className={`app-floating-toast-icon ${style.iconClassName}`}>
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    {toastTitle && (
                        <p className="font-semibold leading-5 text-[var(--hi-text)]">{toastTitle}</p>
                    )}
                    {description && (
                        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onClose?.()}
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
