import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useTranslation, Trans } from 'react-i18next';
import {
    Boxes,
    Users,
    Globe,
    ScanLine,
    ShieldCheck,
    Upload,
    Moon,
    Sun,
    ArrowRight,
    CheckCircle2,
    Package,
    Sparkles,
    Layers,
    Menu,
    X
} from 'lucide-react';
import LanguageSwitcher, { LANGUAGE_OPTIONS } from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

const featureIconMap = {
    categorize: Boxes,
    family: Users,
    access: Globe,
    barcode: ScanLine,
    security: ShieldCheck,
    backup: Upload
};

const previewRows = [1, 2, 3];

const LandingPage = () => {
    const { isDark, toggleTheme } = useTheme();
    const { t } = useTranslation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const supportedLanguageCount = LANGUAGE_OPTIONS.length;

    const features = [
        {
            key: 'categorize',
            title: t('landing.features.items.categorize.title'),
            description: t('landing.features.items.categorize.desc')
        },
        {
            key: 'family',
            title: t('landing.features.items.family.title'),
            description: t('landing.features.items.family.desc')
        },
        {
            key: 'access',
            title: t('landing.features.items.access.title'),
            description: t('landing.features.items.access.desc')
        },
        {
            key: 'barcode',
            title: t('landing.features.items.barcode.title'),
            description: t('landing.features.items.barcode.desc')
        },
        {
            key: 'security',
            title: t('landing.features.items.security.title'),
            description: t('landing.features.items.security.desc')
        },
        {
            key: 'backup',
            title: t('landing.features.items.backup.title'),
            description: t('landing.features.items.backup.desc')
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden transition-colors duration-500">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-cyan-400/20 dark:bg-cyan-400/10 blur-3xl" />
                <div className="absolute top-1/3 -right-24 w-[30rem] h-[30rem] rounded-full bg-blue-500/20 dark:bg-blue-500/10 blur-3xl" />
                <div className="absolute bottom-0 left-1/3 w-[28rem] h-[28rem] rounded-full bg-amber-300/20 dark:bg-amber-300/10 blur-3xl" />
                <div className="absolute inset-0 opacity-[0.08] dark:opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,theme(colors.slate.700)_1px,transparent_0)] [background-size:24px_24px]" />
            </div>

            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/60 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="h-[82px] md:h-[96px] flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <Link to="/" className="inline-flex items-center w-full max-w-[calc(100vw-88px)] md:max-w-none">
                                <BrandLogo variant="full" size="lg" className="w-auto max-h-[58px] md:max-h-[86px]" />
                            </Link>
                        </div>

                        <div className="hidden md:flex items-center gap-2 lg:gap-3">
                            <LanguageSwitcher className="bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700" />
                            <button
                                onClick={toggleTheme}
                                className="p-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-105 transition-all"
                                aria-label="Toggle theme"
                            >
                                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            </button>
                            <Link to="/login" className="btn-secondary text-sm px-4 py-2 inline-flex">
                                {t('landing.nav.login')}
                            </Link>
                            <Link to="/register" className="btn-primary text-sm px-4 py-2 inline-flex">
                                {t('landing.hero.cta_register')}
                            </Link>
                        </div>

                        <div className="md:hidden flex items-center gap-2">
                            <button
                                onClick={() => setMobileNavOpen((v) => !v)}
                                className="p-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                aria-label="Open menu"
                            >
                                {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {mobileNavOpen && (
                        <div className="md:hidden pt-1 pb-3 animate-fade-in">
                            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/90 p-3 space-y-3 shadow-xl">
                                <div className="grid grid-cols-1 gap-2">
                                    <LanguageSwitcher className="w-full justify-between bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700" />
                                    <button
                                        onClick={toggleTheme}
                                        className="w-full inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                        aria-label="Toggle theme"
                                    >
                                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Link
                                        to="/login"
                                        onClick={() => setMobileNavOpen(false)}
                                        className="btn-secondary px-4 py-2.5 inline-flex items-center justify-center"
                                    >
                                        {t('landing.nav.login')}
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={() => setMobileNavOpen(false)}
                                        className="btn-primary px-4 py-2.5 inline-flex items-center justify-center"
                                    >
                                        {t('landing.hero.cta_register')}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            <main className="relative pt-24 sm:pt-28 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8">
                <section className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 xl:gap-14 items-center">
                    <div className="space-y-7">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 text-sm font-semibold">
                            <Sparkles className="w-4 h-4" />
                            {t('landing.hero.free_badge')}
                        </div>

                        <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black leading-[1.05]" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>
                            {t('landing.hero.title_1')}
                            <span className="block bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500 bg-clip-text text-transparent mt-2">
                                {t('landing.hero.title_2')}
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                            {t('landing.hero.description')}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                            <Link to="/login" className="btn-primary py-3.5 px-6 inline-flex items-center justify-center gap-2 text-base">
                                <span>{t('landing.hero.cta_start')}</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link to="/register" className="btn-secondary py-3.5 px-6 inline-flex items-center justify-center gap-2 text-base">
                                <span>{t('landing.hero.cta_register')}</span>
                            </Link>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md">
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 backdrop-blur p-4">
                                <p className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">100%</p>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t('landing.hero.stat_free')}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 backdrop-blur p-4">
                                <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">100+</p>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t('landing.hero.stat_access')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl shadow-slate-900/10 dark:shadow-black/30">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                                    <p className="font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>
                                        {t('dashboard.stats.total_items')}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    +12%
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="rounded-xl p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.stats.total_items')}</p>
                                    <p className="text-xl font-extrabold">248</p>
                                </div>
                                <div className="rounded-xl p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.stats.total_quantity')}</p>
                                    <p className="text-xl font-extrabold">491</p>
                                </div>
                                <div className="rounded-xl p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.stats.category_count')}</p>
                                    <p className="text-xl font-extrabold">14</p>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                {previewRows.map((row) => (
                                    <div key={row} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 w-full">
                                            <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                                            <div className="flex-1">
                                                <div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                                                <div className="h-2.5 w-1/3 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mt-2" />
                                            </div>
                                        </div>
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500/70 flex-shrink-0" />
                                    </div>
                                ))}
                        </div>
                        </div>

                        <div className="absolute -z-10 -bottom-6 -right-4 w-36 h-36 rounded-full bg-cyan-500/20 blur-2xl" />
                        <div className="absolute -z-10 -top-6 -left-4 w-36 h-36 rounded-full bg-blue-500/20 blur-2xl" />
                    </div>
                </section>

                <section className="max-w-7xl mx-auto mt-20 sm:mt-24">
                    <div className="text-center mb-10 sm:mb-12">
                        <h2 className="text-3xl sm:text-4xl font-extrabold" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>
                            <Trans i18nKey="landing.features.title" components={{ 1: <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent" /> }} />
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 mt-3 max-w-2xl mx-auto">
                            {t('landing.features.subtitle')}
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {features.map((feature, index) => {
                            const Icon = featureIconMap[feature.key] || Layers;
                            return (
                                <article
                                    key={feature.key}
                                    className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 p-5 sm:p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/15 to-blue-500/15 text-cyan-700 dark:text-cyan-300 flex items-center justify-center border border-cyan-500/20">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold tracking-wider text-slate-400">0{index + 1}</span>
                                    </div>
                                    <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{feature.title}</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{feature.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="max-w-5xl mx-auto mt-16 sm:mt-20">
                    <div className="relative rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500" />
                        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(135deg,#fff_0.5px,transparent_0)] [background-size:16px_16px]" />
                        <div className="relative px-6 sm:px-10 py-10 sm:py-12 text-center text-white">
                            <h3 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>
                                {t('landing.cta_bottom.title')}
                            </h3>
                            <p className="text-white/85 max-w-2xl mx-auto mb-7 leading-relaxed">
                                {t('landing.cta_bottom.description')}
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                <Link to="/login" className="inline-flex items-center gap-2 bg-white text-slate-900 font-semibold py-3 px-6 rounded-xl hover:scale-105 transition-transform">
                                    {t('landing.cta_bottom.button')}
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                                <Link to="/register" className="inline-flex items-center gap-2 bg-white/20 text-white border border-white/40 font-semibold py-3 px-6 rounded-xl hover:bg-white/30 transition-colors">
                                    {t('landing.hero.cta_register')}
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="relative border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 grid md:grid-cols-3 gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <Link to="/" className="inline-flex items-center">
                                <BrandLogo variant="full" size="md" className="w-auto max-h-[60px]" />
                            </Link>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{t('landing.footer.desc')}</p>
                    </div>

                    <div>
                        <p className="text-sm uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">{t('landing.footer.links')}</p>
                        <div className="space-y-2 text-sm">
                            <Link to="/login" className="block hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors">{t('landing.nav.login')}</Link>
                            <Link to="/register" className="block hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors">{t('landing.hero.cta_register')}</Link>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">{t('landing.footer.contact')}</p>
                        <a href="mailto:support@homeinventory.local" className="text-sm hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors">
                            support@homeinventory.local
                        </a>
                    </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    {t('landing.footer.copyright', { year: new Date().getFullYear() })}
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
