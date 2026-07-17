import React from 'react';
import Tooltip from './Tooltip';

export interface SegmentedToggleOption {
    value: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    ariaLabel?: string;
    tooltip?: string;
}

export interface SegmentedToggleProps {
    options: SegmentedToggleOption[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    className?: string;
    fullWidth?: boolean;
    buttonClassName?: string;
    activeClassName?: string;
    inactiveClassName?: string;
    sliding?: boolean;
}

export default function SegmentedToggle({
    options,
    value,
    onChange,
    ariaLabel,
    className = '',
    fullWidth = false,
    buttonClassName = 'px-3 py-2 text-sm',
    activeClassName = 'bg-[var(--hi-accent)] text-white shadow-[var(--hi-shadow-soft)]',
    inactiveClassName = 'text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]',
    sliding = false
}: SegmentedToggleProps) {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={`segmented-toggle-v25 inline-flex items-center gap-1 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-1 ${sliding ? 'is-sliding' : ''} ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
            style={sliding ? {
                '--segmented-index': selectedIndex,
                '--segmented-count': Math.max(1, options.length)
            } as React.CSSProperties : undefined}
        >
            {sliding && <span className="segmented-toggle-thumb-v25" aria-hidden="true" />}
            {options.map((option) => {
                const isActive = value === option.value;
                const Icon = option.icon;
                const button = (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={option.ariaLabel || option.label}
                        onClick={() => onChange(option.value)}
                        className={`segmented-toggle-option-v25 ${isActive ? 'is-active' : ''} inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] ${fullWidth ? 'flex-1' : ''} ${buttonClassName} ${isActive ? activeClassName : inactiveClassName}`.trim()}
                    >
                        {Icon && <Icon className="h-4 w-4" />}
                        {option.label && <span>{option.label}</span>}
                    </button>
                );

                if (option.tooltip) {
                    return (
                        <Tooltip key={option.value} label={option.tooltip} className={fullWidth ? 'flex-1' : ''}>
                            {button}
                        </Tooltip>
                    );
                }

                return button;
            })}
        </div>
    );
}
