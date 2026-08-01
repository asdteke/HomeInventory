import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { X, Camera, Loader2, Package, Search, Plus, ExternalLink, Flashlight, ZoomIn, ZoomOut, CheckCircle, AlertCircle } from 'lucide-react';
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
    const currentTrackRef = useRef<MediaStreamTrack | null>(null); // Store camera track reference for flash control
    const imageCaptureRef = useRef<any>(null); // Cached ImageCapture instance
    const currentSettingsRef = useRef<any>(null); // Store current video settings for constraint preservation

    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [preparingScanner, setPreparingScanner] = useState(false);
    const [productInfo, setProductInfo] = useState<any | null>(null);
    const scanProcessingRef = useRef(false);

    // Camera controls - hasFlash defaults to true to show button even before detection
    const [flashOn, setFlashOn] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hasFlash, setHasFlash] = useState(true); // Default true - button always visible
    const [maxZoom, setMaxZoom] = useState(8);
    const [flashSupported, setFlashSupported] = useState<boolean | null>(null); // null = unknown, true/false = detected

    // Updated to use object for type safety across languages
    const [flashFeedback, setFlashFeedback] = useState({ text: '', type: 'default' });

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Full cleanup function that releases all camera resources
    const stopScanner = useCallback(async () => {
        console.log('[BarcodeScanner] Stopping scanner...');

        try {
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
            }

            console.log('[BarcodeScanner] Scanner stopped successfully');
        } catch (err) {
            console.log('[BarcodeScanner] Stop error:', err);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            // Delay to ensure DOM is ready
            const timer = setTimeout(() => {
                if (isMountedRef.current && !html5QrcodeRef.current && !isStartingRef.current) {
                    startScanner();
                }
            }, 200);
            return () => clearTimeout(timer);
        } else {
            // When closed, cleanup
            stopScanner();
        }
    }, [isOpen, stopScanner]);

    const startScanner = async () => {
        if (isStartingRef.current) {
            console.log('[BarcodeScanner] Already starting, skipping...');
            return;
        }

        isStartingRef.current = true;
        setError('');
        setStatus(t('scanner.init'));
        setProductInfo(null);
        setPreparingScanner(true);
        scanProcessingRef.current = false;

        try {
            const { Html5Qrcode, Html5QrcodeSupportedFormats, cameraManager } = await loadScannerRuntime();

            // CRITICAL: Release any existing camera streams first
            console.log('[BarcodeScanner] Releasing existing streams...');
            await cameraManager.releaseAllStreams();

            // Wait for hardware to be fully released
            await new Promise(resolve => setTimeout(resolve, 300));

            // Check if DOM element exists
            const readerElement = document.getElementById('barcode-reader');
            if (!readerElement) {
                throw new Error('Scanner element not found');
            }

            const formatsToSupport = [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E
            ];

            html5QrcodeRef.current = new Html5Qrcode('barcode-reader', { formatsToSupport });

            // Try with environment camera first, fallback to any camera
            let started = false;

            // First attempt: exact environment camera with torch pre-declared
            try {
                console.log('[BarcodeScanner] Trying exact environment camera with torch capability...');
                await html5QrcodeRef.current.start(
                    { facingMode: { exact: 'environment' } },
                    {
                        fps: 15,
                        qrbox: { width: 280, height: 160 },
                        aspectRatio: 16 / 9,
                        disableFlip: false
                    },
                    handleScanSuccess,
                    () => { }
                );
                started = true;

                // Pre-declare torch capability by setting it to false initially
                // This helps Brave and other browsers recognize torch as a valid constraint
                setTimeout(async () => {
                    try {
                        const videoEl = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
                        if (videoEl && videoEl.srcObject) {
                            const trk = (videoEl.srcObject as MediaStream).getVideoTracks()[0];
                            await trk.applyConstraints({ advanced: [{ torch: false }] as any });
                            console.log('[BarcodeScanner] Torch pre-declared successfully');
                        }
                    } catch (e: any) {
                        console.log('[BarcodeScanner] Torch pre-declaration skipped:', e.message);
                    }
                }, 500);
            } catch (exactErr) {
                console.log('[BarcodeScanner] Exact environment failed, trying fallback...');

                // Second attempt: prefer environment
                try {
                    await html5QrcodeRef.current.start(
                        { facingMode: 'environment' },
                        {
                            fps: 15,
                            qrbox: { width: 280, height: 160 },
                            aspectRatio: 16 / 9,
                            disableFlip: false
                        },
                        handleScanSuccess,
                        () => { }
                    );
                    started = true;
                } catch (envErr) {
                    console.log('[BarcodeScanner] Environment fallback failed, trying any camera...');

                    // Third attempt: any available camera
                    await html5QrcodeRef.current.start(
                        { facingMode: 'user' },
                        {
                            fps: 15,
                            qrbox: { width: 280, height: 160 },
                            aspectRatio: 16 / 9,
                            disableFlip: false
                        },
                        handleScanSuccess,
                        () => { }
                    );
                    started = true;
                }
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
                            currentSettingsRef.current = {
                                width: settings.width,
                                height: settings.height,
                                facingMode: settings.facingMode
                            };
                        }

                        // Cache ImageCapture instance if supported
                        if ('ImageCapture' in window) {
                            try {
                                imageCaptureRef.current = new (window as any).ImageCapture(track);
                                console.log('[BarcodeScanner] ImageCapture cached');
                            } catch (e: any) {
                                console.log('[BarcodeScanner] ImageCapture not available:', e.message);
                            }
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
                    if (isMountedRef.current) {
                        await checkCameraCapabilities();
                    }
                }, 1000);
            }
        } catch (err: any) {
            console.error('[BarcodeScanner] Start error:', err);

            if (isMountedRef.current) {
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
            isStartingRef.current = false;
            if (isMountedRef.current) {
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
                    // Always keep hasFlash true so button shows, but track actual support
                    if (capabilities.zoom) {
                        setMaxZoom((capabilities.zoom as any).max || 4);
                    }
                    console.log('[BarcodeScanner] Camera capabilities - Torch:', torchSupported);
                }
            }
        } catch (e) {
            console.log('[BarcodeScanner] Could not get camera capabilities');
        }
    };

    const toggleFlash = async () => {
        // 100ms initial delay to avoid UI interaction conflicts with hardware commands
        await new Promise(r => setTimeout(r, 100));

        console.log('[BarcodeScanner] Toggle flash called, current state:', flashOn);
        setFlashFeedback({ text: '', type: 'default' });

        // Try to get track from ref first, fallback to DOM query
        let track = currentTrackRef.current;

        if (!track) {
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                if (track) currentTrackRef.current = track;
            }
        }

        if (!track) {
            console.log('[BarcodeScanner] No track available for flash');
            setFlashFeedback({ text: t('scanner.not_found_error'), type: 'error' });
            setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 2000);
            return;
        }

        const newFlashState = !flashOn;

        // METHOD 1: Try cached ImageCapture first (most reliable on Android)
        if (imageCaptureRef.current) {
            try {
                console.log('[BarcodeScanner] Trying cached ImageCapture...');
                const photoCapabilities = await imageCaptureRef.current.getPhotoCapabilities();

                if (photoCapabilities.fillLightMode?.includes('torch') || photoCapabilities.fillLightMode?.includes('flash')) {
                    const mode = newFlashState ? 'torch' : 'off';
                    await imageCaptureRef.current.setOptions({ fillLightMode: mode });

                    // Give hardware time to respond
                    await new Promise(r => setTimeout(r, 150));

                    setFlashOn(newFlashState);
                    setFlashSupported(true);
                    setFlashFeedback({ text: newFlashState ? t('scanner.flash_on') : '', type: 'success' });
                    setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 2000);
                    console.log('[BarcodeScanner] Flash toggled via ImageCapture (cached)');
                    return;
                }
            } catch (imgErr: any) {
                console.log('[BarcodeScanner] Cached ImageCapture failed:', imgErr.message);
            }
        }

        // METHOD 2: applyConstraints with FULL settings preservation
        try {
            console.log('[BarcodeScanner] Trying applyConstraints with full settings...');

            // Build complete constraints including current resolution to not disrupt stream
            const currentSettings = currentSettingsRef.current || track.getSettings?.() || {};
            const fullConstraints = {
                advanced: [{
                    torch: newFlashState,
                    // Preserve current resolution to avoid stream disruption
                    ...(currentSettings.width && { width: currentSettings.width }),
                    ...(currentSettings.height && { height: currentSettings.height })
                }]
            };

            console.log('[BarcodeScanner] Applying constraints:', JSON.stringify(fullConstraints));
            await track.applyConstraints(fullConstraints as any);

            // Wait for hardware to process
            await new Promise(resolve => setTimeout(resolve, 150));

            // Verify with getSettings
            const verifySettings = track.getSettings?.() as any;

            if (verifySettings && typeof verifySettings.torch !== 'undefined') {
                const actualTorchState = verifySettings.torch;
                console.log('[BarcodeScanner] Torch state after apply:', actualTorchState);
                setFlashOn(actualTorchState);

                if (actualTorchState === newFlashState) {
                    setFlashSupported(true);
                    setFlashFeedback({ text: newFlashState ? t('scanner.flash_on') : '', type: 'success' });
                } else {
                    // Command accepted but hardware didn't respond
                    setFlashFeedback({ text: t('common.error'), type: 'error' });
                    setFlashSupported(false);
                }
            } else {
                // No verification available - trust the command
                setFlashOn(newFlashState);
                setFlashSupported(true);
                setFlashFeedback({ text: newFlashState ? t('scanner.flash_on') : '', type: 'success' });
            }

            setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 3000);
            console.log('[BarcodeScanner] Flash toggle completed');
            return;

        } catch (e: any) {
            console.log('[BarcodeScanner] applyConstraints failed:', e.message);
        }

        // METHOD 3: Try creating new ImageCapture as last resort
        try {
            if ('ImageCapture' in window) {
                console.log('[BarcodeScanner] Trying new ImageCapture instance...');
                const imageCapture = new (window as any).ImageCapture(track);
                const photoCapabilities = await imageCapture.getPhotoCapabilities();

                if (photoCapabilities.fillLightMode?.includes('flash') || photoCapabilities.fillLightMode?.includes('torch')) {
                    await imageCapture.setOptions({ fillLightMode: newFlashState ? 'torch' : 'off' });
                    await new Promise(r => setTimeout(r, 150));

                    setFlashOn(newFlashState);
                    setFlashSupported(true);
                    setFlashFeedback({ text: newFlashState ? t('scanner.flash_on') : '', type: 'success' });
                    setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 2000);

                    // Cache for next time
                    imageCaptureRef.current = imageCapture;
                    console.log('[BarcodeScanner] Flash toggled via new ImageCapture');
                    return;
                }
            }
        } catch (imgErr: any) {
            console.log('[BarcodeScanner] New ImageCapture also failed:', imgErr.message);
        }

        // All methods failed
        setFlashSupported(false);
        setFlashFeedback({ text: t('scanner.flash_unsupported'), type: 'error' });
        setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 3000);
        console.log('[BarcodeScanner] All flash methods failed');
    };

    const changeZoom = async (newZoom: number) => {
        try {
            const videoElement = document.querySelector('#barcode-reader video') as HTMLVideoElement | null;
            if (videoElement && videoElement.srcObject) {
                const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0];
                await track.applyConstraints({ advanced: [{ zoom: newZoom }] as any });
                setZoomLevel(newZoom);
            }
        } catch (e) {
            console.log('[BarcodeScanner] Zoom change failed:', e);
        }
    };

    const pauseScanner = async () => {
        if (html5QrcodeRef.current && isScanning) {
            try {
                await html5QrcodeRef.current.pause(true);
            } catch (err) { }
        }
    };

    const resumeScanner = async () => {
        if (html5QrcodeRef.current) {
            try {
                await html5QrcodeRef.current.resume();
                scanProcessingRef.current = false;
                setProductInfo(null);
                setError('');
                setStatus(t('scanner.hint'));
            } catch (err) {
                // If resume fails, restart scanner
                await stopScanner();
                await new Promise(r => setTimeout(r, 300));
                await startScanner();
            }
        }
    };

    const handleScanSuccess = async (barcode: string) => {
        if (scanProcessingRef.current || loading) return;
        scanProcessingRef.current = true;

        console.log('[BarcodeScanner] Barcode scanned:', barcode);
        await pauseScanner();
        await processBarcode(barcode);
    };

    const processBarcode = async (barcode: string) => {
        setLoading(true);
        setStatus(t('scanner.searching'));
        vibrateSuccess();
        playBeep(true);

        try {
            const response = await axios.get(`/api/barcode/${barcode}`);
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
                vibrateError();
                playBeep(false);
                setProductInfo({
                    source: 'notfound',
                    name: null,
                    barcode: barcode
                });
                setStatus(t('scanner.not_found'));
            }
        } catch (err) {
            console.error('[BarcodeScanner] Barcode lookup error:', err);
            vibrateError();
            playBeep(false);
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
                setProductInfo(null);
                scanProcessingRef.current = false;
                await resumeScanner();
            } catch (err: any) {
                setError(err?.message || t('common.error'));
            } finally {
                setLoading(false);
            }
        }
    };

    const handleGoogleSearch = () => {
        if (productInfo?.barcode) {
            window.open(`https://www.google.com/search?q=${productInfo.barcode}`, '_blank');
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
        setProductInfo(null);
        setError('');
        scanProcessingRef.current = false;
        await resumeScanner();
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
                                    <div className="scanner-reticle" aria-hidden="true"><span /></div>
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
                                            className={`scanner-control ${flashOn ? 'is-on' : ''}`}
                                            title={flashSupported === false ? t('scanner.flash_unsupported') : (flashOn ? 'Flaşı Kapat' : 'Flaşı Aç')}
                                            aria-label={flashSupported === false ? t('scanner.flash_unsupported') : (flashOn ? 'Flaşı Kapat' : 'Flaşı Aç')}
                                        >
                                            <Flashlight className="h-5 w-5" />
                                        </button>
                                        <div className="scanner-zoom" aria-label={t('scanner.zoom_hint')}>
                                            <button type="button" onClick={() => changeZoom(Math.max(1, zoomLevel - 0.5))} disabled={zoomLevel <= 1} aria-label="Zoom out">
                                                <ZoomOut className="h-4 w-4" />
                                            </button>
                                            <strong>{zoomLevel.toFixed(1)}x</strong>
                                            <button type="button" onClick={() => changeZoom(Math.min(maxZoom, zoomLevel + 0.5))} disabled={zoomLevel >= maxZoom} aria-label="Zoom in">
                                                <ZoomIn className="h-4 w-4" />
                                            </button>
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
                            <h3>{productInfo.name ? `${productInfo.brand ? `${productInfo.brand} ` : ''}${productInfo.name}` : t('scanner.not_found_db')}</h3>
                            <p>{productInfo.source === 'local' ? t('scanner.found_local_msg') : productInfo.source === 'online' ? (productInfo.sourceName || t('scanner.found_online')) : t('scanner.not_found_db')}</p>
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
                                                ? (t('common.cancel') || 'İptal')
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
