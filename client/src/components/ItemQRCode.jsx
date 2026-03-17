import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import axios from 'axios';
import { Copy, Check, Download, RefreshCw, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ItemQRCode({ itemId, itemName, size = 250 }) {
    const { t } = useTranslation();
    const canvasRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [itemUrl, setItemUrl] = useState('');
    const [serverInfo, setServerInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch server IP on mount
    useEffect(() => {
        fetchServerInfo();
    }, []);

    // Generate QR when itemId or serverInfo changes
    useEffect(() => {
        if (canvasRef.current && itemId && itemUrl) {
            generateQRCode();
        }
    }, [itemId, itemUrl, size]);

    const fetchServerInfo = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/server-info');
            setServerInfo(response.data);

            // Build URL with server's detected IP
            const url = `http://${response.data.ip}:${response.data.frontendPort}/items/${itemId}/edit`;
            setItemUrl(url);
        } catch (error) {
            console.error('Failed to get server info:', error);
            // Fallback to current window location
            const protocol = window.location.protocol;
            const hostname = window.location.hostname;
            const port = window.location.port || '5173';
            const fallbackUrl = `${protocol}//${hostname}:${port}/items/${itemId}/edit`;
            setItemUrl(fallbackUrl);
        } finally {
            setLoading(false);
        }
    };

    const generateQRCode = () => {
        QRCode.toCanvas(canvasRef.current, itemUrl, {
            width: size,
            margin: 2,
            color: {
                dark: '#1e293b',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'H' // High error correction for better scanning
        }, (error) => {
            if (error) console.error('QR Code error:', error);
        });
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(itemUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleDownloadQR = () => {
        if (canvasRef.current) {
            const link = document.createElement('a');
            link.download = `qr-${itemName || itemId}.png`;
            link.href = canvasRef.current.toDataURL('image/png');
            link.click();
        }
    };

    if (!itemId) return null;

    return (
        <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {/* QR Code */}
            <div className="p-4 bg-white rounded-xl shadow-inner">
                {loading ? (
                    <div className="w-[250px] h-[250px] flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
                    </div>
                ) : (
                    <canvas ref={canvasRef} className="rounded-lg" />
                )}
            </div>

            {/* Item Name */}
            <div className="text-center">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{itemName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {t('item_qr.hint_mobile')}
                </p>
            </div>

            {/* Server IP Info */}
            {serverInfo && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30">
                    <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                        {t('item_qr.network_ip')}: <strong>{serverInfo.ip}</strong>
                    </span>
                </div>
            )}

            {/* URL Display */}
            <div className="w-full p-3 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400 font-mono break-all text-center border border-slate-200 dark:border-slate-700">
                {itemUrl || t('item_qr.url_loading')}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleCopyUrl}
                    disabled={!itemUrl}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? t('item_qr.copied') : t('item_qr.copy_url')}
                </button>
                <button
                    onClick={handleDownloadQR}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                    <Download className="w-4 h-4" />
                    {t('item_qr.download')}
                </button>
                <button
                    onClick={fetchServerInfo}
                    disabled={loading}
                    className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                    title={t('common.refresh') || 'Yenile'}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Instructions */}
            <div className="w-full p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30">
                <p className="text-sm text-blue-700 dark:text-blue-400 text-center">
                    💡 <strong>{t('item_qr.usage_title')}:</strong> {t('item_qr.usage_desc')}
                </p>
            </div>
        </div>
    );
}
