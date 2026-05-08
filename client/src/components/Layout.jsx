import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
    AlertTriangle,
    ArrowRightLeft,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Grid2x2,
    HelpCircle,
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
    X
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { BRAND_NAME, SUPPORT_EMAIL } from '../constants/branding';
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
const MOBILE_DRAWER_NAV_ITEM_CLASS = '!min-h-[58px] !px-3.5 !py-2.5';
const QRScanner = lazy(() => import('./QRScanner'));
const IntroTour = lazy(() => import('./IntroTour'));
const MOBILE_NAV_ITEM_CLASS = 'flex h-[72px] flex-col items-center justify-center px-1 text-[11px] font-medium leading-[1.1] text-center transition-all';
const MOBILE_NAV_LINK_CLASS = 'relative flex h-[72px] flex-col items-center justify-start gap-0 px-1 pt-1.5 text-[10.5px] font-medium leading-none text-center transition-all';
const MOBILE_NAV_LABEL_CLASS = 'mt-px max-w-[4.35rem] text-center leading-[1.02] tracking-[-0.01em]';
const MOBILE_NAV_ICON_BASE_CLASS = 'flex h-10 w-10 items-center justify-center rounded-full border transition-all';

function MobileBottomNavLink({ to, label, Icon, end = false }) {
    return (
        <NavLink to={to} end={end}>
            {({ isActive }) => (
                <span className={`${MOBILE_NAV_LINK_CLASS} ${isActive ? 'text-[var(--hi-accent)]' : 'text-[var(--hi-text-soft)]'}`}>
                    <span className={`${MOBILE_NAV_ICON_BASE_CLASS} ${isActive ? 'border-[color:var(--hi-accent-soft)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)] shadow-[var(--hi-shadow-soft)]' : 'border-transparent bg-transparent text-current'}`}>
                        <Icon className="h-4 w-4" />
                    </span>
                    <span className={MOBILE_NAV_LABEL_CLASS}>{label}</span>
                </span>
            )}
        </NavLink>
    );
}

export function ShellLink({ item, compact = false, onClick, tone = 'default', className = '', spacious = false }) {
    const Icon = item.icon;
    const resolvedPath = useResolvedPath(item.to);
    const isActive = Boolean(useMatch({ path: resolvedPath.pathname, end: item.end }));
    const activeClasses = compact
        ? tone === 'danger'
            ? 'border border-red-300/40 bg-red-500/10 text-red-500'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.26)] bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]'
            : false
                ? 'border border-[color:var(--hi-border-strong)] bg-[linear-gradient(135deg,var(--hi-accent-soft),rgba(255,255,255,0.03))] text-[var(--hi-accent)] shadow-[var(--hi-shadow-soft)]'
                : 'border border-[color:var(--hi-accent-soft)] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
        : tone === 'danger'
            ? 'border border-red-300/40 bg-red-500/10 text-red-500'
            : tone === 'admin'
                ? 'border border-[rgba(184,153,104,0.24)] bg-[linear-gradient(135deg,rgba(184,153,104,0.12),rgba(184,153,104,0.04))] text-[var(--hi-text)]'
            : false
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
            : false
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

    const link = (
        <NavLink
            to={item.to}
            end={item.end}
            onClick={onClick}
            aria-current={isActive ? 'page' : undefined}
            aria-label={compact ? item.label : undefined}
            className={`
                group flex items-center gap-3 rounded-full transition-all duration-200
                ${compact ? `mx-auto ${COMPACT_ICON_BUTTON_SIZE} justify-center px-0 py-0` : `${expandedButtonSize} px-4 py-3`}
                ${isActive ? activeClasses : inactiveClasses}
                ${className}
            `}
            data-shell-link={item.to}
        >
            <span className={`flex ${compact ? 'h-full w-full' : expandedIconSize} shrink-0 items-center justify-center ${compact ? 'mx-auto rounded-full' : 'rounded-full'} ${isActive ? activeIconClasses : inactiveIconClasses}`}>
                <Icon className={`${compact ? 'h-5 w-5' : spacious ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`} />
            </span>
            {!compact && (
                <span className="min-w-0 flex-1">
                    <span className={`block ${expandedLabelClass}`}>{item.label}</span>
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

function BetaBadge({ t, compact = false }) {
    return (
        <Tooltip
            label={t('beta_banner.tooltip', { defaultValue: 'Early access features may still change.' })}
            side={compact ? 'right' : 'top'}
            panelClassName={compact ? '' : '!left-0 !translate-x-0 max-w-[14rem] text-left'}
        >
            <button
                type="button"
                aria-label={t('beta_banner.aria_label', { defaultValue: 'Beta notice' })}
                className={`inline-flex items-center gap-2 rounded-full border border-[rgba(184,153,104,0.24)] bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)] shadow-[var(--hi-shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-bg-elevated)] ${compact ? `${COMPACT_ICON_BUTTON_SIZE} justify-center px-0` : 'px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]'}`}
            >
                <AlertTriangle className={compact ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'} />
                {!compact && <span>{t('beta_banner.badge', { defaultValue: 'Beta' })}</span>}
            </button>
        </Tooltip>
    );
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
    const profileMenuRef = useRef(null);
    const compactUtilityButtonClass = '!mx-auto !h-[64px] !w-[64px] !justify-center !rounded-full !px-0 !py-0';
    const bottomActionButtonClass = 'btn-secondary !w-full !min-h-[58px] !justify-start !gap-3 !rounded-[1rem] !border-[var(--hi-border)] !bg-[var(--hi-panel)] !px-3.5 !py-3 text-sm hover:!bg-[var(--hi-panel-muted)]';
    const mobileBottomActionButtonClass = `${bottomActionButtonClass} !min-h-[54px] !py-2.5`;
    const compactSidebar = !sidebarOpen;
    const userInitial = user?.username?.charAt(0)?.toUpperCase() || 'H';
    const betaT = (key, options) => t(key, { brandName: BRAND_NAME, ...options });
    const [shouldMountIntroTour] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.localStorage?.getItem('enableIntroTour') === 'true';
    });

    const openLogoutConfirm = () => {
        setMobileMenuOpen(false);
        setMobileAccountMenuOpen(false);
        setProfileMenuOpen(false);
        setShowLogoutConfirm(true);
    };

    useEffect(() => {
        setProfileMenuOpen(false);
        setMobileAccountMenuOpen(false);
    }, [location.pathname, location.search, location.hash]);

    useEffect(() => {
        if (!profileMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (event.target instanceof Element && event.target.closest('[data-language-switcher-portal="true"]')) {
                return;
            }

            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
                setProfileMenuOpen(false);
            }
        };

        const handleKeyDown = (event) => {
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
            label: t('navigation.home'),
            icon: Home,
            end: true
        },
        {
            to: '/items',
            label: t('navigation.inventory'),
            icon: Package
        },
        {
            to: '/borrow-requests',
            label: t('navigation.borrow_requests'),
            icon: ArrowRightLeft
        },
        {
            to: '/vault',
            label: t('navigation.personal_vault'),
            icon: KeyRound
        },
        {
            to: '/rooms',
            label: t('navigation.rooms'),
            icon: FolderOpen
        },
        {
            to: '/categories',
            label: t('navigation.categories'),
            icon: Grid2x2
        },
        {
            to: '/settings',
            label: t('navigation.settings'),
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
                                size={false ? 'xl' : 'md'}
                                className={false ? 'w-[258px] max-w-full' : 'max-h-[62px]'}
                            />
                        ) : (
                            <span className={`mx-auto flex ${COMPACT_ICON_BUTTON_SIZE} items-center justify-center overflow-hidden rounded-[1.35rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] shadow-[var(--hi-shadow-soft)]`}>
                                <BrandLogo variant="symbol" size={false ? 'sm' : 'sm'} className={false ? 'max-h-[50px]' : 'max-h-[42px]'} />
                            </span>
                        )}
                    </Link>
                    {sidebarOpen && (
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            aria-label={t('layout.collapse_sidebar', { defaultValue: 'Collapse sidebar' })}
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
                            aria-label={t('layout.expand_sidebar', { defaultValue: 'Expand sidebar' })}
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
                            })}
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
                            })}
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
                                })}
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
                            aria-label={t('layout.account_menu_title', { defaultValue: 'Account menu' })}
                            className={`absolute z-50 overflow-hidden rounded-[1.2rem] border border-[var(--hi-border)] bg-[var(--hi-bg-elevated)] p-3 shadow-[var(--hi-shadow)] backdrop-blur-2xl ${sidebarOpen ? 'left-0 right-0 top-full mt-3' : 'left-full top-0 ml-3 w-[18rem]'}`}
                        >
                            <div className="space-y-2">
                                <Link
                                    to="/settings#settings-account"
                                    onClick={() => setProfileMenuOpen(false)}
                                    aria-label={t('settings.account_overview.title', { defaultValue: 'Account overview' })}
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
                                            aria-label={t('settings.theme.title')}
                                            className="text-xs font-medium text-[var(--hi-accent)] transition hover:text-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel)]"
                                        >
                                            {t('common.manage')}
                                        </Link>
                                    </div>
                                    <SegmentedToggle
                                        ariaLabel={t('settings.theme.title')}
                                        value={theme}
                                        onChange={setTheme}
                                        fullWidth
                                        buttonClassName="min-h-[40px] px-3 py-2 text-sm"
                                        activeClassName="bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]"
                                        options={[
                                            {
                                                value: 'light',
                                                label: t('settings.theme.light'),
                                                icon: Sun,
                                                tooltip: t('settings.theme.light'),
                                                ariaLabel: t('settings.theme.light_aria', { defaultValue: 'Switch to light theme' })
                                            },
                                            {
                                                value: 'dark',
                                                label: t('settings.theme.dark'),
                                                icon: Moon,
                                                tooltip: t('settings.theme.dark'),
                                                ariaLabel: t('settings.theme.dark_aria', { defaultValue: 'Switch to dark theme' })
                                            }
                                        ]}
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={openLogoutConfirm}
                                    aria-label={t('navigation.logout_aria', { defaultValue: 'Log out of your account' })}
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
                                label: t('navigation.admin_panel'),
                                icon: Shield
                            }}
                            compact={!sidebarOpen}
                            spacious={sidebarOpen}
                            tone="admin"
                            className="mt-4"
                        />
                    )}
                </nav>

                <div className={`border-t border-[var(--hi-border)] ${sidebarOpen ? 'space-y-[clamp(0.5rem,0.9vh,0.75rem)] px-4 py-[clamp(0.75rem,1.2vh,1rem)]' : 'flex flex-col items-center gap-3 px-0 py-4'}`}>
                    <div className={`${sidebarOpen ? 'flex items-center justify-start px-1' : 'flex items-center justify-center'}`}>
                        <BetaBadge t={betaT} compact={!sidebarOpen} />
                    </div>

                    <div className={`${sidebarOpen ? 'space-y-2' : 'flex flex-col items-center gap-2'}`}>
                        {sidebarOpen ? (
                            <a href={`mailto:${SUPPORT_EMAIL}`} aria-label={t('common.help_support')} className={bottomActionButtonClass}>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                                    <HelpCircle className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 text-left text-sm font-semibold text-[var(--hi-text)]">{t('common.help_support')}</span>
                            </a>
                        ) : (
                            <Tooltip label={t('common.help_support')} side="right">
                                <a href={`mailto:${SUPPORT_EMAIL}`} aria-label={t('common.help_support')} className={`btn-secondary ${compactUtilityButtonClass}`}>
                                    <HelpCircle className="h-4 w-4" />
                                </a>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </aside>

            <header className="glass lg:hidden sticky top-0 z-40 mx-3 mt-3 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <Link to="/" aria-label={BRAND_NAME} className="min-w-0">
                        <BrandLogo variant="symbol" size="sm" className="max-h-[42px]" />
                    </Link>

                    <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label={t('navigation.menu')} className="btn-secondary !px-3 !py-3">
                        <Menu className="h-4 w-4" />
                    </button>
                </div>
            </header>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                    <div className="absolute inset-y-3 right-3 flex w-[min(88vw,360px)] animate-slide-in-right flex-col overflow-hidden rounded-[1.6rem] border border-[var(--hi-border)] bg-[var(--hi-bg-elevated)] p-4 shadow-2xl backdrop-blur-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <Link to="/" aria-label={BRAND_NAME} onClick={() => setMobileMenuOpen(false)} className="min-w-0">
                                <BrandLogo variant="symbol" size="sm" className="max-h-[42px]" />
                            </Link>
                            <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label={t('common.close')} className="btn-secondary !px-3 !py-3">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setMobileAccountMenuOpen((current) => !current)}
                            aria-expanded={mobileAccountMenuOpen}
                            aria-haspopup="true"
                            aria-label={t('layout.account_menu_aria', {
                                name: user?.username || t('settings.account_overview.title', { defaultValue: 'Account overview' }),
                                defaultValue: 'Open account menu for {{name}}'
                            })}
                            className="card !mb-3 !flex !w-full !items-center !gap-3 !rounded-[1.1rem] !p-3 text-left"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-[var(--hi-accent-strong)] to-[var(--hi-accent)] text-sm font-bold text-white">
                                {userInitial}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold leading-5 text-[var(--hi-text)]">{user?.username}</p>
                                <p className="truncate text-xs text-[var(--hi-text-muted)]">{t('settings.account_overview.title', { defaultValue: 'Account overview' })}</p>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-[var(--hi-text-muted)] transition ${mobileAccountMenuOpen ? 'rotate-180 text-[var(--hi-accent)]' : ''}`} />
                        </button>

                        {mobileAccountMenuOpen && (
                            <div className="mb-3 space-y-3 rounded-[1.1rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-3">
                                <Link
                                    to="/settings#settings-account"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex w-full items-center gap-3 rounded-[0.95rem] border border-transparent px-3 py-2.5 text-left text-sm font-medium text-[var(--hi-text)] transition hover:border-[var(--hi-border)] hover:bg-[var(--hi-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel)]"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                                        <User className="h-4 w-4" />
                                    </span>
                                    <span>{t('settings.account_overview.title', { defaultValue: 'Account overview' })}</span>
                                    <ChevronRight className="ml-auto h-4 w-4 text-[var(--hi-text-muted)]" />
                                </Link>

                                <div className="rounded-[0.95rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-3">
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hi-text-soft)]">
                                        {t('settings.language', { defaultValue: 'Language' })}
                                    </p>
                                    <LanguageSwitcher
                                        showCodeBadge={false}
                                        className="!w-full !justify-between !rounded-[0.9rem] !border-[var(--hi-border)] !bg-[var(--hi-panel)] !px-3 !py-2 text-sm hover:!bg-[var(--hi-panel-strong)]"
                                    />
                                </div>

                                <div className="rounded-[0.95rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-3">
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hi-text-soft)]">
                                        {t('settings.theme.title')}
                                    </p>
                                    <SegmentedToggle
                                        ariaLabel={t('settings.theme.title')}
                                        value={theme}
                                        onChange={setTheme}
                                        fullWidth
                                        buttonClassName="min-h-[40px] px-3 py-2 text-sm"
                                        activeClassName="bg-[var(--hi-panel)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]"
                                        options={[
                                            {
                                                value: 'light',
                                                label: t('settings.theme.light'),
                                                icon: Sun,
                                                tooltip: t('settings.theme.light'),
                                                ariaLabel: t('settings.theme.light_aria', { defaultValue: 'Switch to light theme' })
                                            },
                                            {
                                                value: 'dark',
                                                label: t('settings.theme.dark'),
                                                icon: Moon,
                                                tooltip: t('settings.theme.dark'),
                                                ariaLabel: t('settings.theme.dark_aria', { defaultValue: 'Switch to dark theme' })
                                            }
                                        ]}
                                    />
                                </div>
                            </div>
                        )}

                        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-3">
                            {navItems.map((item) => (
                                <ShellLink
                                    key={item.to}
                                    item={item}
                                    className={MOBILE_DRAWER_NAV_ITEM_CLASS}
                                    onClick={() => setMobileMenuOpen(false)}
                                />
                            ))}
                            {isAdmin && (
                                <ShellLink
                                    item={{
                                        to: '/admin',
                                        label: t('navigation.admin_panel'),
                                        icon: Shield
                                    }}
                                    className={MOBILE_DRAWER_NAV_ITEM_CLASS}
                                    onClick={() => setMobileMenuOpen(false)}
                                    tone="admin"
                                />
                            )}
                        </nav>

                        <div className="mb-4 flex justify-start">
                            <BetaBadge t={betaT} />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Link to="/items/new" onClick={() => setMobileMenuOpen(false)} className="btn-primary !min-h-[56px] !py-2.5">
                                <Plus className="h-4 w-4" />
                                <span>{t('common.new')}</span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    setShowQRScanner(true);
                                }}
                                aria-label={t('navigation.scan_item_qr', { defaultValue: 'Scan item QR' })}
                                className="btn-secondary !min-h-[56px] !py-2.5"
                            >
                                <ScanLine className="h-4 w-4" />
                                <span>{t('navigation.scan_item_qr', { defaultValue: 'Scan item QR' })}</span>
                            </button>
                        </div>

                        <div className="mt-2 space-y-2">
                            <a href={`mailto:${SUPPORT_EMAIL}`} className={mobileBottomActionButtonClass}>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                                    <HelpCircle className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 text-left text-sm font-semibold text-[var(--hi-text)]">{t('common.help_support')}</span>
                            </a>
                            <button
                                type="button"
                                onClick={openLogoutConfirm}
                                aria-label={t('navigation.logout_aria', { defaultValue: 'Log out of your account' })}
                                className={mobileBottomActionButtonClass}
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]">
                                    <LogOut className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 text-left text-sm font-semibold text-[var(--hi-text)]">{t('navigation.logout')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-[288px]' : 'lg:ml-[112px]'}`}>
                <div className="px-3 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
                    <div key={`${location.pathname}${location.search}`} className="animate-fade-in">
                        <Outlet />
                    </div>
                </div>
            </main>

            <ConfirmDialog
                isOpen={showLogoutConfirm}
                title={t('navigation.logout_title', { defaultValue: 'Log out?' })}
                description={t('navigation.logout_description', { defaultValue: 'You will be returned to the sign-in screen and need to log in again to manage your household inventory.' })}
                confirmLabel={logoutSubmitting ? t('common.loading') : t('navigation.logout')}
                cancelLabel={t('common.cancel')}
                onClose={() => !logoutSubmitting && setShowLogoutConfirm(false)}
                onConfirm={handleLogout}
                confirming={logoutSubmitting}
                tone="warning"
            >
                <p className="text-sm leading-6 text-[var(--hi-text-soft)]">
                    {t('navigation.logout_warning', { defaultValue: 'Use this when you are done on a shared or personal device.' })}
                </p>
            </ConfirmDialog>

            <nav className="glass safe-area-pb fixed bottom-3 left-3 right-3 z-40 rounded-full px-2 py-2 lg:hidden">
                <div className="grid grid-cols-5 items-stretch gap-1">
                    <MobileBottomNavLink to="/" end label={t('navigation.home')} Icon={Home} />
                    <MobileBottomNavLink to="/items" label={t('navigation.inventory')} Icon={Package} />
                    <NavLink to="/items/new" aria-label={t('navigation.new_item')} className={`${MOBILE_NAV_ITEM_CLASS} text-[var(--hi-text)]`}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--hi-accent-strong)] to-[var(--hi-accent)] text-white shadow-lg">
                            <Plus className="h-5 w-5" />
                        </span>
                    </NavLink>
                    <MobileBottomNavLink to="/vault" label={t('navigation.personal_vault')} Icon={KeyRound} />
                    <MobileBottomNavLink to="/settings" label={t('navigation.settings')} Icon={Settings} />
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
