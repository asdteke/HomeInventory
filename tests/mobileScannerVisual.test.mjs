import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const scannerSource = readFileSync(new URL('../client/src/components/BarcodeScanner.tsx', import.meta.url), 'utf8');
const qrScannerSource = readFileSync(new URL('../client/src/components/QRScanner.tsx', import.meta.url), 'utf8');
const scannerCss = readFileSync(new URL('../client/src/scanner.css', import.meta.url), 'utf8');
const itemFormSource = readFileSync(new URL('../client/src/components/ItemForm.tsx', import.meta.url), 'utf8');

test('barcode scanner uses a responsive portrait-safe scan box and one camera permission flow', () => {
    assert.match(scannerSource, /getResponsiveBarcodeScanBox/);
    assert.match(scannerSource, /availableWidth \* 0\.82/);
    assert.match(scannerSource, /availableHeight \* 0\.34/);
    assert.match(scannerSource, /qrbox: getResponsiveBarcodeScanBox/);
    assert.match(scannerSource, /facingMode: 'environment'/);
    assert.doesNotMatch(scannerSource, /scannerInstance\.start\(\s*\{ facingMode: \{ ideal: 'environment' \} \}/);
    assert.doesNotMatch(scannerSource, /aspectRatio: 16 \/ 9/);
    assert.doesNotMatch(scannerSource, /facingMode: \{ exact: 'environment' \}/);
    assert.match(scannerSource, /videoConstraints: BARCODE_VIDEO_CONSTRAINTS/);
    assert.match(scannerSource, /width: \{ ideal: 1920 \}/);
    assert.match(scannerSource, /height: \{ ideal: 1080 \}/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.CODE_128/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.CODE_39/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.ITF/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.RSS_EXPANDED/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.DATA_MATRIX/);
    assert.match(scannerSource, /Html5QrcodeSupportedFormats\.PDF_417/);
    assert.doesNotMatch(scannerSource, /Html5QrcodeSupportedFormats\.QR_CODE/);
    assert.match(scannerSource, /\/api\/barcode\/\$\{encodeURIComponent\(barcode\)\}/);
    assert.match(scannerSource, /searchOnline \? '\?online=1' : ''/);
    assert.match(scannerSource, /handleOnlineSearch/);
    assert.match(scannerSource, /scanner\.online_search_privacy/);
});

test('unsupported mobile camera controls are disabled instead of failing silently', () => {
    assert.match(scannerSource, /disabled=\{flashSupported === false \|\| isFlashChanging\}/);
    assert.match(scannerSource, /applyConstraints\(\{ advanced: \[\{ torch: nextFlashState \}\]/);
    assert.doesNotMatch(scannerSource, /fillLightMode/);
    assert.match(scannerSource, /BARCODE_ZOOM_PRESETS = \[1, 2, 4, 8\]/);
    assert.match(scannerSource, /disabled=\{zoomSupported === false \|\| isZoomChanging\}/);
    assert.match(scannerSource, /focusMode.*continuous/);
    assert.match(scannerCss, /\.scanner-zoom button\.is-active/);
    assert.match(scannerSource, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(scannerSource, /startAttemptRef\.current \+= 1/);
    assert.match(scannerSource, /attemptId !== startAttemptRef\.current/);
});

test('scanner shuts down torch safely and starts a fresh camera session after a result', () => {
    assert.match(scannerSource, /activeTrack\.applyConstraints\(\{ advanced: \[\{ torch: false \}\]/);
    assert.match(scannerSource, /for \(let attempt = 0; attempt < 10 && flashChangingRef\.current/);
    assert.match(scannerSource, /await stopScanner\(\);[\s\S]*setProductInfo\(null\);/);
    assert.doesNotMatch(scannerSource, /html5QrcodeRef\.current\.resume\(\)/);
    assert.match(scannerSource, /\[isOpen, productInfo, stopScanner\]/);
});

test('product lookup misses do not replay scan feedback as an error', () => {
    const processBarcodeBody = scannerSource.match(/const processBarcode[\s\S]*?const handleOnlineSearch/)?.[0] || '';
    assert.match(processBarcodeBody, /if \(!searchOnline\)[\s\S]*vibrateSuccess\(\)[\s\S]*playBeep\(true\)/);
    assert.doesNotMatch(processBarcodeBody, /vibrateError\(\)/);
    assert.doesNotMatch(processBarcodeBody, /playBeep\(false\)/);
});

test('barcode catalogue photo previews can be removed without an uploaded file', () => {
    const removePhotoBody = itemFormSource.match(/const handleRemovePhoto[\s\S]*?const handleInvoicePhotoChange/)?.[0] || '';
    assert.match(removePhotoBody, /else if \(photoPreview\)[\s\S]*setPhotoPreview\(null\)/);
    assert.match(itemFormSource, /product\.imageUrl && !photoPreview && !existingPhoto/);
});

test('scanner opens without fixed startup delays and keeps a short mobile camera hand-off', () => {
    assert.match(scannerSource, /requestAnimationFrame\(\(\) =>/);
    assert.match(qrScannerSource, /requestAnimationFrame\(\(\) =>/);
    assert.doesNotMatch(scannerSource, /setTimeout\(resolve, 300\)/);
    assert.doesNotMatch(qrScannerSource, /setTimeout\(resolve, 300\)/);
    assert.match(scannerSource, /if \(wasCameraActive\)[\s\S]*setTimeout\(resolve, 120\)/);
    assert.match(qrScannerSource, /if \(wasCameraActive\)[\s\S]*setTimeout\(resolve, 120\)/);
});

test('QR scanner uses the same safe camera lifecycle without replaying one decoded frame', () => {
    assert.match(qrScannerSource, /startAttemptRef = useRef\(0\)/);
    assert.match(qrScannerSource, /scanProcessingRef = useRef\(false\)/);
    assert.match(qrScannerSource, /activeTrack\.applyConstraints\(\{ advanced: \[\{ torch: false \}\]/);
    assert.match(qrScannerSource, /await html5QrcodeRef\.current\?\.pause\(true\)/);
    assert.match(qrScannerSource, /await stopScanner\(\);[\s\S]*await startScanner\(\);/);
    assert.match(qrScannerSource, /videoConstraints: QR_VIDEO_CONSTRAINTS/);
    assert.match(qrScannerSource, /qrbox: getResponsiveQrScanBox/);
    assert.doesNotMatch(qrScannerSource, /facingMode: \{ exact: 'environment' \}/);
    assert.match(qrScannerSource, /QR_ZOOM_PRESETS = \[1, 2, 4, 8\]/);
    assert.match(qrScannerSource, /disabled=\{flashSupported === false \|\| isFlashChanging\}/);
    assert.match(qrScannerSource, /applyConstraints\(\{ advanced: \[\{ torch: nextFlashState \}\]/);
    assert.match(qrScannerSource, /onClick=\{\(\) => changeZoom\(preset\)\}/);
    assert.match(qrScannerSource, /capabilities\.focusMode\?\.includes\('continuous'\)/);
});

test('scanner accents follow the active HomeInventory or Envanterim brand theme', () => {
    assert.match(scannerCss, /--scanner-accent: var\(--hi-accent\)/);
    assert.match(scannerCss, /--scanner-accent-strong: var\(--hi-accent-strong\)/);
    assert.match(scannerCss, /background: linear-gradient\(135deg, var\(--scanner-accent-strong\), var\(--scanner-accent\)\)/);
    assert.doesNotMatch(scannerCss, /#75c5a5|#3b8f70|#91d6b7|#64b18e/i);
});

test('mobile scanner uses dynamic viewport height and safe-area spacing', () => {
    assert.match(scannerCss, /z-index: 110/);
    assert.match(scannerCss, /height: 100dvh/);
    assert.match(scannerCss, /min-height: min\(230px, 42dvh\)/);
    assert.match(scannerCss, /env\(safe-area-inset-top\)/);
    assert.match(scannerCss, /env\(safe-area-inset-bottom\)/);
    assert.match(scannerCss, /overscroll-behavior: none/);
});

test('scanner shows one app reticle instead of the library crop rectangle', () => {
    assert.match(scannerCss, /\[id\^='qr-shaded-region'\]/);
    assert.match(scannerCss, /background-color: transparent !important/);
    assert.match(scannerCss, /border: 0 !important/);
    assert.match(scannerSource, /setScanDetected\(true\)/);
    assert.match(qrScannerSource, /setScanDetected\(true\)/);
    assert.match(scannerCss, /\.scanner-reticle\.is-detected/);
    assert.match(scannerCss, /animation: scanner-detected-trace 320ms cubic-bezier/);
    assert.match(scannerCss, /center top \/ calc\(100% - 70px\) 2px no-repeat/);
    assert.match(scannerCss, /left center \/ 2px calc\(100% - 70px\) no-repeat/);
    assert.match(scannerCss, /background-size: 0 2px, 0 2px, 2px 0, 2px 0/);
    assert.match(qrScannerSource, /await stopScanner\(true\)/);
    assert.doesNotMatch(scannerCss, /\.scanner-reticle\.is-detected::before/);
    assert.doesNotMatch(scannerCss, /drop-shadow\(0 0 8px rgba\(52, 211, 153/);
    assert.doesNotMatch(scannerCss, /\.scanner-reticle\.is-detected \{[\s\S]*?border: 2px solid/);
    assert.doesNotMatch(scannerCss, /scanner-reticle-pulse/);
});

test('scanner guidance is free of unsupported emoji and replacement characters in every runtime locale', () => {
    const localeRoot = new URL('../client/public/locales/', import.meta.url);
    for (const entry of readdirSync(localeRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const translation = JSON.parse(readFileSync(new URL(`${entry.name}/translation.json`, localeRoot), 'utf8'));
        const zoomHint = translation?.scanner?.zoom_hint || '';
        assert.doesNotMatch(zoomHint, /💡|�/, `${entry.name} scanner.zoom_hint contains an unsupported character`);
    }
});
