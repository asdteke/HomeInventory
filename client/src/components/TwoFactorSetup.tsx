import { useState, useEffect, useRef, FormEvent } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { X, Copy, Download, ShieldCheck, Loader2, CheckCircle, AlertCircle, ChevronRight, KeyRound } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';
import { BRAND_NAME } from '../constants/branding';
import { PremiumCheckbox } from './PremiumCheckbox';

export interface TwoFactorSetupProps {
    onClose: () => void;
    onEnabled?: () => void;
}

type SetupStep = 'loading' | 'qr' | 'verify' | 'backup';

export default function TwoFactorSetup({ onClose, onEnabled }: TwoFactorSetupProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState<SetupStep>('loading');
    const [secret, setSecret] = useState<string>('');
    const [otpauthUrl, setOtpauthUrl] = useState<string>('');
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [verifyCode, setVerifyCode] = useState<string>('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
    const [acknowledgedBackup, setAcknowledgedBackup] = useState<boolean>(false);
    const codeInputRef = useRef<HTMLInputElement>(null);

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
        } catch (err: any) {
            setError(err.response?.data?.error || t('settings.two_factor.setup_error'));
            setStep('qr');
        }
    };

    const handleVerify = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post('/api/auth/2fa/verify-setup', { token: verifyCode });
            setBackupCodes(res.data.backupCodes || []);
            setStep('backup');
        } catch (err: any) {
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
            `${BRAND_NAME} - 2FA Backup Codes`,
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

    const stepMeta = {
        qr: { title: t('settings.two_factor.step_1'), index: '01' },
        verify: { title: t('settings.two_factor.step_2'), index: '02' },
        backup: { title: t('settings.two_factor.step_3'), index: '03' }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-fade-in">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-2xl">
                <div className="border-b border-[var(--hi-border)] px-6 py-6 sm:px-8">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,var(--hi-accent-strong),var(--hi-accent))] text-white shadow-lg">
                                <ShieldCheck className="h-8 w-8" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--hi-text-muted)]">
                                    {step === 'loading' ? t('settings.two_factor.setup_title') : stepMeta[step]?.title}
                                </p>
                                <h2 className="section-title mt-2 text-3xl text-[var(--hi-text)] sm:text-4xl">
                                    {t('settings.two_factor.setup_title')}
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {step === 'qr' && t('settings.two_factor.scan_instruction')}
                                    {step === 'verify' && t('settings.two_factor.verify_instruction')}
                                    {step === 'backup' && t('settings.two_factor.backup_warning_text')}
                                    {step === 'loading' && t('settings.two_factor.setup_error').replace(/Failed to start 2FA setup/i, 'Preparing secure two-factor setup')}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors">
                            <X className="h-6 w-6 text-[var(--hi-text-soft)]" />
                        </button>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {(['qr', 'verify', 'backup'] as const).map((stepKey) => {
                            const isCurrent = step === stepKey;
                            const isComplete =
                                (step === 'verify' && stepKey === 'qr') ||
                                (step === 'backup' && (stepKey === 'qr' || stepKey === 'verify'));

                            return (
                                <div
                                    key={stepKey}
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                                        isCurrent
                                            ? 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                                            : isComplete
                                                ? 'bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]'
                                                : 'border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]'
                                    }`}
                                >
                                    <span>{stepMeta[stepKey].index}</span>
                                    <span>{stepMeta[stepKey].title}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="px-6 py-6 sm:px-8 sm:py-8">
                    {error && (
                        <div className="mb-6 flex items-start gap-3 rounded-[22px] border border-red-400/20 bg-red-500/10 px-4 py-4 text-sm text-red-300">
                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 'loading' && (
                        <div className="flex flex-col items-center justify-center rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-6 py-16 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                <Loader2 className="h-7 w-7 animate-spin" />
                            </div>
                            <p className="mt-5 text-base font-semibold text-[var(--hi-text)]">{t('settings.two_factor.setup_title')}</p>
                            <p className="mt-2 text-sm text-[var(--hi-text-soft)]">{t('settings.two_factor.preparing_setup', { defaultValue: 'Preparing your authenticator setup…' })}</p>
                        </div>
                    )}

                    {step === 'qr' && (
                        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                            <div className="space-y-5">
                                <div className="rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-5">
                                    <div className="flex items-start gap-3">
                                        <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                            <ShieldCheck className="h-5 w-5" />
                                        </span>
                                        <div>
                                            <p className="text-lg font-semibold text-[var(--hi-text)]">{t('settings.two_factor.scan_instruction')}</p>
                                            <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">
                                                Keep your authenticator app ready, then continue with the one-time code it generates.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                                        {t('settings.two_factor.manual_entry')}
                                    </p>
                                    <div className="mt-4 rounded-[22px] border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-4 py-4">
                                        <div className="flex items-start gap-3">
                                            <KeyRound className="mt-1 h-5 w-5 shrink-0 text-[var(--hi-secondary)]" />
                                            <code className="min-w-0 flex-1 break-all text-sm font-mono text-[var(--hi-text)]">
                                                {secret}
                                            </code>
                                            <button
                                                onClick={copySecret}
                                                className="btn-secondary !rounded-[18px] !px-3 !py-2"
                                                title={t('settings.two_factor.copy_secret')}
                                            >
                                                {copiedSecret ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { setStep('verify'); setTimeout(() => codeInputRef.current?.focus(), 100); }}
                                    className="btn-primary w-full py-3.5"
                                >
                                    <span>{t('settings.two_factor.next')}</span>
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="flex items-center justify-center">
                                {qrDataUrl && (
                                    <div className="rounded-[32px] border border-[var(--hi-border)] bg-white p-5 shadow-[var(--hi-shadow)]">
                                        <img src={qrDataUrl} alt="QR Code" className="h-64 w-64 rounded-[20px]" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'verify' && (
                        <form onSubmit={handleVerify} className="space-y-6">
                            <div className="rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-5">
                                <p className="text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {t('settings.two_factor.verify_instruction')}
                                </p>
                            </div>

                            <div className="rounded-[28px] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-5">
                                <label className="mb-3 block text-sm font-medium text-[var(--hi-text)]">
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
                                    {t('settings.two_factor.back')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || verifyCode.length < 6}
                                    className="btn-primary flex-1 py-3 disabled:opacity-50"
                                >
                                    {loading
                                        ? <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                                        : t('settings.two_factor.activate')
                                    }
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 'backup' && (
                        <div className="space-y-6">
                            <div className="rounded-[28px] border border-[rgba(184,153,104,0.24)] bg-[var(--hi-secondary-soft)] p-5">
                                <p className="text-sm font-semibold text-[var(--hi-secondary-strong)] mb-1">
                                    {t('settings.two_factor.backup_warning_title')}
                                </p>
                                <p className="text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {t('settings.two_factor.backup_warning_text')}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {backupCodes.map((code, i) => (
                                    <div
                                        key={i}
                                        className="rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-3 text-center font-mono text-sm text-[var(--hi-text)] select-all"
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

                            <label className="app-premium-checkbox-container flex cursor-pointer items-start gap-3 rounded-[22px] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-4 hover:border-[var(--hi-border-strong)] transition-all">
                                <PremiumCheckbox
                                    checked={acknowledgedBackup}
                                    onChange={(e) => setAcknowledgedBackup(e.target.checked)}
                                />
                                <span className="text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {t('settings.two_factor.backup_acknowledge')}
                                </span>
                            </label>

                            <button
                                onClick={handleComplete}
                                disabled={!acknowledgedBackup}
                                className="btn-primary w-full py-3.5 disabled:opacity-50"
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
