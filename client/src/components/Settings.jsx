import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import {
    Settings as SettingsIcon, User, LogOut, Moon, Sun, Shield,
    Save, Key, Copy, Eye, EyeOff, Building, Plus, ArrowRightLeft,
    Database, Download, Upload, Loader2, AlertCircle, CheckCircle,
    X, Home, Users, Edit3
} from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function Settings() {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const [user, setUser] = useState(null);
    const [houses, setHouses] = useState([]);
    const [activeHouseId, setActiveHouseId] = useState(null);
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [houseKey, setHouseKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [houseActionLoading, setHouseActionLoading] = useState(false);

    // Backup states
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    // Modal states
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showJoinHouseModal, setShowJoinHouseModal] = useState(false);
    const [showCreateHouseModal, setShowCreateHouseModal] = useState(false);

    // Join/Create House form states
    const [joinHouseKey, setJoinHouseKey] = useState('');
    const [newHouseName, setNewHouseName] = useState('');
    const [houseError, setHouseError] = useState('');

    // Members state
    const [members, setMembers] = useState([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    // Username change state
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [changingUsername, setChangingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState('');
    const [usernameSuccess, setUsernameSuccess] = useState('');

    useEffect(() => {
        fetchUserData();
        fetchHouses();

        // Listen for house change events
        const handleHouseChange = () => {
            fetchUserData();
            fetchHouses();
        };

        window.addEventListener('houseChanged', handleHouseChange);
        return () => window.removeEventListener('houseChanged', handleHouseChange);
    }, []);

    useEffect(() => {
        if (activeHouseId) {
            fetchHouseKey();
            fetchMembers();
        }
    }, [activeHouseId]);

    const fetchUserData = async () => {
        try {
            const res = await axios.get('/api/auth/me');
            setUser(res.data.user);
            setActiveHouseId(res.data.user.active_house_id);
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const fetchHouses = async () => {
        try {
            const res = await axios.get('/api/houses');
            setHouses(res.data.houses || []);
        } catch (error) {
            console.error('Error fetching houses:', error);
        }
    };

    const fetchHouseKey = async () => {
        try {
            const res = await axios.get('/api/houses/key');
            setHouseKey(res.data.key);
        } catch (error) {
            console.error('Error fetching house key:', error);
        }
    };

    const fetchMembers = async () => {
        setLoadingMembers(true);
        try {
            const res = await axios.get('/api/houses/members');
            setMembers(res.data.members);
        } catch (error) {
            console.error('Error fetching members:', error);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleSwitchHouse = async (houseId) => {
        if (houseId === activeHouseId) return;

        setHouseActionLoading(true);
        try {
            const res = await axios.post('/api/houses/switch', { house_id: houseId });
            setActiveHouseId(houseId);
            setHouseKey(''); // Clear old key
            setMembers([]); // Clear members

            // Dispatch event to update other components
            window.dispatchEvent(new Event('houseChanged'));

            setMessage(t('settings.messages.house_switched', { name: res.data.house.name }));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(t('settings.messages.house_switch_error'));
            setTimeout(() => setError(''), 3000);
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleJoinHouse = async (e) => {
        e.preventDefault();
        setHouseActionLoading(true);
        setHouseError('');

        try {
            await axios.post('/api/houses/join', {
                key: joinHouseKey,
                name: newHouseName
            });

            await fetchHouses();
            setShowJoinHouseModal(false);
            setJoinHouseKey('');
            setNewHouseName('');
            setMessage(t('settings.messages.house_joined_success'));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setHouseError(err.response?.data?.error || t('settings.messages.house_join_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleCreateHouse = async (e) => {
        e.preventDefault();
        setHouseActionLoading(true);
        setHouseError('');

        try {
            const res = await axios.post('/api/houses', {
                name: newHouseName
            });

            // Auto switch to new house
            setActiveHouseId(res.data.house.id);
            await fetchHouses();
            window.dispatchEvent(new Event('houseChanged'));

            setShowCreateHouseModal(false);
            setNewHouseName('');
            setMessage(t('settings.messages.house_created_success', { name: res.data.house.name }));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setHouseError(err.response?.data?.error || t('settings.messages.house_create_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleLeaveHouse = async (houseToLeave) => {
        if (!confirm(t('settings.messages.house_leave_confirm', { name: houseToLeave.name }))) return;

        setHouseActionLoading(true);
        try {
            await axios.post(`/api/houses/${houseToLeave.id}/leave`);

            // If we left the active house, refresh to get the new active house (backend logic handles fallback)
            if (houseToLeave.id === activeHouseId) {
                const res = await axios.get('/api/auth/me');
                setActiveHouseId(res.data.user.active_house_id);
                window.dispatchEvent(new Event('houseChanged'));
            }

            await fetchHouses();
            setMessage(t('settings.messages.house_left_success'));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || t('settings.messages.house_left_error'));
            setTimeout(() => setError(''), 3000);
        } finally {
            setHouseActionLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(houseKey);
        // Show temporary success indicator?
    };

    const downloadBackup = async () => {
        setDownloading(true);
        try {
            const response = await axios.get('/api/backup/export');
            const data = response.data;

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            setMessage(t('settings.messages.backup_downloaded', { count: data.items.length }));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(t('settings.messages.export_error'));
        } finally {
            setDownloading(false);
        }
    };

    const handleRestoreBackup = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);

                // Validate basic structure
                if (!jsonData.items || !Array.isArray(jsonData.items)) {
                    throw new Error(t('settings.messages.import_invalid_format'));
                }

                const res = await axios.post('/api/backup/import', jsonData);

                setMessage(t('settings.messages.import_success', {
                    items: res.data.imported.items,
                    categories: res.data.imported.categories,
                    rooms: res.data.imported.rooms,
                    locations: res.data.imported.locations
                }));
                setTimeout(() => setMessage(''), 5000);

                // Refresh data if needed (optional since we're in settings)
            } catch (err) {
                console.error('Import error:', err);
                setError(t('settings.messages.import_error', { error: err.message }));
            } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError(t('settings.messages.passwords_mismatch'));
            setLoading(false);
            return;
        }

        if (formData.newPassword.length < 6) {
            setError(t('settings.messages.password_min_len'));
            setLoading(false);
            return;
        }

        try {
            await axios.put('/api/auth/password', {
                currentPassword: formData.currentPassword,
                newPassword: formData.newPassword
            });
            setMessage(t('settings.messages.password_changed'));
            setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowPasswordModal(false);
        } catch (err) {
            if (err.response) {
                setError(err.response.data.error || t('settings.messages.server_error'));
            } else {
                setError(t('settings.messages.connection_error'));
            }
        } finally {
            setLoading(false);
        }
    };

    const openUsernameModal = () => {
        setNewUsername(user?.username || '');
        setUsernameError('');
        setUsernameSuccess('');
        setShowUsernameModal(true);
    };

    const closeUsernameModal = () => {
        setShowUsernameModal(false);
        setUsernameError('');
        setUsernameSuccess('');
    };

    const handleUsernameChange = async (e) => {
        e.preventDefault();
        setChangingUsername(true);
        setUsernameError('');
        setUsernameSuccess('');

        try {
            const res = await axios.put('/api/auth/profile', { username: newUsername });
            setUser(prev => ({ ...prev, username: res.data.user.username }));
            setUsernameSuccess(t('settings.messages.username_changed'));

            // Update global user state if it exists (via context or reload)
            // For now just update local state and close modal after delay
            setTimeout(() => {
                closeUsernameModal();
            }, 1000);
        } catch (err) {
            setUsernameError(err.response?.data?.error || t('settings.messages.username_error'));
        } finally {
            setChangingUsername(false);
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post('/api/auth/logout');
            window.location.href = '/login';
        } catch (err) {
            console.error('Logout failed', err);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in pb-20">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('settings.title')}</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{t('settings.subtitle')}</p>

            {message && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl flex items-center gap-3 text-green-700 dark:text-green-400">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    {message}
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl flex items-center gap-3 text-red-700 dark:text-red-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* User Profile Section */}
            <div className="card mb-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center text-2xl font-bold text-primary-600 dark:text-primary-400">
                        {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user?.username}</h2>
                        <p className="text-slate-500 dark:text-slate-400">{user?.email}</p>
                    </div>
                    <button
                        onClick={openUsernameModal}
                        className="ml-auto p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title={t('settings.user_profile.edit_username')}
                    >
                        <Edit3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            {/* My Houses Section */}
            <div className="card mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Building className="w-5 h-5 text-primary-500" />
                        {t('settings.my_houses.title')}
                    </h2>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => setShowJoinHouseModal(true)}
                            className="btn-secondary py-2.5 px-3 text-sm flex-1 sm:flex-none flex items-center justify-center gap-2"
                        >
                            <Users className="w-4 h-4" />
                            <span className="hidden xs:inline">{t('settings.my_houses.join_house')}</span>
                            <span className="xs:hidden">{t('settings.my_houses.join_short')}</span>
                        </button>
                        <button
                            onClick={() => setShowCreateHouseModal(true)}
                            className="btn-primary py-2.5 px-3 text-sm flex-1 sm:flex-none flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden xs:inline">{t('settings.my_houses.new_house')}</span>
                            <span className="xs:hidden">{t('settings.my_houses.new_short')}</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {houses.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">{t('settings.my_houses.no_house')}</p>
                    ) : (
                        houses.map(house => (
                            <div
                                key={house.id}
                                className={`flex items-center justify-between p-4 rounded-xl border transition-all
                                    ${house.id === activeHouseId
                                        ? 'bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/30'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center 
                                        ${house.id === activeHouseId
                                            ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                        }`}
                                    >
                                        <Home className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className={`font-semibold ${house.id === activeHouseId ? 'text-primary-700 dark:text-primary-400' : 'text-slate-900 dark:text-white'}`}>
                                                {house.name}
                                            </h3>
                                            {house.role === 'owner' && (
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                                    {t('settings.my_houses.owner')}
                                                </span>
                                            )}
                                            {house.id === activeHouseId && (
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">
                                                    {t('settings.my_houses.active')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            <span>{t('settings.my_houses.member_count', { count: house.member_count })}</span>
                                            <span>•</span>
                                            <span>{t('settings.my_houses.item_count', { count: house.item_count })}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {house.id !== activeHouseId && (
                                        <button
                                            onClick={() => handleSwitchHouse(house.id)}
                                            disabled={houseActionLoading}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            {t('settings.my_houses.switch')}
                                        </button>
                                    )}
                                    {/* Always allow leaving unless it's the last house, maybe check that logic later */}
                                    {houses.length > 0 && (
                                        <button
                                            onClick={() => handleLeaveHouse(house)}
                                            disabled={houseActionLoading}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                            title={t('settings.my_houses.leave')}
                                        >
                                            <LogOut className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-3 px-1">
                    {t('settings.my_houses.info')}
                </p>
            </div>

            {/* House Key & Members */}
            {activeHouseId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Key Card */}
                    <div className="card">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Key className="w-5 h-5 text-indigo-500" />
                            {t('settings.house_info.title')}
                        </h2>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('settings.house_info.key_label')}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowKey(!showKey)}
                                        className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700"
                                    >
                                        {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        {showKey ? t('settings.house_info.hide') : t('settings.house_info.show')}
                                    </button>
                                    <button
                                        onClick={copyToClipboard}
                                        className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700"
                                    >
                                        <Copy className="w-3 h-3" />
                                        {t('settings.house_info.copy')}
                                    </button>
                                </div>
                            </div>
                            <code className="block w-full p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 font-mono text-sm break-all text-slate-600 dark:text-slate-400">
                                {showKey ? houseKey : t('settings.house_info.mask_key', { suffix: houseKey.slice(-8) })}
                            </code>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                            {t('settings.house_info.share_info')}
                        </p>
                    </div>

                    {/* Members Card */}
                    <div className="card">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-pink-500" />
                            {t('settings.house_info.members_title', { count: members.length })}
                        </h2>

                        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                            {members.map(member => (
                                <div key={member.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                        {member.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                            {member.username}
                                            {member.id === user?.id && <span className="text-slate-400 font-normal ml-1">{t('settings.house_info.you')}</span>}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {member.created_at ? t('settings.house_info.joined_at', { date: new Date(member.created_at) }) : '-'}
                                        </p>
                                    </div>
                                    {member.role === 'owner' && (
                                        <Shield className="w-4 h-4 text-amber-500" />
                                    )}
                                </div>
                            ))}
                            {members.length === 1 && (
                                <p className="text-sm text-slate-500 text-center py-4">{t('settings.house_info.no_members')}</p>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button className="w-full py-2 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg flex items-center justify-center gap-2" onClick={() => setShowKey(true)}>
                                <Plus className="w-4 h-4" />
                                {t('settings.house_info.invite_title')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Theme & Security Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        {theme === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                        {t('settings.theme.title')}
                    </h2>
                    <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                            onClick={() => setTheme('light')}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2
                                ${theme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Sun className="w-4 h-4" /> {t('settings.theme.light')}
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2
                                ${theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Moon className="w-4 h-4" /> {t('settings.theme.dark')}
                        </button>
                    </div>
                </div>

                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-green-500" />
                        {t('settings.security.title')}
                    </h2>
                    <button
                        onClick={() => setShowPasswordModal(true)}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                    >
                        <div className="text-left">
                            <p className="font-medium text-slate-900 dark:text-white">{t('settings.security.change_password')}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.security.change_password_desc')}</p>
                        </div>
                        <ArrowRightLeft className="w-5 h-5 text-slate-400 group-hover:text-primary-500 transition-colors" />
                    </button>
                </div>
            </div>

            {/* Data Management Section */}
            <div className="card mb-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-500" />
                    {t('settings.data_management.title')}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={downloadBackup} disabled={downloading} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        </div>
                        <div>
                            <p className="font-medium text-slate-900 dark:text-white">{t('settings.data_management.download_backup')}</p>
                            <p className="text-xs text-slate-500">{t('settings.data_management.export_json')}</p>
                        </div>
                    </button>

                    <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        </div>
                        <div>
                            <p className="font-medium text-slate-900 dark:text-white">{t('settings.data_management.upload_backup')}</p>
                            <p className="text-xs text-slate-500">{t('settings.data_management.import_json')}</p>
                        </div>
                    </button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleRestoreBackup} accept=".json" className="hidden" />
            </div>

            {/* Logout Button */}
            <button onClick={handleLogout} className="w-full py-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2">
                <LogOut className="w-5 h-5" />
                {t('common.logout')}
            </button>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)} />
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('settings.modals.password.title')}</h2>
                            <button onClick={() => setShowPasswordModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('settings.modals.password.current')}</label>
                                <input type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange} className="input-field" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('settings.modals.password.new')}</label>
                                <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} className="input-field" required minLength="6" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('settings.modals.password.confirm')}</label>
                                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="input-field" required minLength="6" />
                            </div>
                            <div className="pt-2">
                                <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {loading ? t('settings.modals.password.changing') : t('settings.modals.password.submit')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Join House Modal */}
            {showJoinHouseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowJoinHouseModal(false)} />
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('settings.modals.join_house.title')}</h2>
                            </div>
                            <button onClick={() => setShowJoinHouseModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleJoinHouse} className="p-6 space-y-4">
                            {houseError && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{houseError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <Key className="w-4 h-4 inline mr-1" />
                                    {t('settings.house_info.key_label')}
                                </label>
                                <input
                                    type="text"
                                    value={joinHouseKey}
                                    onChange={(e) => setJoinHouseKey(e.target.value)}
                                    className="input-field font-mono"
                                    placeholder={t('settings.modals.join_house.key_placeholder')}
                                    required
                                />
                                <p className="text-xs text-slate-400 mt-1">{t('settings.modals.join_house.key_help')}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <Home className="w-4 h-4 inline mr-1" />
                                    {t('settings.modals.join_house.name_label')}
                                </label>
                                <input
                                    type="text"
                                    value={newHouseName}
                                    onChange={(e) => setNewHouseName(e.target.value)}
                                    className="input-field"
                                    placeholder={t('settings.modals.join_house.name_placeholder')}
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="submit" disabled={houseActionLoading || !joinHouseKey.trim()} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {houseActionLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {houseActionLoading ? t('settings.modals.join_house.joining') : t('settings.modals.join_house.submit')}
                                </button>
                                <button type="button" onClick={() => setShowJoinHouseModal(false)} className="btn-secondary py-3 px-6">{t('common.cancel')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create House Modal */}
            {showCreateHouseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateHouseModal(false)} />
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('settings.modals.create_house.title')}</h2>
                            </div>
                            <button onClick={() => setShowCreateHouseModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateHouse} className="p-6 space-y-4">
                            {houseError && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{houseError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <Home className="w-4 h-4 inline mr-1" />
                                    {t('settings.modals.create_house.name_label')}
                                </label>
                                <input
                                    type="text"
                                    value={newHouseName}
                                    onChange={(e) => setNewHouseName(e.target.value)}
                                    className="input-field"
                                    placeholder={t('settings.modals.create_house.name_placeholder')}
                                />
                                <p className="text-xs text-slate-400 mt-1">{t('settings.modals.create_house.name_help')}</p>
                            </div>

                            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
                                <p className="text-sm text-amber-700 dark:text-amber-400">
                                    {t('settings.modals.create_house.info')}
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="submit" disabled={houseActionLoading} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {houseActionLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {houseActionLoading ? t('settings.modals.create_house.creating') : t('settings.modals.create_house.submit')}
                                </button>
                                <button type="button" onClick={() => setShowCreateHouseModal(false)} className="btn-secondary py-3 px-6">{t('common.cancel')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Username Change Modal */}
            {showUsernameModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeUsernameModal} />
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                                    <Edit3 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('settings.modals.username.title')}</h2>
                            </div>
                            <button onClick={closeUsernameModal} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleUsernameChange} className="p-6 space-y-4">
                            {usernameError && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{usernameError}
                                </div>
                            )}
                            {usernameSuccess && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-600 dark:text-green-400 text-sm">
                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />{usernameSuccess}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {t('settings.modals.username.new_label')}
                                </label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="input-field"
                                    placeholder={t('settings.modals.username.placeholder')}
                                    minLength={3}
                                    maxLength={30}
                                    required
                                />
                                <p className="text-xs text-slate-400 mt-1">{t('settings.modals.username.help')}</p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="submit" disabled={changingUsername || newUsername === user?.username} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {changingUsername && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {changingUsername ? t('settings.modals.username.saving') : t('settings.modals.username.submit')}
                                </button>
                                <button type="button" onClick={closeUsernameModal} className="btn-secondary py-3 px-6">{t('common.cancel')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Uygulama Hakkında */}
            <div className="card mb-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    {t('settings.about.title')}
                </h2>
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-400">{t('settings.about.version')}</span>
                        <span className="font-medium text-slate-900 dark:text-white">1.0.0</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-400">{t('settings.about.brand')}</span>
                        <div className="flex items-center">
                            <BrandLogo variant="symbol" size="sm" className="sm:hidden w-auto max-h-[42px]" />
                            <BrandLogo variant="full" size="sm" className="hidden sm:block w-auto max-h-[44px]" />
                        </div>
                    </div>
                    <div className="pt-2">
                        <a
                            href="mailto:support@homeinventory.local?subject=Geri Bildirim - HomeInventory"
                            className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
                        >
                            {t('settings.about.feedback')}
                        </a>
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500 mt-2">
                            support@homeinventory.local
                        </p>
                    </div>
                </div>
            </div>

            {/* App Info Footer */}
            <div className="text-center text-sm text-slate-400 dark:text-slate-600 pb-8">
                <p>{t('common.copyright', { year: new Date().getFullYear() })}</p>
            </div>
        </div>
    );
}
