import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { copyTextToClipboard } from '../utils/clipboard';

export default function RecoveryKeyModal({
    recoveryKey,
    title,
    subtitle,
    warning,
    confirmLabel,
    onConfirm
}) {
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const [copied, setCopied] = useState(false);
    const modalBackground = isDark
        ? 'linear-gradient(180deg, var(--hi-bg-elevated) 0%, var(--hi-bg-strong) 100%)'
        : 'linear-gradient(180deg, var(--hi-panel-strong) 0%, var(--hi-bg-strong) 100%)';
    const heroGlow = isDark
        ? 'radial-gradient(circle at top, var(--hi-secondary-soft), transparent 56%)'
        : 'radial-gradient(circle at top, var(--hi-secondary-soft), transparent 54%)';
    const keyPanelBackground = isDark
        ? 'linear-gradient(180deg, color-mix(in srgb, var(--hi-bg-strong) 82%, transparent) 0%, color-mix(in srgb, var(--hi-panel) 92%, transparent) 100%)'
        : 'linear-gradient(180deg, var(--hi-panel-strong) 0%, var(--hi-panel-muted) 100%)';
    const keyValueBackground = isDark
        ? 'color-mix(in srgb, var(--hi-bg-strong) 78%, black)'
        : 'var(--hi-bg-strong)';

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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 p-4 backdrop-blur-md">
            <div
                className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border shadow-[0_40px_120px_rgba(0,0,0,0.34)]"
                style={{
                    background: modalBackground,
                    borderColor: 'var(--hi-border-strong)'
                }}
            >
                <div
                    className="absolute inset-x-0 top-0 h-40 opacity-90"
                    style={{ background: heroGlow }}
                />

                <div className="relative p-6 sm:p-8">
                    <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
                        <div
                            className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-[1.75rem] border shadow-[var(--hi-shadow-soft)]"
                            style={{
                                background: 'linear-gradient(135deg, var(--hi-secondary), var(--hi-secondary-strong))',
                                borderColor: 'rgba(255,255,255,0.18)'
                            }}
                        >
                            <KeyRound className="h-9 w-9 text-white" />
                        </div>
                        <span
                            className="mb-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]"
                            style={{
                                background: 'var(--hi-secondary-soft)',
                                borderColor: 'var(--hi-border)',
                                color: 'var(--hi-secondary)'
                            }}
                        >
                            {t('auth.recovery_key_modal.badge')}
                        </span>
                        <h2 className="mb-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[2.4rem]" style={{ color: 'var(--hi-text)' }}>
                            {title}
                        </h2>
                        <p className="max-w-xl text-base leading-7 sm:text-lg" style={{ color: 'var(--hi-text-soft)' }}>
                            {subtitle}
                        </p>
                    </div>

                    <div
                        className="mb-6 rounded-[1.5rem] border p-4 sm:mb-7 sm:p-5"
                        style={{
                            background: 'var(--hi-warning-soft)',
                            borderColor: 'color-mix(in srgb, var(--hi-warning) 34%, transparent)'
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <div
                                className="mt-0.5 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
                                style={{
                                    background: 'color-mix(in srgb, var(--hi-warning) 14%, transparent)',
                                    color: 'var(--hi-warning)'
                                }}
                            >
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--hi-warning)' }}>
                                    {t('auth.recovery_key_modal.important')}
                                </p>
                                <p className="mt-2 text-base leading-7 sm:text-lg" style={{ color: 'var(--hi-text)' }}>
                                    {warning}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        className="mb-6 rounded-[1.65rem] border p-4 sm:mb-8 sm:p-5"
                        style={{
                            background: keyPanelBackground,
                            borderColor: 'var(--hi-border)'
                        }}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--hi-text-muted)' }}>
                                    {t('auth.recovery_key_modal.key_label')}
                                </p>
                                <p className="mt-1 text-sm" style={{ color: 'var(--hi-text-soft)' }}>
                                    {t('auth.recovery_key_modal.storage_hint')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition hover:-translate-y-0.5"
                                style={{
                                    background: copied ? 'var(--hi-accent-soft)' : 'var(--hi-panel-muted)',
                                    borderColor: copied ? 'color-mix(in srgb, var(--hi-accent) 32%, transparent)' : 'var(--hi-border)',
                                    color: copied ? 'var(--hi-accent-strong)' : 'var(--hi-text)'
                                }}
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                <span>{copied ? t('auth.recovery_key_modal.copied') : t('common.copy')}</span>
                            </button>
                        </div>

                        <div
                            className="rounded-[1.35rem] border px-4 py-5 font-mono text-sm leading-8 tracking-[0.28em] sm:px-5 sm:text-[15px]"
                            style={{
                                background: keyValueBackground,
                                borderColor: 'var(--hi-border)',
                                color: 'var(--hi-text)',
                                overflowWrap: 'anywhere'
                            }}
                        >
                            {recoveryKey}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className="btn-primary w-full py-3.5 text-base"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
