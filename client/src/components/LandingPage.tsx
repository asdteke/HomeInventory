import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight,
    FileText,
    Github,
    KeyRound,
    Lock,
    Menu,
    Moon,
    Package,
    Search,
    ShieldCheck,
    Smartphone,
    Sun,
    Users,
    X
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';
import { useTheme } from '../context/ThemeContext';
import { BRAND_KEY, BRAND_NAME } from '../constants/branding';
import '../auth-landing-v25.css';

const GITHUB_REPOSITORY_URL = 'https://github.com/asdteke/HomeInventory';

function translateCopyTree(value: any, t: any, keyPath: string): any {
    if (keyPath.endsWith('.accent')) {
        return value;
    }

    if (typeof value === 'string') {
        return t(keyPath, { defaultValue: value });
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => translateCopyTree(item, t, `${keyPath}.${index}`));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, translateCopyTree(entry, t, `${keyPath}.${key}`)])
        );
    }

    return value;
}

export default function LandingPage() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const isCustomBrand = BRAND_KEY !== 'homeinventory';
    const brandTranslationNamespace = isCustomBrand ? `landing.${BRAND_KEY}` : 'landing.homeinventory';
    const brandDisplayName = BRAND_NAME || (isCustomBrand ? 'Inventory' : 'HomeInventory');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [mobileNavMounted, setMobileNavMounted] = useState(false);
    const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
    const mobileMenuDialogRef = useRef<HTMLElement>(null);
    const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
    const isTurkish = (i18n.resolvedLanguage || i18n.language || 'tr').toLowerCase().startsWith('tr');
    const brandUpperLabel = isTurkish
        ? brandDisplayName.toLocaleUpperCase('tr-TR')
        : brandDisplayName.toUpperCase();
    const aboutLabel = t('landing.nav.details', { defaultValue: isTurkish ? 'Detaylar' : 'Details' });
    const featuresLabel = t('landing.nav.features');
    const securityLabel = t('landing.nav.security');
    const heroSecondaryCtaLabel = t('landing.hero.cta_explore', {
        defaultValue: isTurkish ? 'Özellikleri İncele' : 'Explore Features'
    });
    const shellTextClass = isDark ? 'text-white' : 'text-[var(--hi-text)]';
    const mutedTextClass = isDark
        ? (isCustomBrand ? 'text-[var(--hi-text-soft)]' : 'text-white/62')
        : 'text-[var(--hi-text-soft)]';
    const headerTextClass = isDark ? 'text-white' : 'text-[var(--hi-text)]';
    const chromeButtonClass = isDark
        ? (isCustomBrand ? '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!border-[var(--hi-border-strong)] hover:!bg-[var(--hi-panel-muted)]' : '!border-white/10 !bg-white/4 !text-white/88 hover:!bg-white/8')
        : '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)]';
    const ghostThemeClass = isDark
        ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] hover:text-white' : 'border border-white/10 bg-white/4 text-white/84 hover:bg-white/8 hover:text-white')
        : 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const heroAtmosphereBackground = isDark
        ? (isCustomBrand
            ? 'radial-gradient(circle_at_top_left,rgba(100,168,255,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(88,213,240,0.12),transparent_34%)'
            : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(74,125,100,0.14),transparent_34%)')
        : (isCustomBrand
            ? 'radial-gradient(circle_at_top_left,rgba(100,168,255,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(22,166,220,0.10),transparent_30%)'
            : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(45,82,65,0.10),transparent_30%)');
    const pageContinuumBackground = isDark
        ? (isCustomBrand
            ? 'linear-gradient(180deg,#08111e 0%,#0d1726 9%,#10213a 18%,#151d2b 28%,#1a2230 44%,#16202d 54%,#111925 64%,#0d1726 76%,#0a1422 88%,#091321 100%)'
            : 'linear-gradient(180deg,#181d1a 0%,#1b211d 9%,#171b18 18%,#1b201d 28%,#202622 44%,#1c2720 54%,#19231d 64%,#1f2522 76%,#1b211d 88%,#171c19 100%)')
        : (isCustomBrand
            ? 'linear-gradient(180deg,#f3f7ff 0%,#edf4ff 9%,#e8f1ff 18%,#eef4fc 28%,#e8f0fa 44%,#edf4fd 54%,#e7f0fb 64%,#f3f7ff 76%,#f8fbff 88%,#edf4ff 100%)'
            : 'linear-gradient(180deg,#f7f1e8 0%,#f2ebdf 9%,#ece3d4 18%,#f1eadf 28%,#ebe2d3 44%,#ece0ce 54%,#e8dccb 64%,#f0e9dd 76%,#f8f5ef 88%,#f7f2e8 100%)');
    const securityPanelClass = isDark
        ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[linear-gradient(180deg,rgba(28,38,53,0.96),rgba(20,28,40,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]' : 'border border-[#4d6755] bg-[#314338] shadow-[0_30px_70px_rgba(0,0,0,0.18)]')
        : (isCustomBrand ? 'border border-[rgba(176,193,216,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,253,0.94))] shadow-[0_26px_52px_rgba(19,35,61,0.10)]' : 'border border-[#d4c4aa] bg-[#fbf7f0] shadow-[0_26px_52px_rgba(38,48,38,0.12)]');
    const securityMutedClass = isDark ? (isCustomBrand ? 'text-[var(--hi-text-soft)]' : 'text-white/62') : (isCustomBrand ? 'text-[var(--hi-text-soft)]' : 'text-[#627060]');
    const securityStrongClass = isDark ? 'text-white' : 'text-[var(--hi-text)]';
    const securityIconSurfaceClass = isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.12)]' : 'bg-[rgba(205,176,136,0.16)]') : (isCustomBrand ? 'bg-[rgba(100,168,255,0.14)]' : 'bg-[rgba(184,153,104,0.14)]');
    const securityPanelEyebrow = t(`${brandTranslationNamespace}.security_panel.eyebrow`, { defaultValue: isTurkish ? 'Özel bilgiler için' : 'Scoped access' });
    const securityPanelTitle = t(`${brandTranslationNamespace}.security_panel.title`, { defaultValue: isTurkish ? 'Hassas kayıtlar ortak envanterden ayrı kalır' : 'Private records never appear in the shared list' });
    const securityPanelDescription = t(`${brandTranslationNamespace}.security_panel.description`, {
        defaultValue: isTurkish
            ? 'Pasaport, tapu, şifre ve benzeri bilgileri ortak envanterden ayrı tutun. Bu alan yalnızca size ait kayıtlar için tasarlanmıştır.'
            : 'Passports, deeds, and access codes stay separate from the shared inventory. Vault data is stored encrypted.'
    });
    const securityChipClass = isDark
        ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[rgba(24,32,45,0.76)] shadow-[0_18px_34px_rgba(0,0,0,0.18)]' : 'border border-white/8 bg-[rgba(22,29,25,0.68)] shadow-[0_18px_34px_rgba(0,0,0,0.18)]')
        : (isCustomBrand ? 'border border-[rgba(176,193,216,0.24)] bg-[rgba(255,255,255,0.9)] shadow-[0_18px_34px_rgba(19,35,61,0.08)]' : 'border border-[rgba(45,82,65,0.12)] bg-[rgba(255,255,255,0.88)] shadow-[0_18px_34px_rgba(38,48,38,0.08)]');
    const securityRingClass = isDark ? (isCustomBrand ? 'border-[rgba(139,171,216,0.28)]' : 'border-white/8') : (isCustomBrand ? 'border-[rgba(176,193,216,0.24)]' : 'border-[rgba(45,82,65,0.12)]');
    const securityCoreClass = isDark
        ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[linear-gradient(180deg,rgba(39,52,72,0.92),rgba(26,35,50,0.96))] shadow-[0_28px_44px_rgba(0,0,0,0.22)]' : 'border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_28px_44px_rgba(0,0,0,0.22)]')
        : (isCustomBrand ? 'border border-[rgba(176,193,216,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,246,253,0.9))] shadow-[0_24px_36px_rgba(19,35,61,0.10)]' : 'border border-[rgba(45,82,65,0.1)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,241,232,0.88))] shadow-[0_24px_36px_rgba(38,48,38,0.10)]');
    const vaultCoreLabel = t(`${brandTranslationNamespace}.security_panel.vault_scope`, { defaultValue: isTurkish ? 'Özel alan' : 'Vault scope' });
    const vaultPassportsLabel = t(`${brandTranslationNamespace}.security_panel.identity_docs`, { defaultValue: isTurkish ? 'Kimlik belgeleri' : 'Identity docs' });
    const vaultPassportsMeta = t(`${brandTranslationNamespace}.security_panel.identity_docs_meta`, { defaultValue: isTurkish ? 'Pasaport, kimlik kartı' : 'Passports, IDs' });
    const vaultDeedsLabel = t(`${brandTranslationNamespace}.security_panel.property_records`, { defaultValue: isTurkish ? 'Tapu ve mülkiyet' : 'Property records' });
    const vaultDeedsMeta = t(`${brandTranslationNamespace}.security_panel.property_records_meta`, { defaultValue: isTurkish ? 'Tapu, kira sözleşmesi' : 'Deeds, leases' });
    const vaultCodesLabel = t(`${brandTranslationNamespace}.security_panel.access_codes`, { defaultValue: isTurkish ? 'Şifreler ve PIN’ler' : 'Access codes' });
    const vaultCodesMeta = t(`${brandTranslationNamespace}.security_panel.access_codes_meta`, { defaultValue: isTurkish ? 'Şifre, PIN, anahtar' : 'Passwords, PINs' });

    const openMobileNav = () => {
        setMobileNavMounted(true);
        setMobileNavOpen(true);
    };

    const closeMobileNav = () => {
        setMobileNavOpen(false);
    };

    useEffect(() => {
        if (!mobileNavMounted) {
            return undefined;
        }

        const { overflow } = document.body.style;
        const desktopMedia = window.matchMedia('(min-width: 768px)');

        const closeForDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
            if (!event.matches) return;
            setMobileNavOpen(false);
            setMobileNavMounted(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMobileNav();
                return;
            }

            if (event.key !== 'Tab' || !mobileNavOpen) return;
            const dialog = mobileMenuDialogRef.current;
            if (!dialog) return;
            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter((element) => !element.hasAttribute('hidden'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        desktopMedia.addEventListener('change', closeForDesktop);
        closeForDesktop(desktopMedia);

        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', handleKeyDown);
            desktopMedia.removeEventListener('change', closeForDesktop);
        };
    }, [mobileNavMounted, mobileNavOpen]);

    useEffect(() => {
        if (!mobileNavMounted) return undefined;

        if (mobileNavOpen) {
            const frame = window.requestAnimationFrame(() => mobileMenuCloseRef.current?.focus());
            return () => window.cancelAnimationFrame(frame);
        }

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const timer = window.setTimeout(() => {
            setMobileNavMounted(false);
            if (!window.matchMedia('(min-width: 768px)').matches) {
                mobileMenuButtonRef.current?.focus();
            }
        }, reduceMotion ? 0 : 150);

        return () => window.clearTimeout(timer);
    }, [mobileNavMounted, mobileNavOpen]);

    const copy = translateCopyTree(isTurkish
        ? {
            hero: {
                statement: 'Evinizdeki her şeyi bilin. Aradığınızı hemen bulun.',
                statementAccent: 'Eşyalarınız, belgeleriniz ve garanti bilgileriniz tek yerde.',
                description: 'Neyin nerede olduğunu, garanti süresini ve kimde kaldığını kolayca takip edin. Evde aradığınız bilgiye hızlıca ulaşın.',
                primaryCta: 'Ücretsiz Başlayın',
                secondaryCta: 'Ürünü İnceleyin',
                trustSignal: 'Şu an tüm özellikler ücretsiz • Ev halkıyla birlikte kullanılabilir • Özel bilgiler ayrı saklanır',
                searchPlaceholder: 'Eşya, oda veya barkodla arayın',
            },
            heroInventoryRows: [
                { name: 'Airfryer', meta: 'Mutfak tezgahı • Garanti 08/2028', state: null, icon: Package, accent: isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#5d8b6a]' },
                { name: 'Matkap seti', meta: 'Depo dolabı • 14 parça', state: 'Ödünç verildi', icon: Package, accent: 'text-[#b3874f]' },
                { name: 'Mesh uydu ünitesi', meta: 'TV ünitesi • Ağ noktası', state: null, icon: Smartphone, accent: 'text-[#5a7388]' },
                { name: 'Yedek kapı anahtarı', meta: 'Antre çekmecesi', state: null, icon: KeyRound, accent: 'text-[#a57e45]' },
                { name: 'Kombi garanti PDF’i', meta: 'Belgeler • PDF eklendi', state: null, icon: FileText, accent: isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#6c7b69]' },
                { name: 'HEPA filtre', meta: 'Çocuk odası • Değişim 11/2026', state: null, icon: Package, accent: isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#6f9978]' }
            ],
            features: {
                eyebrow: `NEDEN ${brandUpperLabel}`,
                heading: 'Evinizdeki eşyaları ve önemli bilgileri kolayca takip edin.',
                description: 'Eşya, belge, garanti ve ödünç bilgileri düzenli kalır; aradığınız şeye ulaşmak için zaman kaybetmezsiniz.'
            },
            productLanes: [
                {
                    eyebrow: 'Ev envanteri',
                    title: 'Sahip olduklarınızı tek yerde görün.',
                    description: 'Eşyalarınızı odalara göre düzenleyin, garanti ve not ekleyin, ihtiyacınız olanı saniyeler içinde bulun.',
                    signal: 'Günlük kullanım',
                    metric: 'Hızlı arama',
                    note: 'Odalar • Kategoriler • Garanti notları'
                },
                {
                    eyebrow: 'Ödünç takibi',
                    title: 'Ödünç verilen eşyalar gözden kaçmasın.',
                    description: 'Bir eşya kimde, ne zaman verildi ve geri alındı mı; hepsini net şekilde takip edin.',
                    signal: 'Ortak kullanım',
                    metric: 'Net geçmiş',
                    note: 'Ev halkı • Ödünç geçmişi • Net takip'
                },
                {
                    eyebrow: 'Kişisel Kasa',
                    title: 'Hassas bilgileri ortak envantere karıştırmayın.',
                    description: 'Pasaport, tapu, şifre ve benzeri özel kayıtları yalnızca sizin görebileceğiniz ayrı alanda saklayın.',
                    signal: 'Özel kayıtlar',
                    metric: 'Size özel',
                    note: 'Belgeler • Şifreler • Özel notlar'
                }
            ],
            security: {
                eyebrow: 'GÜVENLE KULLAN',
                heading: 'Ortak ev kayıtları ile özel bilgiler birbirine karışmaz.',
                description: 'Ev halkıyla paylaştığınız envanter ayrı, yalnızca size ait hassas bilgiler ayrı tutulur.',
                bullets: [
                    'Hassas bilgiler ortak ev envanterinde görünmez.',
                    'İki adımlı doğrulama ve yedek kodlarla hesabınızı koruyun.'
                ]
            },
            about: {
                eyebrow: 'KONTROL SENDE',
                heading: `${brandDisplayName}, ev düzenini karmaşıklaştırmadan kontrol sağlar.`,
                description: 'Öncelik, evde neye sahip olduğunuzu bilmek ve aradığınız bilgiye hızlıca ulaşmak. Teknik ayrıntılar isteyenler için durur; günlük kullanımın önüne geçmez.',
                pills: [
                    'Tamamen ücretsiz',
                    'Ev halkıyla ortak kullanım',
                    'Hızlı arama',
                    'Kişisel Kasa'
                ],
                strips: [
                    {
                        number: '01',
                        title: 'Tamamen ücretsiz',
                        description: `Şu an tüm özellikler ücretsiz; ödeme yapmadan tüm ${brandDisplayName} özelliklerini kullanabilirsiniz.`
                    },
                    {
                        number: '02',
                        title: 'Ev halkıyla ortak kullanım',
                        description: 'Ev halkınız aynı ev envanterini birlikte görebilir, birlikte güncelleyebilir.'
                    },
                    {
                        number: '03',
                        title: 'Belgeler ve garantiler',
                        description: 'Fiş, garanti ve servis notlarını ilgili eşyayla birlikte saklayın.'
                    },
                    {
                        number: '04',
                        title: 'Özel kayıtlar ayrı tutulur',
                        description: 'Pasaport, tapu, şifre ve benzeri özel bilgiler ortak envanterden ayrı kalır.'
                    }
                ],
                advanced: {
                    eyebrow: 'Teknik detaylar',
                    title: 'Merak edenler için teknik detaylar her zaman erişilebilir.',
                    description: `${brandDisplayName}, açık kaynak kodunu ve kendi sunucunuzda çalıştırma esnekliğini korur. MIT lisansı gibi ayrıntılar merak edenler için görünür; ama ürün deneyiminin önüne geçmez.`,
                    link: 'Teknik detayları GitHub’da inceleyin'
                }
            },
            cta: {
                eyebrow: 'BUGÜN BAŞLAYIN',
                heading: 'İlk odanızı oluşturun. İlk eşyanızı ekleyin.',
                description: 'Başlamak ücretsiz. Birkaç dakikada eviniz için daha düzenli bir sistem kurabilirsiniz.'
            }
        }
        : {
            hero: {
                statement: 'HomeInventory keeps your home inventory organized.',
                statementAccent: 'Shared inventory for the household. Personal Vault just for you.',
                description: 'Keep items, warranties, important documents, and borrow tracking in one calm place. See what your home contains at a glance.',
                primaryCta: 'Start Free',
                secondaryCta: 'See the Product',
                trustSignal: 'Completely free • Made for shared household use • Sensitive records stay separate in Personal Vault',
                searchPlaceholder: 'Search an item, room, or barcode',
            },
            heroInventoryRows: [
                { name: 'Air fryer', meta: 'Kitchen counter • Warranty 08/2028', state: null, icon: Package, accent: isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#5d8b6a]' },
                { name: 'Drill set', meta: 'Storage cabinet • 14 pieces', state: 'Borrowed', icon: Package, accent: 'text-[#b3874f]' },
                { name: 'Mesh unit', meta: 'TV console • Network node', state: null, icon: Smartphone, accent: 'text-[#5a7388]' },
                { name: 'Spare door key', meta: 'Entry drawer', state: null, icon: KeyRound, accent: 'text-[#a57e45]' },
                { name: 'Boiler warranty PDF', meta: 'Documents • PDF attached', state: null, icon: FileText, accent: isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#6c7b69]' },
                { name: 'HEPA filter', meta: 'Kids room • Replace 11/2026', state: null, icon: Package, accent: isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#6f9978]' }
            ],
            features: {
                eyebrow: `WHY ${brandUpperLabel}`,
                heading: 'Knowing what you own makes home life easier to manage.',
                description: 'The shared list keeps everyday inventory clear, while Personal Vault keeps sensitive records out of sight.'
            },
            productLanes: [
                {
                    eyebrow: 'Shared inventory',
                    title: 'See what your home contains in one clear place.',
                    description: 'Organize items by room, attach warranties and notes, and find what you need in seconds.',
                    signal: 'Everyday use',
                    metric: 'Quick search',
                    note: 'Rooms • categories • warranty notes'
                },
                {
                    eyebrow: 'Borrow tracking',
                    title: 'Always know who has what around the house.',
                    description: 'Borrowed items stay on the record, so nothing gets lost in the shuffle.',
                    signal: 'Shared use',
                    metric: 'Clear history',
                    note: 'Household members • borrow history • cleaner follow-up'
                },
                {
                    eyebrow: 'Personal Vault',
                    title: 'Passports, deeds, and codes stay out of shared search.',
                    description: 'Sensitive records remain visible only to you and stay separate from the everyday list.',
                    signal: 'Private records',
                    metric: 'Only you can see them',
                    note: 'Documents • access codes • personal notes'
                }
            ],
            security: {
                eyebrow: 'USE WITH CONFIDENCE',
                heading: 'Shared search never reaches private records.',
                description: 'Personal Vault stays separate from the shared inventory and is protected with layered account security.',
                bullets: [
                    'Sensitive fields are handled separately and stored securely.',
                    'Protect access with 2FA, backup codes, and trusted devices.'
                ]
            },
            about: {
                eyebrow: 'YOU STAY IN CONTROL',
                heading: `${brandDisplayName} is designed to feel calm, useful, and trustworthy in daily life.`,
                description: 'The priority is helping you know what you own and reach the right information quickly. Technical transparency stays available, but it does not need to lead the story.',
                pills: [
                    'Completely free',
                    'Shared household use',
                    'Fast search',
                    'Personal Vault'
                ],
                strips: [
                    {
                        number: '01',
                        title: 'Completely free',
                        description: `Everything is currently free; you can use all ${brandDisplayName} features without paying.`
                    },
                    {
                        number: '02',
                        title: 'Shared household flow',
                        description: 'Family members can view and maintain the same household inventory together.'
                    },
                    {
                        number: '03',
                        title: 'Documents and warranties',
                        description: 'Keep receipts, warranty details, and service notes close to each item.'
                    },
                    {
                        number: '04',
                        title: 'Private records stay separate',
                        description: 'Sensitive information stays out of the shared list and remains visible only to you.'
                    }
                ],
                advanced: {
                    eyebrow: 'Technical details',
                    title: 'Transparent by design, quietly in the background.',
                    description: `For anyone who cares about the underlying setup, ${brandDisplayName} still keeps its open-source core, MIT license, and self-hosting flexibility available as supporting details.`,
                    link: 'View the technical details on GitHub'
                }
            },
            cta: {
                eyebrow: 'START TODAY',
                heading: 'Create your first room. Add your first item.',
                description: 'Starting is free, and it only takes a few calm minutes to build a clearer home system.'
            }
        }, t, brandTranslationNamespace);

    return (
        <div className="landing-v25 landing-page-shell min-h-screen overflow-hidden bg-[var(--hi-bg)] text-[var(--hi-text)] selection:bg-[var(--hi-secondary-soft)]">
            <header className={`landing-topbar-v25 fixed inset-x-0 top-0 z-50 ${headerTextClass}`}>
                <div className="landing-topbar-inner-v25 mx-auto flex h-24 max-w-7xl items-center justify-between px-6 lg:px-8">
                    <Link
                        to="/"
                        aria-label={brandDisplayName}
                        title={brandDisplayName}
                        className="landing-brand-v25 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]"
                    >
                        <BrandLogo variant="full" size="md" className="h-auto w-auto" />
                    </Link>

                    <nav className="hidden items-center gap-8 md:flex">
                        <a href="#features" className={`text-sm font-medium transition ${isDark ? 'text-white/65 hover:text-white' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {featuresLabel}
                        </a>
                        <a href="#security" className={`text-sm font-medium transition ${isDark ? 'text-white/65 hover:text-white' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {securityLabel}
                        </a>
                        <a href="#about" className={`text-sm font-medium transition ${isDark ? 'text-white/65 hover:text-white' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {aboutLabel}
                        </a>
                    </nav>

                    <div className="hidden items-center gap-3 md:flex">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${ghostThemeClass}`}
                            title={isDark ? t('common.theme.light') : t('common.theme.dark')}
                            aria-label={isDark ? t('common.theme.light') : t('common.theme.dark')}
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </button>
                        <div className="min-w-[148px]">
                            <LanguageSwitcher
                                showCodeBadge={false}
                                showTooltip={false}
                                className={`!h-11 !rounded-full !px-4 !py-0 ${chromeButtonClass}`}
                            />
                        </div>
                        <Link to="/login" className={`text-sm font-medium transition ${isDark ? (isCustomBrand ? 'text-[var(--hi-text-soft)] hover:text-white' : 'text-white/80 hover:text-white') : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {t('landing.nav.login')}
                        </Link>
                        <Link
                            to="/register"
                            className={`inline-flex h-12 items-center rounded-full px-6 text-sm font-semibold text-white transition ${isCustomBrand ? 'btn-primary !h-12 !rounded-full !px-6' : 'bg-[#6f9978] hover:bg-[#7aa484]'}`}
                        >
                            {copy.hero.primaryCta}
                        </Link>
                    </div>

                    <button
                        ref={mobileMenuButtonRef}
                        type="button"
                        onClick={openMobileNav}
                        className={`landing-menu-button-v25 rounded-xl p-2 ${ghostThemeClass}`}
                        aria-controls="landing-mobile-menu"
                        aria-expanded={mobileNavOpen}
                        aria-label={t('navigation.menu')}
                    >
                        <Menu className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </header>

            {mobileNavMounted && (
                <div
                    id="landing-mobile-menu"
                    className="landing-mobile-menu-layer-v25 fixed inset-0 z-[60]"
                    data-state={mobileNavOpen ? 'open' : 'closed'}
                    aria-hidden={!mobileNavOpen}
                >
                    <div
                        className="landing-mobile-backdrop-v25 absolute inset-0"
                        aria-hidden="true"
                        onClick={closeMobileNav}
                    />

                    <aside
                        ref={mobileMenuDialogRef}
                        className="landing-mobile-menu-v25 landing-mobile-sheet-v25 absolute inset-x-3"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="landing-mobile-menu-title"
                    >
                        <div className="landing-mobile-sheet-head-v25">
                            <p id="landing-mobile-menu-title" className="landing-mobile-sheet-title-v25">{t('navigation.menu')}</p>
                            <button
                                ref={mobileMenuCloseRef}
                                type="button"
                                onClick={closeMobileNav}
                                className="landing-mobile-close-v25"
                                aria-label={t('common.close')}
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="landing-mobile-tools-v25">
                            <button type="button" onClick={toggleTheme} className="landing-mobile-tool-v25">
                                {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                                <span>{isDark ? t('common.theme.light') : t('common.theme.dark')}</span>
                            </button>
                            <LanguageSwitcher
                                showCodeBadge={false}
                                showTooltip={false}
                                className="landing-mobile-language-v25 !h-12 !rounded-full !px-4 !py-0"
                            />
                        </div>

                        <nav className="landing-mobile-nav-v25">
                            <a href="#about" onClick={closeMobileNav} className="landing-mobile-nav-link-v25">
                                <span className="landing-mobile-nav-icon-v25"><FileText className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" /></span>
                                <span>{aboutLabel}</span>
                                <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
                            </a>
                            <Link to="/login" onClick={closeMobileNav} className="landing-mobile-nav-link-v25">
                                <span className="landing-mobile-nav-icon-v25"><Lock className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" /></span>
                                <span>{t('landing.nav.login')}</span>
                                <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
                            </Link>
                        </nav>

                        <div className="landing-mobile-action-v25">
                            <Link to="/register" onClick={closeMobileNav} className="landing-mobile-primary-v25">
                                <span>{copy.hero.primaryCta}</span>
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </div>
                    </aside>
                </div>
            )}

            <main className="pt-24" style={{ background: pageContinuumBackground }}>
                <section className="landing-hero-v25 relative isolate overflow-hidden pb-28 pt-28 lg:min-h-[calc(100svh-6rem)] lg:pb-36 lg:pt-32">
                    <div className="pointer-events-none absolute inset-0 z-0" style={{ background: heroAtmosphereBackground }} />
                    <div className={`landing-hero-grid-layer-v25 pointer-events-none absolute inset-0 z-0 ${isDark ? 'opacity-[0.16]' : 'opacity-[0.28]'}`}>
                        <div className="landing-grid absolute inset-0" />
                    </div>
                    <div className={`pointer-events-none absolute -left-24 top-24 z-0 h-64 w-64 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(139,180,255,0.14)]' : 'bg-[rgba(205,176,136,0.14)]') : (isCustomBrand ? 'bg-[rgba(139,180,255,0.20)]' : 'bg-[rgba(205,176,136,0.22)]')}`} />
                    <div className={`pointer-events-none absolute right-0 top-0 z-0 h-[28rem] w-[28rem] rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.14)]' : 'bg-[rgba(74,125,100,0.14)]') : (isCustomBrand ? 'bg-[rgba(22,166,220,0.10)]' : 'bg-[rgba(45,82,65,0.12)]')}`} />

                    <div className="relative z-10 mx-auto grid max-w-7xl items-start gap-12 px-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1fr)] lg:gap-16 lg:px-8">
                        <div className={`max-w-[30rem] ${shellTextClass}`}>
                            <h1 className={shellTextClass}>
                                <span className="landing-display block max-w-[25rem] text-[clamp(2.35rem,4.5vw,3.95rem)] font-semibold leading-[1.02] tracking-[-0.06em]">
                                    {copy.hero.statement}
                                </span>
                                <span className={`landing-serif mt-4 block max-w-[24rem] text-[clamp(1.55rem,2.9vw,2.35rem)] leading-[1.06] ${isDark ? (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#d8c29d]') : (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#9b6f35]')}`}>
                                    {copy.hero.statementAccent}
                                </span>
                            </h1>

                            <p className={`mt-9 max-w-[27rem] text-[0.98rem] font-normal leading-7 ${isDark ? 'text-white/60' : (isCustomBrand ? 'text-[var(--hi-text-soft)]' : 'text-[#536250]')}`}>
                                {copy.hero.description}
                            </p>

                            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                                <Link
                                    to="/register"
                                    className={`btn-primary !h-14 !rounded-full !px-8 text-base ${isCustomBrand ? '!shadow-[0_18px_40px_rgba(8,44,110,0.28)] hover:!shadow-[0_24px_48px_rgba(8,44,110,0.34)]' : '!shadow-[0_18px_40px_rgba(111,153,120,0.28)] hover:!shadow-[0_24px_48px_rgba(111,153,120,0.34)]'} transition-transform duration-200 hover:-translate-y-0.5`}
                                >
                                    {copy.hero.primaryCta}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                                <a
                                    href="#features"
                                    className={`inline-flex h-14 items-center justify-center rounded-full border px-8 text-base font-semibold transition ${isDark ? (isCustomBrand ? 'border-[var(--hi-border-strong)] bg-[rgba(26,36,51,0.9)] text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)] hover:border-[var(--hi-secondary)] hover:bg-[rgba(33,45,63,0.98)]' : 'border-white/12 bg-white/[0.05] text-white/82 hover:border-white/20 hover:text-white') : (isCustomBrand ? 'border-[rgba(176,193,216,0.62)] bg-[rgba(255,255,255,0.98)] text-[var(--hi-text)] shadow-[0_14px_28px_rgba(19,35,61,0.12)] hover:border-[rgba(139,180,255,0.68)] hover:bg-[rgba(246,250,255,1)] hover:text-[var(--hi-text)]' : 'border-[rgba(18,32,22,0.12)] text-[#556453] hover:bg-white/60 hover:text-[var(--hi-text)]')}`}
                                    aria-label={heroSecondaryCtaLabel}
                                >
                                    {heroSecondaryCtaLabel}
                                    <ArrowRight className="ml-2 h-4 w-4 opacity-80" />
                                </a>
                            </div>

                            <p className={`mt-9 max-w-[26rem] text-[13px] font-normal ${isDark ? 'text-white/42' : 'text-[var(--hi-text-muted)]'}`}>
                                {copy.hero.trustSignal}
                            </p>
                        </div>

                        <div className="relative flex items-start justify-center pt-1 lg:min-h-[440px] lg:pl-4">
                            <div
                                className={`pointer-events-none absolute inset-[-0.8rem] rounded-[2.6rem] transform-gpu ${isDark ? (isCustomBrand ? 'bg-[linear-gradient(135deg,rgba(29,39,55,0.98),rgba(20,28,40,0.94))] shadow-[0_24px_48px_rgba(0,0,0,0.16)]' : 'bg-[linear-gradient(135deg,rgba(34,43,37,0.92),rgba(27,33,29,0.88))] shadow-[0_24px_48px_rgba(0,0,0,0.16)]') : (isCustomBrand ? 'bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(236,244,253,0.96))] shadow-[0_20px_40px_rgba(19,35,61,0.08)]' : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(238,232,220,0.92))] shadow-[0_20px_40px_rgba(28,41,32,0.08)]')}`}
                                style={{
                                    transform: 'rotate(0.35deg)',
                                    boxShadow: isDark
                                        ? (isCustomBrand ? 'inset 0 0 0 1px rgba(139,171,216,0.44), 0 24px 48px rgba(0,0,0,0.16)' : 'inset 0 0 0 1.15px rgba(255,255,255,0.4), 0 24px 48px rgba(0,0,0,0.16)')
                                        : (isCustomBrand ? 'inset 0 0 0 1.6px rgba(255,255,255,0.98), 0 0 0 1px rgba(176,193,216,0.42), 0 20px 40px rgba(19,35,61,0.08)' : 'inset 0 0 0 1.6px rgba(255,255,255,0.98), 0 0 0 1px rgba(192,178,155,0.4), 0 20px 40px rgba(28,41,32,0.08)')
                                }}
                            />

                            <div
                                className={`landing-surface relative z-10 mx-auto w-full max-w-[30rem] overflow-hidden rounded-[1.75rem] p-5 lg:p-6 ${isDark ? (isCustomBrand ? 'bg-[linear-gradient(180deg,rgba(19,26,38,0.98),rgba(14,20,30,0.98))]' : 'bg-[#161d19]') : (isCustomBrand ? 'bg-[rgba(250,253,255,0.82)]' : 'bg-[rgba(255,251,245,0.72)]')}`}
                                style={{
                                    boxShadow: isDark
                                        ? (isCustomBrand ? 'inset 0 0 0 1px rgba(139,171,216,0.32), 0 28px 64px rgba(0,0,0,0.18)' : 'inset 0 0 0 1.15px rgba(255,255,255,0.28), 0 28px 64px rgba(0,0,0,0.18)')
                                        : (isCustomBrand ? 'inset 0 0 0 2px rgba(255,255,255,0.98), 0 0 0 1px rgba(176,193,216,0.34), 0 28px 64px rgba(19,35,61,0.12)' : 'inset 0 0 0 2px rgba(255,255,255,0.98), 0 0 0 1px rgba(186,172,148,0.36), 0 28px 64px rgba(32,44,34,0.12)')
                                }}
                            >
                                <div className="landing-panel-glow absolute inset-0 opacity-40" />

                                <div className="relative">
                                    <div className={`flex items-center gap-3 rounded-full px-4 py-3 ${isDark ? (isCustomBrand ? 'border border-[rgba(105,131,171,0.42)] bg-[rgba(16,23,35,0.96)] text-[var(--hi-text-muted)]' : 'border border-white/8 bg-[rgba(14,20,17,0.75)] text-white/54') : (isCustomBrand ? 'border border-[rgba(176,193,216,0.34)] bg-[rgba(244,248,255,0.96)] text-[var(--hi-text-muted)]' : 'border border-[rgba(18,32,22,0.08)] bg-[rgba(248,243,234,0.92)] text-[var(--hi-text-muted)]')}`}>
                                        <Search className="h-4 w-4" />
                                        <span className="text-sm">{copy.hero.searchPlaceholder}</span>
                                    </div>

                                    <div className="mt-4">
                                        {copy.heroInventoryRows.map((row: any, index: number) => {
                                            const Icon = row.icon;
                                            return (
                                                <div
                                                    key={row.name}
                                                    className={`flex items-start gap-4 py-4 ${index === 2 ? 'pl-1' : ''} ${index !== copy.heroInventoryRows.length - 1 ? (isDark ? 'border-b border-white/8' : 'border-b border-[rgba(18,32,22,0.08)]') : ''}`}
                                                >
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? (isCustomBrand ? 'bg-[rgba(40,61,83,0.72)]' : 'bg-white/6') : (isCustomBrand ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(18,32,22,0.06)]')}`}>
                                                        <Icon className={`h-4 w-4 ${row.accent}`} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-sm font-medium leading-5 ${shellTextClass}`}>{row.name}</p>
                                                        <p className={`mt-1 text-xs font-normal leading-5 ${mutedTextClass}`}>{row.meta}</p>
                                                    </div>
                                                    {row.state && (
                                                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${row.state === (isTurkish ? 'Ödünç verildi' : 'Borrowed') ? (isDark ? (isCustomBrand ? 'border border-[rgba(139,171,216,0.24)] bg-[rgba(139,180,255,0.12)] text-[var(--hi-secondary-strong)]' : 'bg-[rgba(182,139,77,0.16)] text-[#e1c08e]') : (isCustomBrand ? 'border border-[rgba(176,193,216,0.28)] bg-[rgba(139,180,255,0.12)] text-[var(--hi-accent)]' : 'bg-[rgba(182,139,77,0.12)] text-[#9a6e37]')) : (isDark ? 'bg-[rgba(90,115,136,0.2)] text-[#a9bfd1]' : 'bg-[rgba(90,115,136,0.12)] text-[#4b6277]')}`}>
                                                            {row.state}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="landing-sections-continuum-v25">
                <section
                    id="features"
                    className="relative overflow-hidden py-32"
                >
                    <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="grid gap-8 lg:grid-cols-[0.88fr_1fr] lg:items-end">
                            <div>
                                <h2 className="mb-3 landing-kicker text-[var(--hi-secondary)]">
                                    {copy.features.eyebrow}
                                </h2>
                                <h3 className={`landing-display max-w-4xl text-[2.4rem] font-semibold tracking-[-0.05em] md:text-[3.35rem] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                    {copy.features.heading}
                                </h3>
                            </div>
                            <p className={`max-w-2xl text-lg font-normal leading-relaxed ${isDark ? 'text-white/58' : 'text-[var(--hi-text-soft)]'}`}>
                                {copy.features.description}
                            </p>
                        </div>

                        <div className="mt-20 space-y-16 lg:space-y-20">
                            {copy.productLanes.map((lane: any, index: number) => (
                                <article
                                    key={lane.title}
                                    className={`grid gap-10 border-t pt-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center ${isDark ? 'border-white/8' : 'border-[rgba(18,32,22,0.1)]'}`}
                                >
                                    <div className={index === 1 ? 'lg:order-2' : ''}>
                                        <p className="landing-kicker text-[var(--hi-secondary)]">
                                            {lane.eyebrow}
                                        </p>
                                        <h4 className={`mt-4 text-[1.7rem] font-semibold tracking-[-0.04em] md:text-4xl ${shellTextClass}`}>
                                            {lane.title}
                                        </h4>
                                        <p className={`mt-5 max-w-xl text-[1.05rem] font-normal leading-relaxed ${mutedTextClass}`}>
                                            {lane.description}
                                        </p>
                                    </div>

                                    <div className={index === 1 ? 'lg:order-1' : ''}>
                                        <div className={`landing-surface landing-lift rounded-[1rem] p-8 md:p-9 ${index === 1 ? 'lg:translate-y-6' : ''} ${isDark ? (isCustomBrand ? 'bg-[rgba(22,30,42,0.76)]' : 'bg-[rgba(17,23,20,0.7)]') : (isCustomBrand ? 'bg-[rgba(251,253,255,0.8)]' : 'bg-[rgba(255,251,245,0.76)]')}`} style={{ border: isDark ? (isCustomBrand ? '1px solid rgba(105,131,171,0.34)' : '1px solid rgba(255,255,255,0.06)') : (isCustomBrand ? '1px solid rgba(176,193,216,0.26)' : '1px solid rgba(18,32,22,0.05)'), boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.10)' : (isCustomBrand ? '0 2px 8px rgba(19,35,61,0.05)' : '0 2px 8px rgba(24,32,26,0.05)') }}>
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${index === 0 ? (isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.14)]' : 'bg-[rgba(111,153,120,0.16)]') : (isCustomBrand ? 'bg-[rgba(100,168,255,0.12)]' : 'bg-[rgba(93,139,106,0.12)]')) : index === 1 ? (isDark ? (isCustomBrand ? 'bg-[rgba(100,168,255,0.16)]' : 'bg-[rgba(90,115,136,0.18)]') : 'bg-[rgba(90,115,136,0.12)]') : (isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.10)]' : 'bg-[rgba(182,139,77,0.18)]') : (isCustomBrand ? 'bg-[rgba(22,166,220,0.10)]' : 'bg-[rgba(182,139,77,0.12)]'))}`}>
                                                {index === 0 ? <Package className={`h-5 w-5 ${isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#6f9978]'}`} /> : index === 1 ? <Users className={`h-5 w-5 ${isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#5a7388]'}`} /> : <Lock className={`h-5 w-5 ${isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]'}`} />}
                                            </div>
                                            <p className={`mt-8 text-3xl font-semibold tracking-[-0.05em] ${shellTextClass}`}>
                                                {lane.metric}
                                            </p>
                                            <p className={`mt-3 max-w-sm text-sm font-normal leading-6 ${mutedTextClass}`}>
                                                {lane.note}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section
                    id="security"
                    className={`relative overflow-hidden py-32 ${shellTextClass}`}
                >
                    <div className={`absolute inset-0 ${isDark ? 'opacity-10' : 'opacity-[0.06]' } bg-[radial-gradient(circle_at_center,var(--hi-secondary),transparent_45%)]`} />
                    <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2 lg:px-8">
                        <div>
                            <h2 className={`mb-3 landing-kicker ${isDark ? (isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#d9c29e]') : (isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#b68b4d]')}`}>
                                {copy.security.eyebrow}
                            </h2>
                            <h3 className={`landing-display max-w-xl text-[2.35rem] font-semibold tracking-[-0.05em] md:text-[3.7rem] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                {copy.security.heading}
                            </h3>
                            <p className={`mt-6 max-w-lg text-lg font-normal leading-relaxed ${isDark ? 'text-white/70' : (isCustomBrand ? 'text-[var(--hi-text-soft)]' : 'text-[#4b5b4f]')}`}>
                                {copy.security.description}
                            </p>

                            <ul className="mt-8 space-y-5">
                                {copy.security.bullets.map((item: string) => (
                                    <li key={item} className={`flex items-start gap-3 ${isDark ? (isCustomBrand ? 'text-white' : 'text-white/86') : (isCustomBrand ? 'text-[var(--hi-text)]' : 'text-[#3e4d40]')}`}>
                                        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.12)]' : 'bg-white/8') : (isCustomBrand ? 'bg-[rgba(100,168,255,0.12)]' : 'bg-[rgba(182,139,77,0.12)]')}`}>
                                            <ShieldCheck className={`h-4 w-4 ${isDark ? (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#a67a3d]')}`} />
                                        </span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={`relative overflow-hidden rounded-[1rem] p-8 md:p-10 ${securityPanelClass}`}>
                            <div
                                className="pointer-events-none absolute inset-0"
                                style={{
                                    background: isDark
                                        ? (isCustomBrand ? 'radial-gradient(circle_at_top_left,rgba(88,213,240,0.12),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent 32%)' : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.12),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent 32%)')
                                        : (isCustomBrand ? 'radial-gradient(circle_at_top_left,rgba(139,180,255,0.14),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.58),transparent 34%)' : 'radial-gradient(circle_at_top_left,rgba(184,153,104,0.16),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.46),transparent 34%)')
                                }}
                            />
                            <ShieldCheck
                                className={`pointer-events-none absolute -bottom-10 -right-8 h-40 w-40 ${isDark ? (isCustomBrand ? 'text-[rgba(139,180,255,0.08)]' : 'text-white/5') : (isCustomBrand ? 'text-[rgba(139,180,255,0.08)]' : 'text-[rgba(45,82,65,0.06)]')}`}
                            />

                            <div className="relative flex flex-col items-center text-center">
                                <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${isDark ? (isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#d9c29e]') : (isCustomBrand ? 'text-[var(--hi-secondary)]' : 'text-[#a57e45]')}`}>
                                    {securityPanelEyebrow}
                                </p>
                                <p className={`mt-4 max-w-sm text-4xl font-semibold tracking-[-0.05em] md:text-5xl ${securityStrongClass}`}>
                                    {securityPanelTitle}
                                </p>
                                <p className={`mt-4 max-w-md text-base font-normal leading-7 ${securityMutedClass}`}>
                                    {securityPanelDescription}
                                </p>

                                <div className="relative mt-12 flex h-[21rem] w-full max-w-[29rem] items-center justify-center sm:h-[24rem]">
                                    <div className={`absolute h-[17.5rem] w-[17.5rem] rounded-full border ${securityRingClass} sm:h-[20rem] sm:w-[20rem]`} />
                                    <div className={`absolute h-[12.5rem] w-[12.5rem] rounded-full border ${securityRingClass} sm:h-[15rem] sm:w-[15rem]`} />

                                    <div className={`relative z-10 flex h-32 w-32 flex-col items-center justify-center rounded-full sm:h-36 sm:w-36 ${securityCoreClass}`}>
                                        <KeyRound className={`h-10 w-10 ${isDark ? (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]')}`} />
                                        <span className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] ${securityMutedClass}`}>
                                            {vaultCoreLabel}
                                        </span>
                                    </div>

                                    {[
                                        {
                                            icon: FileText,
                                            title: vaultPassportsLabel,
                                            meta: vaultPassportsMeta,
                                            className: 'left-0 top-5 sm:left-2 sm:top-8'
                                        },
                                        {
                                            icon: ShieldCheck,
                                            title: vaultDeedsLabel,
                                            meta: vaultDeedsMeta,
                                            className: 'right-0 top-16 sm:right-2 sm:top-20'
                                        },
                                        {
                                            icon: KeyRound,
                                            title: vaultCodesLabel,
                                            meta: vaultCodesMeta,
                                            className: 'bottom-0 left-1/2 -translate-x-1/2'
                                        }
                                    ].map(({ icon: Icon, title, meta, className }) => (
                                        <div
                                            key={title}
                                            className={`absolute z-20 w-[9.5rem] rounded-[0.875rem] px-4 py-4 text-left sm:w-[10.5rem] ${securityChipClass} ${className}`}
                                        >
                                            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${securityIconSurfaceClass}`}>
                                                <Icon className={`h-4 w-4 ${isDark ? (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (isCustomBrand ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]')}`} />
                                            </div>
                                            <p className={`mt-4 text-sm font-semibold leading-6 ${securityStrongClass}`}>{title}</p>
                                            <p className={`mt-1 text-[11px] font-medium uppercase tracking-[0.18em] ${securityMutedClass}`}>
                                                {meta}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    id="about"
                    className="relative overflow-hidden py-32"
                >
                    <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                            <div>
                                <p className="landing-kicker text-[var(--hi-secondary)]">
                                    {copy.about.eyebrow}
                                </p>
                                <h2 className={`landing-display mt-4 max-w-2xl text-[2.3rem] font-semibold tracking-[-0.05em] md:text-[3.15rem] ${shellTextClass}`}>
                                    {copy.about.heading}
                                </h2>
                                <p className={`mt-6 max-w-2xl text-lg font-normal leading-relaxed ${mutedTextClass}`}>
                                    {copy.about.description}
                                </p>
                                <div className="mt-8 flex flex-wrap gap-3">
                                    {copy.about.pills.map((pill: string) => (
                                        <span
                                            key={pill}
                                            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${isDark ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[rgba(24,32,45,0.56)] text-[var(--hi-text-soft)]' : 'border border-white/8 bg-white/5 text-white/78') : (isCustomBrand ? 'border border-[rgba(176,193,216,0.22)] bg-[rgba(255,255,255,0.84)] text-[var(--hi-text-soft)]' : 'border border-[rgba(45,82,65,0.1)] bg-white/75 text-[var(--hi-text-soft)]')}`}
                                        >
                                            {pill}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6">
                                {copy.about.strips.map((strip: any) => (
                                    <article
                                        key={strip.number}
                                        className={`grid gap-4 border-t pt-6 md:grid-cols-[84px_1fr] ${isDark ? 'border-white/8' : 'border-[rgba(18,32,22,0.1)]'}`}
                                    >
                                        <span className="landing-display text-3xl text-[var(--hi-secondary)]">
                                            {strip.number}
                                        </span>
                                        <div>
                                            <h3 className={`text-2xl font-semibold tracking-[-0.03em] ${shellTextClass}`}>{strip.title}</h3>
                                            <p className={`mt-3 max-w-xl font-normal leading-7 ${mutedTextClass}`}>{strip.description}</p>
                                        </div>
                                    </article>
                                ))}

                                {!isCustomBrand && copy.about?.advanced && (
                                    <article
                                        className={`rounded-[1rem] border p-6 md:p-7 ${isDark ? (isCustomBrand ? 'border-[var(--hi-border)] bg-[rgba(22,30,42,0.72)]' : 'border-white/8 bg-white/5') : (isCustomBrand ? 'border-[rgba(176,193,216,0.26)] bg-[rgba(255,255,255,0.84)]' : 'border-[rgba(45,82,65,0.1)] bg-white/75')}`}
                                    >
                                        <p className="landing-kicker text-[var(--hi-secondary)]">
                                            {copy.about.advanced.eyebrow}
                                        </p>
                                        <h3 className={`mt-3 text-2xl font-semibold tracking-[-0.03em] ${shellTextClass}`}>
                                            {copy.about.advanced.title}
                                        </h3>
                                        <p className={`mt-3 max-w-xl font-normal leading-7 ${mutedTextClass}`}>
                                            {copy.about.advanced.description}
                                        </p>
                                        <a
                                            href={GITHUB_REPOSITORY_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`mt-5 inline-flex items-center gap-2 text-sm font-medium transition ${isDark ? (isCustomBrand ? 'text-[var(--hi-secondary)] hover:text-[var(--hi-accent)]' : 'text-white/72 hover:text-white') : (isCustomBrand ? 'text-[var(--hi-secondary-strong)] hover:text-[var(--hi-accent)]' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]')}`}
                                        >
                                            <Github className="h-4 w-4" />
                                            <span>{copy.about.advanced.link}</span>
                                        </a>
                                    </article>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    className="relative overflow-hidden py-32"
                >
                    <div className={`pointer-events-none absolute -left-20 top-24 h-64 w-64 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(205,176,136,0.12)]') : (isCustomBrand ? 'bg-[rgba(139,180,255,0.14)]' : 'bg-[rgba(184,153,104,0.16)]')}`} />
                    <div className={`pointer-events-none absolute right-0 top-16 h-72 w-72 rounded-full blur-3xl ${isDark ? (isCustomBrand ? 'bg-[rgba(88,213,240,0.1)]' : 'bg-[rgba(74,125,100,0.1)]') : (isCustomBrand ? 'bg-[rgba(22,166,220,0.08)]' : 'bg-[rgba(45,82,65,0.1)]')}`} />

                    <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                        <div className={`relative rounded-[1rem] px-8 py-14 md:px-12 ${isDark ? (isCustomBrand ? 'border border-[var(--hi-border)] bg-[linear-gradient(135deg,rgba(27,37,52,0.96),rgba(18,25,36,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]' : 'border border-white/6 bg-[linear-gradient(135deg,rgba(41,49,44,0.96),rgba(24,29,26,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]') : (isCustomBrand ? 'border border-[rgba(176,193,216,0.26)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,253,0.98))] shadow-[0_28px_56px_rgba(19,35,61,0.10)]' : 'border border-[rgba(45,82,65,0.06)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,235,224,0.98))] shadow-[0_28px_56px_rgba(38,48,38,0.10)]')}`}>
                            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                                <div>
                                    <p className="landing-kicker text-[var(--hi-secondary)]">
                                        {copy.cta.eyebrow}
                                    </p>
                                    <h2 className={`landing-display mt-3 max-w-2xl text-[2.45rem] font-semibold tracking-[-0.05em] md:text-[3.3rem] ${shellTextClass}`}>
                                        {copy.cta.heading}
                                    </h2>
                                    <p className={`mt-4 max-w-2xl text-lg font-normal leading-relaxed ${mutedTextClass}`}>
                                        {copy.cta.description}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
                                    <Link
                                        to="/register"
                                        className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-base font-semibold text-white transition ${isCustomBrand ? 'btn-primary !h-14 !rounded-full !px-8' : 'bg-[#6f9978] hover:bg-[#7aa484]'}`}
                                    >
                                        {copy.hero.primaryCta}
                                    </Link>
                                    <Link
                                        to="/login"
                                        className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-base font-semibold transition ${isDark ? 'border border-white/10 text-white/84 hover:bg-white/6 hover:text-white' : 'border border-[var(--hi-border)] text-[var(--hi-text)] hover:bg-[var(--hi-panel)]'}`}
                                    >
                                        {t('landing.nav.login')}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                </div>
            </main>
        </div>
    );
}
