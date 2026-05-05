import { cloneElement, isValidElement, useId } from 'react';

export default function Tooltip({ label, children, side = 'top', className = '', panelClassName = '' }) {
    const tooltipId = useId();

    if (!label) {
        return children;
    }

    const positionedPanelClass = side === 'right'
        ? 'left-full top-1/2 ml-3 -translate-y-1/2'
        : 'left-1/2 bottom-full mb-2 -translate-x-1/2';

    const child = isValidElement(children)
        ? cloneElement(children, {
            'aria-describedby': tooltipId,
            ...children.props
        })
        : children;

    return (
        <span className={`group/tooltip relative inline-flex ${className}`.trim()}>
            {child}
            <span
                id={tooltipId}
                role="tooltip"
                className={`pointer-events-none absolute z-40 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-3 py-2 text-center text-xs font-medium leading-5 text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)] opacity-0 transition-all duration-150 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:opacity-100 sm:text-left ${side === 'right' ? 'translate-x-1' : 'translate-y-1'} ${positionedPanelClass} ${panelClassName}`.trim()}
            >
                {label}
            </span>
        </span>
    );
}
