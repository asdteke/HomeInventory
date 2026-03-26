import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import {
    Settings as SettingsIcon, User, LogOut, Moon, Sun, Shield, ShieldCheck,
    Save, Key, Copy, Eye, EyeOff, Building, Plus, ArrowRightLeft,
    Database, Download, Upload, Loader2, AlertCircle, CheckCircle,
    X, Home, Users, Edit3, UserX, Smartphone, Trash2
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import RecoveryKeyModal from './RecoveryKeyModal';
import TwoFactorSetup from './TwoFactorSetup';
import { copyTextToClipboard } from '../utils/clipboard';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';

export default function Settings() {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const { refreshUser } = useAuth();
    const [user, setUser] = useState(null);
    const [passwordRecoveryMode, setPasswordRecoveryMode] = useState('email');
    const [hasRecoveryKey, setHasRecoveryKey] = useState(false);
    const [houses, setHouses] = useState([]);
    const [userPendingRequests, setUserPendingRequests] = useState([]);
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
    const [showRecoveryKeyRegenerateModal, setShowRecoveryKeyRegenerateModal] = useState(false);
    const [recoveryKeyPassword, setRecoveryKeyPassword] = useState('');
    const [recoveryKeyLoading, setRecoveryKeyLoading] = useState(false);
    const [displayRecoveryKey, setDisplayRecoveryKey] = useState('');
    const [currentRecoveryKey, setCurrentRecoveryKey] = useState('');
    const [showStoredRecoveryKey, setShowStoredRecoveryKey] = useState(false);

    // Join/Create House form states
    const [joinHouseKey, setJoinHouseKey] = useState('');
    const [newHouseName, setNewHouseName] = useState('');
    const [houseError, setHouseError] = useState('');

    // Members state
    const [members, setMembers] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [viewerCanManageMembers, setViewerCanManageMembers] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [memberActionLoading, setMemberActionLoading] = useState('');

    // Username change state
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [changingUsername, setChangingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState('');
    const [usernameSuccess, setUsernameSuccess] = useState('');

    // Two-Factor Authentication state
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [show2FADisableModal, setShow2FADisableModal] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [disableMethod, setDisableMethod] = useState('totp'); // totp, backup, recovery
    const [disableLoading, setDisableLoading] = useState(false);
    const [disableError, setDisableError] = useState('');
    const [backupCodesResult, setBackupCodesResult] = useState(null);
    const [regeneratePassword, setRegeneratePassword] = useState('');
    const [regenerateLoading, setRegenerateLoading] = useState(false);
    const [revokeLoading, setRevokeLoading] = useState(false);

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
        } else {
            setHouseKey('');
            setMembers([]);
            setPendingRequests([]);
            setViewerCanManageMembers(false);
        }
    }, [activeHouseId]);

    useEffect(() => {
        if (passwordRecoveryMode === 'recovery_key' && hasRecoveryKey) {
            fetchCurrentRecoveryKey();
            return;
        }

        setCurrentRecoveryKey('');
        setShowStoredRecoveryKey(false);
    }, [passwordRecoveryMode, hasRecoveryKey]);

    const fetchUserData = async () => {
        try {
            const res = await axios.get('/api/auth/me');
            setUser(res.data.user);
            setActiveHouseId(res.data.user.active_house_id);
            setPasswordRecoveryMode(res.data.password_recovery_mode || 'email');
            setHasRecoveryKey(Boolean(res.data.has_recovery_key));
            setTotpEnabled(Boolean(res.data.totp_enabled));
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const fetchHouses = async () => {
        try {
            const res = await axios.get('/api/houses');
            setHouses(res.data.houses || []);
            setUserPendingRequests(res.data.pendingRequests || []);
        } catch (error) {
            console.error('Error fetching houses:', error);
        }
    };

    const fetchCurrentRecoveryKey = async () => {
        try {
            const res = await axios.get('/api/auth/recovery-key/current');
            setCurrentRecoveryKey(res.data.recoveryKey || '');
        } catch (requestError) {
            console.error('Error fetching recovery key:', requestError);
            setCurrentRecoveryKey('');
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
            setPendingRequests(res.data.pendingRequests || []);
            setViewerCanManageMembers(Boolean(res.data.viewerCanManageMembers));
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
            await refreshUser();
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
            await refreshUser();
            setShowJoinHouseModal(false);
            setJoinHouseKey('');
            setNewHouseName('');
            setMessage(t('settings.messages.house_request_sent_success'));
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
            await refreshUser();
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
            await refreshUser();

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

    const handleApproveRequest = async (requestId) => {
        setMemberActionLoading(`approve-${requestId}`);
        try {
            await axios.post(`/api/houses/requests/${requestId}/approve`);
            await fetchMembers();
            await fetchHouses();
            setMessage(t('settings.messages.request_approved'));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || t('settings.messages.request_action_error'));
            setTimeout(() => setError(''), 3000);
        } finally {
            setMemberActionLoading('');
        }
    };

    const handleRejectRequest = async (requestId) => {
        setMemberActionLoading(`reject-${requestId}`);
        try {
            await axios.post(`/api/houses/requests/${requestId}/reject`);
            await fetchMembers();
            await fetchHouses();
            setMessage(t('settings.messages.request_rejected'));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || t('settings.messages.request_action_error'));
            setTimeout(() => setError(''), 3000);
        } finally {
            setMemberActionLoading('');
        }
    };

    const handleKickMember = async (member) => {
        if (!confirm(t('settings.messages.member_kick_confirm', { name: member.username }))) return;

        setMemberActionLoading(`kick-${member.id}`);
        try {
            await axios.post(`/api/houses/members/${member.id}/kick`);
            await fetchMembers();
            setMessage(t('settings.messages.member_kicked'));
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || t('settings.messages.member_kick_error'));
            setTimeout(() => setError(''), 3000);
        } finally {
            setMemberActionLoading('');
        }
    };

    const copyToClipboard = () => {
        copyTextToClipboard(houseKey).catch((copyError) => {
            console.error('House key copy failed:', copyError);
        });
    };

    const maskRecoveryKey = (value) => {
        const safeValue = String(value || '');
        if (!safeValue) {
            return '';
        }

        const visibleChars = 6;
        return `${'•'.repeat(Math.max(0, safeValue.length - visibleChars))}${safeValue.slice(-visibleChars)}`;
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

        const passwordValidation = validatePasswordStrengthClient(formData.newPassword, t);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error);
            setLoading(false);
            return;
        }

        try {
            await axios.post('/api/auth/change-password', {
                currentPassword: formData.currentPassword,
                newPassword: formData.newPassword,
                confirmPassword: formData.confirmPassword
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
            const res = await axios.post('/api/auth/change-username', { newUsername });
            setUser(prev => ({ ...prev, username: res.data.username }));
            await refreshUser();
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

    const handleRegenerateRecoveryKey = async (event) => {
        event.preventDefault();
        setRecoveryKeyLoading(true);
        setHouseError('');

        try {
            const response = await axios.post('/api/auth/recovery-key/regenerate', {
                currentPassword: recoveryKeyPassword
            });

            setShowRecoveryKeyRegenerateModal(false);
            setRecoveryKeyPassword('');
            setDisplayRecoveryKey(response.data.recoveryKey);
            await refreshUser();
            await fetchUserData();
            setMessage(t('settings.messages.recovery_key_regenerated'));
            setTimeout(() => setMessage(''), 3000);
        } catch (requestError) {
            setHouseError(requestError.response?.data?.error || t('settings.messages.recovery_key_error'));
        } finally {
            setRecoveryKeyLoading(false);
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
                                            {house.is_owner === 1 && (
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
                                            <span>{t('settings.my_houses.item_count', { count: house.item_count || 0 })}</span>
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

                {userPendingRequests.length > 0 && (
                    <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('settings.pending_requests.title')}
                        </h3>
                        <div className="space-y-2">
                            {userPendingRequests.map((request) => (
                                <div
                                    key={request.id}
                                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10"
                                >
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white">
                                            {request.requested_house_name}
                                        </p>
                                        <p className="text-slate-500 dark:text-slate-400">
                                            {t('settings.pending_requests.waiting_since', { date: new Date(request.created_at) })}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                        {t('settings.pending_requests.pending_badge')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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

                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {t('settings.house_info.active_members')}
                                    </h3>
                                    {viewerCanManageMembers && (
                                        <span className="text-xs text-slate-400">{t('settings.house_info.owner_controls')}</span>
                                    )}
                                </div>

                                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                    {loadingMembers && (
                                        <div className="flex justify-center py-6">
                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                        </div>
                                    )}

                                    {!loadingMembers && members.map((member) => (
                                        <div key={member.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                                {member.username?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                                    {member.username}
                                                    {member.id === user?.id && <span className="text-slate-400 font-normal ml-1">{t('settings.house_info.you')}</span>}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {member.joined_at ? t('settings.house_info.joined_at', { date: new Date(member.joined_at) }) : '-'}
                                                </p>
                                            </div>
                                            {member.is_owner === 1 && (
                                                <Shield className="w-4 h-4 text-amber-500" />
                                            )}
                                            {viewerCanManageMembers && member.id !== user?.id && member.is_owner !== 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleKickMember(member)}
                                                    disabled={memberActionLoading === `kick-${member.id}`}
                                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 disabled:opacity-50"
                                                >
                                                    {memberActionLoading === `kick-${member.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                                                    {t('settings.house_info.kick')}
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    {!loadingMembers && members.length === 0 && (
                                        <p className="py-4 text-center text-sm text-slate-500">{t('settings.house_info.no_members')}</p>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t('settings.house_info.pending_requests')}
                                </h3>

                                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                    {pendingRequests.map((request) => (
                                        <div key={request.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {request.username}
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        {request.requested_house_name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                        {t('settings.pending_requests.waiting_since', { date: new Date(request.created_at) })}
                                                    </p>
                                                </div>

                                                {viewerCanManageMembers && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApproveRequest(request.id)}
                                                            disabled={memberActionLoading === `approve-${request.id}`}
                                                            className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 disabled:opacity-50"
                                                        >
                                                            {memberActionLoading === `approve-${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('settings.house_info.approve')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRejectRequest(request.id)}
                                                            disabled={memberActionLoading === `reject-${request.id}`}
                                                            className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 disabled:opacity-50"
                                                        >
                                                            {memberActionLoading === `reject-${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('settings.house_info.reject')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {pendingRequests.length === 0 && (
                                        <p className="py-4 text-center text-sm text-slate-500">{t('settings.house_info.no_pending_requests')}</p>
                                    )}
                                </div>
                            </div>
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
                    <div className="space-y-3">
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

                        {passwordRecoveryMode === 'recovery_key' && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white">{t('settings.security.recovery_key_title')}</p>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                            {hasRecoveryKey ? t('settings.security.recovery_key_desc') : t('settings.security.recovery_key_missing')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setHouseError('');
                                            setShowRecoveryKeyRegenerateModal(true);
                                        }}
                                        className="btn-secondary shrink-0 px-4 py-2 text-sm"
                                    >
                                        {t('settings.security.recovery_key_action')}
                                    </button>
                                </div>

                                {hasRecoveryKey && currentRecoveryKey && (
                                    <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {t('settings.security.current_key_label')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowStoredRecoveryKey((prev) => !prev)}
                                                    className="text-xs text-primary-600 hover:text-primary-700"
                                                >
                                                    {showStoredRecoveryKey ? t('settings.house_info.hide') : t('settings.house_info.show')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        copyTextToClipboard(currentRecoveryKey).catch((copyError) => {
                                                            console.error('Recovery key copy failed:', copyError);
                                                        });
                                                    }}
                                                    className="text-xs text-primary-600 hover:text-primary-700"
                                                >
                                                    {t('settings.house_info.copy')}
                                                </button>
                                            </div>
                                        </div>
                                        <code className="block rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                                            {showStoredRecoveryKey ? currentRecoveryKey : maskRecoveryKey(currentRecoveryKey)}
                                        </code>
                                    </div>
                                )}

                                {hasRecoveryKey && !currentRecoveryKey && (
                                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                                        {t('settings.security.recovery_key_unavailable')}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Two-Factor Authentication Section */}
            <div className="card mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totpEnabled ? 'bg-green-100 dark:bg-green-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        <ShieldCheck className={`w-5 h-5 ${totpEnabled ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {t('settings.two_factor.title')}
                            {totpEnabled && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">
                                    {t('settings.two_factor.active')}
                                </span>
                            )}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('settings.two_factor.description')}
                        </p>
                    </div>
                </div>

                {!totpEnabled ? (
                    <button
                        onClick={() => setShow2FASetup(true)}
                        className="btn-primary py-3 px-6 flex items-center gap-2"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        {t('settings.two_factor.enable')}
                    </button>
                ) : (
                    <div className="space-y-3">
                        {/* Disable 2FA */}
                        <button
                            onClick={() => { setShow2FADisableModal(true); setDisableError(''); setDisablePassword(''); setDisableCode(''); setDisableMethod('totp'); }}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                        >
                            <div className="text-left">
                                <p className="font-medium text-slate-900 dark:text-white">{t('settings.two_factor.disable')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.two_factor.disable_desc')}</p>
                            </div>
                            <X className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" />
                        </button>

                        {/* Regenerate Backup Codes */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">{t('settings.two_factor.regenerate_codes')}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.two_factor.regenerate_codes_desc')}</p>
                                </div>
                            </div>
                            {!backupCodesResult ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="password"
                                        value={regeneratePassword}
                                        onChange={(e) => setRegeneratePassword(e.target.value)}
                                        placeholder={t('settings.two_factor.password_placeholder')}
                                        className="input-field flex-1 text-sm"
                                    />
                                    <button
                                        disabled={regenerateLoading || !regeneratePassword}
                                        onClick={async () => {
                                            setRegenerateLoading(true);
                                            try {
                                                const res = await axios.post('/api/auth/2fa/backup-codes', { password: regeneratePassword });
                                                setBackupCodesResult(res.data.backupCodes);
                                                setRegeneratePassword('');
                                                setMessage(t('settings.two_factor.codes_regenerated'));
                                                setTimeout(() => setMessage(''), 3000);
                                            } catch (err) {
                                                setError(err.response?.data?.error || t('settings.two_factor.codes_error'));
                                                setTimeout(() => setError(''), 3000);
                                            } finally {
                                                setRegenerateLoading(false);
                                            }
                                        }}
                                        className="btn-secondary py-2.5 px-4 text-sm flex items-center gap-1"
                                    >
                                        {regenerateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                        {t('settings.two_factor.regenerate')}
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                                        {backupCodesResult.map((code, i) => (
                                            <div key={i} className="px-2 py-1.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-center font-mono text-xs text-slate-700 dark:text-slate-300 select-all">
                                                {code}
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setBackupCodesResult(null)} className="text-sm text-primary-500 hover:text-primary-600">
                                        {t('settings.two_factor.close_codes')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Revoke Trusted Devices */}
                        <button
                            disabled={revokeLoading}
                            onClick={async () => {
                                setRevokeLoading(true);
                                try {
                                    const res = await axios.delete('/api/auth/2fa/trusted-devices');
                                    setMessage(t('settings.two_factor.devices_revoked', { count: res.data.devicesRevoked || 0 }));
                                    setTimeout(() => setMessage(''), 3000);
                                } catch (err) {
                                    setError(err.response?.data?.error || t('settings.two_factor.devices_error'));
                                    setTimeout(() => setError(''), 3000);
                                } finally {
                                    setRevokeLoading(false);
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                        >
                            <div className="text-left">
                                <p className="font-medium text-slate-900 dark:text-white">{t('settings.two_factor.revoke_devices')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.two_factor.revoke_devices_desc')}</p>
                            </div>
                            {revokeLoading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <Trash2 className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" />}
                        </button>
                    </div>
                )}
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

            {showRecoveryKeyRegenerateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRecoveryKeyRegenerateModal(false)} />
                    <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/20">
                                    <Key className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                                </div>
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    {t('settings.security.recovery_key_action')}
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowRecoveryKeyRegenerateModal(false)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleRegenerateRecoveryKey} className="space-y-4 p-6">
                            {houseError && (
                                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    {houseError}
                                </div>
                            )}

                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {t('settings.security.recovery_key_modal_desc')}
                            </p>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t('settings.modals.password.current')}
                                </label>
                                <input
                                    type="password"
                                    value={recoveryKeyPassword}
                                    onChange={(event) => setRecoveryKeyPassword(event.target.value)}
                                    className="input-field"
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="submit" disabled={recoveryKeyLoading} className="btn-primary flex-1 py-3">
                                    {recoveryKeyLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            {t('settings.security.recovery_key_loading')}
                                        </span>
                                    ) : (
                                        t('settings.security.recovery_key_action')
                                    )}
                                </button>
                                <button type="button" onClick={() => setShowRecoveryKeyRegenerateModal(false)} className="btn-secondary px-6 py-3">
                                    {t('common.cancel')}
                                </button>
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

            {displayRecoveryKey && (
                <RecoveryKeyModal
                    recoveryKey={displayRecoveryKey}
                    title={t('auth.recovery_key_modal.settings_title')}
                    subtitle={t('auth.recovery_key_modal.subtitle')}
                    warning={t('auth.recovery_key_modal.warning')}
                    confirmLabel={t('auth.recovery_key_modal.confirm')}
                    onConfirm={() => setDisplayRecoveryKey('')}
                />
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

            {/* 2FA Setup Modal */}
            {show2FASetup && (
                <TwoFactorSetup
                    onClose={() => setShow2FASetup(false)}
                    onEnabled={() => { fetchUserData(); }}
                />
            )}

            {/* 2FA Disable Modal */}
            {show2FADisableModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {t('settings.two_factor.disable_title')}
                            </h2>
                            <button onClick={() => setShow2FADisableModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setDisableLoading(true);
                                setDisableError('');
                                try {
                                    const payload = { password: disablePassword };
                                    if (disableMethod === 'totp') payload.token = disableCode;
                                    else if (disableMethod === 'backup') payload.backupCode = disableCode;
                                    else if (disableMethod === 'recovery') payload.recoveryKey = disableCode;

                                    await axios.post('/api/auth/2fa/disable', payload);
                                    setShow2FADisableModal(false);
                                    fetchUserData();
                                    setMessage(t('settings.two_factor.disabled_success'));
                                    setTimeout(() => setMessage(''), 3000);
                                } catch (err) {
                                    setDisableError(err.response?.data?.error || t('settings.two_factor.disable_error'));
                                } finally {
                                    setDisableLoading(false);
                                }
                            }}
                            className="p-6 space-y-4"
                        >
                            {disableError && (
                                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
                                    {disableError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {t('settings.two_factor.password_label')}
                                </label>
                                <input
                                    type="password"
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)}
                                    className="input-field"
                                    required
                                />
                            </div>

                            {/* Method Selector */}
                            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                {[
                                    { key: 'totp', label: t('settings.two_factor.method_totp') },
                                    { key: 'backup', label: t('settings.two_factor.method_backup') },
                                    { key: 'recovery', label: t('settings.two_factor.method_recovery') }
                                ].map(m => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => { setDisableMethod(m.key); setDisableCode(''); }}
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${disableMethod === m.key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {disableMethod === 'totp' && t('settings.two_factor.totp_code_label')}
                                    {disableMethod === 'backup' && t('settings.two_factor.backup_code_label')}
                                    {disableMethod === 'recovery' && t('settings.two_factor.recovery_key_label')}
                                </label>
                                <input
                                    type="text"
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value)}
                                    className={`input-field ${disableMethod === 'totp' ? 'text-center text-xl tracking-[0.3em] font-mono' : ''}`}
                                    placeholder={disableMethod === 'totp' ? '000000' : disableMethod === 'backup' ? 'ABCD1234' : ''}
                                    maxLength={disableMethod === 'totp' ? 6 : disableMethod === 'backup' ? 8 : undefined}
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShow2FADisableModal(false)} className="btn-secondary flex-1 py-3">
                                    {t('settings.two_factor.cancel')}
                                </button>
                                <button type="submit" disabled={disableLoading} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                                    {disableLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('settings.two_factor.disable_confirm')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* App Info Footer */}
            <div className="text-center text-sm text-slate-400 dark:text-slate-600 pb-8">
                <p>{t('common.copyright', { year: new Date().getFullYear() })}</p>
            </div>
        </div>
    );
}
