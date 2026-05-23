export interface ScannerRuntimePayload {
    Html5Qrcode: any;
    Html5QrcodeSupportedFormats: any;
    cameraManager: any;
}

let scannerRuntimePromise: Promise<ScannerRuntimePayload> | null = null;

export async function loadScannerRuntime(): Promise<ScannerRuntimePayload> {
    if (!scannerRuntimePromise) {
        scannerRuntimePromise = Promise.all([
            import('html5-qrcode'),
            import('./cameraManager')
        ])
            .then(([scannerModule, cameraManagerModule]) => ({
                Html5Qrcode: scannerModule.Html5Qrcode,
                Html5QrcodeSupportedFormats: scannerModule.Html5QrcodeSupportedFormats,
                cameraManager: cameraManagerModule.default
            }))
            .catch((error) => {
                scannerRuntimePromise = null;
                throw error;
            });
    }

    return scannerRuntimePromise;
}
