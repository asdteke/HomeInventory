import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { X, Camera, Loader2, Package, Search, Plus, ExternalLink, Flashlight, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadScannerRuntime } from '../utils/scannerRuntime';
import '../scanner.css';

// Beep sound for successful scan
const playBeep = (success = true) => {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = success ? 1200 : 400;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        setTimeout(() => oscillator.stop(), success ? 150 : 100);
    } catch (e) { }
};

// Vibration feedback
const vibrateSuccess = () => navigator.vibrate?.(100);
const vibrateError = () => navigator.vibrate?.([100, 50, 100]);

const SCANNER_ID = 'barcode-scanner';

// Prefer a sharp Full HD rear-camera stream without making that resolution
// mandatory. `ideal` keeps older and lower-resolution devices working while
// avoiding Chromium's blurry low-resolution default on modern phones.
const BARCODE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 }
};
const BARCODE_ZOOM_PRESETS = [1, 2, 4, 8];

export const getResponsiveBarcodeScanBox = (viewfinderWidth: number, viewfinderHeight: number) => {
    const availableWidth = Math.max(1, Number(viewfinderWidth) || 1);
    const availableHeight = Math.max(1, Number(viewfinderHeight) || 1);
    const width = Math.floor(Math.min(320, availableWidth * 0.82));
    const height = Math.floor(Math.min(160, availableHeight * 0.34, width * 0.58));

    return {
        width: Math.max(1, Math.min(Math.max(80, width), Math.max(1, availableWidth - 2))),
        height: Math.max(1, Math.min(Math.max(64, height), Math.max(1, availableHeight - 2)))
    };
};

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onProductFound: (product: { name: string; barcode: string; imageUrl?: string }) => void;
    onBarcodeOnly: (barcode: string) => void;
    onQuickAdd?: (barcode: string) => void | Promise<void>;
    onExistingItemFound?: (item: { id: number; name?: string; box_id?: number | null }) => void | Promise<void>;
    existingItemActionLabel?: string;
}

export default function BarcodeScanner({
    isOpen,
    onClose,
    onProductFound,
    onBarcodeOnly,
    onQuickAdd,
    onExistingItemFound,
    existingItemActionLabel
}: BarcodeScannerProps) {
    const { t } = useTranslation();
    const html5QrcodeRef = useRef<any>(null);
    const isMountedRef = useRef(true);
    const isStartingRef = useRef(false);
    const startAttemptRef = useRef(0);
    const currentTrackRef = useRef<MediaStreamTrack | null>(null); // Store camera track reference for flash control

    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [preparingScanner, setPreparingScanner] = useState(false);
    const [productInfo, setProductInfo] = useState<any | null>(null);
    const [scanDetected, setScanDetected] = useState(false);
    const scanProcessingRef = useRef(false);

    // Camera controls are enabled only after the active track reports support.
    const [flashOn, setFlashOn] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [maxZoom, setMaxZoom] = useState(1);
    const [flashSupported, setFlashSupported] = useState<boolean | null>(null); // null = unknown, true/false = detected
    const [zoomSupported, setZoomSupported] = useState<boolean | null>(null);
    const [isFlashChanging, setIsFlashChanging] = useState(false);
    const flashChangingRef = useRef(false);
    const [isZoomChanging, setIsZoomChanging] = useState(false);
    const zoomChangingRef = useRef(false);

    // Updated to use object for type safety across languages
    const [flashFeedback, setFlashFeedback] = useState({ text: '', type: 'default' });

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    // Full cleanup function that releases all camera resources
    const stopScanner = useCallback(async () => {
        console.log('[BarcodeScanner] Stopping scanner...');
        startAttemptRef.current += 1;
        isStartingRef.current = false;

        try {
            // Some mobile browsers leave the hardware torch on if a lit video
            // track is stopped directly. Let an in-flight toggle settle, then
            // explicitly switch the torch off before releasing the stream.
            for (let attempt = 0; attempt < 10 && flashChangingRef.current; attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            const activeTrack = currentTrackRef.current;
            if (activeTrack?.readyState === 'live') {
                try {
                    const capabilities = activeTrack.getCapabilities?.() as any;
                    const torchIsOn = (activeTrack.getSettings?.() as any)?.torch === true;
                    if (capabilities?.torch === true || torchIsOn) {
                        await activeTrack.applyConstraints({ advanced: [{ torch: false }] as any });
                        await new Promise(resolve => setTimeout(resolve, 80));
                    }
                } catch (error) {
                    console.log('[BarcodeScanner] Torch cleanup skipped:', error);
                }
            }

            const { cameraManager } = await loadScannerRuntime();

            // First release global camera streams
            await cameraManager.releaseAllStreams();

            // Stop the video tracks manually
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                const tracks = (videoElement.srcObject as MediaStream).getTracks();
                tracks.forEach(track => {
                    try { track.stop(); } catch (e) { }
                });
                videoElement.srcObject = null;
            }

            // Stop html5qrcode instance
            if (html5QrcodeRef.current) {
                try {
                    const state = html5QrcodeRef.current.getState?.();
                    // State 2 = SCANNING, State 3 = PAUSED
                    if (state === 2 || state === 3) {
                        await html5QrcodeRef.current.stop();
                    }
                } catch (e: any) {
                    console.log('[BarcodeScanner] Scanner already stopped or error:', e.message);
                }

                try {
                    html5QrcodeRef.current.clear();
                } catch (e) { }

                html5QrcodeRef.current = null;
            }

            if (isMountedRef.current) {
                setIsScanning(false);
                setFlashOn(false);
                setZoomLevel(1);
                setFlashSupported(null);
                setZoomSupported(null);
                setPreparingScanner(false);
                setScanDetected(false);
            }

            currentTrackRef.current = null;

            console.log('[BarcodeScanner] Scanner stopped successfully');
        } catch (err) {
            console.log('[BarcodeScanner] Stop error:', err);
        }
    }, []);

    useEffect(() => {
        if (isOpen && !productInfo) {
            // Effects run after the reader has been committed. One animation
            // frame is enough to let layout settle without making every open
            // feel artificially delayed.
            const frame = requestAnimationFrame(() => {
                if (isMountedRef.current && !html5QrcodeRef.current && !isStartingRef.current) {
                    startScanner();
                }
            });
            return () => cancelAnimationFrame(frame);
        } else {
            // When closed, cleanup
            stopScanner();
        }
    }, [isOpen, productInfo, stopScanner]);

    const startScanner = async () => {
        if (isStartingRef.current) {
            console.log('[BarcodeScanner] Already starting, skipping...');
            return;
        }

        const attemptId = startAttemptRef.current + 1;
        startAttemptRef.current = attemptId;
        isStartingRef.current = true;
        setError('');
        setStatus(t('scanner.init'));
        setProductInfo(null);
        setScanDetected(false);
        setPreparingScanner(true);
        scanProcessingRef.current = false;

        try {
            const { Html5Qrcode, Html5QrcodeSupportedFormats, cameraManager } = await loadScannerRuntime();

            // CRITICAL: Release any existing camera streams first
            console.log('[BarcodeScanner] Releasing existing streams...');
            const wasCameraActive = !cameraManager.isAvailable();
            await cameraManager.releaseAllStreams();

            // A short hand-off is useful when switching/restarting an active
            // mobile camera. A first open does not need a fixed delay.
            if (wasCameraActive) {
                await new Promise(resolve => setTimeout(resolve, 120));
            }

            // Check if DOM element exists
            const readerElement = document.getElementById('barcode-reader');
            if (!readerElement) {
                throw new Error('Scanner element not found');
            }

            const formatsToSupport = [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.RSS_14,
                Html5QrcodeSupportedFormats.RSS_EXPANDED,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.AZTEC,
                Html5QrcodeSupportedFormats.MAXICODE
            ];

            const scannerInstance = new Html5Qrcode('barcode-reader', { formatsToSupport });
            html5QrcodeRef.current = scannerInstance;

            // html5-qrcode 2.3.x accepts a string preference or an object with `exact`;
            // its wrapper rejects the standard `{ ideal: ... }` shape before asking for
            // camera permission. The string remains a preference, so devices with only
            // one camera can still start without a second permission flow.
            console.log('[BarcodeScanner] Starting preferred environment camera...');
            await scannerInstance.start(
                { facingMode: 'environment' },
                {
                    fps: 15,
                    qrbox: getResponsiveBarcodeScanBox,
                    disableFlip: false,
                    videoConstraints: BARCODE_VIDEO_CONSTRAINTS
                },
                handleScanSuccess,
                () => { }
            );
            const started = true;

            if (attemptId !== startAttemptRef.current) {
                try { await scannerInstance.stop(); } catch (e) { }
                try { scannerInstance.clear(); } catch (e) { }
                if (html5QrcodeRef.current === scannerInstance) {
                    html5QrcodeRef.current = null;
                }
                return;
            }

            if (started && isMountedRef.current) {
                // Register the stream with global manager
                const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
                if (videoElement && videoElement.srcObject) {
                    cameraManager.registerStream(videoElement.srcObject as MediaStream, SCANNER_ID);

                    // Store track reference for flash control
                    const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                    if (track) {
                        currentTrackRef.current = track;

                        // Store current settings for constraint preservation
                        const settings = track.getSettings?.();
                        if (settings) {
                            console.log(
                                `[BarcodeScanner] Stream ready: ${settings.width || '?'}x${settings.height || '?'} `
                                + `@ ${settings.frameRate || '?'}fps (${settings.facingMode || 'unknown'})`
                            );
                        }

                        console.log('[BarcodeScanner] Track stored for flash control');
                    }
                }

                setIsScanning(true);
                setStatus(t('scanner.hint'));

                // Apply advanced camera features
                await checkCameraCapabilities();
                await applyAdvancedConstraints();

                // Retry capability check after 1 second (some browsers report late)
                setTimeout(async () => {
                    if (isMountedRef.current && attemptId === startAttemptRef.current) {
                        await checkCameraCapabilities();
                    }
                }, 1000);
            }
        } catch (err: any) {
            console.error('[BarcodeScanner] Start error:', err);

            if (isMountedRef.current && attemptId === startAttemptRef.current) {
                if (err.toString().includes('Permission')) {
                    setError(t('scanner.permission_error'));
                } else if (err.toString().includes('NotReadableError') || err.toString().includes('TrackStartError')) {
                    setError(t('scanner.busy_error'));
                } else if (err.toString().includes('NotFoundError')) {
                    setError(t('scanner.not_found_error'));
                } else {
                    setError(t('scanner.generic_error'));
                }
            }
        } finally {
            if (attemptId === startAttemptRef.current) {
                isStartingRef.current = false;
            }
            if (isMountedRef.current && attemptId === startAttemptRef.current) {
                setPreparingScanner(false);
            }
        }
    };

    const applyAdvancedConstraints = async () => {
        try {
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                const capabilities = track.getCapabilities?.() as any;

                if (capabilities) {
                    const advancedConstraints = [];

                    if (capabilities.focusMode?.includes('continuous')) {
                        advancedConstraints.push({ focusMode: 'continuous' });
                    }
                    if (capabilities.exposureMode?.includes('continuous')) {
                        advancedConstraints.push({ exposureMode: 'continuous' });
                    }
                    if (capabilities.whiteBalanceMode?.includes('continuous')) {
                        advancedConstraints.push({ whiteBalanceMode: 'continuous' });
                    }

                    if (advancedConstraints.length > 0) {
                        await track.applyConstraints({ advanced: advancedConstraints as any });
                    }
                }
            }
        } catch (e: any) {
            console.log('[BarcodeScanner] Could not apply advanced constraints:', e.message);
        }
    };

    const checkCameraCapabilities = async () => {
        try {
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                const capabilities = track.getCapabilities?.() as any;

                if (capabilities) {
                    // Update flash support status
                    const torchSupported = !!capabilities.torch;
                    setFlashSupported(torchSupported);
                    if (capabilities.zoom) {
                        const reportedMax = Number((capabilities.zoom as any).max) || 1;
                        const practicalMax = Math.min(reportedMax, 8);
                        const currentZoom = Number(track.getSettings?.().zoom) || 1;
                        setMaxZoom(practicalMax);
                        setZoomLevel(Math.min(practicalMax, Math.max(1, currentZoom)));
                        setZoomSupported(practicalMax > 1);
                    } else {
                        setZoomSupported(false);
                    }
                    console.log('[BarcodeScanner] Camera capabilities - Torch:', torchSupported);
                } else {
                    setFlashSupported(false);
                    setZoomSupported(false);
                }
            }
        } catch (e) {
            console.log('[BarcodeScanner] Could not get camera capabilities');
            setFlashSupported(false);
            setZoomSupported(false);
        }
    };

    const toggleFlash = async () => {
        if (flashChangingRef.current) return;

        flashChangingRef.current = true;
        setIsFlashChanging(true);
        setFlashFeedback({ text: '', type: 'default' });
        try {
            const track = currentTrackRef.current;
            const capabilities = track?.getCapabilities?.() as any;
            if (!track || capabilities?.torch !== true) {
                setFlashSupported(false);
                setFlashFeedback({ text: t('scanner.flash_unsupported'), type: 'error' });
                return;
            }

            const nextFlashState = !flashOn;
            await track.applyConstraints({ advanced: [{ torch: nextFlashState }] as any });
            await new Promise(resolve => setTimeout(resolve, 80));

            const reportedState = (track.getSettings?.() as any)?.torch;
            if (typeof reportedState === 'boolean' && reportedState !== nextFlashState) {
                throw new Error('Camera did not apply the requested torch state');
            }

            setFlashOn(nextFlashState);
            setFlashSupported(true);
            setFlashFeedback({ text: nextFlashState ? t('scanner.flash_on') : '', type: 'success' });
            console.log(`[BarcodeScanner] Torch ${nextFlashState ? 'enabled' : 'disabled'}`);
        } catch (e: any) {
            console.log('[BarcodeScanner] Torch change failed:', e?.message || e);
            setFlashFeedback({ text: t('common.error'), type: 'error' });
        } finally {
            setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 2000);
            flashChangingRef.current = false;
            setIsFlashChanging(false);
        }
    };

    const changeZoom = async (newZoom: number) => {
        if (zoomChangingRef.current) return;

        zoomChangingRef.current = true;
        setIsZoomChanging(true);
        try {
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                const capabilities = track.getCapabilities?.() as any;
                const supportedMin = Number(capabilities?.zoom?.min) || 1;
                const supportedMax = Math.min(Number(capabilities?.zoom?.max) || 1, 8);
                const targetZoom = Math.min(supportedMax, Math.max(supportedMin, newZoom));
                const focusMode = capabilities?.focusMode?.includes('continuous') ? 'continuous' : undefined;

                await track.applyConstraints({
                    advanced: [{
                        zoom: targetZoom,
                        ...(focusMode && { focusMode })
                    }] as any
                });

                const actualZoom = Number(track.getSettings?.().zoom) || targetZoom;
                setZoomLevel(actualZoom);
                console.log(`[BarcodeScanner] Zoom applied: ${actualZoom}x with stream resolution preserved`);
            }
        } catch (e) {
            console.log('[BarcodeScanner] Zoom change failed:', e);
        } finally {
            zoomChangingRef.current = false;
            setIsZoomChanging(false);
        }
    };

    const pauseScanner = async () => {
        if (html5QrcodeRef.current && isScanning) {
            try {
                await html5QrcodeRef.current.pause(true);
            } catch (err) { }
        }
    };

    const handleScanSuccess = async (barcode: string) => {
        if (scanProcessingRef.current || loading) return;
        scanProcessingRef.current = true;
        setScanDetected(true);

        console.log('[BarcodeScanner] Barcode scanned:', barcode);
        await pauseScanner();
        await processBarcode(barcode);
    };

    const processBarcode = async (barcode: string, searchOnline = false) => {
        setLoading(true);
        setStatus(t(searchOnline ? 'scanner.searching_online' : 'scanner.searching_inventory'));
        if (!searchOnline) {
            vibrateSuccess();
            playBeep(true);
        }

        try {
            const response = await axios.get(
                `/api/barcode/${encodeURIComponent(barcode)}${searchOnline ? '?online=1' : ''}`
            );
            const result = response.data;

            if (result.found) {
                if (result.existingItem) {
                    setProductInfo({
                        source: 'local',
                        name: result.name,
                        barcode: barcode,
                        existingItem: result.existingItem
                    });
                    setStatus(t('scanner.found_local'));
                } else {
                    setProductInfo({
                        source: 'online',
                        sourceName: result.source,
                        name: result.name,
                        brand: result.brand,
                        image: result.image,
                        barcode: barcode,
                        category: result.category,
                        isGoogleResult: result.isGoogleResult
                    });
                    setStatus(t('scanner.found_online'));
                }
            } else {
                setProductInfo({
                    source: searchOnline ? 'notfound' : 'local-miss',
                    name: null,
                    barcode: barcode
                });
                setStatus(t(searchOnline ? 'scanner.not_found' : 'scanner.local_not_found'));
            }
        } catch (err) {
            console.error('[BarcodeScanner] Barcode lookup error:', err);
            setProductInfo({
                source: 'error',
                name: null,
                barcode: barcode
            });
            setStatus(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleOnlineSearch = async () => {
        if (!productInfo?.barcode || loading) return;
        setError('');
        await processBarcode(productInfo.barcode, true);
    };

    const handleUseProduct = async () => {
        if (productInfo) {
            if (productInfo.existingItem) {
                if (onExistingItemFound) {
                    setLoading(true);
                    setError('');
                    try {
                        await onExistingItemFound(productInfo.existingItem);
                        await stopScanner();
                        onClose();
                    } catch (err: any) {
                        setError(err?.message || t('common.error'));
                    } finally {
                        setLoading(false);
                    }
                    return;
                }

                await stopScanner();
                window.location.href = `/items/${productInfo.existingItem.id}/edit`;
            } else if (productInfo.name) {
                await stopScanner();
                onProductFound({
                    name: productInfo.brand ? `${productInfo.brand} ${productInfo.name}` : productInfo.name,
                    barcode: productInfo.barcode,
                    imageUrl: productInfo.image
                });
                onClose();
            } else {
                await stopScanner();
                onBarcodeOnly(productInfo.barcode);
                onClose();
            }
        }
    };

    const handleQuickAdd = async () => {
        if (productInfo?.barcode && onQuickAdd) {
            setLoading(true);
            setError('');
            try {
                await onQuickAdd(productInfo.barcode);
                const addedBarcode = productInfo.barcode;
                await stopScanner();
                scanProcessingRef.current = false;
                setError('');
                setStatus(t('items.messages.quick_add_success', { barcode: addedBarcode }));
                setProductInfo(null);
            } catch (err: any) {
                setError(err?.message || t('common.error'));
            } finally {
                setLoading(false);
            }
        }
    };

    const handleGoogleSearch = () => {
        if (productInfo?.barcode) {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(productInfo.barcode)}`, '_blank');
        }
    };

    const handleClose = async () => {
        await stopScanner();
        scanProcessingRef.current = false;
        setProductInfo(null);
        setError('');
        setStatus('');
        onClose();
    };

    const handleRescan = async () => {
        if (loading) return;

        // The result view unmounts the scanner's video element. Resuming that
        // detached instance can replay its last decoded frame, so always begin
        // a fresh camera session for the next scan.
        scanProcessingRef.current = true;
        await stopScanner();
        setError('');
        scanProcessingRef.current = false;
        setStatus(t('scanner.init'));
        setProductInfo(null);
    };

    if (!isOpen) return null;

    return (
        <div className="scanner-overlay">
            <section className="scanner-shell" role="dialog" aria-modal="true" aria-labelledby="barcode-scanner-title">
                <header className="scanner-header">
                    <div className="scanner-heading">
                        <span className="scanner-heading-icon"><Camera className="h-5 w-5" /></span>
                        <div className="scanner-heading-copy">
                            <h2 id="barcode-scanner-title">{t('scanner.title')}</h2>
                            <p>{t('scanner.hint')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} className="scanner-close" aria-label={t('common.close')}>
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="scanner-body">
                    {!productInfo ? (
                        <>
                            <div className="scanner-stage">
                                <div className="scanner-camera">
                                    <div id="barcode-reader" />
                                    <div className={`scanner-reticle ${scanDetected ? 'is-detected' : ''}`} aria-hidden="true"><span /></div>
                                    {isScanning && <div className="scanner-scanline" aria-hidden="true" />}
                                    {!isScanning && !error && (
                                        <div className="scanner-permission-note">
                                            <Camera className="h-3.5 w-3.5" />
                                            <span>{t('scanner.init')}</span>
                                        </div>
                                    )}
                                    {(preparingScanner || (loading && !isScanning)) && !error && (
                                        <div className="scanner-state-cover">
                                            <div className="scanner-state-card">
                                                <Loader2 className="scanner-spinner h-5 w-5" />
                                                <span>{status || t('scanner.init')}</span>
                                            </div>
                                        </div>
                                    )}
                                    {flashFeedback.text && (
                                        <div className={`scanner-feedback ${flashFeedback.type === 'success' ? 'is-success' : flashFeedback.type === 'error' ? 'is-error' : ''}`}>
                                            {flashFeedback.text}
                                        </div>
                                    )}
                                </div>

                                {isScanning && (
                                    <div className="scanner-toolbar">
                                        <button
                                            type="button"
                                            onClick={toggleFlash}
                                            disabled={flashSupported === false || isFlashChanging}
                                            className={`scanner-control ${flashOn ? 'is-on' : ''}`}
                                            title={flashSupported === false ? t('scanner.flash_unsupported') : (flashOn ? 'Flaşı Kapat' : 'Flaşı Aç')}
                                            aria-label={flashSupported === false ? t('scanner.flash_unsupported') : (flashOn ? 'Flaşı Kapat' : 'Flaşı Aç')}
                                        >
                                            <Flashlight className="h-5 w-5" />
                                        </button>
                                        <div className="scanner-zoom" aria-label={t('scanner.zoom_hint')}>
                                            {BARCODE_ZOOM_PRESETS.filter((preset) => preset <= maxZoom).map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => changeZoom(preset)}
                                                    disabled={zoomSupported === false || isZoomChanging}
                                                    className={Math.abs(zoomLevel - preset) < 0.1 ? 'is-active' : ''}
                                                    aria-pressed={Math.abs(zoomLevel - preset) < 0.1}
                                                >
                                                    {preset.toFixed(preset % 1 === 0 ? 0 : 1)}×
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="scanner-alert" role="alert">
                                        <AlertCircle className="h-5 w-5" />
                                        <div className="scanner-alert-copy">
                                            <strong>{t('common.error')}</strong>
                                            <span>{error}</span>
                                            <div className="scanner-alert-actions">
                                                <button type="button" className="scanner-alert-button" onClick={async () => { await stopScanner(); await startScanner(); }}>
                                                    {t('scanner.retry')}
                                                </button>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => setError('')} className="scanner-alert-dismiss" aria-label={t('common.close')}>
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="scanner-guidance">
                                <span className="scanner-guidance-icon">{loading ? <Loader2 className="scanner-spinner h-4 w-4" /> : <Search className="h-4 w-4" />}</span>
                                <p>{status || t('scanner.hint')}<small>{t('scanner.zoom_hint')}</small></p>
                            </div>
                        </>
                    ) : (
                        <div className="scanner-result animate-slide-up">
                            <div className="scanner-result-heading">
                                {productInfo.source === 'local' ? <Package className="h-5 w-5" /> : productInfo.source === 'online' ? <CheckCircle className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                                <span>{productInfo.source === 'local'
                                    ? t('scanner.found_local')
                                    : productInfo.source === 'online'
                                        ? t('scanner.found_online')
                                        : t('scanner.new_product')}</span>
                            </div>
                            {productInfo.image && <img src={productInfo.image} alt={productInfo.name || ''} className="scanner-result-image" />}
                            <h3>{productInfo.name ? `${productInfo.brand ? `${productInfo.brand} ` : ''}${productInfo.name}` : productInfo.source === 'local-miss' ? t('scanner.local_not_found') : t('scanner.not_found_db')}</h3>
                            <p>{productInfo.source === 'local' ? t('scanner.found_local_msg') : productInfo.source === 'online' ? (productInfo.sourceName || t('scanner.found_online')) : productInfo.source === 'local-miss' ? t('scanner.local_not_found_msg') : t('scanner.not_found_db')}</p>
                            <div className="scanner-result-code">{t('scanner.barcode', { code: productInfo.barcode })}</div>
                            {error && (
                                <div className="scanner-alert" role="alert">
                                    <AlertCircle className="h-5 w-5" />
                                    <div className="scanner-alert-copy">
                                        <strong>{t('common.error')}</strong>
                                        <span>{error}</span>
                                    </div>
                                </div>
                            )}
                            {productInfo.source === 'local-miss' && (
                                <div className="scanner-online-consent">
                                    <p>{t('scanner.online_search_privacy')}</p>
                                    <button type="button" onClick={handleOnlineSearch} disabled={loading} className="scanner-result-link">
                                        {loading ? <Loader2 className="scanner-spinner h-4 w-4" /> : <Search className="h-4 w-4" />}
                                        {loading ? t('scanner.searching_online') : t('scanner.search_online')}
                                    </button>
                                </div>
                            )}
                            {(productInfo.source === 'notfound' || productInfo.source === 'error') && (
                                <>
                                    <button type="button" onClick={handleGoogleSearch} className="scanner-result-link">
                                        <ExternalLink className="h-4 w-4" /> {t('scanner.google_search')}
                                    </button>
                                    {onQuickAdd && (
                                        <button type="button" onClick={handleQuickAdd} className="scanner-result-link">
                                            <Plus className="h-4 w-4" /> {t('scanner.quick_add')}
                                        </button>
                                    )}
                                </>
                            )}
                            <div className="scanner-result-actions">
                                <button type="button" onClick={handleRescan} className="scanner-result-action">{t('scanner.rescan')}</button>
                                <button type="button" onClick={handleUseProduct} disabled={loading} className="scanner-result-action scanner-result-action--primary">
                                    {loading
                                        ? t('common.loading')
                                        : productInfo.existingItem && onExistingItemFound
                                            ? existingItemActionLabel || t('common.select')
                                            : (productInfo.source === 'notfound' || productInfo.source === 'error')
                                                ? t('common.select')
                                                : (t('common.select') || 'Seç')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
