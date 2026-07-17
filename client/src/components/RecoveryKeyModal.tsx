import * as React from 'react';
import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyTextToClipboard } from '../utils/clipboard';
import '../auth-onboarding-v25.css';

export interface RecoveryKeyModalProps {
    recoveryKey: string;
    title: string;
    subtitle: string;
    warning: string;
    confirmLabel: string;
    onConfirm?: () => void;
    onClose?: () => void;
    closeLabel?: string;
}

export default function RecoveryKeyModal({
    recoveryKey,
    title,
    subtitle,
    warning,
    confirmLabel,
    onConfirm,
    onClose,
    closeLabel
}: RecoveryKeyModalProps) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const titleId = React.useId();
    const descriptionId = React.useId();
    const closeModal = onClose || onConfirm;

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
        <div className="recovery-modal-backdrop-v25">
            <section
                className="recovery-modal-surface-v25"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
            >
                {closeModal && (
                    <button
                        type="button"
                        onClick={closeModal}
                        className="recovery-modal-quick-confirm-v25"
                        aria-label={closeLabel || confirmLabel}
                        title={closeLabel || confirmLabel}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                <div className="recovery-modal-scroll-v25">
                    <div className="recovery-modal-content-v25">
                        <header className="recovery-modal-hero-v25">
                            <span className="auth-flow-icon-v25"><KeyRound className="h-6 w-6" /></span>
                            <p className="auth-flow-kicker-v25">{t('auth.recovery_key_modal.badge')}</p>
                            <h2 id={titleId} className="auth-flow-title-v25 !text-[clamp(1.65rem,7vw,2.25rem)]">{title}</h2>
                            <p id={descriptionId} className="auth-flow-subtitle-v25 mx-auto">{subtitle}</p>
                        </header>

                        <div className="auth-flow-notice-v25 is-warning mt-5">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--hi-warning)]" />
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hi-warning)]">
                                        {t('auth.recovery_key_modal.important')}
                                    </p>
                                    <p className="mt-1.5">{warning}</p>
                                </div>
                            </div>
                        </div>

                        <div className="recovery-modal-key-v25">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                                    {t('auth.recovery_key_modal.key_label')}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-[var(--hi-text-soft)]">
                                        {t('auth.recovery_key_modal.storage_hint')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="auth-flow-secondary-v25 !min-h-[2.65rem] shrink-0 !rounded-[.9rem] !px-3 !py-2 !text-xs"
                                >
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    <span>{copied ? t('auth.recovery_key_modal.copied') : t('common.copy')}</span>
                                </button>
                            </div>

                            <div className="recovery-modal-key-value-v25">{recoveryKey}</div>
                        </div>
                    </div>
                </div>

                <footer className="recovery-modal-actions-v25">
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="auth-flow-primary-v25 w-full"
                    >
                        <Check className="h-4 w-4" />
                        {confirmLabel}
                    </button>
                </footer>
            </section>
        </div>
    );
}
