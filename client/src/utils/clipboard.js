export async function copyTextToClipboard(text) {
    const safeText = String(text ?? '');

    if (navigator?.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(safeText);
        return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = safeText;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.top = '0';
    textarea.style.left = '0';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, safeText.length);

    try {
        const copied = document.execCommand('copy');
        if (!copied) {
            throw new Error('Copy command failed');
        }
        return true;
    } finally {
        document.body.removeChild(textarea);
    }
}
