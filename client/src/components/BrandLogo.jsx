import { BRAND_KEY, BRAND_NAME } from '../constants/branding';
import { useTheme } from '../context/ThemeContext';

const SIZE_MAP = {
    xs: 28,
    sm: 42,
    md: 88,
    lg: 128,
    xl: 168
};
const LOGO_VERSION = '20260503-hi-svg-logo';

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
    },
    envanterim: {
        full: {
            dark: '/brand/envanterim-logo-full-dark.svg',
            light: '/brand/envanterim-logo-full.svg'
        },
        symbol: {
            dark: '/brand/envanterim-logo-symbol-dark.svg',
            light: '/brand/envanterim-logo-symbol.svg'
        }
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
    const brandLogos = LOGO_PATHS[BRAND_KEY] || LOGO_PATHS.homeinventory;
    const sourcePath = (brandLogos[variant] || brandLogos.symbol)[themeKey];
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
