import { useState, useRef, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTheme, Theme } from '../context/ThemeContext';
import {
    User as UserIcon, LogOut, Moon, Sun, Shield, ShieldCheck,
    Key, Copy, Eye, Building, Plus, ArrowRightLeft,
    Database, Download, Upload, Loader2, AlertCircle, CheckCircle,
    X, Home, Users, Edit3, UserX, Trash2, Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import RecoveryKeyModal from './RecoveryKeyModal';
import TwoFactorSetup from './TwoFactorSetup';
import { copyTextToClipboard } from '../utils/clipboard';
import { validatePasswordStrengthClient } from '../utils/passwordValidation';
import { EmptyState, LoadingState, PageHeader, SectionHeader } from './ProductUI';
import LanguageSwitcher from './LanguageSwitcher';
import HouseKeyModal from './HouseKeyModal';
import AccordionSection from './AccordionSection';
import { FloatingToastStack } from './FloatingToast';
import SegmentedToggle from './SegmentedToggle';
import ModalDialog, { ConfirmDialog } from './ModalDialog';
import SettingsAboutSection from './SettingsAboutSection';
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackupPayload } from '../utils/backupEncryption';
import { useToastQueue } from '../hooks/useToastQueue';
import { PremiumCheckbox } from './PremiumCheckbox';

const MODAL_CLOSE_BUTTON_CLASS = 'rounded-xl p-2 text-[var(--hi-text-soft)] transition hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]';

interface SettingsUser {
    id: number;
    username: string;
    email: string;
    role: string;
    active_house_id?: number | null;
}

interface House {
    id: number;
    name: string;
    is_owner: number;
    member_count: number;
    item_count?: number;
}

interface UserPendingRequest {
    id: number;
    requested_house_name: string;
    created_at: string;
}

interface HouseMember {
    id: number;
    username: string;
    joined_at?: string;
    is_owner: number;
}

interface HouseholdPendingRequest {
    id: number;
    username: string;
    requested_house_name: string;
    created_at: string;
}

interface ToastOptions {
    title?: string;
    duration?: number;
}

export default function Settings() {
    const { t: tRaw } = useTranslation();
    const t = tRaw as any;
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const { refreshUser, logout } = useAuth();
    const [user, setUser] = useState<SettingsUser | null>(null);
    const [passwordRecoveryMode, setPasswordRecoveryMode] = useState<string>('email');
    const [hasRecoveryKey, setHasRecoveryKey] = useState<boolean>(false);
    const [houses, setHouses] = useState<House[]>([]);
    const [userPendingRequests, setUserPendingRequests] = useState<UserPendingRequest[]>([]);
    const [activeHouseId, setActiveHouseId] = useState<number | null | undefined>(null);
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [houseKey, setHouseKey] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [houseActionLoading, setHouseActionLoading] = useState<boolean>(false);

    // Backup states
    const [downloading, setDownloading] = useState<boolean>(false);
    const [uploading, setUploading] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Modal states
    const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
    const [showJoinHouseModal, setShowJoinHouseModal] = useState<boolean>(false);
    const [showCreateHouseModal, setShowCreateHouseModal] = useState<boolean>(false);
    const [showRecoveryKeyRegenerateModal, setShowRecoveryKeyRegenerateModal] = useState<boolean>(false);
    const [recoveryKeyPassword, setRecoveryKeyPassword] = useState<string>('');
    const [recoveryKeyLoading, setRecoveryKeyLoading] = useState<boolean>(false);
    const [displayRecoveryKey, setDisplayRecoveryKey] = useState<string>('');
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
    const [deletePassword, setDeletePassword] = useState<string>('');
    const [deleteAccountLoading, setDeleteAccountLoading] = useState<boolean>(false);
    const [deleteAccountError, setDeleteAccountError] = useState<string>('');
    const [showHouseKeyModal, setShowHouseKeyModal] = useState<boolean>(false);
    const [showHouseKeyRevealConfirm, setShowHouseKeyRevealConfirm] = useState<boolean>(false);
    const [showHouseKeyCopyConfirm, setShowHouseKeyCopyConfirm] = useState<boolean>(false);
    const [houseKeyRevealAcknowledged, setHouseKeyRevealAcknowledged] = useState<boolean>(false);
    const [houseKeyCopyAcknowledged, setHouseKeyCopyAcknowledged] = useState<boolean>(false);
    const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
    const [backupEncryptEnabled, setBackupEncryptEnabled] = useState<boolean>(true);
    const [backupPassphrase, setBackupPassphrase] = useState<string>('');
    const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState<string>('');
    const [backupModalError, setBackupModalError] = useState<string>('');
    const [pendingEncryptedImport, setPendingEncryptedImport] = useState<any>(null);
    const [showEncryptedImportModal, setShowEncryptedImportModal] = useState<boolean>(false);
    const [backupImportPassphrase, setBackupImportPassphrase] = useState<string>('');
    const [backupImportError, setBackupImportError] = useState<string>('');
    const [pendingLeaveHouse, setPendingLeaveHouse] = useState<House | null>(null);
    const [pendingKickMember, setPendingKickMember] = useState<HouseMember | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
    const [logoutSubmitting, setLogoutSubmitting] = useState<boolean>(false);
    const { toasts, showToast, closeToast } = useToastQueue();

    // Join/Create House form states
    const [joinHouseKey, setJoinHouseKey] = useState<string>('');
    const [newHouseName, setNewHouseName] = useState<string>('');
    const [houseError, setHouseError] = useState<string>('');

    // Members state
    const [members, setMembers] = useState<HouseMember[]>([]);
    const [pendingRequests, setPendingRequests] = useState<HouseholdPendingRequest[]>([]);
    const [viewerCanManageMembers, setViewerCanManageMembers] = useState<boolean>(false);
    const [loadingMembers, setLoadingMembers] = useState<boolean>(false);
    const [memberActionLoading, setMemberActionLoading] = useState<string>('');

    // Username change state
    const [showUsernameModal, setShowUsernameModal] = useState<boolean>(false);
    const [newUsername, setNewUsername] = useState<string>('');
    const [changingUsername, setChangingUsername] = useState<boolean>(false);
    const [usernameError, setUsernameError] = useState<string>('');
    const [usernameSuccess, setUsernameSuccess] = useState<string>('');

    // Two-Factor Authentication state
    const [show2FASetup, setShow2FASetup] = useState<boolean>(false);
    const [show2FADisableModal, setShow2FADisableModal] = useState<boolean>(false);
    const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
    const [disablePassword, setDisablePassword] = useState<string>('');
    const [disableCode, setDisableCode] = useState<string>('');
    const [disableMethod, setDisableMethod] = useState<string>('totp'); // totp, backup, recovery
    const [disableLoading, setDisableLoading] = useState<boolean>(false);
    const [disableError, setDisableError] = useState<string>('');
    const [backupCodesResult, setBackupCodesResult] = useState<string[] | null>(null);
    const [regeneratePassword, setRegeneratePassword] = useState<string>('');
    const [regenerateLoading, setRegenerateLoading] = useState<boolean>(false);
    const [revokeLoading, setRevokeLoading] = useState<boolean>(false);

    const activeHouse = houses.find((house) => house.id === activeHouseId) || null;
    const canManageBackups = activeHouse?.is_owner === 1;
    const concealedHouseKey = houseKey ? '••••••••••••••••••••••••••••••••' : t('settings.house_info.hidden_state', { defaultValue: 'Hidden until you review it securely' });

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

    const showSuccessToast = useCallback((description: string, options: ToastOptions = {}) => {
        showToast({
            title: options.title || t('common.success', { defaultValue: 'Updated' }),
            description,
            tone: 'success',
            duration: options.duration
        });
    }, [showToast, t]);

    const showErrorToast = useCallback((description: string, options: ToastOptions = {}) => {
        showToast({
            title: options.title || t('common.error', { defaultValue: 'Something went wrong' }),
            description,
            tone: 'danger',
            duration: options.duration
        });
    }, [showToast, t]);

    const formatPreviewLine = (label: string, values: string[] = [], omitted = 0): string => {
        if (!values.length) {
            return '';
        }

        const joined = values.join(', ');
        return omitted > 0
            ? `${label}: ${joined} +${omitted}`
            : `${label}: ${joined}`;
    };

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

    const handleSwitchHouse = async (houseId: number) => {
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

            showSuccessToast(t('settings.messages.house_switched', { name: res.data.house.name }));
        } catch (err) {
            showErrorToast(t('settings.messages.house_switch_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleJoinHouse = async (e: FormEvent) => {
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
            showSuccessToast(t('settings.messages.house_request_sent_success'));
        } catch (err: any) {
            setHouseError(err.response?.data?.error || t('settings.messages.house_join_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleCreateHouse = async (e: FormEvent) => {
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
            showSuccessToast(t('settings.messages.house_created_success', { name: res.data.house.name }));
        } catch (err: any) {
            setHouseError(err.response?.data?.error || t('settings.messages.house_create_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleLeaveHouse = async () => {
        if (!pendingLeaveHouse) return;

        const houseToLeave = pendingLeaveHouse;
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
            setPendingLeaveHouse(null);
            showToast({
                title: t('settings.messages.house_left_success'),
                description: t('settings.my_houses.leave_success_body', {
                    defaultValue: 'You no longer have access to this household and your active house was refreshed.'
                })
            });
        } catch (err: any) {
            showErrorToast(err.response?.data?.error || t('settings.messages.house_left_error'));
        } finally {
            setHouseActionLoading(false);
        }
    };

    const handleApproveRequest = async (requestId: number) => {
        setMemberActionLoading(`approve-${requestId}`);
        try {
            await axios.post(`/api/houses/requests/${requestId}/approve`);
            await fetchMembers();
            await fetchHouses();
            showSuccessToast(t('settings.messages.request_approved'));
        } catch (err: any) {
            showErrorToast(err.response?.data?.error || t('settings.messages.request_action_error'));
        } finally {
            setMemberActionLoading('');
        }
    };

    const handleRejectRequest = async (requestId: number) => {
        setMemberActionLoading(`reject-${requestId}`);
        try {
            await axios.post(`/api/houses/requests/${requestId}/reject`);
            await fetchMembers();
            await fetchHouses();
            showSuccessToast(t('settings.messages.request_rejected'));
        } catch (err: any) {
            showErrorToast(err.response?.data?.error || t('settings.messages.request_action_error'));
        } finally {
            setMemberActionLoading('');
        }
    };

    const handleKickMember = async () => {
        if (!pendingKickMember) return;

        const member = pendingKickMember;
        setMemberActionLoading(`kick-${member.id}`);
        try {
            await axios.post(`/api/houses/members/${member.id}/kick`);
            await fetchMembers();
            setPendingKickMember(null);
            showToast({
                title: t('settings.messages.member_kicked'),
                description: t('settings.house_info.kick_success_body', {
                    name: member.username,
                    defaultValue: '{{name}} no longer has access to this household.'
                })
            });
        } catch (err: any) {
            showErrorToast(err.response?.data?.error || t('settings.messages.member_kick_error'));
        } finally {
            setMemberActionLoading('');
        }
    };

    const openHouseKeyRevealConfirm = () => {
        setHouseKeyRevealAcknowledged(false);
        setShowHouseKeyRevealConfirm(true);
    };

    const closeHouseKeyRevealConfirm = () => {
        setShowHouseKeyRevealConfirm(false);
        setHouseKeyRevealAcknowledged(false);
    };

    const openHouseKeyCopyConfirm = () => {
        setHouseKeyCopyAcknowledged(false);
        setShowHouseKeyCopyConfirm(true);
    };

    const closeHouseKeyCopyConfirm = () => {
        setShowHouseKeyCopyConfirm(false);
        setHouseKeyCopyAcknowledged(false);
    };

    const copyToClipboard = async () => {
        try {
            await copyTextToClipboard(houseKey);
            closeHouseKeyCopyConfirm();
            showToast({
                title: t('settings.house_info.copy_success_title', { defaultValue: 'House key copied' }),
                description: t('settings.house_info.copy_success_body', { defaultValue: 'Treat it like a household password and share it only through a trusted channel.' })
            });
        } catch (copyError) {
            console.error('House key copy failed:', copyError);
            showErrorToast(t('settings.house_info.copy_error', { defaultValue: 'The house key could not be copied.' }));
        }
    };

    const resetBackupModal = () => {
        setBackupEncryptEnabled(true);
        setBackupPassphrase('');
        setBackupPassphraseConfirm('');
        setBackupModalError('');
    };

    const openBackupModal = () => {
        resetBackupModal();
        setShowBackupModal(true);
    };

    const closeBackupModal = () => {
        setShowBackupModal(false);
        resetBackupModal();
    };

    const closeEncryptedImportModal = () => {
        setShowEncryptedImportModal(false);
        setPendingEncryptedImport(null);
        setBackupImportPassphrase('');
        setBackupImportError('');
    };

    const triggerBackupDownload = async () => {
        if (backupEncryptEnabled) {
            if (backupPassphrase.trim().length < 12) {
                setBackupModalError(t('settings.data_management.passphrase_length', { defaultValue: 'Use a backup passphrase with at least 12 characters.' }));
                return;
            }

            if (backupPassphrase !== backupPassphraseConfirm) {
                setBackupModalError(t('settings.data_management.passphrase_mismatch', { defaultValue: 'Backup passphrases do not match.' }));
                return;
            }
        }

        setBackupModalError('');
        setDownloading(true);
        try {
            const response = await axios.get('/api/backup/export');
            const data = response.data;
            const payload = backupEncryptEnabled
                ? await encryptBackupPayload(data, backupPassphrase)
                : data;

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = backupEncryptEnabled
                ? `inventory-backup-${new Date().toISOString().split('T')[0]}.hibak.json`
                : `inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            closeBackupModal();
            showSuccessToast(t(
                backupEncryptEnabled ? 'settings.messages.backup_downloaded_encrypted' : 'settings.messages.backup_downloaded',
                {
                    count: data.items.length,
                    defaultValue: backupEncryptEnabled
                        ? `Encrypted backup downloaded successfully! (${data.items.length} items)`
                        : `Backup downloaded successfully! (${data.items.length} items)`
                }
            ));
        } catch (err) {
            showErrorToast(t('settings.messages.export_error'));
        } finally {
            setDownloading(false);
        }
    };

    const importBackupPayload = async (jsonData: any) => {
        if (!jsonData.items || !Array.isArray(jsonData.items)) {
            throw new Error(t('settings.messages.import_invalid_format'));
        }

        const res = await axios.post('/api/backup/import', jsonData);
        const { imported = {}, skipped = {}, preview = {} } = res.data || {};

        const previewLines = [
            formatPreviewLine(
                t('settings.data_management.preview_items', { defaultValue: 'Items' }),
                preview.items,
                preview?.omitted?.items || 0
            ),
            formatPreviewLine(
                t('settings.data_management.preview_categories', { defaultValue: 'Categories' }),
                preview.categories,
                preview?.omitted?.categories || 0
            ),
            formatPreviewLine(
                t('settings.data_management.preview_rooms', { defaultValue: 'Rooms' }),
                preview.rooms,
                preview?.omitted?.rooms || 0
            ),
            formatPreviewLine(
                t('settings.data_management.preview_locations', { defaultValue: 'Locations' }),
                preview.locations,
                preview?.omitted?.locations || 0
            )
        ].filter(Boolean);

        const skippedBits = [
            skipped.items ? t('settings.data_management.skipped_items', { count: skipped.items, defaultValue: '{{count}} existing items skipped.' }) : '',
            skipped.categories ? t('settings.data_management.skipped_categories', { count: skipped.categories, defaultValue: '{{count}} existing categories skipped.' }) : '',
            skipped.rooms ? t('settings.data_management.skipped_rooms', { count: skipped.rooms, defaultValue: '{{count}} existing rooms skipped.' }) : '',
            skipped.locations ? t('settings.data_management.skipped_locations', { count: skipped.locations, defaultValue: '{{count}} existing locations skipped.' }) : '',
            skipped.borrows ? t('settings.data_management.skipped_borrows', { count: skipped.borrows, defaultValue: '{{count}} existing borrow records skipped.' }) : ''
        ].filter(Boolean);

        showToast({
            title: t('settings.data_management.import_summary_title', {
                defaultValue: 'Backup restored'
            }),
            description: [
                t('settings.data_management.import_summary_body', {
                    items: imported.items || 0,
                    categories: imported.categories || 0,
                    rooms: imported.rooms || 0,
                    locations: imported.locations || 0,
                    borrows: imported.borrows || 0,
                    defaultValue: '{{items}} items, {{categories}} categories, {{rooms}} rooms, {{locations}} locations, {{borrows}} borrow records restored.'
                }),
                ...previewLines,
                ...skippedBits
            ].filter(Boolean).join('\n'),
            tone: 'success',
            duration: 9000
        });
    };

    const handleRestoreBackup = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const reader = new FileReader();
        reader.onload = async (event: any) => {
            try {
                const jsonData = JSON.parse(event.target.result);

                if (isEncryptedBackupPayload(jsonData)) {
                    setPendingEncryptedImport(jsonData);
                    setBackupImportPassphrase('');
                    setBackupImportError('');
                    setShowEncryptedImportModal(true);
                } else {
                    await importBackupPayload(jsonData);
                }
            } catch (err: any) {
                console.error('Import error:', err);
                showErrorToast(err.response?.data?.error || t('settings.messages.import_error', { error: err.message }));
            } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleEncryptedImportSubmit = async () => {
        if (!pendingEncryptedImport) {
            return;
        }

        setUploading(true);
        setBackupImportError('');
        try {
            const decryptedPayload = await decryptBackupPayload(pendingEncryptedImport, backupImportPassphrase);
            await importBackupPayload(decryptedPayload);
            closeEncryptedImportModal();
        } catch (err: any) {
            setBackupImportError(err.message || t('settings.messages.import_error', { error: 'Unable to decrypt backup' }));
        } finally {
            setUploading(false);
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (formData.newPassword !== formData.confirmPassword) {
            showErrorToast(t('settings.messages.passwords_mismatch'));
            setLoading(false);
            return;
        }

        const passwordValidation = validatePasswordStrengthClient(formData.newPassword, t);
        if (!passwordValidation.valid) {
            showErrorToast(passwordValidation.error);
            setLoading(false);
            return;
        }

        try {
            await axios.post('/api/auth/change-password', {
                currentPassword: formData.currentPassword,
                newPassword: formData.newPassword,
                confirmPassword: formData.confirmPassword
            });
            showSuccessToast(t('settings.messages.password_changed'));
            setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowPasswordModal(false);
        } catch (err: any) {
            if (err.response) {
                showErrorToast(err.response.data.error || t('settings.messages.server_error'));
            } else {
                showErrorToast(t('settings.messages.connection_error'));
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

    const handleUsernameChange = async (e: FormEvent) => {
        e.preventDefault();
        setChangingUsername(true);
        setUsernameError('');
        setUsernameSuccess('');

        try {
            const res = await axios.post('/api/auth/change-username', { newUsername });
            setUser(prev => prev ? ({ ...prev, username: res.data.username }) : null);
            await refreshUser();
            setUsernameSuccess(t('settings.messages.username_changed'));

            // Update global user state if it exists (via context or reload)
            // For now just update local state and close modal after delay
            setTimeout(() => {
                closeUsernameModal();
            }, 1000);
        } catch (err: any) {
            setUsernameError(err.response?.data?.error || t('settings.messages.username_error'));
        } finally {
            setChangingUsername(false);
        }
    };

    const handleLogout = async () => {
        setLogoutSubmitting(true);
        try {
            await logout();
            navigate('/', { replace: true });
        } catch (err) {
            console.error('Logout failed', err);
        } finally {
            setLogoutSubmitting(false);
            setShowLogoutConfirm(false);
        }
    };

    const openDeleteAccountModal = () => {
        setDeletePassword('');
        setDeleteAccountError('');
        setShowDeleteAccountModal(true);
    };

    const closeDeleteAccountModal = () => {
        setShowDeleteAccountModal(false);
        setDeletePassword('');
        setDeleteAccountError('');
    };

    const handleDeleteAccount = async (event: FormEvent) => {
        event.preventDefault();
        setDeleteAccountLoading(true);
        setDeleteAccountError('');

        try {
            const payload = {
                currentPassword: deletePassword
            };

            try {
                await axios.delete('/api/auth/delete-account', {
                    data: payload
                });
            } catch (requestError: any) {
                const status = requestError.response?.status;
                if (![404, 405].includes(status)) {
                    throw requestError;
                }

                await axios.post('/api/auth/delete-account', payload);
            }

            window.localStorage.removeItem('cookie_notice_dismissed');
            window.localStorage.removeItem('cookie_consent');
            await logout();
            navigate('/', { replace: true });
        } catch (requestError: any) {
            setDeleteAccountError(
                requestError.response?.data?.error || t('settings.messages.account_delete_error')
            );
        } finally {
            setDeleteAccountLoading(false);
        }
    };

    const handleRegenerateRecoveryKey = async (event: FormEvent) => {
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
            showSuccessToast(t('settings.messages.recovery_key_regenerated'));
        } catch (requestError: any) {
            setHouseError(requestError.response?.data?.error || t('settings.messages.recovery_key_error'));
        } finally {
            setRecoveryKeyLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl animate-fade-in pb-20">
            <PageHeader
                title={t('settings.title')}
                description={t('settings.subtitle')}
            />



            <section id="settings-account" className="app-settings-section scroll-mt-24 space-y-5">
                <SectionHeader
                    eyebrow={t('settings.workspace_section.eyebrow', { defaultValue: 'Account and houses' })}
                    title={t('settings.workspace_section.title', { defaultValue: 'Account and household access' })}
                    description={t('settings.workspace_section.description', { defaultValue: 'Manage your profile, active house, and member access from one control area.' })}
                />

                {/* User Profile Section */}
                <AccordionSection
                    title={t('settings.account_overview.title', { defaultValue: 'Account overview' })}
                    description={t('settings.account_overview.description', { defaultValue: 'Basic profile details for the signed-in account.' })}
                    eyebrow={t('settings.control_sections.account', { defaultValue: 'Account' })}
                    icon={UserIcon}
                    defaultOpen
                    className="mb-5"
                >
                    <div className="mb-5 flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] text-2xl font-bold text-white shadow-[var(--hi-shadow-soft)]">
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <h2 className="mt-2 section-title text-2xl text-[var(--hi-text)]">{user?.username}</h2>
                            <p className="truncate text-[var(--hi-text-soft)]">{user?.email}</p>
                        </div>
                        <button
                            onClick={openUsernameModal}
                            type="button"
                            aria-label={t('settings.user_profile.edit_username')}
                            className="ml-auto rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-2 transition hover:bg-[var(--hi-panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"
                            title={t('settings.user_profile.edit_username')}
                        >
                            <Edit3 className="w-4 h-4 text-[var(--hi-text-soft)]" />
                        </button>
                    </div>
                </AccordionSection>

                {/* My Houses Section */}
                <AccordionSection
                    title={t('settings.my_houses.title')}
                    description={t('settings.my_houses.accordion_description', { defaultValue: 'Switch between households, create a new one, or join an existing one with a trusted key.' })}
                    eyebrow={t('settings.control_sections.houses', { defaultValue: 'Houses' })}
                    icon={Building}
                    defaultOpen
                    className="mb-5"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        {houses.length > 0 && (
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => setShowJoinHouseModal(true)}
                                    aria-label={t('settings.my_houses.join_house')}
                                    className="btn-secondary py-2.5 px-3 text-sm flex-1 sm:flex-none flex items-center justify-center gap-2"
                                >
                                    <Users className="w-4 h-4" />
                                    <span className="hidden xs:inline">{t('settings.my_houses.join_house')}</span>
                                    <span className="xs:hidden">{t('settings.my_houses.join_short')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateHouseModal(true)}
                                    aria-label={t('settings.my_houses.new_house')}
                                    className="btn-secondary py-2.5 px-3 text-sm flex-1 sm:flex-none flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden xs:inline">{t('settings.my_houses.new_house')}</span>
                                    <span className="xs:hidden">{t('settings.my_houses.new_short')}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        {houses.length === 0 ? (
                            <EmptyState
                                icon={Building}
                                title={t('settings.my_houses.no_house')}
                                description={t('settings.my_houses.empty_description', { defaultValue: 'Create a house to start a shared inventory, or join one with a secure house key.' })}
                                actions={(
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowJoinHouseModal(true)}
                                            aria-label={t('settings.my_houses.join_house')}
                                            className="btn-secondary"
                                        >
                                            <Users className="w-4 h-4" />
                                            <span>{t('settings.my_houses.join_house')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateHouseModal(true)}
                                            aria-label={t('settings.my_houses.new_house')}
                                            className="btn-secondary"
                                        >
                                            <Plus className="w-4 h-4" />
                                            <span>{t('settings.my_houses.new_house')}</span>
                                        </button>
                                    </>
                                )}
                            />
                        ) : (
                            houses.map(house => (
                                <div
                                    key={house.id}
                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all
                                        ${house.id === activeHouseId
                                            ? 'bg-[var(--hi-accent-soft)] border-[var(--hi-border-strong)]'
                                            : 'bg-[var(--hi-panel-strong)] border-[var(--hi-border)] hover:border-[var(--hi-border-strong)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                                            ${house.id === activeHouseId
                                                ? 'bg-[var(--hi-panel-strong)] text-[var(--hi-accent)]'
                                                : 'bg-[var(--hi-panel-muted)] text-[var(--hi-text-muted)]'
                                            }`}
                                        >
                                            <Home className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className={`font-semibold ${house.id === activeHouseId ? 'text-[var(--hi-accent)]' : 'text-[var(--hi-text)]'}`}>
                                                    {house.name}
                                                </h3>
                                                {house.is_owner === 1 && (
                                                    <span className="rounded-full border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hi-secondary-strong)]">
                                                        {t('settings.my_houses.owner')}
                                                    </span>
                                                )}
                                                {house.id === activeHouseId && (
                                                    <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hi-accent)]">
                                                        {t('settings.my_houses.active')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--hi-text-soft)]">
                                                <span>{t('settings.my_houses.member_count', { count: house.member_count })}</span>
                                                <span>•</span>
                                                <span>{t('settings.my_houses.item_count', { count: house.item_count || 0 })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {house.id !== activeHouseId && (
                                            <button
                                                type="button"
                                                onClick={() => handleSwitchHouse(house.id)}
                                                disabled={houseActionLoading}
                                                aria-label={t('settings.my_houses.switch')}
                                                className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-3 py-1.5 text-sm font-medium text-[var(--hi-text-soft)] transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"
                                            >
                                                {t('settings.my_houses.switch')}
                                            </button>
                                        )}
                                        {/* Always allow leaving unless it's the last house, maybe check that logic later */}
                                        {houses.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setPendingLeaveHouse(house)}
                                                disabled={houseActionLoading}
                                                aria-label={t('settings.my_houses.leave')}
                                                className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] dark:hover:bg-red-500/10"
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
                    <p className="mt-3 px-1 text-xs text-[var(--hi-text-soft)]">
                        {t('settings.my_houses.info')}
                    </p>

                    {userPendingRequests.length > 0 && (
                        <div className="mt-5 border-t border-[var(--hi-border)] pt-4">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--hi-text-soft)]">
                                {t('settings.pending_requests.title')}
                            </h3>
                            <div className="space-y-2">
                                {userPendingRequests.map((request) => (
                                    <div
                                        key={request.id}
                                        className="flex items-center justify-between rounded-xl border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium text-[var(--hi-text)]">
                                                {request.requested_house_name}
                                            </p>
                                            <p className="text-[var(--hi-text-soft)]">
                                                {t('settings.pending_requests.waiting_since', { date: new Date(request.created_at) })}
                                            </p>
                                        </div>
                                        <span className="rounded-full border border-[rgba(184,153,104,0.18)] bg-[var(--hi-panel-strong)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hi-secondary-strong)]">
                                            {t('settings.pending_requests.pending_badge')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </AccordionSection>

                {/* House Key & Members */}
                {activeHouseId && (
                    <AccordionSection
                        title={t('settings.house_info.access_section_title', { defaultValue: 'House access and members' })}
                        description={t('settings.house_info.access_section_body', { defaultValue: 'Review the active household key, manage members, and keep access limited to trusted people.' })}
                        eyebrow={t('settings.house_info.title')}
                        icon={Key}
                        defaultOpen
                        className="mb-6"
                    >
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {/* Key Card */}
                            <div className="app-control-section-nested">
                                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                                    <Key className="h-5 w-5 text-[var(--hi-secondary)]" />
                                    {t('settings.house_info.title')}
                                </h2>

                                <div className="rounded-[1.25rem] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4">
                                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-sm font-medium text-[var(--hi-text-soft)]">{t('settings.house_info.key_label')}</span>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={openHouseKeyRevealConfirm}
                                                className="inline-flex items-center gap-1 rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-3 py-1.5 text-xs font-medium text-[var(--hi-accent)] transition hover:border-[var(--hi-border-strong)]"
                                            >
                                                <Eye className="w-3 h-3" />
                                                {t('settings.house_info.show_securely', { defaultValue: 'Anahtarı göster' })}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={openHouseKeyCopyConfirm}
                                                className="inline-flex items-center gap-1 rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-3 py-1.5 text-xs font-medium text-[var(--hi-accent)] transition hover:border-[var(--hi-border-strong)]"
                                            >
                                                <Copy className="w-3 h-3" />
                                                {t('settings.house_info.copy_securely', { defaultValue: 'Copy securely' })}
                                            </button>
                                        </div>
                                    </div>
                                    <code className="block w-full break-all rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] p-3 font-mono text-sm text-[var(--hi-text-soft)]">
                                        {concealedHouseKey}
                                    </code>
                                    <div className="mt-3 rounded-[1rem] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                                        <p className="font-medium text-[var(--hi-text)]">
                                            {t('settings.house_info.share_warning_title', { defaultValue: 'Share carefully' })}
                                        </p>
                                        <p className="mt-1">
                                            {t('settings.house_info.share_warning_body', { defaultValue: 'Anyone with this key can request access to the household inventory. Only share it with trusted members and use a private channel.' })}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Members Card */}
                            <div className="app-control-section-nested">
                                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                                    <Users className="h-5 w-5 text-[var(--hi-accent)]" />
                                    {t('settings.house_info.members_title', { count: members.length })}
                                </h2>

                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-soft)]">
                                                {t('settings.house_info.active_members')}
                                            </h3>
                                            {viewerCanManageMembers && (
                                                <span className="text-xs text-[var(--hi-text-soft)]">{t('settings.house_info.owner_controls')}</span>
                                            )}
                                        </div>

                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                            {loadingMembers && (
                                                <div className="flex justify-center py-6">
                                                    <LoadingState
                                                        compact
                                                        title={t('settings.house_info.loading_members', { defaultValue: 'Üyeler yükleniyor...' })}
                                                    />
                                                </div>
                                            )}

                                            {!loadingMembers && members.map((member) => (
                                                <div key={member.id} className="flex items-center gap-3 rounded-[1rem] p-3 transition hover:bg-[var(--hi-panel-strong)]">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--hi-accent),var(--hi-secondary))] text-xs font-bold text-white shadow-[var(--hi-shadow-soft)]">
                                                        {member.username?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="truncate text-sm font-medium text-[var(--hi-text)]">
                                                            {member.username}
                                                            {member.id === user?.id && <span className="ml-1 font-normal text-[var(--hi-text-soft)]">{t('settings.house_info.you')}</span>}
                                                        </p>
                                                        <p className="text-xs text-[var(--hi-text-soft)]">
                                                            {member.joined_at ? t('settings.house_info.joined_at', { date: new Date(member.joined_at) }) : '-'}
                                                        </p>
                                                    </div>
                                                    {member.is_owner === 1 && (
                                                        <Shield className="h-4 w-4 text-[var(--hi-secondary)]" />
                                                    )}
                                                    {viewerCanManageMembers && member.id !== user?.id && member.is_owner !== 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingKickMember(member)}
                                                            disabled={memberActionLoading === `kick-${member.id}`}
                                                            aria-label={t('settings.house_info.kick')}
                                                            className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:opacity-50"
                                                        >
                                                            {memberActionLoading === `kick-${member.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                                                            {t('settings.house_info.kick')}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}

                                            {!loadingMembers && members.length === 0 && (
                                                <p className="py-4 text-center text-sm text-[var(--hi-text-soft)]">{t('settings.house_info.no_members')}</p>
                                            )}
                                        </div>
                                    </div>

                                    {pendingRequests.length > 0 && (
                                        <div className="border-t border-[var(--hi-border)] pt-4">
                                            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-soft)]">
                                                {t('settings.house_info.pending_requests')}
                                            </h3>

                                            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                                {pendingRequests.map((request) => (
                                                    <div key={request.id} className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-medium text-[var(--hi-text)]">
                                                                    {request.username}
                                                                </p>
                                                                <p className="text-xs text-[var(--hi-text-soft)]">
                                                                    {request.requested_house_name}
                                                                </p>
                                                                <p className="mt-1 text-xs text-[var(--hi-text-muted)]">
                                                                    {t('settings.pending_requests.waiting_since', { date: new Date(request.created_at) })}
                                                                </p>
                                                            </div>

                                                            {viewerCanManageMembers && (
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleApproveRequest(request.id)}
                                                                        disabled={memberActionLoading === `approve-${request.id}`}
                                                                        className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--hi-accent)] transition hover:bg-[var(--hi-panel-strong)] disabled:opacity-50"
                                                                    >
                                                                        {memberActionLoading === `approve-${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('settings.house_info.approve')}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRejectRequest(request.id)}
                                                                        disabled={memberActionLoading === `reject-${request.id}`}
                                                                        className="rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                                                                    >
                                                                        {memberActionLoading === `reject-${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('settings.house_info.reject')}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </AccordionSection>
                )}
            </section>

            <section id="settings-preferences" className="app-settings-section scroll-mt-24 space-y-5">
                <SectionHeader
                    eyebrow={t('settings.security_section.eyebrow', { defaultValue: 'Security and preferences' })}
                    title={t('settings.security_section.title', { defaultValue: 'Protection and preferences' })}
                    description={t('settings.security_section.description', { defaultValue: 'Control sign-in, account recovery, trusted devices, and appearance without hunting through separate panels.' })}
                />

                {/* Theme & Security Section */}
                <AccordionSection
                    title={t('settings.preferences_section.title', { defaultValue: 'Appearance and language' })}
                    description={t('settings.preferences_section.description', { defaultValue: 'Keep the workspace comfortable on this device and set the language used across navigation and legal text.' })}
                    eyebrow={t('settings.control_sections.preferences', { defaultValue: 'Preferences' })}
                    icon={theme === 'dark' ? Moon : Sun}
                    defaultOpen
                    className="mb-5"
                >
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="app-control-section-nested flex h-full flex-col">
                            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                                {theme === 'dark' ? <Moon className="h-5 w-5 text-[var(--hi-accent)]" /> : <Sun className="h-5 w-5 text-[var(--hi-secondary)]" />}
                                {t('settings.theme.title')}
                            </h2>
                            <div className="mt-2 flex flex-1 flex-col justify-between gap-4">
                                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="font-medium text-[var(--hi-text)]">{t('settings.theme.title')}</p>
                                        <SegmentedToggle
                                            ariaLabel={t('settings.theme.title')}
                                            value={theme}
                                            onChange={(val) => setTheme(val as Theme)}
                                            fullWidth
                                            className="sm:w-auto sm:min-w-[320px]"
                                            activeClassName="bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]"
                                            options={[
                                                {
                                                    value: 'light',
                                                    label: t('settings.theme.light'),
                                                    icon: Sun,
                                                    tooltip: t('settings.theme.light'),
                                                    ariaLabel: t('settings.theme.light_aria', { defaultValue: 'Switch to light theme' })
                                                },
                                                {
                                                    value: 'dark',
                                                    label: t('settings.theme.dark'),
                                                    icon: Moon,
                                                    tooltip: t('settings.theme.dark'),
                                                    ariaLabel: t('settings.theme.dark_aria', { defaultValue: 'Switch to dark theme' })
                                                }
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium text-[var(--hi-text)]">
                                                {t('settings.language')}
                                            </p>
                                            <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                                {t('settings.language_description')}
                                            </p>
                                        </div>
                                        <LanguageSwitcher
                                            showCodeBadge={false}
                                            className="!w-full !justify-between !rounded-[0.9rem] !border-[var(--hi-border)] !bg-[var(--hi-panel)] !px-3 !py-2 text-sm hover:!bg-[var(--hi-panel-strong)] sm:!w-auto sm:!min-w-[220px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="app-control-section-nested flex h-full flex-col">
                            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                                <Shield className="h-5 w-5 text-[var(--hi-accent)]" />
                                {t('settings.security.title')}
                            </h2>
                            <div className="mt-2 flex flex-1 flex-col justify-between gap-4">
                                <button
                                    onClick={() => setShowPasswordModal(true)}
                                    className="group flex w-full items-center justify-between rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]"
                                >
                                    <p className="font-medium text-[var(--hi-text)]">{t('settings.security.change_password')}</p>
                                    <ArrowRightLeft className="h-5 w-5 text-[var(--hi-text-soft)] transition group-hover:text-[var(--hi-accent)]" />
                                </button>

                                {passwordRecoveryMode === 'recovery_key' && (
                                    <div className="rounded-xl border border-[rgba(184,153,104,0.2)] bg-[var(--hi-secondary-soft)] p-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="font-medium text-[var(--hi-text)]">{t('settings.security.recovery_key_title')}</p>
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
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </AccordionSection>

                {/* Two-Factor Authentication Section */}
                <AccordionSection
                    title={t('settings.two_factor.title')}
                    description={t('settings.two_factor.description')}
                    eyebrow={t('settings.control_sections.security', { defaultValue: 'Security' })}
                    icon={ShieldCheck}
                    badge={totpEnabled ? (
                        <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hi-accent)]">
                            {t('settings.two_factor.active')}
                        </span>
                    ) : null}
                    className="mb-5"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${totpEnabled ? 'bg-[var(--hi-accent-soft)]' : 'bg-[var(--hi-panel-muted)]'}`}>
                            <ShieldCheck className={`h-5 w-5 ${totpEnabled ? 'text-[var(--hi-accent)]' : 'text-[var(--hi-text-soft)]'}`} />
                        </div>
                        <div className="flex-1">
                            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                                {t('settings.two_factor.title')}
                                {totpEnabled && (
                                    <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hi-accent)]">
                                        {t('settings.two_factor.active')}
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-[var(--hi-text-soft)]">
                                {t('settings.two_factor.description')}
                            </p>
                        </div>
                    </div>

                    {!totpEnabled ? (
                        <button
                            onClick={() => setShow2FASetup(true)}
                            className="btn-secondary py-3 px-6 flex items-center gap-2"
                        >
                            <ShieldCheck className="w-4 h-4" />
                            {t('settings.two_factor.enable')}
                        </button>
                    ) : (
                        <div className="space-y-3">
                            {/* Disable 2FA */}
                            <button
                                onClick={() => { setShow2FADisableModal(true); setDisableError(''); setDisablePassword(''); setDisableCode(''); setDisableMethod('totp'); }}
                                className="group flex w-full items-center justify-between rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]"
                            >
                                <div className="text-left">
                                    <p className="font-medium text-[var(--hi-text)]">{t('settings.two_factor.disable')}</p>
                                    <p className="text-sm text-[var(--hi-text-soft)]">{t('settings.two_factor.disable_desc')}</p>
                                </div>
                                <X className="h-5 w-5 text-[var(--hi-text-soft)] transition group-hover:text-red-400" />
                            </button>

                            {/* Regenerate Backup Codes */}
                            <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="font-medium text-[var(--hi-text)]">{t('settings.two_factor.regenerate_codes')}</p>
                                        <p className="text-sm text-[var(--hi-text-soft)]">{t('settings.two_factor.regenerate_codes_desc')}</p>
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
                                                    showSuccessToast(t('settings.two_factor.codes_regenerated'));
                                                } catch (err: any) {
                                                    showErrorToast(err.response?.data?.error || t('settings.two_factor.codes_error'));
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
                                                <div key={i} className="select-all rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] px-2 py-1.5 text-center font-mono text-xs text-[var(--hi-text-soft)]">
                                                    {code}
                                                </div>
                                            ))}
                                        </div>
                                        <button onClick={() => setBackupCodesResult(null)} className="text-sm font-medium text-[var(--hi-accent)] transition hover:text-[var(--hi-accent-strong)]">
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
                                        showSuccessToast(t('settings.two_factor.devices_revoked', { count: res.data.devicesRevoked || 0 }));
                                    } catch (err: any) {
                                        showErrorToast(err.response?.data?.error || t('settings.two_factor.devices_error'));
                                    } finally {
                                        setRevokeLoading(false);
                                    }
                                }}
                                className="group flex w-full items-center justify-between rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4 transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]"
                            >
                                <div className="text-left">
                                    <p className="font-medium text-[var(--hi-text)]">{t('settings.two_factor.revoke_devices')}</p>
                                    <p className="text-sm text-[var(--hi-text-soft)]">{t('settings.two_factor.revoke_devices_desc')}</p>
                                </div>
                                {revokeLoading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--hi-text-soft)]" /> : <Trash2 className="h-5 w-5 text-[var(--hi-text-soft)] transition group-hover:text-red-400" />}
                            </button>
                        </div>
                    )}
                </AccordionSection>
            </section>

            <section className="app-settings-section space-y-5">
                <SectionHeader
                    eyebrow={t('settings.data_section.eyebrow', { defaultValue: 'Data and about' })}
                    title={t('settings.data_section.title', { defaultValue: 'Data, legal, and account ownership' })}
                />

                {/* Data Management Section */}
                <AccordionSection
                    title={t('settings.data_management.title')}
                    description={t('settings.data_management.accordion_description', { defaultValue: 'Download encrypted backups, restore trusted files, and keep sensitive exports separate from everyday settings.' })}
                    eyebrow={t('settings.control_sections.data', { defaultValue: 'Data' })}
                    icon={Database}
                    className="mb-5"
                >
                    {canManageBackups ? (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <button onClick={openBackupModal} disabled={downloading} className="flex items-center gap-3 rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-left transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                        {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-[var(--hi-text)]">{t('settings.data_management.download_backup')}</p>
                                        <p className="text-xs text-[var(--hi-text-soft)]">{t('settings.data_management.export_json')}</p>
                                    </div>
                                </button>

                                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-3 rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-left transition hover:border-[var(--hi-border-strong)] hover:bg-[var(--hi-panel-strong)]">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)]">
                                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-[var(--hi-text)]">{t('settings.data_management.upload_backup')}</p>
                                        <p className="text-xs text-[var(--hi-text-soft)]">{t('settings.data_management.import_json')}</p>
                                    </div>
                                </button>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleRestoreBackup} accept=".json" className="hidden" />

                            <p className="mt-3 text-xs leading-5 text-[var(--hi-text-soft)]">
                                {t('settings.data_management.export_sensitive_notice', {
                                    defaultValue: 'Backups are exported from live household data first. Keep encryption enabled so the downloaded file stays protected with your passphrase.'
                                })}
                            </p>
                        </>
                    ) : (
                        <div className="rounded-[1rem] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] p-4 text-sm text-[var(--hi-secondary-strong)] flex items-start gap-3">
                            <Database className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">{t('settings.data_management.owner_only_title', { defaultValue: 'Yedekleme ve Geri Yükleme Kısıtlı' })}</p>
                                <p className="mt-1 text-xs leading-5 text-[var(--hi-text-soft)]">
                                    {t('settings.data_management.owner_only_desc', { defaultValue: 'Veri yedekleme ve geri yükleme yalnızca ev sahibi tarafından yönetilebilir.' })}
                                </p>
                            </div>
                        </div>
                    )}
                </AccordionSection>

                <AccordionSection
                    title={t('settings.danger_zone.title')}
                    description={t('settings.danger_zone.delete_description')}
                    eyebrow={t('settings.control_sections.account', { defaultValue: 'Account' })}
                    icon={UserX}
                    className="mb-5"
                >
                    <div className="rounded-[1rem] border border-red-500/14 bg-[rgba(187,66,87,0.045)] p-4">
                        <p className="font-medium text-[var(--hi-text)]">
                            {t('settings.danger_zone.delete_title')}
                        </p>
                        <p className="mt-2 text-sm text-[var(--hi-text-soft)]">
                            {t('settings.danger_zone.delete_description')}
                        </p>
                        <p className="mt-3 text-xs text-[var(--hi-text-soft)]">
                            {t('settings.danger_zone.delete_warning')}
                        </p>

                        <button
                            type="button"
                            onClick={openDeleteAccountModal}
                            className="btn-danger mt-4 w-full"
                        >
                            <UserX className="h-4 w-4" />
                            {t('settings.danger_zone.delete_action')}
                        </button>
                    </div>
                </AccordionSection>

                <FloatingToastStack toasts={toasts} onClose={closeToast} />

                <ConfirmDialog
                    isOpen={Boolean(pendingLeaveHouse)}
                    title={t('settings.my_houses.leave_title', { defaultValue: 'Leave this house?' })}
                    description={pendingLeaveHouse ? t('settings.messages.house_leave_confirm', { name: pendingLeaveHouse.name }) : ''}
                    confirmLabel={houseActionLoading ? t('settings.my_houses.leaving', { defaultValue: 'Leaving...' }) : t('settings.my_houses.leave')}
                    cancelLabel={t('common.cancel')}
                    confirmButtonClassName="btn-danger"
                    tone="danger"
                    confirming={houseActionLoading}
                    onClose={() => !houseActionLoading && setPendingLeaveHouse(null)}
                    onConfirm={handleLeaveHouse}
                >
                    <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                        <p className="font-medium text-[var(--hi-text)]">{pendingLeaveHouse?.name}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                            {t('settings.my_houses.leave_warning', {
                                defaultValue: 'You will lose access to this household workspace until another member invites or approves you again.'
                            })}
                        </p>
                    </div>
                </ConfirmDialog>

                <ConfirmDialog
                    isOpen={Boolean(pendingKickMember)}
                    title={t('settings.house_info.kick_title', { defaultValue: 'Remove this member?' })}
                    description={pendingKickMember ? t('settings.messages.member_kick_confirm', { name: pendingKickMember.username }) : ''}
                    confirmLabel={memberActionLoading === `kick-${pendingKickMember?.id}` ? t('settings.house_info.kicking', { defaultValue: 'Removing...' }) : t('settings.house_info.kick')}
                    cancelLabel={t('common.cancel')}
                    confirmButtonClassName="btn-danger"
                    tone="danger"
                    confirming={memberActionLoading === `kick-${pendingKickMember?.id}`}
                    onClose={() => memberActionLoading !== `kick-${pendingKickMember?.id}` && setPendingKickMember(null)}
                    onConfirm={handleKickMember}
                >
                    <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                        <p className="font-medium text-[var(--hi-text)]">{pendingKickMember?.username}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                            {t('settings.house_info.kick_warning', {
                                defaultValue: 'Their household access will end immediately and they will need a new invitation or approval to return.'
                            })}
                        </p>
                    </div>
                </ConfirmDialog>

                <ConfirmDialog
                    isOpen={showLogoutConfirm}
                    title={t('settings.about.logout_title', { defaultValue: 'Log out now?' })}
                    description={t('settings.about.logout_description', { defaultValue: 'You will return to the home page and can sign back in anytime.' })}
                    confirmLabel={logoutSubmitting ? t('common.logging_out', { defaultValue: 'Logging out...' }) : t('common.logout')}
                    cancelLabel={t('common.cancel')}
                    confirming={logoutSubmitting}
                    tone="warning"
                    onClose={() => !logoutSubmitting && setShowLogoutConfirm(false)}
                    onConfirm={handleLogout}
                >
                    <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('settings.about.logout_body', { defaultValue: 'Any unsaved changes in open forms may be lost after you leave this session.' })}
                    </div>
                </ConfirmDialog>

                <ConfirmDialog
                    isOpen={showHouseKeyRevealConfirm}
                    title={t('settings.house_info.reveal_confirm_title', { defaultValue: 'Reveal the house key?' })}
                    description={t('settings.house_info.reveal_confirm_body', { defaultValue: 'This key grants household access requests. Make sure nobody else can see your screen before continuing.' })}
                    confirmLabel={t('settings.house_info.show_securely', { defaultValue: 'Anahtarı göster' })}
                    cancelLabel={t('common.cancel')}
                    confirmDisabled={!houseKeyRevealAcknowledged}
                    tone="warning"
                    onClose={closeHouseKeyRevealConfirm}
                    onConfirm={() => {
                        closeHouseKeyRevealConfirm();
                        setShowHouseKeyModal(true);
                    }}
                >
                    <div className="space-y-4">
                        <div className="rounded-[1rem] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                            {t('settings.house_info.share_warning_body', { defaultValue: 'Anyone with this key can request access to the household inventory. Only share it with trusted members and use a private channel.' })}
                        </div>
                        <label className="app-premium-checkbox-container flex items-start gap-3 rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text)] cursor-pointer hover:border-[var(--hi-border-strong)] transition-all">
                            <PremiumCheckbox
                                checked={houseKeyRevealAcknowledged}
                                onChange={(event) => setHouseKeyRevealAcknowledged(event.target.checked)}
                            />
                            <span>
                                {t('settings.house_info.reveal_confirm_acknowledge', { defaultValue: 'I understand that anyone with this key can request access to this household.' })}
                            </span>
                        </label>
                    </div>
                </ConfirmDialog>

                <ConfirmDialog
                    isOpen={showHouseKeyCopyConfirm}
                    title={t('settings.house_info.copy_confirm_title', { defaultValue: 'Copy the house key?' })}
                    description={t('settings.house_info.copy_confirm_body', { defaultValue: 'Copy only when you are ready to paste it into a trusted message or secure password manager.' })}
                    confirmLabel={t('settings.house_info.copy_securely', { defaultValue: 'Copy securely' })}
                    cancelLabel={t('common.cancel')}
                    confirmDisabled={!houseKeyCopyAcknowledged}
                    tone="warning"
                    onClose={closeHouseKeyCopyConfirm}
                    onConfirm={copyToClipboard}
                >
                    <div className="space-y-4">
                        <div className="rounded-[1rem] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                            {t('settings.house_info.copy_confirm_tip', { defaultValue: 'Do not paste this into group chats, screenshots, or any channel you would not trust with your front-door code.' })}
                        </div>
                        <label className="app-premium-checkbox-container flex items-start gap-3 rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text)] cursor-pointer hover:border-[var(--hi-border-strong)] transition-all">
                            <PremiumCheckbox
                                checked={houseKeyCopyAcknowledged}
                                onChange={(event) => setHouseKeyCopyAcknowledged(event.target.checked)}
                            />
                            <span>
                                {t('settings.house_info.copy_confirm_acknowledge', { defaultValue: 'I understand this key should be pasted only into a trusted private channel or password manager.' })}
                            </span>
                        </label>
                    </div>
                </ConfirmDialog>

                <ModalDialog
                    isOpen={showBackupModal}
                    title={t('settings.data_management.backup_modal_title', { defaultValue: 'Download household backup' })}
                    description={t('settings.data_management.backup_modal_body', { defaultValue: 'Choose whether the downloaded backup should be protected with a passphrase. Encryption is recommended for almost every export.' })}
                    onClose={closeBackupModal}
                    tone="warning"
                    footer={(
                        <>
                            <button type="button" onClick={closeBackupModal} className="btn-secondary px-5 py-3" disabled={downloading}>
                                {t('common.cancel')}
                            </button>
                            <button type="button" onClick={triggerBackupDownload} className="btn-primary px-5 py-3 disabled:opacity-60" disabled={downloading}>
                                {downloading ? t('settings.data_management.downloading') : t('settings.data_management.download_backup')}
                            </button>
                        </>
                    )}
                >
                    <div className="space-y-4">
                        <div className="rounded-[1rem] border border-[rgba(184,153,104,0.22)] bg-[var(--hi-secondary-soft)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                            <p className="font-medium text-[var(--hi-text)]">
                                {backupEncryptEnabled
                                    ? t('settings.data_management.export_encrypted_title', { defaultValue: 'Encryption will be applied before download' })
                                    : t('settings.data_management.export_sensitive_title')}
                            </p>
                            <p className="mt-1">
                                {backupEncryptEnabled
                                    ? t('settings.data_management.export_encrypted_notice', {
                                        defaultValue: 'The backup is prepared from live household data and then wrapped with the passphrase you choose. Keep that passphrase somewhere safe because it is required to restore the file later.'
                                    })
                                    : t('settings.data_management.unencrypted_warning', { defaultValue: 'Plain JSON exports are easier to inspect, but anyone who opens the file can read your household data immediately.' })}
                            </p>
                        </div>

                        <label className="app-premium-checkbox-container flex items-start gap-3 rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 cursor-pointer hover:border-[var(--hi-border-strong)] transition-all">
                            <PremiumCheckbox
                                checked={backupEncryptEnabled}
                                onChange={(event) => setBackupEncryptEnabled(event.target.checked)}
                            />
                            <div>
                                <p className="font-medium text-[var(--hi-text)]">
                                    {t('settings.data_management.encrypt_toggle_title', { defaultValue: 'Encrypt backup before download' })}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {t('settings.data_management.encrypt_toggle_body', { defaultValue: 'Recommended. The downloaded file is wrapped with a passphrase you choose and can be restored later with the same passphrase.' })}
                                </p>
                            </div>
                        </label>

                        {backupEncryptEnabled ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                        {t('settings.data_management.passphrase_label', { defaultValue: 'Backup passphrase' })}
                                    </label>
                                    <input
                                        type="password"
                                        value={backupPassphrase}
                                        onChange={(event) => setBackupPassphrase(event.target.value)}
                                        className="input-field"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                        {t('settings.data_management.passphrase_confirm_label', { defaultValue: 'Confirm passphrase' })}
                                    </label>
                                    <input
                                        type="password"
                                        value={backupPassphraseConfirm}
                                        onChange={(event) => setBackupPassphraseConfirm(event.target.value)}
                                        className="input-field"
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-[1rem] border border-[rgba(187,66,87,0.18)] bg-[var(--hi-danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                                {t('settings.data_management.unencrypted_warning', { defaultValue: 'Plain JSON exports are easier to inspect, but anyone who opens the file can read your household data immediately.' })}
                            </div>
                        )}

                        {backupModalError && (
                            <div className="rounded-[1rem] border border-[rgba(187,66,87,0.18)] bg-[var(--hi-danger-soft)] px-4 py-3 text-sm text-[var(--hi-danger)]">
                                {backupModalError}
                            </div>
                        )}
                    </div>
                </ModalDialog>

                <ModalDialog
                    isOpen={showEncryptedImportModal}
                    title={t('settings.data_management.import_encrypted_title', { defaultValue: 'Unlock encrypted backup' })}
                    description={t('settings.data_management.import_encrypted_body', { defaultValue: 'Enter the backup passphrase used during download to restore this encrypted file.' })}
                    onClose={closeEncryptedImportModal}
                    tone="warning"
                    footer={(
                        <>
                            <button type="button" onClick={closeEncryptedImportModal} className="btn-secondary px-5 py-3" disabled={uploading}>
                                {t('common.cancel')}
                            </button>
                            <button type="button" onClick={handleEncryptedImportSubmit} className="btn-primary px-5 py-3 disabled:opacity-60" disabled={uploading}>
                                {uploading ? t('settings.data_management.uploading') : t('settings.data_management.unlock_and_import', { defaultValue: 'Unlock and import' })}
                            </button>
                        </>
                    )}
                >
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                {t('settings.data_management.passphrase_label', { defaultValue: 'Backup passphrase' })}
                            </label>
                            <input
                                type="password"
                                value={backupImportPassphrase}
                                onChange={(event) => setBackupImportPassphrase(event.target.value)}
                                className="input-field"
                                autoComplete="current-password"
                            />
                        </div>

                        {backupImportError && (
                            <div className="rounded-[1rem] border border-[rgba(187,66,87,0.18)] bg-[var(--hi-danger-soft)] px-4 py-3 text-sm text-[var(--hi-danger)]">
                                {backupImportError}
                            </div>
                        )}
                    </div>
                </ModalDialog>

                {/* Password Change Modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)} />
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)] animate-slide-up">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('settings.modals.password.title')}</h2>
                                <button type="button" onClick={() => setShowPasswordModal(false)} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">{t('settings.modals.password.current')}</label>
                                    <input type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange} className="input-field" required />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">{t('settings.modals.password.new')}</label>
                                    <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} className="input-field" required minLength={6} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">{t('settings.modals.password.confirm')}</label>
                                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="input-field" required minLength={6} />
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

                {showDeleteAccountModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDeleteAccountModal} />
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)]">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10">
                                        <UserX className="h-5 w-5 text-red-400" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[var(--hi-text)]">
                                        {t('settings.danger_zone.modal_title')}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeDeleteAccountModal}
                                    aria-label={t('common.close')}
                                    className={MODAL_CLOSE_BUTTON_CLASS}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handleDeleteAccount} className="space-y-4 p-6">
                                {deleteAccountError && (
                                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        {deleteAccountError}
                                    </div>
                                )}

                                <div className="rounded-xl border border-red-500/16 bg-red-500/5 p-4 text-sm text-[var(--hi-text-soft)]">
                                    <p className="font-medium">{t('settings.danger_zone.modal_warning_title')}</p>
                                    <p className="mt-2">{t('settings.danger_zone.modal_warning_body')}</p>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                        {t('settings.danger_zone.password_label')}
                                    </label>
                                    <input
                                        type="password"
                                        value={deletePassword}
                                        onChange={(event) => setDeletePassword(event.target.value)}
                                        className="input-field"
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button type="submit" disabled={deleteAccountLoading} className="btn-danger flex-1 disabled:opacity-50">
                                        {deleteAccountLoading ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                {t('settings.danger_zone.deleting')}
                                            </span>
                                        ) : (
                                            t('settings.danger_zone.confirm_delete')
                                        )}
                                    </button>
                                    <button type="button" onClick={closeDeleteAccountModal} className="btn-secondary px-6 py-3">
                                        {t('common.cancel')}
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
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)] animate-slide-up">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)]">
                                        <Users className="h-5 w-5 text-[var(--hi-accent)]" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('settings.modals.join_house.title')}</h2>
                                </div>
                                <button type="button" onClick={() => setShowJoinHouseModal(false)} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
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
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                                    <p className="mt-1 text-xs text-[var(--hi-text-soft)]">{t('settings.modals.join_house.key_help')}</p>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)] animate-slide-up">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)]">
                                        <Plus className="h-5 w-5 text-[var(--hi-accent)]" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('settings.modals.create_house.title')}</h2>
                                </div>
                                <button type="button" onClick={() => setShowCreateHouseModal(false)} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
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
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                                    <p className="mt-1 text-xs text-[var(--hi-text-soft)]">{t('settings.modals.create_house.name_help')}</p>
                                </div>

                                <div className="rounded-xl border border-[rgba(184,153,104,0.2)] bg-[var(--hi-secondary-soft)] p-3 flex items-start gap-2.5">
                                    <Info className="h-4.5 w-4.5 shrink-0 text-[var(--hi-secondary-strong)] mt-0.5" />
                                    <p className="text-sm text-[var(--hi-secondary-strong)] leading-5">
                                        {t('settings.modals.create_house.info').replace(/^[ℹ️ℹ\s\uFE0F\u2139]+/g, '')}
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
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)]">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--hi-secondary-soft)]">
                                        <Key className="h-5 w-5 text-[var(--hi-secondary-strong)]" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[var(--hi-text)]">
                                        {t('settings.security.recovery_key_action')}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowRecoveryKeyRegenerateModal(false)}
                                    aria-label={t('common.close')}
                                    className={MODAL_CLOSE_BUTTON_CLASS}
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

                                <p className="text-sm text-[var(--hi-text-soft)]">
                                    {t('settings.security.recovery_key_modal_desc')}
                                </p>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)] animate-slide-up">
                            <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)]">
                                        <Edit3 className="h-5 w-5 text-[var(--hi-accent)]" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-[var(--hi-text)]">{t('settings.modals.username.title')}</h2>
                                </div>
                                <button type="button" onClick={closeUsernameModal} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
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
                                    <div className="flex items-center gap-2 rounded-xl border border-[rgba(111,153,120,0.18)] bg-[rgba(111,153,120,0.10)] p-3 text-sm text-[var(--hi-text)]">
                                        <CheckCircle className="w-4 h-4 flex-shrink-0 text-[var(--hi-accent)]" />{usernameSuccess}
                                    </div>
                                )}

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                                    <p className="mt-1 text-xs text-[var(--hi-text-soft)]">{t('settings.modals.username.help')}</p>
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

                {showHouseKeyModal && (
                    <HouseKeyModal
                        houseKey={houseKey}
                        title={t('settings.house_info.modal_title', { defaultValue: 'House key access' })}
                        subtitle={t('settings.house_info.modal_subtitle', { defaultValue: 'Use this key only for trusted household members who should request access to this shared inventory.' })}
                        warning={t('settings.house_info.share_warning_body', { defaultValue: 'Anyone with this key can request access to the household inventory. Only share it with trusted members and use a private channel.' })}
                        confirmLabel={t('common.close')}
                        onCopied={() => showToast({
                            title: t('settings.house_info.copy_success_title', { defaultValue: 'House key copied' }),
                            description: t('settings.house_info.copy_success_body', { defaultValue: 'Treat it like a household password and share it only through a trusted channel.' })
                        })}
                        onConfirm={() => setShowHouseKeyModal(false)}
                    />
                )}

                <SettingsAboutSection onLogout={() => setShowLogoutConfirm(true)} />
            </section>

            {/* 2FA Setup Modal */}
            {show2FASetup && (
                <TwoFactorSetup
                    onClose={() => setShow2FASetup(false)}
                    onEnabled={() => { fetchUserData(); }}
                />
            )}

            {/* 2FA Disable Modal */}
            {show2FADisableModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow)]">
                        <div className="flex items-center justify-between border-b border-[var(--hi-border)] p-6">
                            <h2 className="text-lg font-semibold text-[var(--hi-text)]">
                                {t('settings.two_factor.disable_title')}
                            </h2>
                            <button type="button" onClick={() => setShow2FADisableModal(false)} aria-label={t('common.close')} className={MODAL_CLOSE_BUTTON_CLASS}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setDisableLoading(true);
                                setDisableError('');
                                try {
                                    const payload: any = { password: disablePassword };
                                    if (disableMethod === 'totp') payload.token = disableCode;
                                    else if (disableMethod === 'backup') payload.backupCode = disableCode;
                                    else if (disableMethod === 'recovery') payload.recoveryKey = disableCode;

                                    await axios.post('/api/auth/2fa/disable', payload);
                                    setShow2FADisableModal(false);
                                    fetchUserData();
                                    showSuccessToast(t('settings.two_factor.disabled_success'));
                                } catch (err: any) {
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
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                            <div className="flex gap-1 rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-1">
                                {[
                                    { key: 'totp', label: t('settings.two_factor.method_totp') },
                                    { key: 'backup', label: t('settings.two_factor.method_backup') },
                                    { key: 'recovery', label: t('settings.two_factor.method_recovery') }
                                ].map(m => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => { setDisableMethod(m.key); setDisableCode(''); }}
                                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${disableMethod === m.key ? 'bg-[var(--hi-panel-strong)] text-[var(--hi-text)] shadow-[var(--hi-shadow-soft)]' : 'text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]'}`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                                <button type="submit" disabled={disableLoading} className="btn-danger flex-1 disabled:opacity-50">
                                    {disableLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('settings.two_factor.disable_confirm')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
