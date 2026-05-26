import React from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

function resolveMetaTone(tone?: string) {
    switch (tone) {
    case 'accent':
        return 'app-meta-pill app-meta-pill-accent';
    case 'secondary':
        return 'app-meta-pill app-meta-pill-secondary';
    case 'warning':
        return 'app-meta-pill app-meta-pill-warning';
    default:
        return 'app-meta-pill';
    }
}

function normalizeHeaderText(value?: string) {
    return String(value || '').trim().toLocaleLowerCase();
}

export interface BreadcrumbItem {
    label: string;
    to?: string;
}

export type MetaItem = string | { label: string; tone?: 'accent' | 'secondary' | 'warning' | 'default' };

export interface PageHeaderProps {
    kicker?: string;
    title: string;
    description?: string;
    meta?: MetaItem[];
    actions?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    breadcrumbs?: BreadcrumbItem[];
}

export function PageHeader({
    kicker,
    title,
    description,
    meta = [],
    actions,
    children,
    className = '',
    breadcrumbs = []
}: PageHeaderProps) {
    const normalizedTitle = normalizeHeaderText(title);
    const filteredBreadcrumbs = breadcrumbs.filter((crumb, index) => {
        if (index !== breadcrumbs.length - 1) {
            return true;
        }

        return normalizeHeaderText(crumb?.label) !== normalizedTitle;
    });
    const shouldRenderKicker = Boolean(kicker)
        && normalizeHeaderText(kicker) !== normalizedTitle
        && !filteredBreadcrumbs.some((crumb) => normalizeHeaderText(crumb?.label) === normalizeHeaderText(kicker));

    return (
        <section className={`app-page-header ${className}`.trim()}>
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 max-w-3xl space-y-4">
                    {filteredBreadcrumbs.length > 0 && (
                        <nav aria-label="Breadcrumb">
                            <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                                {filteredBreadcrumbs.map((crumb, index) => (
                                    <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                                        {index > 0 && <span aria-hidden="true">/</span>}
                                        {crumb.to ? (
                                            <Link
                                                to={crumb.to}
                                                className="transition hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg)]"
                                            >
                                                {crumb.label}
                                            </Link>
                                        ) : (
                                            <span>{crumb.label}</span>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </nav>
                    )}
                    {shouldRenderKicker && <p className="app-kicker">{kicker}</p>}
                    <div>
                        <h1 className="section-title text-3xl leading-tight text-[var(--hi-text)] lg:text-4xl">{title}</h1>
                        {description && <p className="app-page-description">{description}</p>}
                    </div>
                    {meta.length > 0 && (
                        <div className="app-inline-meta">
                            {meta.map((item, index) => {
                                const tone = typeof item === 'string' ? 'default' : item.tone;
                                const label = typeof item === 'string' ? item : item.label;

                                return (
                                    <span key={`${label}-${index}`} className={resolveMetaTone(tone)}>
                                        {label}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>

                {actions && <div className="app-page-actions">{actions}</div>}
            </div>

            {children && <div className="app-page-header-body">{children}</div>}
        </section>
    );
}

export interface SectionHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export function SectionHeader({ eyebrow, title, description, action, className = '' }: SectionHeaderProps) {
    return (
        <div className={`app-section-header ${className}`.trim()}>
            <div className="min-w-0">
                {eyebrow && <p className="app-kicker app-kicker-subtle">{eyebrow}</p>}
                <h2 className="section-title mt-2.5 text-xl leading-snug text-[var(--hi-text)]">{title}</h2>
                {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>}
            </div>
            {action && <div className="app-section-action">{action}</div>}
        </div>
    );
}

export interface NoticeBannerProps {
    icon?: React.ComponentType<{ className?: string }>;
    title?: string;
    description?: string;
    tone?: 'info' | 'success' | 'warning' | 'danger';
    action?: React.ReactNode;
    className?: string;
}

export function NoticeBanner({ icon: Icon, title, description, tone = 'info', action, className = '' }: NoticeBannerProps) {
    const liveRole = tone === 'danger' ? 'alert' : 'status';

    return (
        <div
            role={liveRole}
            aria-live={tone === 'danger' ? 'assertive' : 'polite'}
            className={`app-notice app-notice-${tone} ${className}`.trim()}
        >
            {Icon && (
                <span className="app-notice-icon">
                    <Icon className="h-5 w-5" />
                </span>
            )}
            <div className="min-w-0 flex-1">
                {title && <p className="font-semibold text-[var(--hi-text)]">{title}</p>}
                {description && <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>}
            </div>
            {action && <div className="app-notice-action">{action}</div>}
        </div>
    );
}

export interface LoadingStateProps {
    title: string;
    description?: string;
    compact?: boolean;
    className?: string;
}

export function LoadingState({
    title,
    description,
    compact = false,
    className = ''
}: LoadingStateProps) {
    if (compact) {
        return (
            <div
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-2 text-sm text-[var(--hi-text-soft)] ${className}`.trim()}
            >
                <Loader2 className="h-4 w-4 animate-spin text-[var(--hi-accent)]" />
                <span>{title}</span>
            </div>
        );
    }

    return (
        <div
            role="status"
            aria-live="polite"
            className={`app-loading-state flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-6 py-10 text-center shadow-[var(--hi-shadow-soft)] ${className}`.trim()}
        >
            <span className="app-loading-state-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                <Loader2 className="h-5 w-5 animate-spin" />
            </span>
            <div className="max-w-md">
                <p className="text-base font-semibold text-[var(--hi-text)]">{title}</p>
                {description && (
                    <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>
                )}
            </div>
            <div className="app-loading-state-bars" aria-hidden="true">
                <span />
                <span />
                <span />
            </div>
        </div>
    );
}

export interface EmptyStateTip {
    title: string;
    description: string;
}

export interface EmptyStateProps {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    tips?: EmptyStateTip[];
    align?: 'center' | 'left';
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, actions, tips = [], align = 'center', className = '' }: EmptyStateProps) {
    return (
        <div className={`app-empty-state ${align === 'left' ? 'app-empty-state-left' : ''} ${className}`.trim()}>
            {Icon && (
                <span className="app-empty-state-icon">
                    <Icon className="h-7 w-7" />
                </span>
            )}
            <div className="max-w-3xl">
                <h3 className="section-title text-xl text-[var(--hi-text)]">{title}</h3>
                {description && <p className="mt-2.5 text-sm leading-6 text-[var(--hi-text-soft)]">{description}</p>}
            </div>

            {actions && <div className="app-empty-state-actions">{actions}</div>}

            {tips.length > 0 && (
                <div className="app-empty-state-grid">
                    {tips.map((tip, index) => (
                        <div key={`${tip.title}-${index}`} className="app-empty-state-step">
                            <span className="app-empty-state-step-index">{index + 1}</span>
                            <p className="mt-3 text-sm font-semibold text-[var(--hi-text)]">{tip.title}</p>
                            <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">{tip.description}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
