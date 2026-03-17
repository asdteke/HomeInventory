import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard, Users, Activity, Mail, Shield,
    Search, Ban, CheckCircle, XCircle, AlertTriangle,
    Server, RefreshCw, Send, Lock, Trash2
} from 'lucide-react';

const AdminPanel = () => {
    const { t } = useTranslation();
    const { isAdmin, user } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState({ adminLogs: [], errorLogs: [] });
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Email State
    const [emailForm, setEmailForm] = useState({ to: '', subject: '', message: '' });
    const [emailStatus, setEmailStatus] = useState({ type: null, message: '' });
    const [sending, setSending] = useState(false);

    // Redirect non-admin
    if (!isAdmin) return <Navigate to="/" replace />;

    const fetchData = async () => {
        setRefreshing(true);
        try {
            if (activeTab === 'dashboard') {
                const res = await axios.get('/api/admin/stats');
                setStats(res.data.stats);
            } else if (activeTab === 'users') {
                const res = await axios.get('/api/admin/users');
                setUsers(res.data.users);
            } else if (activeTab === 'logs') {
                const res = await axios.get('/api/admin/logs');
                setLogs(res.data);
            }
        } catch (error) {
            console.error('Data fetch error:', error);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleBanUser = async (userId, currentBanStatus) => {
        const actionText = currentBanStatus ? t('admin.users.ban_lift') : t('admin.users.ban_apply');
        if (!window.confirm(t('admin.users.confirm_ban', { status: actionText }))) return;

        try {
            await axios.post(`/api/admin/users/${userId}/ban`, { ban: !currentBanStatus });
            fetchData(); // Refresh list
        } catch (error) {
            alert(error.response?.data?.error || t('common.error'));
        }
    };

    const handleDeleteUser = async (userId, username) => {
        // 3 aşamalı onay
        if (!window.confirm(t('admin.users.confirm_delete_1', { username }))) return;
        if (!window.confirm(t('admin.users.confirm_delete_2', { username }))) return;
        if (!window.confirm(t('admin.users.confirm_delete_3', { username }))) return;

        try {
            const res = await axios.delete(`/api/admin/users/${userId}`);
            alert(res.data.message);
            fetchData(); // Listeyi yenile
        } catch (error) {
            alert(error.response?.data?.error || t('common.error'));
        }
    };

    const handleSendEmail = async (e) => {
        e.preventDefault();
        setSending(true);
        setEmailStatus({ type: null, message: '' });

        try {
            const res = await axios.post('/api/admin/email/send', emailForm);
            setEmailStatus({ type: 'success', message: t('admin.email.success') });
            setEmailForm({ to: '', subject: '', message: '' });
        } catch (error) {
            setEmailStatus({ type: 'error', message: error.response?.data?.error || t('admin.email.error') });
        } finally {
            setSending(false);
        }
    };

    // Components
    const StatCard = ({ title, value, subtext, icon: Icon, color }) => (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
            <div className={`absolute top-0 right-0 p-4 opacity-10 ${color}`}>
                <Icon size={48} />
            </div>
            <div className="relative z-10">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">{value}</h3>
                {subtext && <p className="text-xs text-slate-400 dark:text-slate-500">{subtext}</p>}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-500 rounded-xl text-white shadow-lg shadow-red-500/20">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('admin.title')}</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('admin.subtitle')}</p>
                    </div>
                </div>

                <button
                    onClick={fetchData}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    <span>{t('admin.refresh')}</span>
                </button>
            </div>

            {/* Mobile-First Tabs */}
            <div className="flex overflow-x-auto pb-2 gap-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                {[
                    { id: 'dashboard', label: t('admin.tabs.dashboard'), icon: LayoutDashboard },
                    { id: 'users', label: t('admin.tabs.users'), icon: Users },
                    { id: 'logs', label: t('admin.tabs.logs'), icon: Activity },
                    { id: 'email', label: t('admin.tabs.email'), icon: Mail },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-2 px-4 py-3 rounded-xl whitespace-nowrap transition-all font-medium
                            ${activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }
                        `}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* CONTENT AREA */}
            <div className="bg-slate-50 dark:bg-slate-900/50 min-h-[400px]">

                {/* DASHBOARD TAB */}
                {activeTab === 'dashboard' && stats && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title={t('admin.stats.total_users')}
                            value={stats.users.total}
                            subtext={t('admin.stats.new_today', { count: stats.users.new_today })}
                            icon={Users}
                            color="text-blue-500"
                        />
                        <StatCard
                            title={t('admin.stats.total_inventory')}
                            value={stats.inventory.items}
                            subtext={t('admin.stats.inventory_details', { rooms: stats.inventory.rooms, categories: stats.inventory.categories })}
                            icon={Server}
                            color="text-indigo-500"
                        />
                        <StatCard
                            title={t('admin.stats.banned_users')}
                            value={stats.users.banned}
                            subtext={t('admin.stats.access_blocked')}
                            icon={Ban}
                            color="text-red-500"
                        />
                        <StatCard
                            title={t('admin.stats.server_memory')}
                            value={`%${stats.server.memory_percent}`}
                            subtext={t('admin.stats.uptime', { hours: stats.server.uptime_hours })}
                            icon={Activity}
                            color="text-green-500"
                        />
                    </div>
                )}

                {/* USERS TAB */}
                {activeTab === 'users' && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="p-4 font-medium">{t('admin.users.user')}</th>
                                        <th className="p-4 font-medium">{t('admin.users.role')}</th>
                                        <th className="p-4 font-medium">{t('admin.users.status')}</th>
                                        <th className="p-4 font-medium text-right">{t('admin.users.action')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {users.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-900 dark:text-white">{u.username}</div>
                                                <div className="text-slate-500 text-xs">{u.email}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${u.role === 'admin'
                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {u.is_banned ? (
                                                    <span className="flex items-center gap-1 text-red-600 text-xs font-medium"><XCircle size={14} /> {t('admin.users.banned')}</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle size={14} /> {t('admin.users.active')}</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {u.role !== 'admin' && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleBanUser(u.id, u.is_banned)}
                                                            className={`p-2 rounded-lg transition-colors ${u.is_banned
                                                                ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                                                                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400'
                                                                }`}
                                                            title={u.is_banned ? t('admin.users.unban') : t('admin.users.ban')}
                                                        >
                                                            {u.is_banned ? <CheckCircle size={16} /> : <Ban size={16} />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUser(u.id, u.username)}
                                                            className="p-2 rounded-lg transition-colors bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                                                            title={t('admin.users.delete')}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* LOGS TAB */}
                {activeTab === 'logs' && (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <Shield size={18} className="text-indigo-500" />
                                {t('admin.logs.title')}
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                {logs.adminLogs.length === 0 ? (
                                    <p className="p-4 text-slate-500 text-sm">{t('admin.logs.no_logs')}</p>
                                ) : logs.adminLogs.map(log => (
                                    <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                        <div className={`mt-1 p-1.5 rounded-full ${log.action === 'ban' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            <Activity size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {log.action.toUpperCase()} <span className="text-slate-400 font-normal">• {log.type}</span>
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">{log.details}</p>
                                            <p className="text-[10px] text-slate-400 mt-1">{t('admin.logs.date_fmt', { date: new Date(log.created_at) })}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <AlertTriangle size={18} className="text-orange-500" />
                                {t('admin.logs.errors_title')}
                            </div>
                            <div className="bg-slate-900 p-4 overflow-x-auto">
                                <pre className="text-xs text-green-400 font-mono">
                                    {logs.errorLogs.map((err, i) => (
                                        <div key={i} className="mb-2 pb-2 border-b border-white/10 last:border-0">
                                            <span className="text-slate-500">[{err.timestamp}]</span> {err.error}
                                        </div>
                                    ))}
                                    {logs.errorLogs.length === 0 && <span className="text-slate-500">{t('admin.logs.no_errors')}</span>}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}

                {/* EMAIL TAB */}
                {activeTab === 'email' && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-w-2xl mx-auto">
                        <div className="p-6">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Mail size={20} className="text-indigo-500" />
                                {t('admin.email.title')}
                            </h2>

                            {emailStatus.type && (
                                <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${emailStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                    }`}>
                                    {emailStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                                    <p className="text-sm font-medium">{emailStatus.message}</p>
                                </div>
                            )}

                            <form onSubmit={handleSendEmail} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.email.to')}</label>
                                    <input
                                        type="email"
                                        required
                                        value={emailForm.to}
                                        onChange={e => setEmailForm({ ...emailForm, to: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        placeholder="ornek@email.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.email.subject')}</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={200}
                                        value={emailForm.subject}
                                        onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        placeholder={t('admin.email.title')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('admin.email.message')}</label>
                                    <textarea
                                        required
                                        rows={6}
                                        value={emailForm.message}
                                        onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 resize-none"
                                        placeholder={t('admin.email.placeholder_message')}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={sending}
                                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {sending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
                                    {sending ? t('admin.email.sending') : t('admin.email.send')}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPanel;
