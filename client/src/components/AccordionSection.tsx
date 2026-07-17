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
        <section
            className={`app-control-section ${isOpen ? 'is-open' : 'is-closed'} ${className}`.trim()}
            data-accordion-state={isOpen ? 'open' : 'closed'}
        >
            <button
                type="button"
                id={buttonId}
                onClick={() => setIsOpen((value) => !value)}
                className="app-accordion-trigger"
                aria-expanded={isOpen}
                aria-controls={contentId}
            >
                <div className="app-accordion-leading">
                    {eyebrow && <p className="app-kicker mb-1.5">{eyebrow}</p>}
                    <div className="app-accordion-title-row">
                        {Icon && (
                            <span className="app-accordion-icon">
                                <Icon className="h-5 w-5" />
                            </span>
                        )}
                        <div className="app-accordion-copy">
                            <div className="app-accordion-heading">
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

                <span className={`app-accordion-chevron ${isOpen ? 'is-open' : ''}`}>
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
