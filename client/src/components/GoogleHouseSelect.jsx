import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import axios from 'axios';
import { Sun, Moon, Home, Users, Key, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';

export default function GoogleHouseSelect() {
    const { t } = useTranslation();
    const [mode, setMode] = useState(null); // 'create' or 'join'
    const [houseKey, setHouseKey] = useState('');
    const [houseName, setHouseName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { googleLogin } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [token, setTokenState] = useState(null);

    // Read token from URL fragment (hash) for security — never sent in referrer/logs
    useEffect(() => {
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const t = params.get('token');
            if (t) {
                // Immediately clear token from URL to minimize exposure
                window.history.replaceState(null, '', window.location.pathname);
                setTokenState(t);
                return;
            }
        }
        navigate('/login');
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // First set the token for axios
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            const response = await axios.post('/api/auth/google-complete', {
                mode,
                house_key: mode === 'join' ? houseKey : undefined,
                house_name: houseName || undefined
            });

            // Login with the new token
            await googleLogin(response.data.token);
            navigate('/');
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || t('common.error') || 'İşlem sırasında hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            {/* Theme Toggle */}
            <button onClick={toggleTheme} className="absolute top-4 right-4 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:scale-110 transition-all shadow-sm">
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="w-full max-w-md">
                <div className="text-center mb-8 animate-fade-in">
                    <Link to="/">
                        <BrandLogo variant="full" size="md" className="mx-auto w-auto mb-4 max-h-[76px]" />
                    </Link>
                    <h1 className="text-3xl font-bold gradient-text mb-2">{t('google_house_select.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('google_house_select.subtitle')}</p>
                </div>

                <div className="card animate-slide-up">
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {!mode ? (
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">{t('google_house_select.welcome_options')}</h2>

                            <button
                                onClick={() => setMode('create')}
                                className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-500 dark:hover:border-primary-500 bg-white dark:bg-slate-800 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                        <Home className="w-6 h-6" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="font-semibold text-slate-900 dark:text-white">{t('google_house_select.create.title')}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('google_house_select.create.desc')}</p>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => setMode('join')}
                                className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-500 dark:hover:border-primary-500 bg-white dark:bg-slate-800 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="font-semibold text-slate-900 dark:text-white">{t('google_house_select.join.title')}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('google_house_select.join.desc')}</p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="flex items-center gap-3 mb-4">
                                <button
                                    type="button"
                                    onClick={() => { setMode(null); setError(''); }}
                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                                >
                                    ← {t('google_house_select.back')}
                                </button>
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    {mode === 'create' ? t('google_house_select.create.title') : t('google_house_select.join.title')}
                                </h2>
                            </div>

                            {mode === 'create' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        <Home className="w-4 h-4 inline mr-1" />
                                        {t('google_house_select.house_name')}
                                    </label>
                                    <input
                                        type="text"
                                        value={houseName}
                                        onChange={(e) => setHouseName(e.target.value)}
                                        className="input-field"
                                        placeholder={t('google_house_select.house_name_placeholder')}
                                    />
                                    <p className="text-xs text-slate-400 mt-2">
                                        {t('google_house_select.house_name_hint')}
                                    </p>
                                </div>
                            )}

                            {mode === 'join' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            <Key className="w-4 h-4 inline mr-1" />
                                            {t('google_house_select.house_key')}
                                        </label>
                                        <input
                                            type="text"
                                            value={houseKey}
                                            onChange={(e) => setHouseKey(e.target.value)}
                                            className="input-field font-mono"
                                            placeholder={t('google_house_select.house_key_placeholder')}
                                            required
                                        />
                                        <p className="text-xs text-slate-400 mt-2">
                                            {t('google_house_select.house_key_hint')}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            <Home className="w-4 h-4 inline mr-1" />
                                            {t('google_house_select.house_name_join')}
                                        </label>
                                        <input
                                            type="text"
                                            value={houseName}
                                            onChange={(e) => setHouseName(e.target.value)}
                                            className="input-field"
                                            placeholder={t('google_house_select.house_name_placeholder')}
                                        />
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                disabled={loading || (mode === 'join' && !houseKey)}
                                className="btn-primary w-full py-3 text-lg disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                {loading ? t('google_house_select.processing') : (mode === 'create' ? t('google_house_select.submit_create') : t('google_house_select.submit_join'))}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
