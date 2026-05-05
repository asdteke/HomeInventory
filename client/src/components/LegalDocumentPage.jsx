import { useMemo } from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { useTheme } from '../context/ThemeContext';

const SECTION_TITLE_PATTERN = /^(?:\d+\.\s+|#{2,3}\s+)(.+)$/;
const TURKISH_CHAR_MAP = {
    'ı': 'i',
    'İ': 'i',
    'ş': 's',
    'Ş': 's',
    'ğ': 'g',
    'Ğ': 'g',
    'ü': 'u',
    'Ü': 'u',
    'ö': 'o',
    'Ö': 'o',
    'ç': 'c',
    'Ç': 'c'
};

function splitBody(rawBody) {
    const lines = String(rawBody || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const bullets = [];
    const paragraphs = [];
    let bulletBuffer = [];

    lines.forEach((line) => {
        if (line.startsWith('- ')) {
            bulletBuffer.push(line.replace(/^- /, '').trim());
            return;
        }

        if (bulletBuffer.length) {
            bullets.push(...bulletBuffer);
            bulletBuffer = [];
        }

        paragraphs.push(line);
    });

    if (bulletBuffer.length) {
        bullets.push(...bulletBuffer);
    }

    return { paragraphs, bullets };
}

function renderInlineEmphasis(text) {
    const value = String(text || '');
    const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={`${part}-${index}`} className="font-semibold text-current">
                    {part.slice(2, -2)}
                </strong>
            );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function normalizeForSlug(value) {
    return String(value || '')
        .split('')
        .map((char) => TURKISH_CHAR_MAP[char] || char)
        .join('')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
}

function createSectionId(title, index, usedIds) {
    const base = normalizeForSlug(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `section-${index + 1}`;

    const duplicateCount = usedIds.get(base) || 0;
    usedIds.set(base, duplicateCount + 1);

    return duplicateCount === 0 ? base : `${base}-${duplicateCount + 1}`;
}

function looksLikeDocumentHeading(block) {
    const lines = String(block || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.length === 1 && lines[0].length <= 90 && !SECTION_TITLE_PATTERN.test(lines[0]);
}

function parseLegalContent(content) {
    const blocks = String(content || '')
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);

    let documentHeading = '';
    const usedIds = new Map();
    const bodyBlocks = [...blocks];
    const intro = [];
    const sections = [];

    if (bodyBlocks.length && looksLikeDocumentHeading(bodyBlocks[0])) {
        documentHeading = bodyBlocks.shift() || '';
    }

    bodyBlocks.forEach((block) => {
        const lines = block.split('\n');
        const firstLine = lines[0]?.trim() || '';
        const sectionMatch = firstLine.match(SECTION_TITLE_PATTERN);

        if (sectionMatch) {
            lines.shift();
            const title = sectionMatch[1].trim();
            sections.push({
                title,
                id: createSectionId(title, sections.length, usedIds),
                body: lines.join('\n').trim()
            });
            return;
        }

        if (sections.length === 0) {
            intro.push(block);
            return;
        }

        sections[sections.length - 1].body = `${sections[sections.length - 1].body}\n\n${block}`.trim();
    });

    return {
        documentHeading,
        intro: intro.map(splitBody),
        sections: sections.map((section) => ({
            ...section,
            ...splitBody(section.body)
        }))
    };
}

export default function LegalDocumentPage({
    icon: Icon,
    title,
    eyebrowLabel,
    description,
    content,
    summaryBlock,
    summaryCards = [],
    supportLabel,
    supportValue,
    backLabel,
    translationLanguage
}) {
    const { i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const documentLanguage = translationLanguage || i18n.resolvedLanguage || i18n.language || 'en';
    const documentT = i18n.getFixedT(documentLanguage);
    const parsed = useMemo(() => parseLegalContent(content), [content]);
    const quickAccessLabel = documentT('legal.quick_access');
    const pageLabel = parsed.documentHeading || title;

    const heroShellClass = 'border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow)]';
    const panelClass = 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]';
    const mutedTextClass = 'text-[var(--hi-text-soft)]';
    const subtleTextClass = 'text-[var(--hi-text-muted)]';
    const topChromeClass = 'border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const pageGlow = 'transparent';
    const summaryHighlightClass = 'border border-[rgba(184,153,104,0.24)] bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow)]';
    const sectionLinks = parsed.sections.length
        ? parsed.sections.map((section) => ({
            id: section.id,
            title: section.title
        }))
        : [{ id: 'document-top', title: pageLabel }];
    const summaryShortcuts = (summaryBlock?.shortcuts || [])
        .map((shortcut) => {
            const matchedSection = sectionLinks.find((section) => section.title === shortcut.title);

            if (!matchedSection) {
                return null;
            }

            return {
                id: matchedSection.id,
                label: shortcut.label,
                title: matchedSection.title
            };
        })
        .filter(Boolean);

    return (
        <div id="document-top" className="relative min-h-screen overflow-hidden bg-[var(--hi-bg)] px-4 py-6 text-[var(--hi-text)] sm:px-6 sm:py-8">
            <div className="absolute inset-0 -z-10" style={{ background: pageGlow }} />

            <div className="mx-auto max-w-6xl">
                <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center justify-between gap-4 sm:justify-start">
                        <Link
                            to="/"
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${topChromeClass}`}
                        >
                            <ArrowLeft className="h-4 w-4" />
                            {backLabel}
                        </Link>

                        <Link to="/" className="sm:hidden">
                            <BrandLogo variant="full" size="md" className="h-auto max-h-10 w-auto" />
                        </Link>
                    </div>

                    <Link to="/" className="hidden sm:block">
                        <BrandLogo variant="full" size="md" className="h-auto max-h-11 w-auto" />
                    </Link>

                    <div className="flex items-center justify-end gap-2 sm:gap-3">
                        <div className="w-[140px] sm:w-[164px]">
                            <LanguageSwitcher className="!h-10 !rounded-full !border-[var(--hi-border)] !bg-[var(--hi-panel)] !px-3 !py-0 !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)] sm:!h-11 sm:!px-4" />
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition sm:h-11 sm:w-11 ${topChromeClass}`}
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>
                    </div>
                </header>

                <section className={`rounded-[2rem] p-6 sm:p-8 lg:p-10 ${heroShellClass}`}>
                    <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--hi-secondary-soft)] bg-[var(--hi-secondary-soft)] px-4 py-2 text-sm font-medium text-[var(--hi-secondary)]">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hi-panel-strong)] text-[var(--hi-accent)]">
                                    <Icon className="h-4 w-4" />
                                </span>
                                {eyebrowLabel || documentT('legal.document_badge')}
                            </div>

                            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                                {title}
                            </h1>
                            <p className={`mt-5 max-w-2xl text-lg leading-relaxed ${mutedTextClass}`}>
                                {renderInlineEmphasis(description)}
                            </p>
                        </div>

                        {(summaryBlock || summaryCards.length > 0) ? (
                            <div className="grid gap-4">
                                {summaryBlock ? (
                                    <article className={`rounded-[1.75rem] p-6 sm:p-7 ${summaryHighlightClass}`}>
                                        {summaryBlock.eyebrow ? (
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                                {summaryBlock.eyebrow}
                                            </p>
                                        ) : null}
                                        <h2 className={`${summaryBlock.eyebrow ? 'mt-3' : ''} text-2xl font-semibold tracking-[-0.03em] sm:text-[2rem]`}>
                                            {summaryBlock.title}
                                        </h2>
                                        {summaryBlock.description ? (
                                            <p className={`mt-3 max-w-xl text-sm leading-7 ${mutedTextClass}`}>
                                                {renderInlineEmphasis(summaryBlock.description)}
                                            </p>
                                        ) : null}
                                        <ul className="mt-5 space-y-3.5">
                                            {summaryBlock.items.map((item) => (
                                                <li key={item} className="flex items-start gap-3">
                                                    <span className="mt-2 h-2 w-2 rounded-full bg-[var(--hi-secondary)]" />
                                                    <span className={`text-[15px] leading-7 ${mutedTextClass}`}>{renderInlineEmphasis(item)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {summaryShortcuts.length > 0 ? (
                                            <div className="mt-6">
                                                <h3 className="text-sm font-semibold text-[var(--hi-text)]">
                                                    {documentT('legal.jump_to')}
                                                </h3>
                                                <div className="mt-3 flex flex-wrap gap-2.5">
                                                    {summaryShortcuts.map((shortcut) => (
                                                        <a
                                                            key={shortcut.id}
                                                            href={`#${shortcut.id}`}
                                                            className="inline-flex items-center rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel)] px-4 py-2 text-sm font-medium text-[var(--hi-text)] transition hover:bg-[var(--hi-panel-strong)]"
                                                        >
                                                            {shortcut.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </article>
                                ) : null}

                                {summaryCards.map((card) => (
                                    <article key={card.title} className={`rounded-[1.5rem] p-5 ${panelClass}`}>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                            {card.eyebrow}
                                        </p>
                                        <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]">
                                            {card.title}
                                        </h2>
                                        <p className={`mt-3 text-sm leading-7 ${mutedTextClass}`}>
                                            {renderInlineEmphasis(card.description)}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </section>

                <section className="mt-8 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="xl:sticky xl:top-8 xl:self-start">
                        <div className={`rounded-[1.75rem] p-6 ${panelClass}`}>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                {quickAccessLabel}
                            </p>
                            <h2 className="mt-3 text-xl font-semibold">
                                {documentT('legal.on_this_page')}
                            </h2>

                            <div className="mt-5 border-t border-[var(--hi-border)] pt-5">
                                <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${subtleTextClass}`}>
                                    {parsed.sections.length ? documentT('legal.contents') : documentT('legal.page_label')}
                                </p>
                                <div className="mt-4 space-y-3">
                                    {sectionLinks.map((section) => (
                                        <a
                                            key={section.id}
                                            href={`#${section.id}`}
                                            className="flex items-start gap-3 rounded-2xl px-3 py-2 text-sm leading-6 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                                        >
                                            <span className="mt-[0.65rem] h-1.5 w-1.5 rounded-full bg-[var(--hi-secondary)]" />
                                            <span>{section.title}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </aside>

                    <div className="space-y-6">
                        {parsed.intro.length > 0 ? (
                            <article className={`rounded-[1.75rem] p-6 sm:p-7 ${panelClass}`}>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                    {documentT('legal.overview')}
                                </p>
                                <div className="mt-4 space-y-5">
                                    {parsed.intro.map((block, index) => (
                                        <div key={`intro-${index}`} className="space-y-4">
                                            {block.paragraphs.map((paragraph) => (
                                                <p key={paragraph} className={`text-[15px] leading-8 ${mutedTextClass}`}>
                                                    {renderInlineEmphasis(paragraph)}
                                                </p>
                                            ))}
                                            {block.bullets.length > 0 ? (
                                                <ul className="space-y-3">
                                                    {block.bullets.map((bullet) => (
                                                        <li key={bullet} className="flex items-start gap-3">
                                                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--hi-secondary)]" />
                                                            <span className={`text-[15px] leading-7 ${mutedTextClass}`}>{renderInlineEmphasis(bullet)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ) : null}

                        {parsed.sections.map((section) => (
                            <article
                                key={section.id}
                                id={section.id}
                                className={`scroll-mt-24 rounded-[1.75rem] p-6 sm:p-7 ${panelClass}`}
                            >
                                <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.85rem]">
                                    {section.title}
                                </h2>

                                <div className="mt-5 space-y-5">
                                    {section.paragraphs.map((paragraph) => (
                                        <p key={paragraph} className={`text-[15px] leading-8 ${mutedTextClass}`}>
                                            {renderInlineEmphasis(paragraph)}
                                        </p>
                                    ))}
                                    {section.bullets.length > 0 ? (
                                        <ul className="space-y-3">
                                            {section.bullets.map((bullet) => (
                                                <li key={bullet} className="flex items-start gap-3">
                                                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--hi-secondary)]" />
                                                    <span className={`text-[15px] leading-7 ${mutedTextClass}`}>{renderInlineEmphasis(bullet)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            </article>
                        ))}

                        <footer className={`rounded-[1.75rem] p-6 sm:p-7 ${panelClass}`}>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hi-secondary)]">
                                {documentT('legal.contact')}
                            </p>
                            <h2 className="mt-3 text-xl font-semibold">
                                {supportLabel}
                            </h2>
                            <a
                                href={`mailto:${supportValue}`}
                                className="mt-4 inline-flex rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-2 text-sm font-medium text-[var(--hi-text)] transition hover:bg-[var(--hi-panel-strong)]"
                            >
                                {supportValue}
                            </a>
                        </footer>
                    </div>
                </section>
            </div>
        </div>
    );
}
