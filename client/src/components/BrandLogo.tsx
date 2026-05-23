import { BRAND_KEY, BRAND_NAME } from '../constants/branding';
import { useTheme } from '../context/ThemeContext';

declare const __APP_ASSET_VERSION__: string | undefined;
declare const __APP_BRAND_LOGO_FULL_DARK__: string | undefined;
declare const __APP_BRAND_LOGO_FULL_LIGHT__: string | undefined;
declare const __APP_BRAND_LOGO_SYMBOL_DARK__: string | undefined;
declare const __APP_BRAND_LOGO_SYMBOL_LIGHT__: string | undefined;

type SizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LogoVariant = 'full' | 'symbol';
type ThemeKey = 'dark' | 'light';

const SIZE_MAP: Record<SizeKey, number> = {
    xs: 28,
    sm: 42,
    md: 88,
    lg: 128,
    xl: 168
};

const LOGO_VERSION = (
    typeof __APP_ASSET_VERSION__ === 'string' && __APP_ASSET_VERSION__.trim()
        ? __APP_ASSET_VERSION__.trim()
        : '20260519-pwa-assets'
);

const LOGO_PATHS = {
    homeinventory: {
        full: {
            dark: '/brand/logo-full-dark.svg',
            light: '/brand/logo-full-light.svg'
        },
        symbol: {
            dark: '/brand/logo-symbol-dark.svg',
            light: '/brand/logo-symbol-light.svg'
        }
    }
};

const CUSTOM_LOGO_PATHS = {
    full: {
        dark: typeof __APP_BRAND_LOGO_FULL_DARK__ === 'string' ? __APP_BRAND_LOGO_FULL_DARK__.trim() : '',
        light: typeof __APP_BRAND_LOGO_FULL_LIGHT__ === 'string' ? __APP_BRAND_LOGO_FULL_LIGHT__.trim() : ''
    },
    symbol: {
        dark: typeof __APP_BRAND_LOGO_SYMBOL_DARK__ === 'string' ? __APP_BRAND_LOGO_SYMBOL_DARK__.trim() : '',
        light: typeof __APP_BRAND_LOGO_SYMBOL_LIGHT__ === 'string' ? __APP_BRAND_LOGO_SYMBOL_LIGHT__.trim() : ''
    }
};

function resolveCustomLogoPath(variant: LogoVariant, themeKey: ThemeKey): string {
    const variantPaths = CUSTOM_LOGO_PATHS[variant] || CUSTOM_LOGO_PATHS.symbol;
    return variantPaths?.[themeKey] || '';
}

interface BrandLogoProps {
    variant?: LogoVariant;
    size?: SizeKey;
    className?: string;
    alt?: string;
}

export default function BrandLogo({
    variant = 'symbol',
    size = 'md',
    className = '',
    alt = `${BRAND_NAME} logo`
}: BrandLogoProps) {
    const { isDark } = useTheme();
    const height = SIZE_MAP[size] || SIZE_MAP.md;
    const themeKey: ThemeKey = isDark ? 'dark' : 'light';
    const brandLogos = LOGO_PATHS[BRAND_KEY as 'homeinventory'] || LOGO_PATHS.homeinventory;
    const sourcePath = resolveCustomLogoPath(variant, themeKey) || (brandLogos[variant] || brandLogos.symbol)[themeKey];
    const src = `${sourcePath}?v=${LOGO_VERSION}`;
    const style = { height: `${height}px`, width: 'auto' };

    return (
        <img
            src={src}
            alt={alt}
            className={`brand-logo ${variant === 'full' ? 'brand-logo-full' : 'brand-logo-symbol'} ${className}`.trim()}
            style={style}
            decoding="async"
            loading="eager"
        />
    );
}
