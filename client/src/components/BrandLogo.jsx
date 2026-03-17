import { useTheme } from '../context/ThemeContext';

const SIZE_MAP = {
    xs: 28,
    sm: 42,
    md: 88,
    lg: 128,
    xl: 168
};

const LOGO_VERSION = '20260301d';

const LOGO_PATHS = {
    light: {
        full: '/brand/logo-full-light.png',
        symbol: '/brand/logo-symbol-light.png'
    },
    dark: {
        full: '/brand/logo-full-dark.png',
        symbol: '/brand/logo-symbol-dark.png'
    }
};

export default function BrandLogo({
    variant = 'symbol',
    size = 'md',
    className = '',
    alt = 'HomeInventory logo'
}) {
    const { isDark } = useTheme();
    const height = SIZE_MAP[size] || SIZE_MAP.md;
    const themeKey = isDark ? 'dark' : 'light';
    const sourcePath = LOGO_PATHS[themeKey][variant] || LOGO_PATHS[themeKey].symbol;
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
