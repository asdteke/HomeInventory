import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

const GITHUB_REPOSITORY_URL = 'https://github.com/asdteke/HomeInventory';
const DOCKER_DOCUMENTATION_URL = `${GITHUB_REPOSITORY_URL}/blob/main/DOCKER.md`;

function translateCopyTree(value, t, keyPath) {
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
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const isTurkish = (i18n.resolvedLanguage || i18n.language || 'tr').toLowerCase().startsWith('tr');
    const aboutLabel = t('landing.nav.details', { defaultValue: isTurkish ? 'Detaylar' : 'Details' });
    const featuresLabel = t('landing.nav.features');
    const securityLabel = t('landing.nav.security');
    const shellTextClass = isDark ? 'text-white' : 'text-[var(--hi-text)]';
    const mutedTextClass = isDark
        ? (false ? 'text-[var(--hi-text-soft)]' : 'text-white/62')
        : 'text-[var(--hi-text-soft)]';
    const headerClass = isDark
        ? (false ? 'border-b border-[var(--hi-border)] bg-[rgba(18,24,35,0.92)] text-white' : 'border-b border-[var(--hi-border)] bg-[rgba(26,31,28,0.92)] text-white')
        : (false ? 'border-b border-[var(--hi-border)] bg-[rgba(247,250,255,0.92)] text-[var(--hi-text)]' : 'border-b border-[var(--hi-border)] bg-[rgba(250,248,244,0.9)] text-[var(--hi-text)]');
    const chromeButtonClass = isDark
        ? (false ? '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!border-[var(--hi-border-strong)] hover:!bg-[var(--hi-panel-muted)]' : '!border-white/10 !bg-white/4 !text-white/88 hover:!bg-white/8')
        : '!border-[var(--hi-border)] !bg-[var(--hi-panel)] !text-[var(--hi-text)] hover:!bg-[var(--hi-panel-strong)]';
    const ghostThemeClass = isDark
        ? (false ? 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-muted)] hover:text-white' : 'border border-white/10 bg-white/4 text-white/84 hover:bg-white/8 hover:text-white')
        : 'border border-[var(--hi-border)] bg-[var(--hi-panel)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]';
    const heroBackground = isDark
        ? (false
            ? 'radial-gradient(circle_at_top_left,rgba(139,180,255,0.09),transparent_24%),radial-gradient(circle_at_top_right,rgba(103,227,242,0.12),transparent_34%),linear-gradient(180deg,#101620_0%,#161d29_58%,#121823_100%)'
            : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(74,125,100,0.14),transparent_34%),linear-gradient(180deg,#181d1a_0%,#1b211d_58%,#171b18_100%)')
        : (false
            ? 'radial-gradient(circle_at_top_left,rgba(139,180,255,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(18,158,154,0.10),transparent_30%),linear-gradient(180deg,#f5f9fe_0%,#eef4fc_54%,#e9f0fa_100%)'
            : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(45,82,65,0.10),transparent_30%),linear-gradient(180deg,#f7f1e8_0%,#f2ebdf_54%,#ece3d4_100%)');
    const featureBackground = isDark
        ? (false
            ? 'radial-gradient(circle_at_15%_20%,rgba(139,180,255,0.08),transparent_24%),linear-gradient(180deg,#131924_0%,#1a2230_100%)'
            : 'radial-gradient(circle_at_15%_20%,rgba(205,176,136,0.08),transparent_24%),linear-gradient(180deg,#151a18_0%,#202622_100%)')
        : (false
            ? 'radial-gradient(circle_at_18%_18%,rgba(139,180,255,0.12),transparent_24%),linear-gradient(180deg,#eef4fc_0%,#e8f0fa_100%)'
            : 'radial-gradient(circle_at_18%_18%,rgba(184,153,104,0.12),transparent_24%),linear-gradient(180deg,#f3ede2_0%,#ebe2d3_100%)');
    const aboutBackground = isDark
        ? (false
            ? 'radial-gradient(circle_at_85%_18%,rgba(103,227,242,0.08),transparent_22%),linear-gradient(180deg,#151c28_0%,#131923_100%)'
            : 'radial-gradient(circle_at_85%_18%,rgba(74,125,100,0.08),transparent_22%),linear-gradient(180deg,#1f2522_0%,#1b211d_100%)')
        : (false
            ? 'radial-gradient(circle_at_84%_16%,rgba(18,158,154,0.08),transparent_22%),linear-gradient(180deg,#f4f8fe_0%,#f7fbff_100%)'
            : 'radial-gradient(circle_at_84%_16%,rgba(45,82,65,0.08),transparent_22%),linear-gradient(180deg,#f5f0e7_0%,#f8f5ef_100%)');
    const ctaBackground = isDark
        ? (false
            ? 'radial-gradient(circle_at_10%_20%,rgba(139,180,255,0.12),transparent_20%),radial-gradient(circle_at_92%_18%,rgba(103,227,242,0.10),transparent_24%),linear-gradient(180deg,#141b26_0%,#111823_100%)'
            : 'radial-gradient(circle_at_10%_20%,rgba(205,176,136,0.12),transparent_20%),radial-gradient(circle_at_92%_18%,rgba(74,125,100,0.1),transparent_24%),linear-gradient(180deg,#181d1a_0%,#171c19_100%)')
        : (false
            ? 'radial-gradient(circle_at_12%_18%,rgba(139,180,255,0.14),transparent_20%),radial-gradient(circle_at_90%_14%,rgba(18,158,154,0.08),transparent_24%),linear-gradient(180deg,#f4f8fd_0%,#eef4fb_100%)'
            : 'radial-gradient(circle_at_12%_18%,rgba(184,153,104,0.16),transparent_20%),radial-gradient(circle_at_90%_14%,rgba(45,82,65,0.1),transparent_24%),linear-gradient(180deg,#f6f1e7_0%,#f7f2e8_100%)');
    const securityPanelClass = isDark
        ? (false ? 'border border-[var(--hi-border)] bg-[linear-gradient(180deg,rgba(28,38,53,0.96),rgba(20,28,40,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]' : 'border border-[#4d6755] bg-[#314338] shadow-[0_30px_70px_rgba(0,0,0,0.18)]')
        : (false ? 'border border-[rgba(176,193,216,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,253,0.94))] shadow-[0_26px_52px_rgba(19,35,61,0.10)]' : 'border border-[#d4c4aa] bg-[#fbf7f0] shadow-[0_26px_52px_rgba(38,48,38,0.12)]');
    const securityMutedClass = isDark ? (false ? 'text-[var(--hi-text-soft)]' : 'text-white/62') : (false ? 'text-[var(--hi-text-soft)]' : 'text-[#627060]');
    const securityStrongClass = isDark ? 'text-white' : 'text-[var(--hi-text)]';
    const securityIconSurfaceClass = isDark ? (false ? 'bg-[rgba(103,227,242,0.12)]' : 'bg-[rgba(205,176,136,0.16)]') : (false ? 'bg-[rgba(139,180,255,0.14)]' : 'bg-[rgba(184,153,104,0.14)]');
    const securityPanelEyebrow = t('landing.homeinventory.security_panel.eyebrow', { defaultValue: isTurkish ? 'Özel bilgiler için' : 'Scoped access' });
    const securityPanelTitle = t('landing.homeinventory.security_panel.title', { defaultValue: isTurkish ? 'Hassas kayıtlar ortak envanterden ayrı kalır' : 'Private records never appear in the shared list' });
    const securityPanelDescription = t('landing.homeinventory.security_panel.description', {
        defaultValue: isTurkish
            ? 'Pasaport, tapu, şifre ve benzeri bilgileri ortak ev listesinden ayrı saklayın. Bu alan yalnızca size ait kayıtlar için tasarlanmıştır.'
            : 'Passports, deeds, and access codes stay separate from the shared inventory. Vault data is stored encrypted.'
    });
    const securityChipClass = isDark
        ? (false ? 'border border-[var(--hi-border)] bg-[rgba(24,32,45,0.76)] shadow-[0_18px_34px_rgba(0,0,0,0.18)]' : 'border border-white/8 bg-[rgba(22,29,25,0.68)] shadow-[0_18px_34px_rgba(0,0,0,0.18)]')
        : (false ? 'border border-[rgba(176,193,216,0.24)] bg-[rgba(255,255,255,0.9)] shadow-[0_18px_34px_rgba(19,35,61,0.08)]' : 'border border-[rgba(45,82,65,0.12)] bg-[rgba(255,255,255,0.88)] shadow-[0_18px_34px_rgba(38,48,38,0.08)]');
    const securityRingClass = isDark ? (false ? 'border-[rgba(139,171,216,0.28)]' : 'border-white/8') : (false ? 'border-[rgba(176,193,216,0.24)]' : 'border-[rgba(45,82,65,0.12)]');
    const securityCoreClass = isDark
        ? (false ? 'border border-[var(--hi-border)] bg-[linear-gradient(180deg,rgba(39,52,72,0.92),rgba(26,35,50,0.96))] shadow-[0_28px_44px_rgba(0,0,0,0.22)]' : 'border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_28px_44px_rgba(0,0,0,0.22)]')
        : (false ? 'border border-[rgba(176,193,216,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,246,253,0.9))] shadow-[0_24px_36px_rgba(19,35,61,0.10)]' : 'border border-[rgba(45,82,65,0.1)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,241,232,0.88))] shadow-[0_24px_36px_rgba(38,48,38,0.10)]');
    const vaultCoreLabel = t('landing.homeinventory.security_panel.vault_scope', { defaultValue: isTurkish ? 'Özel alan' : 'Vault scope' });
    const vaultPassportsLabel = t('landing.homeinventory.security_panel.identity_docs', { defaultValue: isTurkish ? 'Kimlik belgeleri' : 'Identity docs' });
    const vaultPassportsMeta = t('landing.homeinventory.security_panel.identity_docs_meta', { defaultValue: isTurkish ? 'Pasaport, kimlik kartı' : 'Passports, IDs' });
    const vaultDeedsLabel = t('landing.homeinventory.security_panel.property_records', { defaultValue: isTurkish ? 'Tapu ve mülkiyet' : 'Property records' });
    const vaultDeedsMeta = t('landing.homeinventory.security_panel.property_records_meta', { defaultValue: isTurkish ? 'Tapu, kira sözleşmesi' : 'Deeds, leases' });
    const vaultCodesLabel = t('landing.homeinventory.security_panel.access_codes', { defaultValue: isTurkish ? 'Şifreler ve PIN\u2019ler' : 'Access codes' });
    const vaultCodesMeta = t('landing.homeinventory.security_panel.access_codes_meta', { defaultValue: isTurkish ? 'Şifre, PIN, anahtar' : 'Passwords, PINs' });

    useEffect(() => {
        if (!mobileNavOpen) {
            return undefined;
        }

        const { overflow } = document.body.style;

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setMobileNavOpen(false);
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', handleEscape);
        };
    }, [mobileNavOpen]);

    const copy = translateCopyTree(isTurkish
        ? {
            hero: {
                statement: 'HomeInventory çalışıyor. Ev envanterinizi kurun.',
                statementAccent: 'Önce evi, odaları ve kategorileri oluşturun; sonra eşya, belge, garanti ve ödünç kayıtlarını ekleyin.',
                description: 'Bu ekran kurulumdan sonra başlangıç rehberi gibi çalışmalı. Hesap oluşturun, ev yapısını kurun, önemli eşyaları ekleyin ve özel kayıtları Kişisel Kasa’da ayrı tutun.',
                primaryCta: 'Kuruluma başla',
                secondaryCta: 'Giriş yap',
                trustSignal: 'Önerilen akış: hesap • ev • oda ve kategori • eşya • yedekleme',
                searchPlaceholder: 'Eşya, oda veya barkodla arayın',
            },
            heroInventoryRows: [
                { name: 'Airfryer', meta: 'Mutfak tezgahı • Garanti 08/2028', state: null, icon: Package, accent: false ? 'text-[var(--hi-accent)]' : 'text-[#5d8b6a]' },
                { name: 'Matkap seti', meta: 'Depo dolabı • 14 parça', state: 'Ödünç verildi', icon: Package, accent: 'text-[#b3874f]' },
                { name: 'Mesh uydu ünitesi', meta: 'TV ünitesi • Deco M4', state: null, icon: Smartphone, accent: 'text-[#5a7388]' },
                { name: 'Yedek kapı anahtarı', meta: 'Antre çekmecesi', state: null, icon: KeyRound, accent: 'text-[#a57e45]' },
                { name: 'Kombi garanti PDF’i', meta: 'Belgeler • PDF eklendi', state: null, icon: FileText, accent: false ? 'text-[var(--hi-secondary)]' : 'text-[#6c7b69]' },
                { name: 'HEPA filtre', meta: 'Çocuk odası • Değişim 11/2026', state: null, icon: Package, accent: false ? 'text-[var(--hi-accent)]' : 'text-[#6f9978]' }
            ],
            features: {
                eyebrow: 'BAŞLANGIÇ',
                heading: 'Önce evin yapısını kurun, sonra aramak isteyeceğiniz şeyleri ekleyin.',
                description: 'HomeInventory en iyi; oda ve kategoriler önce oluşturulduğunda, ardından eşya, belge, garanti ve ödünç kayıtları bu yapıya bağlandığında çalışır.'
            },
            productLanes: [
                {
                    eyebrow: 'Adım 1',
                    title: 'Bir ev oluşturun veya mevcut eve katılın.',
                    description: 'Bu kurulumdaki ilk hesabı oluşturun, bir ev başlatın ya da davet/ev anahtarıyla mevcut haneye katılın.',
                    signal: 'Hesap kurulumu',
                    metric: 'Önce ev',
                    note: 'Hesap • ev anahtarı • ev halkı'
                },
                {
                    eyebrow: 'Adım 2',
                    title: 'Oda, kategori ve günlük eşyaları ekleyin.',
                    description: 'Eşyaları eklemeden önce evin haritasını kurun. Bu; arama, filtreleme, QR etiketleri ve garanti takibini daha anlaşılır hale getirir.',
                    signal: 'Envanter kurulumu',
                    metric: 'Düzenli arama',
                    note: 'Odalar • kategoriler • eşya detayları'
                },
                {
                    eyebrow: 'Adım 3',
                    title: 'Gerektiğinde ödünç takibi ve Kişisel Kasa kullanın.',
                    description: 'Evden çıkan eşyaları takip edin; pasaport, şifre, tapu ve benzeri hassas kayıtları ortak listeden ayrı tutun.',
                    signal: 'Günlük kullanım',
                    metric: 'Ortak ve özel',
                    note: 'Ödünç • yedekleme • Kişisel Kasa'
                }
            ],
            security: {
                eyebrow: 'GÜVENEREK KULLANMADAN ÖNCE',
                heading: 'Önemli kayıtları eklemeden önce güvenlik temelini tamamlayın.',
                description: 'İlk eşyaları ekledikten sonra hesap korumasını, yedekleme davranışını ve Kişisel Kasa kurulumunu kontrol edin.',
                bullets: [
                    'Hesap ayarlarından iki adımlı doğrulama, yedek kodlar ve kurtarma materyallerini hazırlayın.',
                    'Vazgeçilmez belgeleri saklamadan önce yedekleme ve geri yüklemeyi test edin.'
                ]
            },
            about: {
                eyebrow: 'NASIL KULLANILIR',
                heading: 'Yeni bir HomeInventory kurulumu için pratik başlangıç yolu.',
                description: 'Bu sayfa, uygulamayı yeni açan kişiye sıradaki adımı göstermeli. Teknik proje bilgileri erişilebilir kalır; ama ilk iş ev envanterini kullanılır hale getirmektir.',
                pills: [
                    'Hesap oluştur',
                    'Oda ekle',
                    'Eşya ekle',
                    'Yedeklemeyi kontrol et'
                ],
                strips: [
                    {
                        number: '01',
                        title: 'İlk hesabı oluşturun',
                        description: 'Bu kurulum için yerel bir hesapla başlayın. Zaten bir ev varsa ikinci bir ev oluşturmak yerine mevcut eve katılın.'
                    },
                    {
                        number: '02',
                        title: 'Evi modelleyin',
                        description: 'Gerçekten kullandığınız oda ve kategorileri ekleyin. Yapıyı evdeki herkesin anlayacağı kadar sade tutun.'
                    },
                    {
                        number: '03',
                        title: 'Önemli eşyaları kaydedin',
                        description: 'Daha sonra bulmanız gerekebilecek eşyalar için ad, konum, fiş, garanti tarihi, not ve QR etiketi ekleyin.'
                    },
                    {
                        number: '04',
                        title: 'Özel ve geri kazanılabilir veriyi koruyun',
                        description: 'Hassas kayıtlar için Kişisel Kasa kullanın, hesap korumasını açın ve uygulamaya güvenmeden önce yedeklerin çalıştığını doğrulayın.'
                    }
                ],
                advanced: {
                    eyebrow: 'Teknik notlar',
                    title: 'Dağıtım detayları mı gerekiyor?',
                    description: 'Bu kurulumu siz yönetiyorsanız Docker rehberini, ortam ayarlarını, yedekleme konumunu ve kaynak depoyu el altında tutun.',
                    link: 'Proje dokümantasyonunu GitHub’da açın'
                }
            },
            cta: {
                eyebrow: 'BURADAN BAŞLA',
                heading: 'Hesabınızı oluşturun ve ilk evi kurun.',
                description: 'Sonra oda ve kategorileri ekleyin, ilk eşyaları kaydedin; önemli kayıtları saklamadan önce yedekleme ve güvenlik ayarlarını kontrol edin.'
            }
        }
        : (false ? {
            hero: {
                statement: 'HomeInventory is running. Set up your home inventory.',
                statementAccent: 'Create a home, add rooms and categories, then start recording items, documents, warranties, and borrowing.',
                description: 'Use this screen as your starting point after installation. Begin with an account, build the household structure, add important items, and keep private records in Personal Vault.',
                primaryCta: 'Start setup',
                secondaryCta: 'Sign in',
                trustSignal: 'Suggested flow: account • home • rooms and categories • items • backup',
                searchPlaceholder: 'Search an item, room, or barcode',
            },
            heroInventoryRows: [
                { name: 'Air fryer', meta: 'Kitchen counter • Warranty 08/2028', state: null, icon: Package, accent: 'text-[var(--hi-accent)]' },
                { name: 'Drill set', meta: 'Storage cabinet • 14 pieces', state: 'Borrowed', icon: Package, accent: 'text-[#b3874f]' },
                { name: 'Mesh unit', meta: 'TV console • Deco M4', state: null, icon: Smartphone, accent: 'text-[#5a7388]' },
                { name: 'Spare door key', meta: 'Entry drawer', state: null, icon: KeyRound, accent: 'text-[#a57e45]' },
                { name: 'Boiler warranty PDF', meta: 'Documents • PDF attached', state: null, icon: FileText, accent: 'text-[var(--hi-secondary)]' },
                { name: 'HEPA filter', meta: 'Kids room • Replace 11/2026', state: null, icon: Package, accent: 'text-[var(--hi-accent)]' }
            ],
            features: {
                eyebrow: 'GET STARTED',
                heading: 'Start with the structure of your home, then add the things you need to find later.',
                description: 'HomeInventory works best when you create rooms and categories first, then attach items, documents, warranties, and borrow history to that structure.'
            },
            productLanes: [
                {
                    eyebrow: 'Step 1',
                    title: 'Create or join a home.',
                    description: 'Register the first account for this installation, create a home, or join an existing household with an invite or house key.',
                    signal: 'Account setup',
                    metric: 'Home first',
                    note: 'Account • home key • household members'
                },
                {
                    eyebrow: 'Step 2',
                    title: 'Add rooms, categories, and everyday items.',
                    description: 'Build the map of your home before adding items. It makes search, filtering, QR labels, and warranty tracking much easier later.',
                    signal: 'Inventory setup',
                    metric: 'Organized search',
                    note: 'Rooms • categories • item details'
                },
                {
                    eyebrow: 'Step 3',
                    title: 'Use borrow tracking and Personal Vault when needed.',
                    description: 'Track items that leave the house, and keep passports, codes, deeds, and other sensitive records away from the shared list.',
                    signal: 'Daily use',
                    metric: 'Shared plus private',
                    note: 'Borrowing • backups • Personal Vault'
                }
            ],
            security: {
                eyebrow: 'BEFORE YOU RELY ON IT',
                heading: 'Finish the security basics before adding important records.',
                description: 'Once your first items are in place, review account protection, backup behavior, and Personal Vault setup so the installation is ready for real household use.',
                bullets: [
                    'Set up 2FA, backup codes, and recovery materials from account settings.',
                    'Test backup and restore before storing irreplaceable documents.'
                ]
            },
            about: {
                eyebrow: 'HOW TO USE IT',
                heading: 'A practical setup path for a new HomeInventory installation.',
                description: 'This page should help the person who just opened the app understand what to do next. Technical project details stay available, but the first job is getting the household inventory usable.',
                pills: [
                    'Create account',
                    'Add rooms',
                    'Add items',
                    'Review backup'
                ],
                strips: [
                    {
                        number: '01',
                        title: 'Create the first account',
                        description: 'Start with a local account for this installation. If a home already exists, join it instead of creating a second one.'
                    },
                    {
                        number: '02',
                        title: 'Model the home',
                        description: 'Add the rooms and categories you actually use. Keep the structure simple enough that everyone in the house understands it.'
                    },
                    {
                        number: '03',
                        title: 'Record important items',
                        description: 'Add item names, locations, receipts, warranty dates, notes, and QR labels for the things you may need to find later.'
                    },
                    {
                        number: '04',
                        title: 'Protect private and recoverable data',
                        description: 'Use Personal Vault for sensitive records, enable account protection, and confirm that backups are working before you depend on the app.'
                    }
                ],
                advanced: {
                    eyebrow: 'Technical notes',
                    title: 'Need deployment details?',
                    description: 'If you are maintaining this installation, keep the Docker guide, environment settings, backup location, and source repository handy.',
                    link: 'Open project documentation on GitHub'
                }
            },
            cta: {
                eyebrow: 'START HERE',
                heading: 'Create your account and set up the first home.',
                description: 'After that, add rooms and categories, record your first items, then review backup and security settings before storing important records.'
            }
        } : {
            hero: {
                statement: 'HomeInventory is running. Set up your home inventory.',
                statementAccent: 'Create a home, add rooms and categories, then start recording items, documents, warranties, and borrowing.',
                description: 'Use this screen as your starting point after installation. Begin with an account, build the household structure, add important items, and keep private records in Personal Vault.',
                primaryCta: 'Start setup',
                secondaryCta: 'Sign in',
                trustSignal: 'Suggested flow: account • home • rooms and categories • items • backup',
                searchPlaceholder: 'Search an item, room, or barcode',
            },
            heroInventoryRows: [
                { name: 'Air fryer', meta: 'Kitchen counter • Warranty 08/2028', state: null, icon: Package, accent: 'text-[#5d8b6a]' },
                { name: 'Drill set', meta: 'Storage cabinet • 14 pieces', state: 'Borrowed', icon: Package, accent: 'text-[#b3874f]' },
                { name: 'Mesh unit', meta: 'TV console • Deco M4', state: null, icon: Smartphone, accent: 'text-[#5a7388]' },
                { name: 'Spare door key', meta: 'Entry drawer', state: null, icon: KeyRound, accent: 'text-[#a57e45]' },
                { name: 'Boiler warranty PDF', meta: 'Documents • PDF attached', state: null, icon: FileText, accent: 'text-[#6c7b69]' },
                { name: 'HEPA filter', meta: 'Kids room • Replace 11/2026', state: null, icon: Package, accent: 'text-[#6f9978]' }
            ],
            features: {
                eyebrow: 'GET STARTED',
                heading: 'Start with the structure of your home, then add the things you need to find later.',
                description: 'HomeInventory works best when you create rooms and categories first, then attach items, documents, warranties, and borrow history to that structure.'
            },
            productLanes: [
                {
                    eyebrow: 'Step 1',
                    title: 'Create or join a home.',
                    description: 'Register the first account for this installation, create a home, or join an existing household with an invite or house key.',
                    signal: 'Account setup',
                    metric: 'Home first',
                    note: 'Account • home key • household members'
                },
                {
                    eyebrow: 'Step 2',
                    title: 'Add rooms, categories, and everyday items.',
                    description: 'Build the map of your home before adding items. It makes search, filtering, QR labels, and warranty tracking much easier later.',
                    signal: 'Inventory setup',
                    metric: 'Organized search',
                    note: 'Rooms • categories • item details'
                },
                {
                    eyebrow: 'Step 3',
                    title: 'Use borrow tracking and Personal Vault when needed.',
                    description: 'Track items that leave the house, and keep passports, codes, deeds, and other sensitive records away from the shared list.',
                    signal: 'Daily use',
                    metric: 'Shared plus private',
                    note: 'Borrowing • backups • Personal Vault'
                }
            ],
            security: {
                eyebrow: 'BEFORE YOU RELY ON IT',
                heading: 'Finish the security basics before adding important records.',
                description: 'Once your first items are in place, review account protection, backup behavior, and Personal Vault setup so the installation is ready for real household use.',
                bullets: [
                    'Set up 2FA, backup codes, and recovery materials from account settings.',
                    'Test backup and restore before storing irreplaceable documents.'
                ]
            },
            about: {
                eyebrow: 'HOW TO USE IT',
                heading: 'A practical setup path for a new HomeInventory installation.',
                description: 'This page should help the person who just opened the app understand what to do next. Technical project details stay available, but the first job is getting the household inventory usable.',
                pills: [
                    'Create account',
                    'Add rooms',
                    'Add items',
                    'Review backup'
                ],
                strips: [
                    {
                        number: '01',
                        title: 'Create the first account',
                        description: 'Start with a local account for this installation. If a home already exists, join it instead of creating a second one.'
                    },
                    {
                        number: '02',
                        title: 'Model the home',
                        description: 'Add the rooms and categories you actually use. Keep the structure simple enough that everyone in the house understands it.'
                    },
                    {
                        number: '03',
                        title: 'Record important items',
                        description: 'Add item names, locations, receipts, warranty dates, notes, and QR labels for the things you may need to find later.'
                    },
                    {
                        number: '04',
                        title: 'Protect private and recoverable data',
                        description: 'Use Personal Vault for sensitive records, enable account protection, and confirm that backups are working before you depend on the app.'
                    }
                ],
                advanced: {
                    eyebrow: 'Technical notes',
                    title: 'Need deployment details?',
                    description: 'If you are maintaining this installation, keep the Docker guide, environment settings, backup location, and source repository handy.',
                    link: 'Open project documentation on GitHub'
                }
            },
            cta: {
                eyebrow: 'START HERE',
                heading: 'Create your account and set up the first home.',
                description: 'After that, add rooms and categories, record your first items, then review backup and security settings before storing important records.'
            }
        }), t, false ? 'landing.homeinventory' : 'landing.homeinventory');

    return (
        <div className="landing-page-shell min-h-screen overflow-hidden bg-[var(--hi-bg)] text-[var(--hi-text)] selection:bg-[var(--hi-secondary-soft)]">
            <header className={`fixed inset-x-0 top-0 z-50 backdrop-blur-xl ${headerClass}`}>
                <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6 lg:px-8">
                    <Link
                        to="/"
                        aria-label="HomeInventory"
                        title="HomeInventory"
                        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary)]"
                    >
                        <BrandLogo variant="full" size="md" className="max-h-10 w-auto" />
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
                        <Link to="/login" className={`text-sm font-medium transition ${isDark ? (false ? 'text-[var(--hi-text-soft)] hover:text-white' : 'text-white/80 hover:text-white') : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}>
                            {t('landing.nav.login')}
                        </Link>
                        <Link
                            to="/register"
                            className={`inline-flex h-12 items-center rounded-full px-6 text-sm font-semibold text-white transition ${false ? 'btn-primary !h-12 !rounded-full !px-6' : 'bg-[#6f9978] hover:bg-[#7aa484]'}`}
                        >
                            {copy.hero.primaryCta}
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setMobileNavOpen((open) => !open)}
                        className={`rounded-xl p-2 md:hidden ${ghostThemeClass}`}
                        aria-controls="landing-mobile-menu"
                        aria-expanded={mobileNavOpen}
                        aria-label={mobileNavOpen ? t('common.close') : t('navigation.menu')}
                    >
                        {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </header>

            {mobileNavOpen && (
                <div id="landing-mobile-menu" className="fixed inset-0 z-[60] md:hidden">
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setMobileNavOpen(false)}
                    />

                    <div className="absolute inset-x-3 top-[6.5rem] rounded-[2rem] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-2xl backdrop-blur-2xl">
                        <div className="grid gap-3">
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className={`inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition ${ghostThemeClass}`}
                            >
                                {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                                {isDark ? t('common.theme.light') : t('common.theme.dark')}
                            </button>
                            <LanguageSwitcher
                                showCodeBadge={false}
                                showTooltip={false}
                                className={`!h-11 !rounded-full !px-4 !py-0 ${chromeButtonClass}`}
                            />
                            <a href="#features" onClick={() => setMobileNavOpen(false)} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${isDark ? 'text-white/75 hover:bg-white/5 hover:text-white' : 'text-[var(--hi-text-soft)] hover:bg-black/5 hover:text-[var(--hi-text)]'}`}>
                                {featuresLabel}
                            </a>
                            <a href="#security" onClick={() => setMobileNavOpen(false)} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${isDark ? 'text-white/75 hover:bg-white/5 hover:text-white' : 'text-[var(--hi-text-soft)] hover:bg-black/5 hover:text-[var(--hi-text)]'}`}>
                                {securityLabel}
                            </a>
                            <a href="#about" onClick={() => setMobileNavOpen(false)} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${isDark ? 'text-white/75 hover:bg-white/5 hover:text-white' : 'text-[var(--hi-text-soft)] hover:bg-black/5 hover:text-[var(--hi-text)]'}`}>
                                {aboutLabel}
                            </a>
                            <Link to="/login" onClick={() => setMobileNavOpen(false)} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${isDark ? 'text-white/75 hover:bg-white/5 hover:text-white' : 'text-[var(--hi-text-soft)] hover:bg-black/5 hover:text-[var(--hi-text)]'}`}>
                                {t('landing.nav.login')}
                            </Link>
                            <Link
                                to="/register"
                                onClick={() => setMobileNavOpen(false)}
                                className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white transition ${false ? 'btn-primary !h-11 !rounded-full !px-5' : 'bg-[#6f9978] hover:bg-[#7aa484]'}`}
                            >
                                {copy.hero.primaryCta}
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <main className="pt-24">
                <section className="relative overflow-hidden pb-28 pt-28 lg:min-h-[calc(100svh-6rem)] lg:pb-36 lg:pt-32">
                    <div className="absolute inset-0 -z-10" style={{ background: heroBackground }} />
                    <div className={`absolute inset-0 -z-10 ${isDark ? 'opacity-[0.16]' : 'opacity-[0.28]'}`}>
                        <div className="landing-grid absolute inset-0" />
                    </div>
                    <div className={`absolute -left-24 top-24 -z-10 h-64 w-64 rounded-full blur-3xl ${isDark ? (false ? 'bg-[rgba(139,180,255,0.14)]' : 'bg-[rgba(205,176,136,0.14)]') : (false ? 'bg-[rgba(139,180,255,0.20)]' : 'bg-[rgba(205,176,136,0.22)]')}`} />
                    <div className={`absolute right-0 top-0 -z-10 h-[28rem] w-[28rem] rounded-full blur-3xl ${isDark ? (false ? 'bg-[rgba(103,227,242,0.14)]' : 'bg-[rgba(74,125,100,0.14)]') : (false ? 'bg-[rgba(18,158,154,0.10)]' : 'bg-[rgba(45,82,65,0.12)]')}`} />

                    <div className="mx-auto grid max-w-7xl items-start gap-12 px-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1fr)] lg:gap-16 lg:px-8">
                        <div className={`max-w-[30rem] ${shellTextClass}`}>
                            <h1 className={shellTextClass}>
                                <span className="landing-display block max-w-[25rem] text-[clamp(2.35rem,4.5vw,3.95rem)] font-semibold leading-[1.02] tracking-[-0.06em]">
                                    {copy.hero.statement}
                                </span>
                                <span className={`landing-serif mt-4 block max-w-[24rem] text-[clamp(1.55rem,2.9vw,2.35rem)] leading-[1.06] ${isDark ? (false ? 'text-[var(--hi-accent)]' : 'text-[#d8c29d]') : (false ? 'text-[var(--hi-accent)]' : 'text-[#9b6f35]')}`}>
                                    {copy.hero.statementAccent}
                                </span>
                            </h1>

                            <p className={`mt-9 max-w-[27rem] text-[0.98rem] font-normal leading-7 ${isDark ? 'text-white/60' : (false ? 'text-[var(--hi-text-soft)]' : 'text-[#536250]')}`}>
                                {copy.hero.description}
                            </p>

                            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                                <Link
                                    to="/register"
                                    className={`btn-primary !h-14 !rounded-full !px-8 text-base ${false ? '!shadow-[0_18px_40px_rgba(8,44,110,0.28)] hover:!shadow-[0_24px_48px_rgba(8,44,110,0.34)]' : '!shadow-[0_18px_40px_rgba(111,153,120,0.28)] hover:!shadow-[0_24px_48px_rgba(111,153,120,0.34)]'} transition-transform duration-200 hover:-translate-y-0.5`}
                                >
                                    {copy.hero.primaryCta}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                                <Link
                                    to="/login"
                                    className={`inline-flex h-14 items-center justify-center rounded-full border px-8 text-base font-semibold transition ${isDark ? (false ? 'border-[var(--hi-border-strong)] bg-[rgba(26,36,51,0.9)] text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)] hover:border-[var(--hi-secondary)] hover:bg-[rgba(33,45,63,0.98)]' : 'border-white/12 bg-white/[0.05] text-white/82 hover:border-white/20 hover:text-white') : (false ? 'border-[rgba(176,193,216,0.62)] bg-[rgba(255,255,255,0.98)] text-[var(--hi-text)] shadow-[0_14px_28px_rgba(19,35,61,0.12)] hover:border-[rgba(139,180,255,0.68)] hover:bg-[rgba(246,250,255,1)] hover:text-[var(--hi-text)]' : 'border-[rgba(18,32,22,0.12)] text-[#556453] hover:bg-white/60 hover:text-[var(--hi-text)]')}`}
                                    aria-label={copy.hero.secondaryCta}
                                >
                                    {copy.hero.secondaryCta}
                                    <ArrowRight className="ml-2 h-4 w-4 opacity-80" />
                                </Link>
                            </div>

                            <p className={`mt-9 max-w-[26rem] text-[13px] font-normal ${isDark ? 'text-white/42' : 'text-[var(--hi-text-muted)]'}`}>
                                {copy.hero.trustSignal}
                            </p>
                        </div>

                        <div className="relative flex items-start justify-center pt-1 lg:min-h-[440px] lg:pl-4">
                            <div
                                className={`pointer-events-none absolute inset-[-0.8rem] rounded-[2.6rem] transform-gpu ${isDark ? (false ? 'bg-[linear-gradient(135deg,rgba(29,39,55,0.98),rgba(20,28,40,0.94))] shadow-[0_24px_48px_rgba(0,0,0,0.16)]' : 'bg-[linear-gradient(135deg,rgba(34,43,37,0.92),rgba(27,33,29,0.88))] shadow-[0_24px_48px_rgba(0,0,0,0.16)]') : (false ? 'bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(236,244,253,0.96))] shadow-[0_20px_40px_rgba(19,35,61,0.08)]' : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(238,232,220,0.92))] shadow-[0_20px_40px_rgba(28,41,32,0.08)]')}`}
                                style={{
                                    transform: 'rotate(0.35deg)',
                                    boxShadow: isDark
                                        ? (false ? 'inset 0 0 0 1px rgba(139,171,216,0.44), 0 24px 48px rgba(0,0,0,0.16)' : 'inset 0 0 0 1.15px rgba(255,255,255,0.4), 0 24px 48px rgba(0,0,0,0.16)')
                                        : (false ? 'inset 0 0 0 1.6px rgba(255,255,255,0.98), 0 0 0 1px rgba(176,193,216,0.42), 0 20px 40px rgba(19,35,61,0.08)' : 'inset 0 0 0 1.6px rgba(255,255,255,0.98), 0 0 0 1px rgba(192,178,155,0.4), 0 20px 40px rgba(28,41,32,0.08)')
                                }}
                            />

                            <div
                                className={`landing-surface relative z-10 mx-auto w-full max-w-[30rem] overflow-hidden rounded-[1.75rem] p-5 lg:p-6 ${isDark ? (false ? 'bg-[linear-gradient(180deg,rgba(19,26,38,0.98),rgba(14,20,30,0.98))]' : 'bg-[#161d19]') : (false ? 'bg-[rgba(250,253,255,0.82)]' : 'bg-[rgba(255,251,245,0.72)]')}`}
                                style={{
                                    boxShadow: isDark
                                        ? (false ? 'inset 0 0 0 1px rgba(139,171,216,0.32), 0 28px 64px rgba(0,0,0,0.18)' : 'inset 0 0 0 1.15px rgba(255,255,255,0.28), 0 28px 64px rgba(0,0,0,0.18)')
                                        : (false ? 'inset 0 0 0 2px rgba(255,255,255,0.98), 0 0 0 1px rgba(176,193,216,0.34), 0 28px 64px rgba(19,35,61,0.12)' : 'inset 0 0 0 2px rgba(255,255,255,0.98), 0 0 0 1px rgba(186,172,148,0.36), 0 28px 64px rgba(32,44,34,0.12)')
                                }}
                            >
                                <div className="landing-panel-glow absolute inset-0 opacity-40" />

                                <div className="relative">
                                    <div className={`flex items-center gap-3 rounded-full px-4 py-3 ${isDark ? (false ? 'border border-[rgba(105,131,171,0.42)] bg-[rgba(16,23,35,0.96)] text-[var(--hi-text-muted)]' : 'border border-white/8 bg-[rgba(14,20,17,0.75)] text-white/54') : (false ? 'border border-[rgba(176,193,216,0.34)] bg-[rgba(244,248,255,0.96)] text-[var(--hi-text-muted)]' : 'border border-[rgba(18,32,22,0.08)] bg-[rgba(248,243,234,0.92)] text-[var(--hi-text-muted)]')}`}>
                                        <Search className="h-4 w-4" />
                                        <span className="text-sm">{copy.hero.searchPlaceholder}</span>
                                    </div>

                                    <div className="mt-4">
                                        {copy.heroInventoryRows.map((row, index) => {
                                            const Icon = row.icon;
                                            return (
                                                <div
                                                    key={row.name}
                                                    className={`flex items-start gap-4 py-4 ${index === 2 ? 'pl-1' : ''} ${index !== copy.heroInventoryRows.length - 1 ? (isDark ? 'border-b border-white/8' : 'border-b border-[rgba(18,32,22,0.08)]') : ''}`}
                                                >
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? (false ? 'bg-[rgba(40,61,83,0.72)]' : 'bg-white/6') : (false ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(18,32,22,0.06)]')}`}>
                                                        <Icon className={`h-4 w-4 ${row.accent}`} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-sm font-medium leading-5 ${shellTextClass}`}>{row.name}</p>
                                                        <p className={`mt-1 text-xs font-normal leading-5 ${mutedTextClass}`}>{row.meta}</p>
                                                    </div>
{row.state && (
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${row.state === (isTurkish ? 'Ödünç verildi' : 'Borrowed') ? (isDark ? (false ? 'border border-[rgba(139,171,216,0.24)] bg-[rgba(139,180,255,0.12)] text-[var(--hi-secondary-strong)]' : 'bg-[rgba(182,139,77,0.16)] text-[#e1c08e]') : (false ? 'border border-[rgba(176,193,216,0.28)] bg-[rgba(139,180,255,0.12)] text-[var(--hi-accent)]' : 'bg-[rgba(182,139,77,0.12)] text-[#9a6e37]')) : (isDark ? 'bg-[rgba(90,115,136,0.2)] text-[#a9bfd1]' : 'bg-[rgba(90,115,136,0.12)] text-[#4b6277]')}`}>
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

                <section
                    id="features"
                    className="relative overflow-hidden py-32"
                    style={{ background: featureBackground }}
                >
                    <div className={`absolute inset-x-0 top-0 h-px ${isDark ? 'bg-white/10' : 'bg-[rgba(18,32,22,0.1)]'}`} />
                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
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
                            {copy.productLanes.map((lane, index) => (
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
                                        <div className={`landing-surface landing-lift rounded-[1rem] p-8 md:p-9 ${index === 1 ? 'lg:translate-y-6' : ''} ${isDark ? (false ? 'bg-[rgba(22,30,42,0.76)]' : 'bg-[rgba(17,23,20,0.7)]') : (false ? 'bg-[rgba(251,253,255,0.8)]' : 'bg-[rgba(255,251,245,0.76)]')}`} style={{ border: isDark ? (false ? '1px solid rgba(105,131,171,0.34)' : '1px solid rgba(255,255,255,0.06)') : (false ? '1px solid rgba(176,193,216,0.26)' : '1px solid rgba(18,32,22,0.05)'), boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.10)' : (false ? '0 2px 8px rgba(19,35,61,0.05)' : '0 2px 8px rgba(24,32,26,0.05)') }}>
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${index === 0 ? (isDark ? (false ? 'bg-[rgba(103,227,242,0.14)]' : 'bg-[rgba(111,153,120,0.16)]') : (false ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(93,139,106,0.12)]')) : index === 1 ? (isDark ? (false ? 'bg-[rgba(139,180,255,0.16)]' : 'bg-[rgba(90,115,136,0.18)]') : 'bg-[rgba(90,115,136,0.12)]') : (isDark ? (false ? 'bg-[rgba(103,227,242,0.10)]' : 'bg-[rgba(182,139,77,0.18)]') : (false ? 'bg-[rgba(18,158,154,0.10)]' : 'bg-[rgba(182,139,77,0.12)]'))}`}>
                                                {index === 0 ? <Package className={`h-5 w-5 ${false ? 'text-[var(--hi-accent)]' : 'text-[#6f9978]'}`} /> : index === 1 ? <Users className={`h-5 w-5 ${false ? 'text-[var(--hi-secondary)]' : 'text-[#5a7388]'}`} /> : <Lock className={`h-5 w-5 ${false ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]'}`} />}
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

                <section id="security" className={`relative overflow-hidden py-32 ${shellTextClass}`} style={{ background: isDark ? (false ? 'linear-gradient(180deg,#16202d 0%,#111925 100%)' : 'linear-gradient(180deg,#1d2b24 0%,#19231d 100%)') : (false ? 'linear-gradient(180deg,#edf4fd 0%,#e7f0fb 100%)' : 'linear-gradient(180deg,#ece0ce 0%,#e8dccb 100%)') }}>
                    <div className={`absolute inset-0 ${isDark ? 'opacity-10' : 'opacity-[0.06]' } bg-[radial-gradient(circle_at_center,var(--hi-secondary),transparent_45%)]`} />
                    <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2 lg:px-8">
                        <div>
                            <h2 className={`mb-3 landing-kicker ${isDark ? (false ? 'text-[var(--hi-secondary)]' : 'text-[#d9c29e]') : (false ? 'text-[var(--hi-secondary)]' : 'text-[#b68b4d]')}`}>
                                {copy.security.eyebrow}
                            </h2>
                            <h3 className={`landing-display max-w-xl text-[2.35rem] font-semibold tracking-[-0.05em] md:text-[3.7rem] ${isDark ? 'text-white' : 'text-[var(--hi-text)]'}`}>
                                {copy.security.heading}
                            </h3>
                            <p className={`mt-6 max-w-lg text-lg font-normal leading-relaxed ${isDark ? 'text-white/70' : (false ? 'text-[var(--hi-text-soft)]' : 'text-[#4b5b4f]')}`}>
                                {copy.security.description}
                            </p>

                            <ul className="mt-8 space-y-5">
                                {copy.security.bullets.map((item) => (
                                    <li key={item} className={`flex items-start gap-3 ${isDark ? (false ? 'text-white' : 'text-white/86') : (false ? 'text-[var(--hi-text)]' : 'text-[#3e4d40]')}`}>
                                        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isDark ? (false ? 'bg-[rgba(103,227,242,0.12)]' : 'bg-white/8') : (false ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(182,139,77,0.12)]')}`}>
                                            <ShieldCheck className={`h-4 w-4 ${isDark ? (false ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (false ? 'text-[var(--hi-accent)]' : 'text-[#a67a3d]')}`} />
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
                                        ? (false ? 'radial-gradient(circle_at_top_left,rgba(103,227,242,0.12),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent 32%)' : 'radial-gradient(circle_at_top_left,rgba(205,176,136,0.12),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent 32%)')
                                        : (false ? 'radial-gradient(circle_at_top_left,rgba(139,180,255,0.14),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.58),transparent 34%)' : 'radial-gradient(circle_at_top_left,rgba(184,153,104,0.16),transparent 30%),linear-gradient(180deg,rgba(255,255,255,0.46),transparent 34%)')
                                }}
                            />
                            <ShieldCheck
                                className={`pointer-events-none absolute -bottom-10 -right-8 h-40 w-40 ${isDark ? (false ? 'text-[rgba(139,180,255,0.08)]' : 'text-white/5') : (false ? 'text-[rgba(139,180,255,0.08)]' : 'text-[rgba(45,82,65,0.06)]')}`}
                            />

                            <div className="relative flex flex-col items-center text-center">
                                <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${isDark ? (false ? 'text-[var(--hi-secondary)]' : 'text-[#d9c29e]') : (false ? 'text-[var(--hi-secondary)]' : 'text-[#a57e45]')}`}>
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
                                        <KeyRound className={`h-10 w-10 ${isDark ? (false ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (false ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]')}`} />
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
                                                <Icon className={`h-4 w-4 ${isDark ? (false ? 'text-[var(--hi-accent)]' : 'text-[#d9c29e]') : (false ? 'text-[var(--hi-accent)]' : 'text-[#a57e45]')}`} />
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
                    style={{ background: aboutBackground }}
                >
                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
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
                                    {copy.about.pills.map((pill) => (
                                        <span
                                            key={pill}
                                            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${isDark ? (false ? 'border border-[var(--hi-border)] bg-[rgba(24,32,45,0.56)] text-[var(--hi-text-soft)]' : 'border border-white/8 bg-white/5 text-white/78') : (false ? 'border border-[rgba(176,193,216,0.22)] bg-[rgba(255,255,255,0.84)] text-[var(--hi-text-soft)]' : 'border border-[rgba(45,82,65,0.1)] bg-white/75 text-[var(--hi-text-soft)]')}`}
                                        >
                                            {pill}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6">
                                {copy.about.strips.map((strip) => (
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

                                <article
                                    className={`rounded-[1rem] border p-6 md:p-7 ${isDark ? (false ? 'border-[var(--hi-border)] bg-[rgba(22,30,42,0.72)]' : 'border-white/8 bg-white/5') : (false ? 'border-[rgba(176,193,216,0.26)] bg-[rgba(255,255,255,0.84)]' : 'border-[rgba(45,82,65,0.1)] bg-white/75')}`}
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
                                        className={`mt-5 inline-flex items-center gap-2 text-sm font-medium transition ${isDark ? (false ? 'text-[var(--hi-secondary)] hover:text-[var(--hi-accent)]' : 'text-white/72 hover:text-white') : (false ? 'text-[var(--hi-secondary-strong)] hover:text-[var(--hi-accent)]' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]')}`}
                                    >
                                        <Github className="h-4 w-4" />
                                        <span>{copy.about.advanced.link}</span>
                                    </a>
                                </article>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="relative overflow-hidden py-32" style={{ background: ctaBackground }}>
                    <div className={`pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full blur-3xl ${isDark ? (false ? 'bg-[rgba(139,180,255,0.12)]' : 'bg-[rgba(205,176,136,0.12)]') : (false ? 'bg-[rgba(139,180,255,0.14)]' : 'bg-[rgba(184,153,104,0.16)]')}`} />
                    <div className={`pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full blur-3xl ${isDark ? (false ? 'bg-[rgba(103,227,242,0.1)]' : 'bg-[rgba(74,125,100,0.1)]') : (false ? 'bg-[rgba(18,158,154,0.08)]' : 'bg-[rgba(45,82,65,0.1)]')}`} />

                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
                        <div className={`relative rounded-[1rem] px-8 py-14 md:px-12 ${isDark ? (false ? 'border border-[var(--hi-border)] bg-[linear-gradient(135deg,rgba(27,37,52,0.96),rgba(18,25,36,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]' : 'border border-white/6 bg-[linear-gradient(135deg,rgba(41,49,44,0.96),rgba(24,29,26,0.98))] shadow-[0_30px_70px_rgba(0,0,0,0.24)]') : (false ? 'border border-[rgba(176,193,216,0.26)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,253,0.98))] shadow-[0_28px_56px_rgba(19,35,61,0.10)]' : 'border border-[rgba(45,82,65,0.06)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,235,224,0.98))] shadow-[0_28px_56px_rgba(38,48,38,0.10)]')}`}>
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
                                        className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-base font-semibold text-white transition ${false ? 'btn-primary !h-14 !rounded-full !px-8' : 'bg-[#6f9978] hover:bg-[#7aa484]'}`}
                                    >
                                        {copy.hero.primaryCta}
                                    </Link>
                                    <Link
                                        to="/login"
                                        className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-base font-semibold transition ${isDark ? 'border border-white/10 text-white/84 hover:bg-white/6 hover:text-white' : 'border border-[var(--hi-border)] text-[var(--hi-text)] hover:bg-[var(--hi-panel)]'}`}
                                    >
                                        {copy.hero.secondaryCta}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
