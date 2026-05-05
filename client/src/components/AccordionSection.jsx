import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AccordionSection({
    title,
    description,
    children,
    defaultOpen = false,
    eyebrow,
    badge,
    icon: Icon,
    className = ''
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <section className={`app-control-section ${className}`.trim()}>
            <button
                type="button"
                onClick={() => setIsOpen((value) => !value)}
                className="flex w-full items-start justify-between gap-4 text-left"
                aria-expanded={isOpen}
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

                <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)] transition ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDown className="h-5 w-5" />
                </span>
            </button>

            {isOpen && (
                <div className="mt-4 border-t border-[var(--hi-border)] pt-4">
                    {children}
                </div>
            )}
        </section>
    );
}
