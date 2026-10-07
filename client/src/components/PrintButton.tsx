import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isLauncherShell } from '../utils/launcherShell';

interface PrintButtonProps {
    className?: string;
}

/**
 * The launcher app window's WebView may not open a system print dialog, and it
 * blocks new windows. Print once, then tell the user how to print from a browser
 * instead of failing silently.
 */
export default function PrintButton({ className = 'btn-primary' }: PrintButtonProps) {
    const { t } = useTranslation();
    const [showFallback, setShowFallback] = useState(false);
    const [copied, setCopied] = useState(false);

    const handlePrint = () => {
        try {
            window.print();
        } catch {
            // Fall through to the browser hint below.
        }
        if (isLauncherShell()) {
            setShowFallback(true);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    return (
        <>
            <button type="button" onClick={handlePrint} className={`${className} print:hidden`}>
                <Printer className="h-4 w-4" />
                <span>{t('common.print', { defaultValue: 'Print' })}</span>
            </button>
            {showFallback && (
                <div role="status" className="print:hidden text-sm opacity-80">
                    <span>
                        {t('common.print_launcher_hint', {
                            defaultValue: 'No print dialog opened? The app window may not support printing. Copy this page link and open it in your browser to print or save as PDF.'
                        })}
                    </span>{' '}
                    <button type="button" className="btn-secondary" onClick={copyLink}>
                        {copied
                            ? t('common.copied', { defaultValue: 'Copied' })
                            : t('common.print_copy_link', { defaultValue: 'Copy link' })}
                    </button>
                </div>
            )}
        </>
    );
}
