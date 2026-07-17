import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Camera, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadScannerRuntime } from '../utils/scannerRuntime';
import '../scanner.css';

const SCANNER_ID = 'qr-scanner';

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

    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [preparingScanner, setPreparingScanner] = useState<boolean>(false);

    // Full cleanup function
    const stopScanner = useCallback(async () => {
        console.log('[QRScanner] Stopping scanner...');

        try {
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
            }

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

        isStartingRef.current = true;
        setError('');
        setSuccess('');
        setPreparingScanner(true);

        try {
            const { Html5Qrcode, cameraManager } = await loadScannerRuntime();

            // CRITICAL: Release any existing camera streams first
            console.log('[QRScanner] Releasing existing streams...');
            await cameraManager.releaseAllStreams();

            // Wait for hardware to be fully released
            await new Promise(resolve => setTimeout(resolve, 300));

            // Check if DOM element exists
            const readerElement = document.getElementById('qr-reader');
            if (!readerElement) {
                throw new Error('Scanner element not found');
            }

            html5QrcodeRef.current = new Html5Qrcode('qr-reader');

            // Try with environment camera first, fallback to any camera
            let started = false;

            // First attempt: exact environment camera
            try {
                console.log('[QRScanner] Trying exact environment camera...');
                await html5QrcodeRef.current.start(
                    { facingMode: { exact: 'environment' } },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1
                    },
                    (decodedText: string) => handleScanSuccess(decodedText),
                    () => { }
                );
                started = true;
            } catch (exactErr) {
                console.log('[QRScanner] Exact environment failed, trying fallback...');

                // Second attempt: prefer environment
                try {
                    await html5QrcodeRef.current.start(
                        { facingMode: 'environment' },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                            aspectRatio: 1
                        },
                        (decodedText: string) => handleScanSuccess(decodedText),
                        () => { }
                    );
                    started = true;
                } catch (envErr) {
                    console.log('[QRScanner] Environment fallback failed, trying any camera...');

                    // Third attempt: any available camera
                    await html5QrcodeRef.current.start(
                        { facingMode: 'user' },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                            aspectRatio: 1
                        },
                        (decodedText: string) => handleScanSuccess(decodedText),
                        () => { }
                    );
                    started = true;
                }
            }

            if (started && isMountedRef.current) {
                // Register the stream with global manager
                const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
                if (videoElement && videoElement.srcObject) {
                    cameraManager.registerStream(videoElement.srcObject as MediaStream, SCANNER_ID);
                }

                setIsScanning(true);
            }
        } catch (err: any) {
            console.error('[QRScanner] Start error:', err);

            if (isMountedRef.current) {
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
            isStartingRef.current = false;
            if (isMountedRef.current) {
                setPreparingScanner(false);
            }
        }
    };

    // Track mounted state
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
                if (isMountedRef.current && scannerRef.current && !html5QrcodeRef.current && !isStartingRef.current) {
                    startScanner();
                }
            }, 200);
            return () => clearTimeout(timer);
        } else {
            stopScanner();
        }
    }, [isOpen, stopScanner]);

    const handleScanSuccess = async (decodedText: string) => {
        console.log('[QRScanner] QR Scanned:', decodedText);

        // Check if it's a valid item URL
        const itemMatch = decodedText.match(/\/items\/(\d+)\/edit/);

        if (itemMatch) {
            const itemId = itemMatch[1];
            setSuccess(t('scanner.found_item_redirect'));

            await stopScanner();

            setTimeout(() => {
                onClose();
                navigate(`/items/${itemId}/edit`);
            }, 1000);
        } else if (decodedText.includes(window.location.origin)) {
            setSuccess(t('scanner.found_page_redirect'));
            await stopScanner();

            setTimeout(() => {
                onClose();
                window.location.href = decodedText;
            }, 1000);
        } else {
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
        await new Promise(r => setTimeout(r, 500));
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
                            <div className="scanner-reticle scanner-reticle--qr" aria-hidden="true"><span /></div>
                            {isScanning && <div className="scanner-scanline scanner-scanline--qr" aria-hidden="true" />}
                            {!isScanning && !error && !success && (
                                <div className="scanner-permission-note"><Camera className="h-3.5 w-3.5" /><span>{t('scanner.init')}</span></div>
                            )}
                            {preparingScanner && !isScanning && !error && !success && (
                                <div className="scanner-state-cover">
                                    <div className="scanner-state-card"><RefreshCw className="scanner-spinner h-5 w-5" /><span>{t('scanner.init')}</span></div>
                                </div>
                            )}
                        </div>

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
                                <button type="button" onClick={() => setError('')} className="scanner-alert-dismiss" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
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
