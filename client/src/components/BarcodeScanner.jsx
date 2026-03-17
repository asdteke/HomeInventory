import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import axios from 'axios';
import { X, Camera, AlertCircle, CheckCircle, Loader2, Package, Search, Plus, ExternalLink, Flashlight, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import cameraManager from '../utils/cameraManager';
import { useTranslation } from 'react-i18next';

// Beep sound for successful scan
const playBeep = (success = true) => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

export default function BarcodeScanner({ isOpen, onClose, onProductFound, onBarcodeOnly, onQuickAdd }) {
    const { t } = useTranslation();
    const html5QrcodeRef = useRef(null);
    const isMountedRef = useRef(true);
    const isStartingRef = useRef(false);
    const currentTrackRef = useRef(null); // Store camera track reference for flash control
    const imageCaptureRef = useRef(null); // Cached ImageCapture instance
    const currentSettingsRef = useRef(null); // Store current video settings for constraint preservation

    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [productInfo, setProductInfo] = useState(null);
    const scanProcessingRef = useRef(false);

    // Camera controls - hasFlash defaults to true to show button even before detection
    const [flashOn, setFlashOn] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hasFlash, setHasFlash] = useState(true); // Default true - button always visible
    const [maxZoom, setMaxZoom] = useState(8);
    const [flashSupported, setFlashSupported] = useState(null); // null = unknown, true/false = detected

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
    }, [isOpen]);

    // Full cleanup function that releases all camera resources
    const stopScanner = useCallback(async () => {
        console.log('[BarcodeScanner] Stopping scanner...');

        try {
            // First release global camera streams
            await cameraManager.releaseAllStreams();

            // Stop the video tracks manually
            const videoElement = document.querySelector('#barcode-reader video');
            if (videoElement && videoElement.srcObject) {
                const tracks = videoElement.srcObject.getTracks();
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
                } catch (e) {
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

    const startScanner = async () => {
        if (isStartingRef.current) {
            console.log('[BarcodeScanner] Already starting, skipping...');
            return;
        }

        isStartingRef.current = true;
        setError('');
        setStatus(t('scanner.init'));
        setProductInfo(null);
        scanProcessingRef.current = false;

        try {
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
                        const videoEl = document.querySelector('#barcode-reader video');
                        if (videoEl && videoEl.srcObject) {
                            const trk = videoEl.srcObject.getVideoTracks()[0];
                            await trk.applyConstraints({ advanced: [{ torch: false }] });
                            console.log('[BarcodeScanner] Torch pre-declared successfully');
                        }
                    } catch (e) {
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
                const videoElement = document.querySelector('#barcode-reader video');
                if (videoElement && videoElement.srcObject) {
                    cameraManager.registerStream(videoElement.srcObject, SCANNER_ID);

                    // Store track reference for flash control
                    const track = videoElement.srcObject.getVideoTracks()[0];
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
                                imageCaptureRef.current = new ImageCapture(track);
                                console.log('[BarcodeScanner] ImageCapture cached');
                            } catch (e) {
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
        } catch (err) {
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
        }
    };

    const applyAdvancedConstraints = async () => {
        try {
            const videoElement = document.querySelector('#barcode-reader video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                const capabilities = track.getCapabilities?.();

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
                        await track.applyConstraints({ advanced: advancedConstraints });
                    }
                }
            }
        } catch (e) {
            console.log('[BarcodeScanner] Could not apply advanced constraints:', e.message);
        }
    };

    const checkCameraCapabilities = async () => {
        try {
            const videoElement = document.querySelector('#barcode-reader video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                const capabilities = track.getCapabilities?.();

                if (capabilities) {
                    // Update flash support status
                    const torchSupported = !!capabilities.torch;
                    setFlashSupported(torchSupported);
                    // Always keep hasFlash true so button shows, but track actual support
                    if (capabilities.zoom) {
                        setMaxZoom(capabilities.zoom.max || 4);
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
            const videoElement = document.querySelector('#barcode-reader video');
            if (videoElement && videoElement.srcObject) {
                track = videoElement.srcObject.getVideoTracks()[0];
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
            } catch (imgErr) {
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
            await track.applyConstraints(fullConstraints);

            // Wait for hardware to process
            await new Promise(resolve => setTimeout(resolve, 150));

            // Verify with getSettings
            const verifySettings = track.getSettings?.();

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

        } catch (e) {
            console.log('[BarcodeScanner] applyConstraints failed:', e.message);
        }

        // METHOD 3: Try creating new ImageCapture as last resort
        try {
            if ('ImageCapture' in window) {
                console.log('[BarcodeScanner] Trying new ImageCapture instance...');
                const imageCapture = new ImageCapture(track);
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
        } catch (imgErr) {
            console.log('[BarcodeScanner] New ImageCapture also failed:', imgErr.message);
        }

        // All methods failed
        setFlashSupported(false);
        setFlashFeedback({ text: t('scanner.flash_unsupported'), type: 'error' });
        setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 3000);
        console.log('[BarcodeScanner] All flash methods failed');
    };

    const changeZoom = async (newZoom) => {
        try {
            const videoElement = document.querySelector('#barcode-reader video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
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

    const handleScanSuccess = async (barcode) => {
        if (scanProcessingRef.current || loading) return;
        scanProcessingRef.current = true;

        console.log('[BarcodeScanner] Barcode scanned:', barcode);
        await pauseScanner();
        await processBarcode(barcode);
    };

    const processBarcode = async (barcode) => {
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
            await stopScanner();

            if (productInfo.existingItem) {
                window.location.href = `/items/${productInfo.existingItem.id}/edit`;
            } else if (productInfo.name) {
                onProductFound({
                    name: productInfo.brand ? `${productInfo.brand} ${productInfo.name}` : productInfo.name,
                    barcode: productInfo.barcode,
                    imageUrl: productInfo.image
                });
                onClose();
            } else {
                onBarcodeOnly(productInfo.barcode);
                onClose();
            }
        }
    };

    const handleQuickAdd = () => {
        if (productInfo?.barcode && onQuickAdd) {
            onQuickAdd(productInfo.barcode);
            setProductInfo(null);
            scanProcessingRef.current = false;
            resumeScanner();
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

    const handleRetry = async () => {
        setError('');
        await stopScanner();
        await new Promise(r => setTimeout(r, 500));
        await startScanner();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white">
                        <Camera className="w-6 h-6" />
                        <span className="font-semibold">{t('scanner.title')}</span>
                    </div>
                    <button onClick={handleClose} className="p-2 text-white bg-white/20 rounded-full hover:bg-white/30">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Scanner Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-4">
                {!productInfo && (
                    <>
                        <div id="barcode-reader" className="w-full max-w-sm rounded-2xl overflow-hidden" />

                        {/* Camera Controls - Flash button always visible when scanning */}
                        {isScanning && (
                            <div className="flex flex-col items-center gap-3 mt-4">
                                <div className="flex items-center gap-4">
                                    {/* Flash Button - Always visible, gracefully fails if unsupported */}
                                    <button onClick={toggleFlash}
                                        className={`p-4 rounded-full transition-all duration-200 shadow-lg ${flashOn
                                            ? 'bg-yellow-400 text-black scale-110'
                                            : 'bg-black/50 text-white hover:bg-black/70'} 
                                            ${flashSupported === false ? 'opacity-50' : ''}`}
                                        title={flashSupported === false ? t('scanner.flash_unsupported') : (flashOn ? 'Flaşı Kapat' : 'Flaşı Aç')}>
                                        <Flashlight className="w-7 h-7" />
                                    </button>

                                    {/* Zoom Controls */}
                                    <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">
                                        <button onClick={() => changeZoom(Math.max(1, zoomLevel - 0.5))} className="p-1 text-white">
                                            <ZoomOut className="w-5 h-5" />
                                        </button>
                                        <span className="text-white text-sm min-w-[3rem] text-center">{zoomLevel.toFixed(1)}x</span>
                                        <button onClick={() => changeZoom(Math.min(maxZoom, zoomLevel + 0.5))} className="p-1 text-white">
                                            <ZoomIn className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Flash Message Toast */}
                                {flashFeedback.text && (
                                    <div className={`px-4 py-2 rounded-full text-sm font-medium animate-fade-in ${flashFeedback.type === 'success' ? 'bg-yellow-400 text-black' :
                                        flashFeedback.type === 'error' ? 'bg-red-500/80 text-white' :
                                            'bg-white/20 text-white'
                                        }`}>
                                        {flashFeedback.text}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-4 px-4 py-2 bg-white/10 rounded-full">
                            <p className="text-white/80 text-sm flex items-center gap-2">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                {status || t('scanner.hint')}
                            </p>
                        </div>

                        <div className="mt-3 text-center">
                            <p className="text-white/50 text-xs">{t('scanner.zoom_hint')}</p>
                        </div>
                    </>
                )}

                {/* Product Result */}
                {productInfo && (
                    <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl p-6 animate-slide-up">
                        {/* Found in Local DB */}
                        {productInfo.source === 'local' && (
                            <>
                                <div className="flex items-center gap-2 text-blue-500 mb-4">
                                    <Package className="w-6 h-6" />
                                    <span className="font-semibold">{t('scanner.found_local')}</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">{productInfo.name}</h3>
                                <p className="text-sm text-slate-500 text-center mb-4">{t('scanner.found_local_msg')}</p>
                            </>
                        )}

                        {/* Found Online */}
                        {productInfo.source === 'online' && (
                            <>
                                <div className="flex items-center gap-2 text-green-500 mb-4">
                                    <CheckCircle className="w-6 h-6" />
                                    <span className="font-semibold">{t('scanner.found_online')}</span>
                                    <span className="text-xs text-slate-400">({productInfo.sourceName})</span>
                                </div>

                                {productInfo.image && (
                                    <img src={productInfo.image} alt={productInfo.name} className="w-32 h-32 object-contain mx-auto mb-4 rounded-lg bg-white" />
                                )}

                                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">
                                    {productInfo.brand && <span className="text-primary-500">{productInfo.brand} </span>}
                                    {productInfo.name}
                                </h3>

                                {productInfo.isGoogleResult && (
                                    <p className="text-xs text-amber-500 text-center mb-2">{t('scanner.google_result')}</p>
                                )}

                                <p className="text-sm text-slate-500 text-center mb-4">{t('scanner.barcode', { code: productInfo.barcode })}</p>
                            </>
                        )}

                        {/* Not Found */}
                        {(productInfo.source === 'notfound' || productInfo.source === 'error') && (
                            <>
                                <div className="flex items-center gap-2 text-amber-500 mb-4">
                                    <Plus className="w-6 h-6" />
                                    <span className="font-semibold">{t('scanner.new_product')}</span>
                                </div>

                                <p className="text-slate-600 dark:text-slate-400 text-center mb-3">
                                    {t('scanner.not_found_db')}
                                </p>

                                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg text-center font-mono text-lg mb-3">
                                    {productInfo.barcode}
                                </div>

                                <button onClick={handleGoogleSearch}
                                    className="w-full flex items-center justify-center gap-2 p-3 mb-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 transition-colors">
                                    <ExternalLink className="w-4 h-4" />
                                    {t('scanner.google_search')}
                                </button>

                                {onQuickAdd && (
                                    <button onClick={handleQuickAdd}
                                        className="w-full flex items-center justify-center gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-xl hover:bg-amber-100 transition-colors">
                                        <Plus className="w-4 h-4" />
                                        {t('scanner.quick_add')}
                                    </button>
                                )}
                            </>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 mt-4">
                            <button onClick={handleRescan} className="flex-1 btn-secondary py-3">{t('scanner.rescan')}</button>
                            <button onClick={handleUseProduct} className="flex-1 btn-primary py-3">
                                {(productInfo.source === 'notfound' || productInfo.source === 'error') ? t('common.cancel') || 'İptal' : t('common.select') || 'Seç'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading State - if purely loading without camera */}
                {loading && !isScanning && (
                    <div className="flex flex-col items-center justify-center text-white">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p>{status}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
