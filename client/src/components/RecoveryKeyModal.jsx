import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';

export default function RecoveryKeyModal({
    recoveryKey,
    title,
    subtitle,
    warning,
    confirmLabel,
    onConfirm
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await copyTextToClipboard(recoveryKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Recovery key copy failed:', error);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <div className="mb-6 text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
                        <KeyRound className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
                    <p className="text-slate-500 dark:text-slate-400">{subtitle}</p>
                </div>

                <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <p>{warning}</p>
                </div>

                <div className="relative mb-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 font-mono text-sm tracking-[0.22em] text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        {recoveryKey}
                    </div>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="absolute right-2 top-2 rounded-lg bg-white p-2 shadow transition-transform hover:scale-105 dark:bg-slate-700"
                    >
                        {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-slate-500 dark:text-slate-200" />}
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onConfirm}
                    className="btn-primary w-full py-3"
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    );
}
