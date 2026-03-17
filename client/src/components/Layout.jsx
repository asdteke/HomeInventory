import { useState } from 'react';
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
    Home, Package, FolderOpen, Settings, Plus, Menu, X, ChevronLeft, ChevronRight,
    Sun, Moon, LogOut, User, MapPin, ScanLine, Share2, HelpCircle, Shield
} from 'lucide-react';
import QRScanner from './QRScanner';
import IntroTour from './IntroTour';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

export default function Layout() {
    const { user, logout, isAdmin } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showQRScanner, setShowQRScanner] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };

    const navItems = [
        { to: '/', label: t('navigation.home'), icon: Home, end: true },
        { to: '/items', label: t('navigation.inventory'), icon: Package, id: 'intro-inventory' },
        { to: '/rooms', label: t('navigation.rooms'), icon: FolderOpen },
        { to: '/categories', label: t('navigation.categories'), icon: MapPin, id: 'intro-categories' },
        { to: '/settings', label: t('navigation.settings'), icon: Settings },
    ];

    const NavItem = ({ item, mobile = false }) => (
        <NavLink
            to={item.to}
            end={item.end}
            id={item.id}
            onClick={() => mobile && setMobileMenuOpen(false)}
            className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200
        ${mobile ? 'text-base' : sidebarOpen ? 'text-sm' : 'justify-center'}
        ${isActive
                    ? 'bg-primary-500/20 text-primary-500 dark:text-primary-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }
      `}
        >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(sidebarOpen || mobile) && <span>{item.label}</span>}
        </NavLink>
    );

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            {/* Intro Tour */}
            <IntroTour />

            {/* Desktop Sidebar */}
            <aside className={`
        hidden lg:flex flex-col fixed top-0 left-0 h-full z-40
        bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800
        transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}
      `}>
                {/* Logo */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center w-full'}`}>
                        <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                            {sidebarOpen ? (
                                <BrandLogo variant="full" size="sm" className="w-auto max-h-[50px]" />
                            ) : (
                                <BrandLogo variant="symbol" size="sm" className="shrink-0 w-auto max-h-[40px]" />
                            )}
                        </Link>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map(item => <NavItem key={item.to} item={item} />)}

                    {/* Share House Button */}
                    <NavLink id="intro-house-key" to="/settings#house-info" className={`
            flex items-center gap-3 px-4 py-3 rounded-xl font-medium mt-2
            bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400
            border border-green-200 dark:border-green-500/30
            hover:bg-green-100 dark:hover:bg-green-500/20 transition-all duration-200
            ${!sidebarOpen && 'justify-center'}
          `}>
                        <Share2 className="w-5 h-5" />
                        {sidebarOpen && <span>{t('navigation.share_house')}</span>}
                    </NavLink>

                    <NavLink to="/items/new" className={`
            flex items-center gap-3 px-4 py-3 rounded-xl font-medium mt-2
            bg-gradient-to-r from-primary-500 to-blue-500 text-white shadow-lg shadow-primary-500/25
            hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-200
            ${!sidebarOpen && 'justify-center'}
          `}>
                        <Plus className="w-5 h-5" />
                        {sidebarOpen && <span>{t('navigation.new_item')}</span>}
                    </NavLink>

                    {/* Admin Panel - Sadece Admin'e Görünür */}
                    {isAdmin && (
                        <NavLink to="/admin/mail-gonder" className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-xl font-medium mt-4
                            ${isActive
                                ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/50'
                                : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20'
                            }
                            transition-all duration-200
                            ${!sidebarOpen && 'justify-center'}
                        `}>
                            <Shield className="w-5 h-5" />
                            {sidebarOpen && <span>{t('navigation.admin_panel')}</span>}
                        </NavLink>
                    )}
                </nav>

                {/* Bottom Section */}
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    {/* Language Switcher */}
                    <div className={!sidebarOpen ? 'flex justify-center' : ''}>
                        <LanguageSwitcher className="w-full justify-center" />
                    </div>

                    {/* Theme Toggle */}
                    <button onClick={toggleTheme} className={`
            flex items-center gap-3 px-4 py-3 rounded-xl w-full
            text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800
            transition-all duration-200 ${!sidebarOpen && 'justify-center'}
          `}>
                        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        {sidebarOpen && <span>{isDark ? t('common.theme.light') : t('common.theme.dark')}</span>}
                    </button>

                    {/* Help & Support */}
                    <a
                        href="mailto:support@homeinventory.local"
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${!sidebarOpen && 'justify-center'}`}
                    >
                        <HelpCircle className="w-5 h-5" />
                        {sidebarOpen && <span>{t('common.help_support')}</span>}
                    </a>

                    {/* User & Logout */}
                    {sidebarOpen ? (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-medium">
                                {user?.username?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.username}</p>
                            </div>
                            <button onClick={handleLogout} className="p-1.5 text-slate-500 hover:text-red-500 transition-colors" title={t('navigation.logout')}>
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleLogout} className="flex justify-center w-full px-4 py-3 text-slate-500 hover:text-red-500" title={t('navigation.logout')}>
                            <LogOut className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-primary-500 shadow-sm"
                >
                    {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between h-full px-4">
                    <div className="flex items-center gap-3">
                        <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                            <BrandLogo variant="symbol" size="lg" className="shrink-0 w-auto max-h-[56px]" />
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowQRScanner(true)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" title={t('scanner.qr_title')}>
                            <ScanLine className="w-5 h-5" />
                        </button>
                        <button onClick={toggleTheme} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                            <Menu className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 animate-slide-in-right">
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                            <span className="font-bold text-slate-900 dark:text-white">{t('navigation.menu')}</span>
                            <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-4 pt-4">
                            <LanguageSwitcher className="w-full justify-between bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                        </div>
                        <nav className="p-4 space-y-2">
                            {navItems.map(item => <NavItem key={item.to} item={item} mobile />)}

                            {/* Admin Panel - Mobile */}
                            {isAdmin && (
                                <NavLink
                                    to="/admin/mail-gonder"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={({ isActive }) => `
                                        flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-base mt-2
                                        ${isActive
                                            ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                                            : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                                        }
                                    `}
                                >
                                    <Shield className="w-5 h-5" />
                                    <span>{t('navigation.admin_panel')}</span>
                                </NavLink>
                            )}
                        </nav>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                                    {user?.username?.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">{user?.username}</p>
                                    <p className="text-sm text-slate-500">{user?.email}</p>
                                </div>
                            </div>
                            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl">
                                <LogOut className="w-5 h-5" /> {t('navigation.logout')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Navigation */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 safe-area-pb">
                <div className="flex items-center justify-around h-full">
                    <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-2 ${isActive ? 'text-primary-500' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Home className="w-5 h-5" /><span className="text-xs">{t('navigation.home')}</span>
                    </NavLink>
                    <NavLink to="/items" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-2 ${isActive ? 'text-primary-500' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Package className="w-5 h-5" /><span className="text-xs">{t('navigation.inventory')}</span>
                    </NavLink>
                    <NavLink to="/items/new" className="flex flex-col items-center gap-1 -mt-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
                            <Plus className="w-6 h-6" />
                        </div>
                    </NavLink>
                    <NavLink to="/rooms" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-2 ${isActive ? 'text-primary-500' : 'text-slate-500 dark:text-slate-400'}`}>
                        <FolderOpen className="w-5 h-5" /><span className="text-xs">{t('navigation.rooms')}</span>
                    </NavLink>
                    <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-2 ${isActive ? 'text-primary-500' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Settings className="w-5 h-5" /><span className="text-xs">{t('navigation.settings')}</span>
                    </NavLink>
                </div>
            </nav>

            {/* Main Content */}
            <main className={`
        transition-all duration-300 min-h-screen
        pt-16 pb-20 lg:pt-0 lg:pb-0
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}
      `}>
                <div className="p-4 lg:p-8">
                    <Outlet />
                </div>

                {/* BETA Disclaimer Banner */}
                <div className="mx-4 lg:mx-8 mb-4 p-3 lg:p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700/50">
                    <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">⚠️</span>
                        <div className="text-xs lg:text-sm text-amber-800 dark:text-amber-200">
                            <span className="font-bold text-amber-600 dark:text-amber-400">{t('beta_banner.title')} </span>
                            {t('beta_banner.text')}
                            <span className="hidden sm:inline"> {t('beta_banner.contact')} </span>
                            <a href="mailto:support@homeinventory.local" className="text-amber-600 dark:text-amber-400 hover:underline font-medium">
                                support@homeinventory.local
                            </a>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 lg:px-8 text-center text-xs lg:text-sm text-slate-500 dark:text-slate-400 mb-16 lg:mb-0">
                    <p>
                        {t('footer.rights', { year: new Date().getFullYear() })}
                        <span className="hidden sm:inline mx-2">•</span>
                        <br className="sm:hidden" />
                        {t('footer.contact')} <a href="mailto:support@homeinventory.local" className="text-primary-500 hover:underline">support@homeinventory.local</a>
                    </p>
                </footer>
            </main>

            {/* QR Scanner Modal */}
            <QRScanner isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
        </div>
    );
}
