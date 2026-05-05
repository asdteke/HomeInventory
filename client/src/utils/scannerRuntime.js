let scannerRuntimePromise = null;

export async function loadScannerRuntime() {
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
