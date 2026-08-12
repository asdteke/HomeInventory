import React, { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
    label?: React.ReactNode;
    children: React.ReactNode;
    side?: 'top' | 'right';
    className?: string;
    panelClassName?: string;
}

export default function Tooltip({
    label,
    children,
    side = 'top',
    className = '',
    panelClassName = ''
}: TooltipProps) {
    const tooltipId = useId();
    const triggerRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLSpanElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({
        left: 0,
        top: 0,
        transform: 'translate(-50%, -100%)'
    });

    if (!label) {
        return <>{children}</>;
    }

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;

        const triggerRect = trigger.getBoundingClientRect();
        const panelWidth = panelRef.current?.getBoundingClientRect().width || 0;
        const viewportPadding = 16;

        if (side === 'right') {
            const canFitRight = triggerRect.right + 12 + panelWidth <= window.innerWidth - viewportPadding;
            setPosition({
                left: canFitRight ? triggerRect.right + 12 : triggerRect.left - 12,
                top: triggerRect.top + triggerRect.height / 2,
                transform: canFitRight ? 'translate(0, -50%)' : 'translate(-100%, -50%)'
            });
            return;
        }

        const halfPanel = panelWidth / 2;
        const centeredLeft = triggerRect.left + triggerRect.width / 2;
        setPosition({
            left: Math.min(window.innerWidth - viewportPadding - halfPanel, Math.max(viewportPadding + halfPanel, centeredLeft)),
            top: triggerRect.top - 8,
            transform: 'translate(-50%, -100%)'
        });
    }, [side]);

    useLayoutEffect(() => {
        if (isOpen) updatePosition();
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const reposition = () => updatePosition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [isOpen, updatePosition]);

    const child = isValidElement(children)
        ? cloneElement(children as React.ReactElement<any>, {
            'aria-describedby': tooltipId,
            ...(children.props as object)
        })
        : children;

    return (
        <span
            ref={triggerRef}
            className={`group/tooltip relative inline-flex ${className}`.trim()}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            onFocusCapture={() => setIsOpen(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
            }}
        >
            {child}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <span
                    ref={panelRef}
                    id={tooltipId}
                    role="tooltip"
                    className={`app-tooltip-panel pointer-events-none fixed z-[10000] w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-3 py-2 text-center text-xs font-medium leading-5 text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)] sm:text-left ${panelClassName}`.trim()}
                    style={{ left: position.left, top: position.top, transform: position.transform }}
                >
                    {label}
                </span>,
                document.body
            )}
        </span>
    );
}
