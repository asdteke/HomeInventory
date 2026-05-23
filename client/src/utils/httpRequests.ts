export const PAGE_REQUEST_TIMEOUT_MS = 2500;
export const ACTION_REQUEST_TIMEOUT_MS = 10000;

export interface RequestConfigOptions {
    signal?: AbortSignal;
    timeout?: number;
    [key: string]: any;
}

export function createRequestConfig({ signal, timeout = PAGE_REQUEST_TIMEOUT_MS, ...rest }: RequestConfigOptions = {}) {
    return {
        signal,
        timeout,
        ...rest
    };
}

export function isRequestCanceled(error: any): boolean {
    return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
}

export function getRequestErrorMessage(error: any, fallbackMessage: string): string {
    return error?.response?.data?.error || fallbackMessage;
}
