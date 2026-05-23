import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRAND_KEY, BRAND_NAME } from '../constants/branding';
import { useTheme } from '../context/ThemeContext';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';

declare const __APP_ASSET_VERSION__: string | undefined;
declare const __APP_FAVICON_LIGHT__: string | undefined;
declare const __APP_FAVICON_DARK__: string | undefined;
declare const __APP_THEME_COLOR_LIGHT__: string | undefined;
declare const __APP_THEME_COLOR_DARK__: string | undefined;
declare const __APP_APPLE_TOUCH_ICON_LIGHT__: string | undefined;
declare const __APP_APPLE_TOUCH_ICON_DARK__: string | undefined;

const ASSET_VERSION = (
    typeof __APP_ASSET_VERSION__ === 'string' && __APP_ASSET_VERSION__.trim()
        ? __APP_ASSET_VERSION__.trim()
        : '20260519-pwa-assets'
);

interface FaviconSet {
    light: string;
    dark: string;
}

const FAVICON_PATHS: Record<'homeinventory', FaviconSet> = {
    homeinventory: {
        light: `/brand/logo-symbol-light.svg?v=${ASSET_VERSION}`,
        dark: `/brand/logo-symbol-dark.svg?v=${ASSET_VERSION}`
    }
};

const CUSTOM_FAVICON_PATHS = {
    light: typeof __APP_FAVICON_LIGHT__ === 'string' ? __APP_FAVICON_LIGHT__.trim() : '',
    dark: typeof __APP_FAVICON_DARK__ === 'string' ? __APP_FAVICON_DARK__.trim() : ''
};

const THEME_COLORS = {
    light: typeof __APP_THEME_COLOR_LIGHT__ === 'string' && __APP_THEME_COLOR_LIGHT__.trim()
        ? __APP_THEME_COLOR_LIGHT__.trim()
        : '#f6f2e9',
    dark: typeof __APP_THEME_COLOR_DARK__ === 'string' && __APP_THEME_COLOR_DARK__.trim()
        ? __APP_THEME_COLOR_DARK__.trim()
        : '#1a1f1c'
};

const MANIFEST_PATHS = {
    light: `/manifest-light.webmanifest?v=${ASSET_VERSION}`,
    dark: `/manifest-dark.webmanifest?v=${ASSET_VERSION}`
};

const APPLE_TOUCH_ICON_PATHS = {
    light: typeof __APP_APPLE_TOUCH_ICON_LIGHT__ === 'string' && __APP_APPLE_TOUCH_ICON_LIGHT__.trim()
        ? __APP_APPLE_TOUCH_ICON_LIGHT__.trim()
        : `/pwa/apple-touch-icon-light.png?v=${ASSET_VERSION}`,
    dark: typeof __APP_APPLE_TOUCH_ICON_DARK__ === 'string' && __APP_APPLE_TOUCH_ICON_DARK__.trim()
        ? __APP_APPLE_TOUCH_ICON_DARK__.trim()
        : `/pwa/apple-touch-icon-dark.png?v=${ASSET_VERSION}`
};

interface PageTitleRoute {
    path: string;
    label: (t: any) => string;
}

const PAGE_TITLES: PageTitleRoute[] = [
    { path: '/login', label: (t) => t('meta.page_title_sign_in', { defaultValue: 'Giriş yap' }) },
    { path: '/register', label: (t) => t('meta.page_title_register', { defaultValue: 'Hesap oluştur' }) },
    { path: '/forgot-password', label: (t) => t('auth.forgot_password.title', { defaultValue: 'Forgot password' }) },
    { path: '/reset-password', label: (t) => t('auth.reset_password.title', { defaultValue: 'Reset password' }) },
    { path: '/google-house-select', label: (t) => t('meta.page_title_choose_house', { defaultValue: 'Choose house' }) },
    { path: '/recovery-key-setup', label: (t) => t('meta.page_title_recovery_key', { defaultValue: 'Recovery key' }) },
    { path: '/house-access', label: (t) => t('meta.page_title_house_access', { defaultValue: 'House access' }) },
    { path: '/legal-consent', label: (t) => t('meta.page_title_legal_review', { defaultValue: 'Legal review' }) },
    { path: '/privacy-policy', label: (t) => t('legal.privacy_policy_title', { defaultValue: 'Privacy policy' }) },
    { path: '/terms-of-service', label: (t) => t('legal.terms_of_service_title', { defaultValue: 'Terms of service' }) },
    { path: '/items/new', label: (t) => t('meta.page_title_new_item', { defaultValue: 'Yeni eşya' }) },
    { path: '/items/:id/edit', label: (t) => t('meta.page_title_edit_item', { defaultValue: 'Eşyayı düzenle' }) },
    { path: '/items', label: (t) => t('meta.page_title_items', { defaultValue: 'Envanter' }) },
    { path: '/borrow-requests', label: (t) => t('navigation.borrow_requests', { defaultValue: 'Borrow center' }) },
    { path: '/vault', label: (t) => t('navigation.personal_vault', { defaultValue: 'Personal vault' }) },
    { path: '/categories', label: (t) => t('navigation.categories', { defaultValue: 'Categories' }) },
    { path: '/rooms', label: (t) => t('navigation.rooms', { defaultValue: 'Rooms' }) },
    { path: '/settings', label: (t) => t('navigation.settings', { defaultValue: 'Settings' }) },
    { path: '/admin', label: (t) => t('navigation.admin_panel', { defaultValue: 'Admin panel' }) },
    { path: '/admin/mail-gonder', label: (t) => t('navigation.admin_panel', { defaultValue: 'Admin panel' }) },
    { path: '/landing', label: (t) => t('navigation.home', { defaultValue: 'Home' }) },
    { path: '/', label: (t) => t('navigation.home', { defaultValue: 'Home' }) }
];

function resolvePageLabel(pathname: string, t: any): string {
    const matchedPage = PAGE_TITLES.find(({ path }) => matchPath({ path, end: true }, pathname));
    return matchedPage?.label(t) || '';
}

function updateFaviconLinks(href: string): void {
    if (typeof document === 'undefined') return;

    document.querySelectorAll('link[data-app-favicon]').forEach((link) => {
        if (link.getAttribute('href') !== href) {
            link.setAttribute('href', href);
        }
    });
}

function updateHeadLink(selector: string, href: string): void {
    if (typeof document === 'undefined') return;

    document.querySelectorAll(selector).forEach((link) => {
        if (link.getAttribute('href') !== href) {
            link.setAttribute('href', href);
        }
    });
}

function updateThemeColor(theme: 'light' | 'dark'): void {
    if (typeof document === 'undefined') return;

    const themeColor = theme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    if (themeMeta && themeMeta.getAttribute('content') !== themeColor) {
        themeMeta.setAttribute('content', themeColor);
    }
}

export default function BrowserBranding() {
    const location = useLocation();
    const { t, i18n } = useTranslation();
    const { theme } = useTheme();
    const legalLanguage = resolveVerifiedLegalTranslationLanguage(i18n, [
        'legal.privacy_policy_title',
        'legal.terms_of_service_title'
    ]);
    const legalT = i18n.getFixedT(legalLanguage);

    useEffect(() => {
        const pageLabel = location.pathname === '/privacy-policy'
            ? legalT('legal.privacy_policy_title', { defaultValue: 'Privacy policy' })
            : location.pathname === '/terms-of-service'
                ? legalT('legal.terms_of_service_title', { defaultValue: 'Terms of service' })
                : resolvePageLabel(location.pathname, t);
        document.title = pageLabel ? `${pageLabel} · ${BRAND_NAME}` : BRAND_NAME;
    }, [location.pathname, i18n.resolvedLanguage, legalT, t]);

    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-brand', BRAND_KEY);
    }, []);

    useEffect(() => {
        const faviconPaths = FAVICON_PATHS[BRAND_KEY as 'homeinventory'] || FAVICON_PATHS.homeinventory;
        const faviconHref = theme === 'dark'
            ? (CUSTOM_FAVICON_PATHS.dark || faviconPaths.dark)
            : (CUSTOM_FAVICON_PATHS.light || faviconPaths.light);

        updateFaviconLinks(faviconHref);
        updateHeadLink('link[data-app-manifest]', theme === 'dark' ? MANIFEST_PATHS.dark : MANIFEST_PATHS.light);
        updateHeadLink(
            'link[data-app-apple-touch-icon]',
            theme === 'dark' ? APPLE_TOUCH_ICON_PATHS.dark : APPLE_TOUCH_ICON_PATHS.light
        );
        updateThemeColor(theme);
    }, [theme]);

    return null;
}
