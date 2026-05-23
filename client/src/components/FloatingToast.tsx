import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ToastTone = 'success' | 'danger' | 'info';

interface ToastStyle {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { title?: string }>;
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
    info: {
        icon: Info,
        iconClassName: 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
    }
};

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

export default function FloatingToast({
    open,
    title,
    message,
    description,
    tone = 'success',
    type,
    onClose,
    duration = 2400
}: FloatingToastProps) {
    const { t } = useTranslation();

    const toastOpen = open !== undefined ? open : Boolean(title || message);
    const toastTitle = title || message;
    const toastTone = tone || type || 'success';

    useEffect(() => {
        if (!toastOpen || !duration) {
            return undefined;
        }

        const timerId = window.setTimeout(() => {
            onClose?.();
        }, duration);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [duration, onClose, toastOpen]);

    if (!toastOpen || typeof document === 'undefined') {
        return null;
    }

    const style = TOAST_STYLES[toastTone as ToastTone] || TOAST_STYLES.success;
    const Icon = style.icon;

    return createPortal(
        <div className="fixed bottom-4 right-4 z-[90] w-[min(92vw,360px)] animate-slide-up">
            <div
                role={toastTone === 'danger' ? 'alert' : 'status'}
                aria-live={toastTone === 'danger' ? 'assertive' : 'polite'}
                className="rounded-[1.35rem] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow-lift)] backdrop-blur-xl"
            >
                <div className="flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${style.iconClassName}`}>
                        <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--hi-text)]">{toastTitle}</p>
                        {description && (
                            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        aria-label={t('common.close') || 'Close'}
                        className="rounded-xl p-1.5 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
