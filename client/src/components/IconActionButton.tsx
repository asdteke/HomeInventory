import * as React from 'react';
import Tooltip from './Tooltip';

interface ToneStyles {
    button: string;
    focus: string;
}

const TONE_STYLES: Record<'default' | 'danger', ToneStyles> = {
    default: {
        button: 'text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-accent)]',
        focus: 'focus-visible:ring-[var(--hi-accent)]'
    },
    danger: {
        button: 'text-[var(--hi-text-soft)] hover:bg-red-500/10 hover:text-red-400',
        focus: 'focus-visible:ring-red-400'
    }
};

export interface IconActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: 'default' | 'danger';
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
}

export default function IconActionButton({
    label,
    icon: Icon,
    tone = 'default',
    className = '',
    disabled = false,
    type = 'button',
    ...props
}: IconActionButtonProps) {
    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.default;

    return (
        <Tooltip label={label}>
            <button
                type={type}
                aria-label={label}
                disabled={disabled}
                className={`rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--hi-text-soft)] ${toneStyle.button} ${toneStyle.focus} ${className}`.trim()}
                {...props}
            >
                <Icon className="h-4 w-4" />
            </button>
        </Tooltip>
    );
}
