import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { X, Camera, AlertCircle, CheckCircle, Flashlight, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadScannerRuntime } from '../utils/scannerRuntime';
import '../scanner.css';

const SCANNER_ID = 'qr-scanner';
const QR_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 }
};
const QR_ZOOM_PRESETS = [1, 2, 4, 8];

const getResponsiveQrScanBox = (viewfinderWidth: number, viewfinderHeight: number) => {
    const availableWidth = Math.max(1, Number(viewfinderWidth) || 1);
    const availableHeight = Math.max(1, Number(viewfinderHeight) || 1);
    const size = Math.floor(Math.min(280, availableWidth * 0.72, availableHeight * 0.72));
    return {
        width: Math.max(1, Math.min(Math.max(120, size), Math.max(1, availableWidth - 2))),
        height: Math.max(1, Math.min(Math.max(120, size), Math.max(1, availableHeight - 2)))
    };
};

export interface QRScannerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function QRScanner({ isOpen, onClose }: QRScannerProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const scannerRef = useRef<HTMLDivElement>(null);
    const html5QrcodeRef = useRef<any>(null);
    const isMountedRef = useRef<boolean>(true);
    const isStartingRef = useRef<boolean>(false);
    const startAttemptRef = useRef(0);
    const scanProcessingRef = useRef(false);
    const currentTrackRef = useRef<MediaStreamTrack | null>(null);

    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [preparingScanner, setPreparingScanner] = useState<boolean>(false);
    const [scanDetected, setScanDetected] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [flashSupported, setFlashSupported] = useState<boolean | null>(null);
    const [isFlashChanging, setIsFlashChanging] = useState(false);
    const flashChangingRef = useRef(false);
    const [flashFeedback, setFlashFeedback] = useState({ text: '', type: 'default' });
    const [zoomLevel, setZoomLevel] = useState(1);
    const [maxZoom, setMaxZoom] = useState(1);
    const [zoomSupported, setZoomSupported] = useState<boolean | null>(null);
    const [isZoomChanging, setIsZoomChanging] = useState(false);
    const zoomChangingRef = useRef(false);

    // Full cleanup function
    const stopScanner = useCallback(async (preserveDetected = false) => {
        console.log('[QRScanner] Stopping scanner...');
        startAttemptRef.current += 1;
        isStartingRef.current = false;
        scanProcessingRef.current = true;

        try {
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
                    console.log('[QRScanner] Torch cleanup skipped:', error);
                }
            }

            const { cameraManager } = await loadScannerRuntime();

            // Release global camera streams first
            await cameraManager.releaseAllStreams();

            // Stop video tracks manually
            const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
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
                    if (state === 2 || state === 3) {
                        await html5QrcodeRef.current.stop();
                    }
                } catch (e: any) {
                    console.log('[QRScanner] Scanner already stopped:', e.message);
                }

                try {
                    html5QrcodeRef.current.clear();
                } catch (e) { }

                html5QrcodeRef.current = null;
            }

            if (isMountedRef.current) {
                setIsScanning(false);
                setPreparingScanner(false);
                setFlashOn(false);
                setFlashSupported(null);
                setZoomLevel(1);
                setMaxZoom(1);
                setZoomSupported(null);
                if (!preserveDetected) setScanDetected(false);
            }
            currentTrackRef.current = null;

            console.log('[QRScanner] Scanner stopped successfully');
        } catch (err) {
            console.log('[QRScanner] Stop error:', err);
        }
    }, []);

    const startScanner = async () => {
        if (isStartingRef.current) {
            console.log('[QRScanner] Already starting, skipping...');
            return;
        }

        const attemptId = startAttemptRef.current + 1;
        startAttemptRef.current = attemptId;
        isStartingRef.current = true;
        scanProcessingRef.current = false;
        setError('');
        setSuccess('');
        setPreparingScanner(true);
        setScanDetected(false);

        try {
            const { Html5Qrcode, cameraManager } = await loadScannerRuntime();

            // CRITICAL: Release any existing camera streams first
            console.log('[QRScanner] Releasing existing streams...');
            const wasCameraActive = !cameraManager.isAvailable();
            await cameraManager.releaseAllStreams();

            // Only pause for a camera hand-off. On the initial open there is
            // no hardware lock to wait for.
            if (wasCameraActive) {
                await new Promise(resolve => setTimeout(resolve, 120));
            }

            if (attemptId !== startAttemptRef.current) return;

            // Check if DOM element exists
            const readerElement = document.getElementById('qr-reader');
            if (!readerElement) {
                throw new Error('Scanner element not found');
            }

            const scannerInstance = new Html5Qrcode('qr-reader');
            html5QrcodeRef.current = scannerInstance;

            console.log('[QRScanner] Starting preferred environment camera...');
            await scannerInstance.start(
                { facingMode: 'environment' },
                {
                    fps: 12,
                    qrbox: getResponsiveQrScanBox,
                    disableFlip: false,
                    videoConstraints: QR_VIDEO_CONSTRAINTS
                },
                (decodedText: string) => handleScanSuccess(decodedText),
                () => { }
            );

            if (attemptId !== startAttemptRef.current) {
                try { await scannerInstance.stop(); } catch (e) { }
                try { scannerInstance.clear(); } catch (e) { }
                if (html5QrcodeRef.current === scannerInstance) {
                    html5QrcodeRef.current = null;
                }
                return;
            }

            if (isMountedRef.current) {
                // Register the stream with global manager
                const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
                if (videoElement && videoElement.srcObject) {
                    cameraManager.registerStream(videoElement.srcObject as MediaStream, SCANNER_ID);
                    currentTrackRef.current = (videoElement.srcObject as MediaStream).getVideoTracks()[0] || null;
                }

                setIsScanning(true);
                await checkCameraCapabilities();
                await applyAdvancedCameraConstraints();
            }
        } catch (err: any) {
            console.error('[QRScanner] Start error:', err);

            if (isMountedRef.current && attemptId === startAttemptRef.current) {
                const errStr = err.toString();
                if (errStr.includes('Permission')) {
                    setError(t('scanner.permission_error'));
                } else if (errStr.includes('NotReadableError') || errStr.includes('TrackStartError')) {
                    setError(t('scanner.busy_error'));
                } else if (errStr.includes('NotFoundError')) {
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

    const checkCameraCapabilities = async () => {
        const track = currentTrackRef.current;
        try {
            const capabilities = track?.getCapabilities?.() as any;
            if (!track || !capabilities) {
                setFlashSupported(false);
                setZoomSupported(false);
                return;
            }

            setFlashSupported(capabilities.torch === true);
            if (capabilities.zoom) {
                const practicalMax = Math.min(Number(capabilities.zoom.max) || 1, 8);
                const currentZoom = Number((track.getSettings?.() as any)?.zoom) || 1;
                setMaxZoom(practicalMax);
                setZoomLevel(Math.min(practicalMax, Math.max(1, currentZoom)));
                setZoomSupported(practicalMax > 1);
            } else {
                setZoomSupported(false);
            }
        } catch (error) {
            console.log('[QRScanner] Capability check failed:', error);
            setFlashSupported(false);
            setZoomSupported(false);
        }
    };

    const applyAdvancedCameraConstraints = async () => {
        const track = currentTrackRef.current;
        try {
            const capabilities = track?.getCapabilities?.() as any;
            if (!track || !capabilities) return;

            const advanced = [];
            if (capabilities.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
            if (capabilities.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
            if (capabilities.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
            if (advanced.length > 0) {
                await track.applyConstraints({ advanced: advanced as any });
            }
        } catch (error) {
            console.log('[QRScanner] Advanced camera constraints skipped:', error);
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
        } catch (error) {
            console.log('[QRScanner] Torch change failed:', error);
            setFlashFeedback({ text: t('common.error'), type: 'error' });
        } finally {
            setTimeout(() => setFlashFeedback({ text: '', type: 'default' }), 2000);
            flashChangingRef.current = false;
            setIsFlashChanging(false);
        }
    };

    const changeZoom = async (requestedZoom: number) => {
        if (zoomChangingRef.current) return;

        zoomChangingRef.current = true;
        setIsZoomChanging(true);
        try {
            const track = currentTrackRef.current;
            const capabilities = track?.getCapabilities?.() as any;
            if (!track || !capabilities?.zoom) {
                setZoomSupported(false);
                return;
            }

            const supportedMin = Number(capabilities.zoom.min) || 1;
            const supportedMax = Math.min(Number(capabilities.zoom.max) || 1, 8);
            const targetZoom = Math.min(supportedMax, Math.max(supportedMin, requestedZoom));
            const focusMode = capabilities.focusMode?.includes('continuous') ? 'continuous' : undefined;
            await track.applyConstraints({
                advanced: [{ zoom: targetZoom, ...(focusMode && { focusMode }) }] as any
            });
            setZoomLevel(Number((track.getSettings?.() as any)?.zoom) || targetZoom);
        } catch (error) {
            console.log('[QRScanner] Zoom change failed:', error);
        } finally {
            zoomChangingRef.current = false;
            setIsZoomChanging(false);
        }
    };

    // Track mounted state
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            void stopScanner();
        };
    }, [stopScanner]);

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            const frame = requestAnimationFrame(() => {
                if (isMountedRef.current && scannerRef.current && !html5QrcodeRef.current && !isStartingRef.current) {
                    startScanner();
                }
            });
            return () => cancelAnimationFrame(frame);
        } else {
            stopScanner();
        }
    }, [isOpen, stopScanner]);

    const handleScanSuccess = async (decodedText: string) => {
        if (scanProcessingRef.current) return;
        scanProcessingRef.current = true;
        setScanDetected(true);
        console.log('[QRScanner] QR Scanned:', decodedText);

        try {
            await html5QrcodeRef.current?.pause(true);
        } catch (error) {
            console.log('[QRScanner] Pause skipped:', error);
        }
        if (isMountedRef.current) setIsScanning(false);

        // Check if it's a valid item URL
        const itemMatch = decodedText.match(/\/items\/(\d+)\/edit/);

        if (itemMatch) {
            const itemId = itemMatch[1];
            setSuccess(t('scanner.found_item_redirect'));

            await stopScanner(true);

            setTimeout(() => {
                onClose();
                navigate(`/items/${itemId}/edit`);
            }, 1000);
        } else if (decodedText.includes(window.location.origin)) {
            setSuccess(t('scanner.found_page_redirect'));
            await stopScanner(true);

            setTimeout(() => {
                onClose();
                window.location.href = decodedText;
            }, 1000);
        } else {
            setScanDetected(false);
            setError(t('scanner.invalid_qr'));
        }
    };

    const handleClose = async () => {
        await stopScanner();
        onClose();
    };

    const handleRetry = async () => {
        setError('');
        await stopScanner();
        await new Promise(r => setTimeout(r, 120));
        await startScanner();
    };

    if (!isOpen) return null;

    return (
        <div className="scanner-overlay">
            <section className="scanner-shell" role="dialog" aria-modal="true" aria-labelledby="qr-scanner-title">
                <header className="scanner-header">
                    <div className="scanner-heading">
                        <span className="scanner-heading-icon"><Camera className="h-5 w-5" /></span>
                        <div className="scanner-heading-copy">
                            <h2 id="qr-scanner-title">{t('scanner.qr_title')}</h2>
                            <p>{t('scanner.qr_subtitle')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} className="scanner-close" aria-label={t('common.close')}>
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="scanner-body">
                    <div className="scanner-stage">
                        <div className="scanner-camera">
                            <div id="qr-reader" ref={scannerRef} />
                            <div className={`scanner-reticle scanner-reticle--qr ${scanDetected ? 'is-detected' : ''}`} aria-hidden="true"><span /></div>
                            {isScanning && <div className="scanner-scanline scanner-scanline--qr" aria-hidden="true" />}
                            {!isScanning && !error && !success && (
                                <div className="scanner-permission-note"><Camera className="h-3.5 w-3.5" /><span>{t('scanner.init')}</span></div>
                            )}
                            {preparingScanner && !isScanning && !error && !success && (
                                <div className="scanner-state-cover">
                                    <div className="scanner-state-card"><RefreshCw className="scanner-spinner h-5 w-5" /><span>{t('scanner.init')}</span></div>
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
                                    aria-label={flashSupported === false ? t('scanner.flash_unsupported') : t('scanner.flash_on')}
                                    aria-pressed={flashOn}
                                >
                                    <Flashlight className="h-5 w-5" />
                                </button>
                                <div className="scanner-zoom" aria-label={t('scanner.zoom_hint')}>
                                    {QR_ZOOM_PRESETS.filter((preset) => preset <= maxZoom).map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => changeZoom(preset)}
                                            disabled={zoomSupported === false || isZoomChanging}
                                            className={Math.abs(zoomLevel - preset) < 0.1 ? 'is-active' : ''}
                                            aria-pressed={Math.abs(zoomLevel - preset) < 0.1}
                                        >
                                            {preset}×
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
                                        <button type="button" onClick={handleRetry} className="scanner-alert-button"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />{t('scanner.retry')}</button>
                                    </div>
                                </div>
                                <button type="button" onClick={handleRetry} className="scanner-alert-dismiss" aria-label={t('scanner.retry')}><X className="h-4 w-4" /></button>
                            </div>
                        )}
                        {success && (
                            <div className="scanner-alert scanner-alert--success" role="status">
                                <CheckCircle className="h-5 w-5" />
                                <div className="scanner-alert-copy"><strong>{t('common.success')}</strong><span>{success}</span></div>
                            </div>
                        )}
                    </div>

                    <div className="scanner-guidance">
                        <span className="scanner-guidance-icon"><Camera className="h-4 w-4" /></span>
                        <p>{t('scanner.qr_hint')}<small>{t('scanner.qr_subtitle')}</small></p>
                    </div>
                </div>
            </section>
        </div>
    );
}
