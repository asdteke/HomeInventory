export const PAGE_REQUEST_TIMEOUT_MS = 2500;
export const ACTION_REQUEST_TIMEOUT_MS = 10000;

export function createRequestConfig({ signal, timeout = PAGE_REQUEST_TIMEOUT_MS, ...rest } = {}) {
    return {
        signal,
        timeout,
        ...rest
    };
}

export function isRequestCanceled(error) {
    return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
}

export function getRequestErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error || fallbackMessage;
}
