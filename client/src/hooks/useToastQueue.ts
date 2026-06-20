import { useCallback, useRef, useState } from 'react';
import type { FloatingToastItem, ToastTone } from '../components/FloatingToast';

export interface ToastQueueInput {
    title?: string;
    message?: string;
    description?: string;
    tone?: ToastTone;
    type?: ToastTone;
    duration?: number;
}

const MAX_VISIBLE_TOASTS = 3;

type ToastSignatureInput = Pick<FloatingToastItem, 'tone' | 'type' | 'title' | 'message' | 'description'>;

function getToastSignature(toast: ToastSignatureInput) {
    return [
        toast.tone || toast.type || 'success',
        toast.title || '',
        toast.message || '',
        toast.description || ''
    ].join('|');
}

export function useToastQueue() {
    const nextToastIdRef = useRef(1);
    const [toasts, setToasts] = useState<FloatingToastItem[]>([]);

    const showToast = useCallback((toast: ToastQueueInput) => {
        const signature = getToastSignature(toast);

        setToasts((currentToasts) => {
            const dedupedToasts = currentToasts.filter((currentToast) => (
                getToastSignature(currentToast) !== signature
            ));
            const nextToast: FloatingToastItem = {
                id: nextToastIdRef.current,
                ...toast
            };

            nextToastIdRef.current += 1;
            return [...dedupedToasts, nextToast].slice(-MAX_VISIBLE_TOASTS);
        });
    }, []);

    const closeToast = useCallback((id: FloatingToastItem['id']) => {
        setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, []);

    const clearToasts = useCallback(() => {
        setToasts([]);
    }, []);

    return {
        toasts,
        showToast,
        closeToast,
        clearToasts
    };
}
