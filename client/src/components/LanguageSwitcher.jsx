import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Search, X, Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import Tooltip from './Tooltip';
import { PRODUCT_LANGUAGE_OPTIONS, resolveSupportedLanguageCode } from '../utils/languageSupport';

export const LANGUAGE_OPTIONS = PRODUCT_LANGUAGE_OPTIONS;
const FREQUENT_LANGUAGE_CODES = ['tr', 'en', 'de', 'es', 'ar', 'fr'];

export default function LanguageSwitcher({
    className = '',
    variant = 'default',
    showLabel = true,
    showCodeBadge = false,
    showTooltip = true,
    onLanguageChange
}) {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const modalRef = useRef(null);
    const titleId = useId();
    const descriptionId = useId();

    const currentLangCode = resolveSupportedLanguageCode(i18n.resolvedLanguage || i18n.language, 'tr');
    const currentLang = useMemo(
        () => LANGUAGE_OPTIONS.find((language) => language.code === currentLangCode) || LANGUAGE_OPTIONS[0],
        [currentLangCode]
    );
    const filteredLanguages = useMemo(() => {
        if (!searchQuery) {
            return LANGUAGE_OPTIONS;
        }

        const query = searchQuery.toLowerCase();
        return LANGUAGE_OPTIONS.filter((language) =>
            language.label.toLowerCase().includes(query) || language.code.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    const frequentLanguages = useMemo(
        () => filteredLanguages.filter((language) => FREQUENT_LANGUAGE_CODES.includes(language.code)),
        [filteredLanguages]
    );
    const otherLanguages = useMemo(
        () => filteredLanguages.filter((language) => !FREQUENT_LANGUAGE_CODES.includes(language.code)),
        [filteredLanguages]
    );

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen]);

    const handleSelect = async (code) => {
        const resolvedCode = resolveSupportedLanguageCode(code, currentLangCode);
        if (resolvedCode === currentLangCode) {
            setIsOpen(false);
            setSearchQuery('');
            return;
        }

        await i18n.changeLanguage(resolvedCode);
        const selectedLanguage = LANGUAGE_OPTIONS.find((option) => option.code === resolvedCode) || null;
        onLanguageChange?.(selectedLanguage);
        setIsOpen(false);
        setSearchQuery('');
    };

    const isMinimal = variant === 'minimal';
    const isSidebar = variant === 'sidebar';
    const isSidebarCompact = isSidebar && !showLabel;
    const isExpandedSidebar = isSidebar && showLabel;
    const triggerClassName = isMinimal
        ? 'text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]'
        : isSidebar
            ? `btn-secondary ${isSidebarCompact ? '!justify-center !gap-0 !rounded-full !px-0 !py-0' : '!grid !grid-cols-[2rem_minmax(0,1fr)_1.25rem] !items-center !gap-x-3 !justify-stretch !rounded-[0.95rem] !px-3 !py-2.5 text-sm'}`
            : 'text-sm bg-[var(--hi-panel)] backdrop-blur-sm border border-[var(--hi-border)] hover:bg-[var(--hi-panel-strong)] text-[var(--hi-text)]';

    const renderLanguageButton = (language) => (
        <button
            key={language.code}
            type="button"
            onClick={() => handleSelect(language.code)}
            className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] ${
                currentLangCode === language.code
                    ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent-soft)] text-[var(--hi-text)] font-semibold'
                    : 'border-transparent text-[var(--hi-text-soft)] hover:bg-[var(--hi-accent-soft)] hover:text-[var(--hi-text)]'
            }`}
        >
            <div className="flex items-center gap-3">
                <span className={`flex h-6 min-w-[24px] items-center justify-center rounded-md px-1.5 text-[9px] font-bold uppercase transition-colors ${
                    currentLangCode === language.code ? 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]' : 'bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]'
                }`}>
                    {language.code}
                </span>
                {language.label}
            </div>
            {currentLangCode === language.code && <Check className="h-4 w-4 text-[var(--hi-accent)]" />}
        </button>
    );

    const triggerButton = (
        <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-label={t('settings.select_language_aria', {
                language: currentLang.label,
                defaultValue: 'Select language. Current: {{language}}'
            })}
            className={`flex w-full items-center rounded-xl px-4 py-3 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] ${isExpandedSidebar ? 'gap-0' : 'gap-3'} ${triggerClassName} ${className}`}
        >
            {isExpandedSidebar ? (
                <>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                        <Globe className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 truncate text-left text-sm font-semibold leading-[1.2] text-[var(--hi-text)]">
                        {currentLang.label}
                    </span>
                </>
            ) : (
                <div className={`flex items-center gap-3 overflow-hidden ${showLabel ? 'flex-1' : 'justify-center'}`}>
                    <Globe className={`h-5 w-5 flex-shrink-0 ${isMinimal ? 'text-[var(--hi-text-muted)]' : isSidebar ? 'text-[var(--hi-text-muted)]' : 'text-[var(--hi-secondary)]'}`} />
                    {showLabel && <span className="truncate text-left font-medium">{currentLang.label}</span>}
                </div>
            )}
            {showLabel && !isSidebar && showCodeBadge && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-md bg-[var(--hi-panel-muted)] px-1.5 text-[8px] font-bold uppercase text-[var(--hi-text-muted)]">
                    {currentLangCode}
                </span>
            )}
            {showLabel && isSidebar && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center justify-self-end text-[var(--hi-text-muted)]">
                    <ChevronDown className="h-4 w-4" />
                </span>
            )}
        </button>
    );

    return (
        <div className="relative">
            {showTooltip ? (
                <Tooltip
                    label={t('settings.select_language_tooltip', {
                        language: currentLang.label,
                        defaultValue: 'Change language. Current: {{language}}'
                    })}
                >
                    {triggerButton}
                </Tooltip>
            ) : triggerButton}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    data-language-switcher-portal="true"
                    className="fixed inset-0 z-[9999] overflow-y-auto bg-black/55 backdrop-blur-sm animate-in fade-in duration-200"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setIsOpen(false);
                        }
                    }}
                >
                    <div className="flex min-h-full items-start justify-center p-4 pb-6 pt-20">
                        <div
                            ref={modalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={titleId}
                            aria-describedby={descriptionId}
                            className="flex max-h-[calc(100dvh-7rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.6rem] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-2xl animate-in zoom-in-95 duration-200 backdrop-blur-xl"
                        >
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4">
                                <div>
                                    <h3 id={titleId} className="flex items-center gap-2 font-semibold text-[var(--hi-text)]">
                                        <Globe className="h-5 w-5 text-[var(--hi-secondary)]" />
                                        {t('settings.select_language')}
                                    </h3>
                                    <p id={descriptionId} className="mt-1 text-xs leading-5 text-[var(--hi-text-soft)]">
                                        {t('settings.language_description')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    aria-label={t('common.close')}
                                    className="rounded-lg p-1 text-[var(--hi-text-muted)] transition hover:bg-[var(--hi-accent-soft)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="border-b border-[var(--hi-border)] p-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hi-text-muted)]" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder={t('common.search')}
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        className="w-full rounded-xl border border-[var(--hi-border-strong)] bg-[var(--hi-bg-strong)] py-2 pl-10 pr-4 text-sm text-[var(--hi-text)] outline-none transition-all placeholder:text-[var(--hi-text-muted)] focus:ring-2 focus:ring-[var(--hi-accent)]"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            aria-label={t('common.clear', { defaultValue: 'Clear search' })}
                                            className="absolute right-2 top-1/2 rounded-lg p-1 text-[var(--hi-text-muted)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                            style={{ transform: 'translateY(-50%)' }}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2">
                                {searchQuery ? (
                                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                        {filteredLanguages.map(renderLanguageButton)}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {frequentLanguages.length > 0 && (
                                            <div>
                                                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                                                    {t('settings.frequently_used', { defaultValue: 'Frequently used' })}
                                                </p>
                                                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                                    {frequentLanguages.map(renderLanguageButton)}
                                                </div>
                                            </div>
                                        )}

                                        {otherLanguages.length > 0 && (
                                            <div>
                                                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-muted)]">
                                                    {t('settings.other_languages', { defaultValue: 'All languages' })}
                                                </p>
                                                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                                    {otherLanguages.map(renderLanguageButton)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {filteredLanguages.length === 0 && (
                                    <div className="p-8 text-center text-[var(--hi-text-muted)]">
                                        {t('settings.no_language_found', { defaultValue: 'No language matched that search.' })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
