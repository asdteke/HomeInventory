import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { X, Copy, Download, ShieldCheck, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';

export default function TwoFactorSetup({ onClose, onEnabled }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('loading'); // loading, qr, verify, backup
    const [secret, setSecret] = useState('');
    const [otpauthUrl, setOtpauthUrl] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [copiedSecret, setCopiedSecret] = useState(false);
    const [acknowledgedBackup, setAcknowledgedBackup] = useState(false);
    const codeInputRef = useRef(null);

    useEffect(() => {
        startSetup();
    }, []);

    const startSetup = async () => {
        try {
            const res = await axios.post('/api/auth/2fa/setup');
            setSecret(res.data.secret);
            setOtpauthUrl(res.data.otpauthUrl);

            // Generate QR code as data URL
            const dataUrl = await QRCode.toDataURL(res.data.otpauthUrl, {
                width: 256,
                margin: 2,
                color: { dark: '#1e293b', light: '#ffffff' }
            });
            setQrDataUrl(dataUrl);
            setStep('qr');
        } catch (err) {
            setError(err.response?.data?.error || t('settings.two_factor.setup_error'));
            setStep('qr');
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post('/api/auth/2fa/verify-setup', { token: verifyCode });
            setBackupCodes(res.data.backupCodes || []);
            setStep('backup');
        } catch (err) {
            setError(err.response?.data?.error || t('settings.two_factor.verify_error'));
        } finally {
            setLoading(false);
        }
    };

    const copySecret = () => {
        copyTextToClipboard(secret).then(() => {
            setCopiedSecret(true);
            setTimeout(() => setCopiedSecret(false), 2000);
        });
    };

    const downloadBackupCodes = () => {
        const content = [
            'HomeInventory - 2FA Backup Codes',
            '================================',
            `Generated: ${new Date().toISOString()}`,
            '',
            'Keep these codes safe. Each code can only be used once.',
            '',
            ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
            '',
            'If you lose access to your authenticator app,',
            'use one of these codes to log in.'
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `homeinventory-2fa-backup-codes-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleComplete = () => {
        if (onEnabled) onEnabled();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {t('settings.two_factor.setup_title')}
                            </h2>
                            <p className="text-xs text-slate-500">
                                {step === 'qr' && t('settings.two_factor.step_1')}
                                {step === 'verify' && t('settings.two_factor.step_2')}
                                {step === 'backup' && t('settings.two_factor.step_3')}
                            </p>
                        </div>
                    </div>
                    {step !== 'backup' && (
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 'loading' && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                        </div>
                    )}

                    {step === 'qr' && (
                        <div className="space-y-6">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {t('settings.two_factor.scan_instruction')}
                            </p>

                            {/* QR Code */}
                            {qrDataUrl && (
                                <div className="flex justify-center">
                                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                                    </div>
                                </div>
                            )}

                            {/* Manual entry */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                    {t('settings.two_factor.manual_entry')}
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-sm font-mono text-slate-800 dark:text-slate-200 break-all select-all">
                                        {secret}
                                    </code>
                                    <button
                                        onClick={copySecret}
                                        className="p-2 text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0"
                                        title={t('settings.two_factor.copy_secret')}
                                    >
                                        {copiedSecret ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => { setStep('verify'); setTimeout(() => codeInputRef.current?.focus(), 100); }}
                                className="btn-primary w-full py-3"
                            >
                                {t('settings.two_factor.next')}
                            </button>
                        </div>
                    )}

                    {step === 'verify' && (
                        <form onSubmit={handleVerify} className="space-y-6">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {t('settings.two_factor.verify_instruction')}
                            </p>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {t('settings.two_factor.code_label')}
                                </label>
                                <input
                                    ref={codeInputRef}
                                    type="text"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="input-field text-center text-2xl tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    maxLength={6}
                                    autoComplete="one-time-code"
                                    required
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setStep('qr')}
                                    className="btn-secondary flex-1 py-3"
                                >
                                    ← {t('settings.two_factor.back')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || verifyCode.length < 6}
                                    className="btn-primary flex-1 py-3 disabled:opacity-50"
                                >
                                    {loading 
                                        ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> 
                                        : t('settings.two_factor.activate')
                                    }
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 'backup' && (
                        <div className="space-y-6">
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                                    {t('settings.two_factor.backup_warning_title')}
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {t('settings.two_factor.backup_warning_text')}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {backupCodes.map((code, i) => (
                                    <div
                                        key={i}
                                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center font-mono text-sm text-slate-800 dark:text-slate-200 select-all"
                                    >
                                        {code}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={downloadBackupCodes}
                                className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                {t('settings.two_factor.download_codes')}
                            </button>

                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={acknowledgedBackup}
                                    onChange={(e) => setAcknowledgedBackup(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-600 dark:text-slate-400">
                                    {t('settings.two_factor.backup_acknowledge')}
                                </span>
                            </label>

                            <button
                                onClick={handleComplete}
                                disabled={!acknowledgedBackup}
                                className="btn-primary w-full py-3 disabled:opacity-50"
                            >
                                {t('settings.two_factor.done')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
