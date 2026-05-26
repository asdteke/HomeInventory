import React, { useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionSectionProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    eyebrow?: React.ReactNode;
    badge?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    className?: string;
}

export default function AccordionSection({
    title,
    description,
    children,
    defaultOpen = false,
    eyebrow,
    badge,
    icon: Icon,
    className = ''
}: AccordionSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const contentId = useId();
    const buttonId = useId();

    return (
        <section className={`app-control-section ${className}`.trim()}>
            <button
                type="button"
                id={buttonId}
                onClick={() => setIsOpen((value) => !value)}
                className="flex w-full items-start justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 rounded-xl p-1"
                aria-expanded={isOpen}
                aria-controls={contentId}
            >
                <div className="min-w-0">
                    {eyebrow && <p className="app-kicker mb-1.5">{eyebrow}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                        {Icon && (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--hi-panel-muted)] text-[var(--hi-accent)]">
                                <Icon className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-semibold text-[var(--hi-text)]">{title}</h2>
                                {badge}
                            </div>
                            {description && (
                                <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)] transition-all duration-300 ${isOpen ? 'rotate-180 bg-[var(--hi-accent-soft)] border-[var(--hi-accent)] text-[var(--hi-accent)]' : ''}`}>
                    <ChevronDown className="h-5 w-5" />
                </span>
            </button>

            <div
                id={contentId}
                role="region"
                aria-labelledby={buttonId}
                aria-hidden={!isOpen}
                className={`settings-accordion-content ${isOpen ? 'is-open' : ''}`}
            >
                <div className="overflow-hidden">
                    <div className="mt-4 border-t border-[var(--hi-border)] pt-4">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}
