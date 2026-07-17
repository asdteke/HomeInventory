import * as React from 'react';
import { useEffect, useState } from 'react';
import { Home, Copy, Check, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { copyTextToClipboard } from '../utils/clipboard';

export interface HouseKeyModalProps {
    houseKey: string;
    title: string;
    subtitle: string;
    warning: string;
    confirmLabel: string;
    onConfirm?: () => void;
    onCopied?: () => void;
}

export default function HouseKeyModal({
    houseKey,
    title,
    subtitle,
    warning,
    confirmLabel,
    onConfirm,
    onCopied
}: HouseKeyModalProps) {
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const [copied, setCopied] = useState(false);
    const modalBackground = isDark
        ? 'linear-gradient(180deg, var(--hi-bg-elevated) 0%, var(--hi-bg-strong) 100%)'
        : 'linear-gradient(180deg, var(--hi-panel-strong) 0%, var(--hi-bg-strong) 100%)';
    const heroGlow = isDark
        ? 'radial-gradient(circle at top, var(--hi-accent-soft), transparent 56%)'
        : 'radial-gradient(circle at top, var(--hi-accent-soft), transparent 54%)';
    const keyPanelBackground = isDark
        ? 'linear-gradient(180deg, color-mix(in srgb, var(--hi-bg-strong) 82%, transparent) 0%, color-mix(in srgb, var(--hi-panel) 92%, transparent) 100%)'
        : 'linear-gradient(180deg, var(--hi-panel-strong) 0%, var(--hi-panel-muted) 100%)';
    const keyValueBackground = isDark
        ? 'color-mix(in srgb, var(--hi-bg-strong) 78%, black)'
        : 'var(--hi-bg-strong)';

    const handleCopy = async () => {
        try {
            await copyTextToClipboard(houseKey);
            setCopied(true);
            onCopied?.();
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('House key copy failed:', error);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onConfirm?.();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm]);

    return (
        <div
            className="house-key-modal-backdrop"
            onClick={() => onConfirm?.()}
        >
            <div
                className="house-key-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="house-key-modal-title"
                onClick={(event) => event.stopPropagation()}
                style={{
                    background: modalBackground,
                    borderColor: 'var(--hi-border-strong)'
                }}
            >
                <div className="house-key-modal-close-row">
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="house-key-modal-close"
                        aria-label={t('common.close')}
                        title={t('common.close')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div
                    className="absolute inset-x-0 top-0 h-40 opacity-90"
                    style={{ background: heroGlow }}
                />

                <div className="house-key-modal-content">
                    <div className="house-key-modal-hero">
                        <div
                            className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-[1.75rem] border shadow-[var(--hi-shadow-soft)]"
                            style={{
                                background: 'linear-gradient(135deg, var(--hi-accent-strong), var(--hi-accent))',
                                borderColor: 'rgba(255,255,255,0.18)'
                            }}
                        >
                            <Home className="h-9 w-9 text-white" />
                        </div>
                        <span
                            className="mb-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]"
                            style={{
                                background: 'var(--hi-accent-soft)',
                                borderColor: 'var(--hi-border)',
                                color: 'var(--hi-accent)'
                            }}
                        >
                            {t('auth.register.modals.key_created.badge')}
                        </span>
                        <h2 id="house-key-modal-title" className="mb-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[2.4rem]" style={{ color: 'var(--hi-text)' }}>
                            {title}
                        </h2>
                        <p className="max-w-xl text-base leading-7 sm:text-lg" style={{ color: 'var(--hi-text-soft)' }}>
                            {subtitle}
                        </p>
                    </div>

                    <div
                        className="house-key-modal-warning mb-6 rounded-[1.5rem] border p-4 sm:mb-7 sm:p-5"
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
                                    {t('auth.register.modals.key_created.important')}
                                </p>
                                <p className="mt-2 text-base leading-7 sm:text-lg" style={{ color: 'var(--hi-text)' }}>
                                    {warning}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        className="house-key-modal-key-panel mb-6 rounded-[1.65rem] border p-4 sm:mb-8 sm:p-5"
                        style={{
                            background: keyPanelBackground,
                            borderColor: 'var(--hi-border)'
                        }}
                    >
                        <div className="house-key-modal-key-header mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--hi-text-muted)' }}>
                                    {t('auth.register.modals.key_created.key_label')}
                                </p>
                                <p className="mt-1 text-sm" style={{ color: 'var(--hi-text-soft)' }}>
                                    {t('auth.register.modals.key_created.storage_hint')}
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
                                <span>{copied ? t('auth.register.modals.key_created.copied') : t('common.copy')}</span>
                            </button>
                        </div>

                        <div
                            className="house-key-modal-key-value rounded-[1.35rem] border px-4 py-5 font-mono text-sm leading-8 tracking-[0.28em] sm:px-5 sm:text-[15px]"
                            style={{
                                background: keyValueBackground,
                                borderColor: 'var(--hi-border)',
                                color: 'var(--hi-text)',
                                overflowWrap: 'anywhere'
                            }}
                        >
                            {houseKey}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className="btn-primary house-key-modal-confirm w-full py-3.5 text-base"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
