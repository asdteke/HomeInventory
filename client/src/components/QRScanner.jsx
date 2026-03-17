import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import cameraManager from '../utils/cameraManager';
import { useTranslation } from 'react-i18next';

const SCANNER_ID = 'qr-scanner';

export default function QRScanner({ isOpen, onClose }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const scannerRef = useRef(null);
    const html5QrcodeRef = useRef(null);
    const isMountedRef = useRef(true);
    const isStartingRef = useRef(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isScanning, setIsScanning] = useState(false);

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
    }, [isOpen]);

    // Full cleanup function
    const stopScanner = useCallback(async () => {
        console.log('[QRScanner] Stopping scanner...');

        try {
            // Release global camera streams first
            await cameraManager.releaseAllStreams();

            // Stop video tracks manually
            const videoElement = document.querySelector('#qr-reader video');
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
                    if (state === 2 || state === 3) {
                        await html5QrcodeRef.current.stop();
                    }
                } catch (e) {
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

        try {
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
                    (decodedText) => handleScanSuccess(decodedText),
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
                        (decodedText) => handleScanSuccess(decodedText),
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
                        (decodedText) => handleScanSuccess(decodedText),
                        () => { }
                    );
                    started = true;
                }
            }

            if (started && isMountedRef.current) {
                // Register the stream with global manager
                const videoElement = document.querySelector('#qr-reader video');
                if (videoElement && videoElement.srcObject) {
                    cameraManager.registerStream(videoElement.srcObject, SCANNER_ID);
                }

                setIsScanning(true);
            }
        } catch (err) {
            console.error('[QRScanner] Start error:', err);

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

    const handleScanSuccess = async (decodedText) => {
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
        <div className="fixed inset-0 z-50 bg-black">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white">
                        <Camera className="w-6 h-6" />
                        <span className="font-semibold">{t('scanner.qr_title')}</span>
                    </div>
                    <button onClick={handleClose} className="p-2 text-white bg-white/20 rounded-full hover:bg-white/30">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Scanner */}
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div id="qr-reader" ref={scannerRef} className="w-full max-w-sm rounded-2xl overflow-hidden" />

                {/* Error Message with Retry */}
                {error && (
                    <div className="absolute bottom-24 left-4 right-4 p-4 bg-red-500/90 text-white rounded-xl">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <span className="text-sm block mb-2">{error}</span>
                                <button onClick={handleRetry} className="flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-lg text-sm hover:bg-white/30">
                                    <RefreshCw className="w-4 h-4" />
                                    {t('scanner.retry')}
                                </button>
                            </div>
                            <button onClick={() => setError('')} className="p-1 hover:bg-white/20 rounded">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Success Message */}
                {success && (
                    <div className="absolute bottom-24 left-4 right-4 flex items-center gap-3 p-4 bg-green-500/90 text-white rounded-xl">
                        <CheckCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm">{success}</span>
                    </div>
                )}
            </div>

            {/* Instructions */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-center">
                <p className="text-white/80 text-sm">{t('scanner.qr_hint')}</p>
            </div>
        </div>
    );
}
