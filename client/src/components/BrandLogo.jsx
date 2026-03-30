import { BRAND_HOST, BRAND_NAME } from '../constants/branding';
import { useTheme } from '../context/ThemeContext';

const SIZE_MAP = {
    xs: 28,
    sm: 42,
    md: 88,
    lg: 128,
    xl: 168
};

const LOGO_VERSION = '20260329-brandfix-logo';

const USE_ENVANTERIM_LEGACY_LOGO = BRAND_HOST === 'envanterim.net.tr' || BRAND_NAME === 'Envanterim';

const LOGO_PATHS = {
    full: {
        dark: USE_ENVANTERIM_LEGACY_LOGO ? '/brand/logo-full.png' : '/brand/logo-full-dark.png',
        light: USE_ENVANTERIM_LEGACY_LOGO ? '/brand/logo-full.png' : '/brand/logo-full-light.png'
    },
    symbol: {
        dark: USE_ENVANTERIM_LEGACY_LOGO ? '/brand/logo-symbol.png' : '/brand/logo-symbol-dark.png',
        light: USE_ENVANTERIM_LEGACY_LOGO ? '/brand/logo-symbol.png' : '/brand/logo-symbol-light.png'
    }
};

export default function BrandLogo({
    variant = 'symbol',
    size = 'md',
    className = '',
    alt = `${BRAND_NAME} logo`
}) {
    const { isDark } = useTheme();
    const height = SIZE_MAP[size] || SIZE_MAP.md;
    const themeKey = isDark ? 'dark' : 'light';
    const sourcePath = (LOGO_PATHS[variant] || LOGO_PATHS.symbol)[themeKey];
    const src = `${sourcePath}?v=${LOGO_VERSION}`;

    return (
        <img
            src={src}
            alt={alt}
            className={`brand-logo ${variant === 'full' ? 'brand-logo-full' : 'brand-logo-symbol'} ${className}`.trim()}
            style={{ height: `${height}px` }}
            decoding="async"
            loading="eager"
        />
    );
}
