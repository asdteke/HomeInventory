import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useResolvedPath } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
    ArrowRightLeft,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Grid2x2,
    Home,
    KeyRound,
    LogOut,
    Menu,
    Moon,
    Package,
    Plus,
    ScanLine,
    Settings,
    Shield,
    Sun,
    User,
    X,
    Wrench,
    ShoppingCart
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { BRAND_KEY, BRAND_NAME } from '../constants/branding';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitcher from './LanguageSwitcher';
import SegmentedToggle from './SegmentedToggle';
import Tooltip from './Tooltip';
import { ConfirmDialog } from './ModalDialog';

const COMPACT_ICON_BUTTON_SIZE = 'h-[64px] w-[64px]';
const COMPACT_ICON_INNER_SIZE = 'h-[48px] w-[48px]';
const EXPANDED_NAV_BUTTON_MIN_HEIGHT = 'min-h-[clamp(64px,6.9vh,74px)]';
const EXPANDED_NAV_ICON_SIZE = 'h-[clamp(40px,4.4vh,44px)] w-[clamp(40px,4.4vh,44px)]';
const STANDARD_NAV_BUTTON_MIN_HEIGHT = 'min-h-[64px]';
const STANDARD_NAV_ICON_SIZE = 'h-10 w-10';
const QRScanner = lazy(() => import('./QRScanner'));
const IntroTour = lazy(() => import('./IntroTour'));
const MOBILE_NAV_LINK_CLASS = 'mobile-liquid-nav-item';
const MOBILE_NAV_ITEM_CLASS = 'mobile-liquid-nav-action';
const MOBILE_NAV_LABEL_CLASS = 'mobile-liquid-nav-label';
const MOBILE_NAV_ICON_BASE_CLASS = 'mobile-liquid-nav-icon';

interface MobileBottomNavLinkProps {
    to: string;
    label: string;
    Icon: React.ComponentType<any>;
    end?: boolean;
}

function MobileBottomNavLink({ to, label, Icon, end = false }: MobileBottomNavLinkProps) {
    return (
        <NavLink to={to} end={end}>
            {({ isActive }) => (
                <span className={`${MOBILE_NAV_LINK_CLASS} ${isActive ? 'is-active' : ''}`}>
                    <span className="mobile-liquid-nav-content">
                        <span className={MOBILE_NAV_ICON_BASE_CLASS}>
                            <Icon className="h-4 w-4" />
                        </span>
                        <span className={MOBILE_NAV_LABEL_CLASS}>{label}</span>
                    </span>
                </span>
            )}
        </NavLink>
    );
}

interface ShellLinkProps {
    item: {
        to: string;
        label: string;
        icon: React.ComponentType<any>;
        end?: boolean;
    };
    compact?: boolean;
    onClick?: () => void;
    tone?: 'default' | 'danger' | 'admin';
    className?: string;
    spacious?: boolean;
    variant?: 'default' | 'drawer';
}

export function ShellLink({ item, compact = false, onClick, tone = 'default', className = '', spacious = false, variant = 'default' }: ShellLinkProps) {
    const Icon = item.icon;
    const resolvedPath = useResolvedPath(item.to);
    const isActive = Boolean(useMatch({ path: resolvedPath.pathname, end: item.end }));
    const isCustomBrand = BRAND_KEY !== 'homeinventory';
    const activeClasses = compact
        ? tone === 'danger'
            ? 'border border-red-300/40 bg-red-500/10 text-red-500'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.26)] bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]'
            : isCustomBrand
                ? 'border border-[color:var(--hi-border-strong)] bg-[linear-gradient(135deg,var(--hi-accent-soft),rgba(255,255,255,0.03))] text-[var(--hi-accent)] shadow-[var(--hi-shadow-soft)]'
                : 'border border-[color:var(--hi-accent-soft)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
        : tone === 'danger'
            ? 'border border-red-300/40 bg-red-500/10 text-red-500'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.24)] bg-[linear-gradient(135deg,rgba(184,153,104,0.12),rgba(184,153,104,0.04))] text-[var(--hi-text)]'
            : isCustomBrand
                ? 'border border-[color:var(--hi-border-strong)] bg-[linear-gradient(135deg,var(--hi-accent-soft),rgba(255,255,255,0.03))] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]'
                : 'border border-[color:var(--hi-accent-soft)] bg-[var(--hi-accent-soft)] text-[var(--hi-text)]';
    const inactiveClasses = compact
        ? tone === 'danger'
            ? 'border border-red-300/20 bg-red-500/5 text-red-500 hover:bg-red-500/10'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.16)] bg-[rgba(184,153,104,0.05)] text-[var(--hi-secondary-strong)] hover:border-[rgba(184,153,104,0.24)] hover:bg-[rgba(184,153,104,0.1)]'
            : 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]'
        : tone === 'danger'
            ? 'border border-red-300/20 bg-red-500/5 text-red-500 hover:bg-red-500/10'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.12)] bg-[rgba(184,153,104,0.05)] text-[var(--hi-text-soft)] hover:border-[rgba(184,153,104,0.22)] hover:bg-[rgba(184,153,104,0.1)] hover:text-[var(--hi-text)]'
            : isCustomBrand
                ? 'border border-transparent text-[var(--hi-text-soft)] hover:border-[var(--hi-border)] hover:bg-[var(--hi-panel)] hover:text-[var(--hi-text)]'
                : 'border border-transparent text-[var(--hi-text-soft)] hover:bg-white/45 hover:text-[var(--hi-text)] dark:hover:bg-white/5';
    const activeIconClasses = compact
        ? 'text-current'
        : tone === 'danger'
            ? 'bg-red-500/10 text-red-500'
        : tone === 'admin'
                ? 'bg-[rgba(184,153,104,0.18)] text-[var(--hi-secondary-strong)]'
            : 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]';
    const inactiveIconClasses = compact
        ? 'text-current'
        : tone === 'danger'
            ? 'bg-red-500/10 text-red-500'
            : tone === 'admin'
                ? 'bg-[rgba(184,153,104,0.12)] text-[var(--hi-secondary-strong)]'
            : 'bg-black/5 text-current dark:bg-white/5';
    const expandedButtonSize = spacious ? EXPANDED_NAV_BUTTON_MIN_HEIGHT : STANDARD_NAV_BUTTON_MIN_HEIGHT;
    const expandedIconSize = spacious ? EXPANDED_NAV_ICON_SIZE : STANDARD_NAV_ICON_SIZE;
    const expandedLabelClass = spacious
        ? 'text-[clamp(0.96rem,1vw,1.02rem)] font-semibold leading-6'
        : 'text-sm font-semibold leading-6';
    const isDrawerLink = variant === 'drawer';
    const drawerToneClass = tone === 'default' ? '' : `is-${tone}`;
    const resolvedClassName = isDrawerLink
        ? `mobile-drawer-nav-item ${isActive ? 'is-active' : ''} ${drawerToneClass} ${className}`.trim()
        : `
            group flex items-center gap-3 rounded-full transition-all duration-200
            ${compact ? `mx-auto ${COMPACT_ICON_BUTTON_SIZE} justify-center px-0 py-0` : `${expandedButtonSize} px-4 py-3`}
            ${isActive ? activeClasses : inactiveClasses}
            ${className}
        `;

    const link = (
        <NavLink
            to={item.to}
            end={item.end}
            onClick={onClick}
            aria-current={isActive ? 'page' : undefined}
            aria-label={compact ? item.label : undefined}
            className={resolvedClassName}
            data-shell-link={item.to}
        >
            <span className={isDrawerLink
                ? 'mobile-drawer-nav-icon'
                : `shell-link-icon flex ${compact ? 'h-full w-full' : expandedIconSize} shrink-0 items-center justify-center ${compact ? 'mx-auto rounded-full' : 'rounded-full'} ${isActive ? activeIconClasses : inactiveIconClasses}`
            }>
                <Icon className={isDrawerLink ? 'h-5 w-5' : `${compact ? 'h-5 w-5' : spacious ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`} />
            </span>
            {!compact && (
                <span className={isDrawerLink ? 'mobile-drawer-nav-copy' : 'shell-link-copy min-w-0 flex-1'}>
                    <span className={isDrawerLink ? 'mobile-drawer-nav-label' : `shell-link-label block ${expandedLabelClass}`}>{item.label}</span>
                </span>
            )}
        </NavLink>
    );

    if (compact) {
        return (
            <Tooltip label={item.label} side="right">
                {link}
            </Tooltip>
        );
    }

    return link;
}

export default function Layout() {
    const { user, logout, isAdmin } = useAuth();
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [logoutSubmitting, setLogoutSubmitting] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
    const mobileMenuDialogRef = useRef<HTMLDivElement>(null);
    const compactSidebar = !sidebarOpen;
    const isCustomBrand = BRAND_KEY !== 'homeinventory';
    const userInitial = user?.username?.charAt(0)?.toUpperCase() || 'H';
    const [shouldMountIntroTour] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return window.localStorage?.getItem('enableIntroTour') === 'true';
    });

    const closeMobileMenu = useCallback(() => {
        setMobileMenuOpen(false);
        setMobileAccountMenuOpen(false);
    }, []);

    const openLogoutConfirm = () => {
        closeMobileMenu();
        setProfileMenuOpen(false);
        setShowLogoutConfirm(true);
    };

    useEffect(() => {
        setProfileMenuOpen(false);
        closeMobileMenu();
    }, [closeMobileMenu, location.pathname, location.search, location.hash]);

    useEffect(() => {
        if (!mobileMenuOpen) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        const previousOverscrollBehavior = document.body.style.overscrollBehavior;
        const focusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');

        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';

        const focusFrame = window.requestAnimationFrame(() => {
            const initialFocus = mobileMenuDialogRef.current?.querySelector<HTMLElement>('[data-mobile-drawer-close="true"]');
            initialFocus?.focus({ preventScroll: true });
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (document.querySelector('[data-language-switcher-portal="true"]')) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeMobileMenu();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const dialog = mobileMenuDialogRef.current;
            if (!dialog) {
                return;
            }

            const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
                .filter((element) => element.offsetParent !== null);
            if (focusableElements.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }

            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === firstFocusable) {
                event.preventDefault();
                lastFocusable.focus();
            } else if (!event.shiftKey && document.activeElement === lastFocusable) {
                event.preventDefault();
                firstFocusable.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            document.body.style.overscrollBehavior = previousOverscrollBehavior;
            mobileMenuButtonRef.current?.focus({ preventScroll: true });
        };
    }, [closeMobileMenu, mobileMenuOpen]);

    useEffect(() => {
        if (!profileMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-language-switcher-portal="true"]')) {
                return;
            }

            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setProfileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [profileMenuOpen]);

    const handleLogout = async () => {
        setLogoutSubmitting(true);
        try {
            await logout();
            navigate('/', { replace: true });
        } finally {
            setLogoutSubmitting(false);
        }
    };

    const navItems = useMemo(() => ([
        {
            to: '/',
            label: t('navigation.home') || '',
            icon: Home,
            end: true
        },
        {
            to: '/items',
            label: t('navigation.inventory') || '',
            icon: Package
        },
        {
            to: '/maintenance',
            label: t('navigation.maintenance', { defaultValue: 'Bakım Takvimi' }) || '',
            icon: Wrench
        },
        {
            to: '/shopping',
            label: t('navigation.shopping', { defaultValue: 'Alışveriş Listesi' }) || '',
            icon: ShoppingCart
        },
        {
            to: '/borrow-requests',
            label: t('navigation.borrow_requests') || '',
            icon: ArrowRightLeft
        },
        {
            to: '/vault',
            label: t('navigation.personal_vault') || '',
            icon: KeyRound
        },
        {
            to: '/rooms',
            label: t('navigation.rooms') || '',
            icon: FolderOpen
        },
        {
            to: '/categories',
            label: t('navigation.categories') || '',
            icon: Grid2x2
        },
        {
            to: '/settings',
            label: t('navigation.settings') || '',
            icon: Settings
        }
    ]), [t]);

    return (
        <div className="premium-shell min-h-screen">
            {shouldMountIntroTour && (
                <Suspense fallback={null}>
                    <IntroTour />
                </Suspense>
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col border-r border-[var(--hi-border)]
                    bg-[var(--hi-bg-elevated)] backdrop-blur-2xl transition-all duration-300
                    ${sidebarOpen ? 'w-[288px]' : 'w-[112px]'}
                `}
            >
                <div className={`flex items-center ${sidebarOpen ? 'gap-4 px-5 pb-[clamp(0.75rem,1.2vh,1rem)] pt-[clamp(1rem,2vh,1.5rem)]' : 'justify-center px-0 pb-4 pt-6'}`}>
                    <Link to="/" aria-label={BRAND_NAME} className={`min-w-0 ${sidebarOpen ? 'flex-1 pr-3' : 'mx-auto'}`}>
                        {sidebarOpen ? (
                            <BrandLogo
                                variant="full"
                                size={isCustomBrand ? 'sm' : 'md'}
                                className={isCustomBrand ? 'max-h-[44px] max-w-[190px] object-contain' : 'max-h-[62px]'}
                            />
                        ) : (
                            <span className={`mx-auto flex ${COMPACT_ICON_BUTTON_SIZE} items-center justify-center overflow-hidden rounded-[1.35rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] shadow-[var(--hi-shadow-soft)]`}>
                                <BrandLogo variant="symbol" size="sm" className={isCustomBrand ? 'max-h-[50px]' : 'max-h-[42px]'} />
                            </span>
                        )}
                    </Link>
                    {sidebarOpen && (
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            aria-label={t('layout.collapse_sidebar', { defaultValue: 'Collapse sidebar' }) || undefined}
                            className="ml-2 shrink-0 rounded-full border border-[var(--hi-border)] bg-white/50 p-2 text-[var(--hi-text-soft)] transition hover:text-[var(--hi-text)] dark:bg-white/5"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {!sidebarOpen && (
                    <div className="flex justify-center pb-3">
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(true)}
                            aria-label={t('layout.expand_sidebar', { defaultValue: 'Expand sidebar' }) || undefined}
                            className={`mx-auto flex ${COMPACT_ICON_BUTTON_SIZE} items-center justify-center rounded-full border border-[var(--hi-border)] bg-white/50 text-[var(--hi-text-soft)] transition hover:text-[var(--hi-text)] dark:bg-white/5`}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                )}

                <div ref={profileMenuRef} className={`relative ${sidebarOpen ? 'px-4 pb-[clamp(0.75rem,1.2vh,1rem)]' : 'flex justify-center px-0 pb-4'}`}>
                    {sidebarOpen ? (
                        <button
                            type="button"
                            onClick={() => setProfileMenuOpen((current) => !current)}
                            aria-haspopup="dialog"
                            aria-expanded={profileMenuOpen}
                            aria-label={t('layout.account_menu_aria', {
                                name: user?.username || t('settings.account_overview.title', { defaultValue: 'Account overview' }),
                                defaultValue: 'Open account menu for {{name}}'
                            }) || undefined}
                            className="group flex w-full items-center gap-3 rounded-[1.15rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] px-3 py-2.5 text-left transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)]"
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] text-sm font-extrabold text-white shadow-[var(--hi-shadow-soft)]">
                                {userInitial}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold leading-5 text-[var(--hi-text)]">{user?.username}</p>
                            </div>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--hi-text-muted)] transition ${profileMenuOpen ? 'rotate-180 text-[var(--hi-accent)]' : 'group-hover:text-[var(--hi-accent)]'}`} />
                        </button>
                    ) : (
                        <Tooltip
                            label={t('layout.account_menu_tooltip', {
                                name: user?.username || t('settings.account_overview.title', { defaultValue: 'Account overview' }),
                                defaultValue: '{{name}} account menu'
                            }) || ''}
                            side="right"
                        >
                            <button
                                type="button"
                                onClick={() => setProfileMenuOpen((current) => !current)}
                                aria-haspopup="dialog"
                                aria-expanded={profileMenuOpen}
                                aria-label={t('layout.account_menu_aria', {
                                    name: user?.username || t('settings.account_overview.title', { defaultValue: 'Account overview' }),
                                    defaultValue: 'Open account menu for {{name}}'
                                }) || undefined}
                                className={`flex ${COMPACT_ICON_BUTTON_SIZE} items-center justify-center rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text)] transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)]`}
                            >
                                <span className={`flex ${COMPACT_ICON_INNER_SIZE} items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] text-[1.125rem] font-extrabold text-white shadow-[var(--hi-shadow-soft)]`}>
                                    {userInitial}
                                </span>
                            </button>
                        </Tooltip>
                    )}

                    {profileMenuOpen && (
                        <div
                            role="dialog"
                            aria-modal="false"
                            aria-label={t('layout.account_menu_title', { defaultValue: 'Account menu' }) || undefined}
                            className={`absolute z-50 overflow-hidden rounded-[1.2rem] border border-[var(--hi-border)] bg-[var(--hi-bg-elevated)] p-3 shadow-[var(--hi-shadow)] backdrop-blur-2xl ${sidebarOpen ? 'left-0 right-0 top-full mt-3' : 'left-full top-0 ml-3 w-[18rem]'}`}
                        >
                            <div className="space-y-2">
                                <Link
                                    to="/settings#settings-account"
                                    onClick={() => setProfileMenuOpen(false)}
                                    aria-label={t('settings.account_overview.title', { defaultValue: 'Account overview' }) || undefined}
                                    className="flex w-full items-center gap-3 rounded-[0.95rem] border border-transparent px-3 py-2.5 text-left text-sm font-medium text-[var(--hi-text)] transition hover:border-[var(--hi-border)] hover:bg-[var(--hi-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)]"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                                        <User className="h-4 w-4" />
                                    </span>
                                    <span>{t('settings.account_overview.title', { defaultValue: 'Account overview' })}</span>
                                </Link>

                                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-3">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-soft)]">
                                        {t('settings.language', { defaultValue: 'Language' })}
                                    </p>
                                    <LanguageSwitcher
                                        showCodeBadge={false}
                                        className="!h-11 !rounded-[0.95rem] !border-[var(--hi-border)] !bg-[var(--hi-panel-strong)] !px-3 !py-0 !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-muted)]"
                                    />
                                </div>

                                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-3">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-soft)]">
                                            {t('settings.theme.title')}
                                        </p>
                                        <Link
                                            to="/settings#settings-preferences"
                                            onClick={() => setProfileMenuOpen(false)}
                                            aria-label={t('settings.theme.title') || undefined}
                                            className="text-xs font-medium text-[var(--hi-accent)] transition hover:text-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel)]"
                                        >
                                            {t('common.manage')}
                                        </Link>
                                    </div>
                                    <SegmentedToggle
                                        ariaLabel={t('settings.theme.title') || ''}
                                        value={theme}
                                        onChange={setTheme as any}
                                        fullWidth
                                        buttonClassName="min-h-[40px] px-3 py-2 text-sm"
                                        activeClassName="bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]"
                                        options={[
                                            {
                                                value: 'light',
                                                label: t('settings.theme.light') || '',
                                                icon: Sun,
                                                tooltip: t('settings.theme.light') || '',
                                                ariaLabel: t('settings.theme.light_aria', { defaultValue: 'Switch to light theme' }) || ''
                                            },
                                            {
                                                value: 'dark',
                                                label: t('settings.theme.dark') || '',
                                                icon: Moon,
                                                tooltip: t('settings.theme.dark') || '',
                                                ariaLabel: t('settings.theme.dark_aria', { defaultValue: 'Switch to dark theme' }) || ''
                                            }
                                        ]}
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={openLogoutConfirm}
                                    aria-label={t('navigation.logout_aria', { defaultValue: 'Log out of your account' }) || undefined}
                                    className="flex w-full items-center gap-3 rounded-[0.95rem] border border-red-500/18 bg-red-500/6 px-3 py-2.5 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)]"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/12 text-current">
                                        <LogOut className="h-4 w-4" />
                                    </span>
                                    <span>{t('navigation.logout')}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <nav
                    className={`overflow-y-auto ${sidebarOpen ? 'flex-1 space-y-[clamp(0.5rem,0.9vh,0.75rem)] px-4 pb-[clamp(0.75rem,1.3vh,1.1rem)] pt-[clamp(0.5rem,0.9vh,0.75rem)]' : 'flex flex-col items-center gap-2 px-0 pb-3 pt-2'}`}
                    style={compactSidebar ? { scrollbarWidth: 'none' } : undefined}
                >
                    {navItems.map((item) => (
                        <ShellLink key={item.to} item={item} compact={!sidebarOpen} spacious={sidebarOpen} />
                    ))}

                    {isAdmin && (
                        <ShellLink
                            item={{
                                to: '/admin',
                                label: t('navigation.admin_panel') || '',
                                icon: Shield
                            }}
                            compact={!sidebarOpen}
                            spacious={sidebarOpen}
                            tone="admin"
                            className="mt-4"
                        />
                    )}
                </nav>

            </aside>

            <header className="mobile-topbar lg:hidden sticky top-0 z-40">
                <div className="flex items-center justify-between gap-3">
                    <Link to="/" aria-label={BRAND_NAME} className="min-w-0">
                        <BrandLogo variant="symbol" size="sm" className="max-h-[34px]" />
                    </Link>

                    <button
                        ref={mobileMenuButtonRef}
                        type="button"
                        onClick={() => setMobileMenuOpen(true)}
                        aria-label={t('navigation.menu') || undefined}
                        aria-controls="mobile-navigation-drawer"
                        aria-expanded={mobileMenuOpen}
                        aria-haspopup="dialog"
                        className="mobile-topbar-menu"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                </div>
            </header>

            {mobileMenuOpen && (
                <div className="mobile-drawer-root fixed inset-0 z-50 lg:hidden">
                    <div className="mobile-drawer-scrim absolute inset-0" aria-hidden="true" onClick={closeMobileMenu} />
                    <div
                        id="mobile-navigation-drawer"
                        ref={mobileMenuDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="mobile-navigation-drawer-title"
                        tabIndex={-1}
                        className="mobile-drawer-panel absolute flex flex-col overflow-hidden"
                    >
                        <header className="mobile-drawer-header shrink-0">
                            <Link to="/" aria-label={BRAND_NAME} onClick={closeMobileMenu} className="mobile-drawer-brand">
                                <BrandLogo variant="symbol" size="sm" className="max-h-[42px]" />
                            </Link>
                            <h2 id="mobile-navigation-drawer-title" className="sr-only">
                                {t('navigation.menu')}
                            </h2>
                            <button
                                type="button"
                                onClick={closeMobileMenu}
                                aria-label={t('common.close') || undefined}
                                className="mobile-drawer-close"
                                data-mobile-drawer-close="true"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </header>

                        <div className="mobile-drawer-body min-h-0 flex-1 overflow-y-auto">
                            <section className="mobile-drawer-account-section" aria-label={t('settings.account_overview.title', { defaultValue: 'Account overview' })}>
                                <button
                                    type="button"
                                    onClick={() => setMobileAccountMenuOpen((current) => !current)}
                                    aria-expanded={mobileAccountMenuOpen}
                                    aria-controls="mobile-drawer-account-panel"
                                    aria-label={t('layout.account_menu_aria', {
                                        name: user?.username || t('settings.account_overview.title', { defaultValue: 'Account overview' }),
                                        defaultValue: 'Open account menu for {{name}}'
                                    }) || undefined}
                                    className="mobile-drawer-account"
                                >
                                    <span className="mobile-drawer-account-avatar" aria-hidden="true">{userInitial}</span>
                                    <span className="mobile-drawer-account-copy">
                                        <span className="mobile-drawer-account-name">{user?.username}</span>
                                        <span className="mobile-drawer-account-label">{t('settings.account_overview.title', { defaultValue: 'Account overview' })}</span>
                                    </span>
                                    <ChevronDown className={`mobile-drawer-account-chevron ${mobileAccountMenuOpen ? 'is-open' : ''}`} aria-hidden="true" />
                                </button>

                                {mobileAccountMenuOpen && (
                                    <div id="mobile-drawer-account-panel" className="mobile-drawer-account-panel">
                                        <Link
                                            to="/settings#settings-account"
                                            onClick={closeMobileMenu}
                                            className="mobile-drawer-account-link"
                                        >
                                            <span className="mobile-drawer-account-link-icon" aria-hidden="true">
                                                <User className="h-4 w-4" />
                                            </span>
                                            <span className="mobile-drawer-account-link-label">{t('settings.account_overview.title', { defaultValue: 'Account overview' })}</span>
                                            <ChevronRight className="mobile-drawer-account-link-chevron" aria-hidden="true" />
                                        </Link>

                                        <div className="mobile-drawer-preference">
                                            <p className="mobile-drawer-preference-label">
                                                {t('settings.language', { defaultValue: 'Language' })}
                                            </p>
                                            <LanguageSwitcher
                                                showCodeBadge={false}
                                                showTooltip={false}
                                                className="mobile-drawer-language-trigger"
                                            />
                                        </div>

                                        <div className="mobile-drawer-preference">
                                            <p className="mobile-drawer-preference-label">
                                                {t('settings.theme.title')}
                                            </p>
                                            <SegmentedToggle
                                                ariaLabel={t('settings.theme.title') || ''}
                                                value={theme}
                                                onChange={setTheme as any}
                                                fullWidth
                                                className="mobile-drawer-theme-toggle"
                                                buttonClassName="mobile-drawer-theme-option"
                                                activeClassName="is-active"
                                                inactiveClassName=""
                                                options={[
                                                    {
                                                        value: 'light',
                                                        label: t('settings.theme.light') || '',
                                                        icon: Sun,
                                                        tooltip: t('settings.theme.light') || '',
                                                        ariaLabel: t('settings.theme.light_aria', { defaultValue: 'Switch to light theme' }) || ''
                                                    },
                                                    {
                                                        value: 'dark',
                                                        label: t('settings.theme.dark') || '',
                                                        icon: Moon,
                                                        tooltip: t('settings.theme.dark') || '',
                                                        ariaLabel: t('settings.theme.dark_aria', { defaultValue: 'Switch to dark theme' }) || ''
                                                    }
                                                ]}
                                            />
                                        </div>
                                    </div>
                                )}
                            </section>

                            <nav className="mobile-drawer-nav" aria-label={t('navigation.menu', { defaultValue: 'Primary navigation' }) || undefined}>
                                {navItems.map((item) => (
                                    <ShellLink
                                        key={item.to}
                                        item={item}
                                        variant="drawer"
                                        onClick={closeMobileMenu}
                                    />
                                ))}
                                {isAdmin && (
                                    <ShellLink
                                        item={{
                                            to: '/admin',
                                            label: t('navigation.admin_panel') || '',
                                            icon: Shield
                                        }}
                                        variant="drawer"
                                        onClick={closeMobileMenu}
                                        tone="admin"
                                    />
                                )}
                            </nav>
                        </div>

                        <footer className="mobile-drawer-footer shrink-0">
                            <div className="mobile-drawer-actions">
                                <button
                                    type="button"
                                    onClick={() => {
                                        closeMobileMenu();
                                        setShowQRScanner(true);
                                    }}
                                    aria-label={t('navigation.scan_item_qr', { defaultValue: 'Scan item QR' }) || undefined}
                                    className="mobile-drawer-action mobile-drawer-action--secondary"
                                >
                                    <ScanLine className="h-4 w-4" aria-hidden="true" />
                                    <span>{t('navigation.scan_item_qr', { defaultValue: 'Scan item QR' })}</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={openLogoutConfirm}
                                aria-label={t('navigation.logout_aria', { defaultValue: 'Log out of your account' }) || undefined}
                                className="mobile-drawer-logout"
                            >
                                <span className="mobile-drawer-logout-icon" aria-hidden="true">
                                    <LogOut className="h-4 w-4" />
                                </span>
                                <span className="mobile-drawer-logout-label">{t('navigation.logout')}</span>
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            <main className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-[288px]' : 'lg:ml-[112px]'}`}>
                <div className="px-3 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
                    <div key={`${location.pathname}${location.search}`} className="animate-fade-in">
                        <Suspense
                            fallback={(
                                <div role="status" aria-live="polite" className="flex min-h-[42vh] items-center justify-center">
                                    <div className="spinner" />
                                    <span className="sr-only">{t('common.loading')}</span>
                                </div>
                            )}
                        >
                            <Outlet />
                        </Suspense>
                    </div>
                </div>
            </main>

            <ConfirmDialog
                isOpen={showLogoutConfirm}
                title={t('navigation.logout_title', { defaultValue: 'Log out?' }) || ''}
                description={t('navigation.logout_description', { defaultValue: 'You will be returned to the sign-in screen and need to log in again to manage your household inventory.' }) || ''}
                confirmLabel={logoutSubmitting ? t('common.loading') || '' : t('navigation.logout') || ''}
                cancelLabel={t('common.cancel') || ''}
                onClose={() => !logoutSubmitting && setShowLogoutConfirm(false)}
                onConfirm={handleLogout}
                confirming={logoutSubmitting}
                tone="warning"
            >
                <p className="text-sm leading-6 text-[var(--hi-text-soft)]">
                    {t('navigation.logout_warning', { defaultValue: 'Use this when you are done on a shared or personal device.' })}
                </p>
            </ConfirmDialog>

            <nav aria-label={t('navigation.menu', { defaultValue: 'Primary navigation' }) || undefined} className="mobile-liquid-nav safe-area-pb fixed bottom-3 left-3 right-3 z-40 lg:hidden">
                <div className="mobile-liquid-nav-grid">
                    <MobileBottomNavLink to="/" end label={t('navigation.home') || ''} Icon={Home} />
                    <MobileBottomNavLink to="/items" label={t('navigation.inventory') || ''} Icon={Package} />
                    <NavLink to="/items/new" aria-label={t('navigation.new_item') || undefined} className={MOBILE_NAV_ITEM_CLASS}>
                        <span className="mobile-liquid-nav-create">
                            <Plus className="h-6 w-6" />
                        </span>
                    </NavLink>
                    {isAdmin ? (
                        <MobileBottomNavLink to="/admin" label={t('navigation.admin_panel', { defaultValue: 'Admin' }) || ''} Icon={Shield} />
                    ) : (
                        <MobileBottomNavLink to="/vault" label={t('navigation.personal_vault') || ''} Icon={KeyRound} />
                    )}
                    <MobileBottomNavLink to="/settings" label={t('navigation.settings') || ''} Icon={Settings} />
                </div>
            </nav>

            {showQRScanner && (
                <Suspense
                    fallback={(
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                            <div className="spinner" />
                        </div>
                    )}
                >
                    <QRScanner isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
                </Suspense>
            )}
        </div>
    );
}
