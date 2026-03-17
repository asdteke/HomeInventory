import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation, Trans } from 'react-i18next'; // Import Trans
import { useAuth } from '../context/AuthContext';
import {
    Package, Hash, FolderOpen, Layers, Plus, ArrowRight, TrendingUp, Search,
    Lock, Globe, ChevronRight, Wallet
} from 'lucide-react';
import IntroTour from './IntroTour';
import SecureImage from './SecureImage';

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [stats, setStats] = useState(null);
    const [recentItems, setRecentItems] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const [statsRes, itemsRes] = await Promise.all([
                axios.get('/api/items/stats/summary'),
                axios.get('/api/items')
            ]);
            setStats(statsRes.data);
            setAllItems(itemsRes.data.items);
            setRecentItems(itemsRes.data.items.slice(0, 5));
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    // Quick search
    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/items?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    // Filter chips
    const filterChips = [
        { id: 'private', label: t('dashboard.filters.private'), filter: (items) => items.filter(i => i.is_public === 0) },
        { id: 'public', label: t('dashboard.filters.public'), filter: (items) => items.filter(i => i.is_public === 1) },
        ...(stats?.byRoom?.filter(r => r.count > 0).slice(0, 4).map(r => ({
            id: `room-${r.name}`, label: `🚪 ${r.name}`, filter: (items) => items.filter(i => i.room_name === r.name)
        })) || [])
    ];

    const filteredItems = activeFilter
        ? filterChips.find(c => c.id === activeFilter)?.filter(allItems) || []
        : [];

    // Find room with most items
    const topRoom = stats?.byRoom?.reduce((max, room) => room.count > (max?.count || 0) ? room : max, null);

    if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    const statCards = [
        { label: t('dashboard.stats.total_items'), value: stats?.totalItems || 0, icon: Package, color: 'from-blue-500 to-cyan-500', shadow: 'shadow-blue-500/25' },
        { label: t('dashboard.stats.total_quantity'), value: stats?.totalQuantity || 0, icon: Hash, color: 'from-purple-500 to-pink-500', shadow: 'shadow-purple-500/25' },
        { label: t('dashboard.stats.fullest_room'), value: topRoom?.name || '-', subValue: topRoom ? `${topRoom.count} ${t('dashboard.stats.items_suffix')}` : '', icon: FolderOpen, color: 'from-emerald-500 to-teal-500', shadow: 'shadow-emerald-500/25' },
        { label: t('dashboard.stats.category_count'), value: stats?.byCategory?.filter(c => c.count > 0).length || 0, icon: Layers, color: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/25' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Intro Tour for first-time users */}
            <IntroTour />
            {/* Welcome & Quick Search */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                        <Trans i18nKey="dashboard.welcome" values={{ name: user?.username }}>
                            Hoş geldin, <span className="gradient-text">name</span>! 👋
                        </Trans>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.subtitle')}</p>
                </div>

                {/* Quick Search */}
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1 lg:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('dashboard.quick_search')}
                            className="input-field pl-10 py-2.5"
                        />
                    </div>
                    <Link to="/items/new" className="btn-primary flex items-center gap-2 whitespace-nowrap">
                        <Plus className="w-5 h-5" /> <span className="hidden sm:inline">{t('common.new')}</span>
                    </Link>
                </form>
            </div>

            {/* Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                {filterChips.map(chip => (
                    <button
                        key={chip.id}
                        onClick={() => setActiveFilter(activeFilter === chip.id ? null : chip.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap
              ${activeFilter === chip.id
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600'
                            }`}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Filtered Results (when filter active) */}
            {activeFilter && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {filterChips.find(c => c.id === activeFilter)?.label} ({filteredItems.length})
                        </h2>
                        <button onClick={() => setActiveFilter(null)} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                            {t('dashboard.filters.remove')}
                        </button>
                    </div>
                    {filteredItems.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {filteredItems.slice(0, 10).map(item => (
                                <Link key={item.id} to={`/items/${item.id}/edit`} className="group">
                                    <div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2">
                                        {item.photo_path ? (
                                            <SecureImage
                                                src={item.photo_path}
                                                alt={item.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                fallback={<div className="w-full h-full flex items-center justify-center text-3xl opacity-30">{item.category_icon || '📦'}</div>}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">{item.category_icon || '📦'}</div>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.name}</p>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-center py-8">{t('dashboard.filters.no_items')}</p>
                    )}
                </div>
            )}

            {/* Stats Grid - Horizontal scroll on mobile */}
            <div className="flex lg:grid lg:grid-cols-4 gap-4 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible scrollbar-hide">
                {statCards.map((stat, i) => (
                    <div key={i} className="flex-shrink-0 w-[200px] lg:w-auto card p-5 hover:scale-[1.02] transition-transform">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg ${stat.shadow}`}>
                                <stat.icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                                {stat.subValue && <p className="text-xs text-slate-400">{stat.subValue}</p>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Items */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary-500" /> {t('dashboard.recent_items.title')}
                        </h2>
                        <Link to="/items" className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
                            {t('dashboard.recent_items.see_all')} <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {recentItems.length > 0 ? (
                        <div className="space-y-3">
                            {recentItems.map(item => (
                                <Link key={item.id} to={`/items/${item.id}/edit`}
                                    className="flex items-center gap-4 p-3 -mx-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                    <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                                        {item.photo_path ? (
                                            <SecureImage
                                                src={item.photo_path}
                                                alt={item.name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                                fallback={<div className="w-full h-full flex items-center justify-center text-2xl opacity-40">{item.category_icon || '📦'}</div>}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">{item.category_icon || '📦'}</div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-slate-900 dark:text-white truncate">{item.name}</p>
                                            {item.is_public ? <Globe className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> : <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                            {item.room_name && `🚪 ${item.room_name}`}
                                            {item.room_name && item.location_name && ' • '}
                                            {item.location_name && `📍 ${item.location_name}`}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-500 dark:text-slate-400">{t('dashboard.categories.empty')}</p>
                        </div>
                    )}
                </div>

                {/* Categories & Rooms */}
                <div className="space-y-6">
                    {/* Categories */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <Layers className="w-5 h-5 text-primary-500" /> {t('dashboard.categories.title')}
                            </h2>
                            <Link to="/categories" className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
                                {t('dashboard.categories.manage')} <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="space-y-2">
                            {stats?.byCategory?.filter(c => c.count > 0).slice(0, 4).map((cat, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="text-xl w-8">{cat.icon}</span>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-700 dark:text-slate-300">{cat.name}</span>
                                            <span className="text-slate-500 dark:text-slate-400">{cat.count}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{
                                                width: `${Math.max(8, (cat.count / (stats.totalItems || 1)) * 100)}%`,
                                                backgroundColor: cat.color
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!stats?.byCategory || stats.byCategory.every(c => c.count === 0)) && (
                                <p className="text-slate-400 text-center py-4">{t('dashboard.categories.empty')}</p>
                            )}
                        </div>
                    </div>

                    {/* Rooms */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <FolderOpen className="w-5 h-5 text-primary-500" /> {t('dashboard.rooms.title')}
                            </h2>
                            <Link to="/rooms" className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
                                {t('dashboard.rooms.manage')} <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {stats?.byRoom?.filter(r => r.count > 0).slice(0, 4).map((room, i) => (
                                <Link key={i} to={`/items?room=${room.name}`}
                                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 transition-colors">
                                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{room.name}</p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-white">{room.count}</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('dashboard.quick_actions.title')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { to: '/items/new', icon: '➕', label: t('dashboard.quick_actions.add_item') },
                        { to: '/items', icon: '🔍', label: t('dashboard.quick_actions.search_item') },
                        { to: '/categories', icon: '🏷️', label: t('dashboard.quick_actions.categories') },
                        { to: '/settings', icon: '⚙️', label: t('dashboard.quick_actions.settings') },
                    ].map((action, i) => (
                        <Link key={i} to={action.to}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:scale-[1.02] transition-all">
                            <span className="text-2xl">{action.icon}</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{action.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
