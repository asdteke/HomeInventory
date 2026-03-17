import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, googleLogin } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Handle Google Login Callback
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            setLoading(true);
            googleLogin(token)
                .then(() => navigate('/'))
                .catch(err => {
                    console.error(err);
                    setError(t('common.error'));
                    setLoading(false);
                });
        }
    }, [searchParams, googleLogin, navigate, t]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try { await login(username, password); }
        catch (err) { setError(err.response?.data?.error || t('common.error')); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            {/* Theme Toggle & Language Switcher */}
            <div className="absolute top-4 right-4 flex gap-2">
                <LanguageSwitcher className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm" />
                <button onClick={toggleTheme} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:scale-110 transition-all shadow-sm">
                    {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
            </div>

            <div className="w-full max-w-md">
                <div className="text-center mb-8 animate-fade-in">
                    <Link to="/">
                        <BrandLogo variant="full" size="md" className="mx-auto w-auto mb-4 max-h-[76px]" />
                    </Link>
                    <h1 className="text-3xl font-bold gradient-text mb-2">{t('auth.login.welcome')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('auth.login.subtitle')}</p>
                </div>

                <div className="card animate-slide-up">
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">{t('auth.login.title')}</h2>
                    {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6">{error}</div>}

                    {/* Google Login */}
                    <div className="mb-6">
                        <a href="/api/auth/google" className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200 font-medium shadow-sm group">
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            {t('auth.login.google_continue')}
                        </a>

                        <div className="relative mt-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-300 dark:border-slate-700"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-slate-50 dark:bg-slate-950 text-slate-500">{t('auth.login.or')}</span>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.login.username_or_email')}</label>
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" placeholder="örn: ahmet" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('auth.login.password')}</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pr-12" placeholder="••••••••" required />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-lg disabled:opacity-50">
                            {loading ? <span className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{t('auth.login.submitting')}</span> : t('auth.login.submit')}
                        </button>
                    </form>


                    <div className="mt-6 text-center">
                        <p className="text-slate-500 dark:text-slate-400">{t('auth.login.no_account')} <Link to="/register" className="text-primary-500 hover:text-primary-600 font-medium">{t('auth.login.register_link')}</Link></p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            {t('auth.login.support_contact')} <a href="mailto:support@homeinventory.local" className="text-primary-500 hover:underline">support@homeinventory.local</a>
                        </p>
                    </div>

                    {/* Kullanım Şartları ve Sorumluluk Reddi */}
                    <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">{t('auth.login.terms_title')}</h3>
                        <div className="text-xs text-amber-700 dark:text-amber-400 space-y-2">
                            <p>
                                {t('auth.login.terms_beta')}
                            </p>
                            <p>
                                {t('auth.login.terms_disclaimer')}
                            </p>
                            <p>
                                {t('auth.login.terms_backup')}
                            </p>
                            <p className="text-amber-600 dark:text-amber-300 font-medium">
                                {t('auth.login.terms_accept')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
