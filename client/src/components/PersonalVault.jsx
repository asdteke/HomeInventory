import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    CalendarDays,
    KeyRound,
    Lock,
    LockOpen,
    Package,
    Save,
    Search,
    ShieldAlert,
    ShieldCheck,
    Tag,
    Trash2,
    XCircle
} from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';
import { useVault } from '../context/VaultContext';
import { validateVaultPassphrase } from '../utils/personalVaultCrypto';

const CURRENCY_OPTIONS = [
    { code: 'TRY', label: 'TRY (₺)' },
    { code: 'USD', label: 'USD ($)' },
    { code: 'EUR', label: 'EUR (€)' },
    { code: 'GBP', label: 'GBP (£)' },
    { code: 'CHF', label: 'CHF' },
    { code: 'CAD', label: 'CAD (C$)' },
    { code: 'AUD', label: 'AUD (A$)' },
    { code: 'JPY', label: 'JPY (¥)' },
    { code: 'SAR', label: 'SAR (﷼)' },
    { code: 'AED', label: 'AED (د.إ)' }
];
const CUSTOM_CURRENCY_OPTION = '__OTHER__';
const WARRANTY_DURATION_OPTIONS = [
    { code: 'months', labelKey: 'items.form.warranty_duration_months' },
    { code: 'years', labelKey: 'items.form.warranty_duration_years' }
];

function createInitialVaultFormData() {
    return {
        name: '',
        description: '',
        quantity: '1',
        category_id: '',
        category_name: '',
        category_icon: '',
        category_color: '',
        room_id: '',
        room_name: '',
        location_details: '',
        barcode: '',
        invoice_price: '',
        invoice_currency: '',
        invoice_currency_custom: '',
        invoice_date: '',
        warranty_start_date: '',
        warranty_duration_value: '',
        warranty_duration_unit: '',
        warranty_expiry_date: ''
    };
}

function normalizeDurationValue(value) {
    return String(value || '').replace(/[^\d]/g, '').slice(0, 4);
}

function parseDurationValue(value) {
    const normalized = String(value || '').trim();
    if (!/^\d{1,4}$/.test(normalized)) {
        return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1200) {
        return null;
    }

    return parsed;
}

function buildValidatedIsoDate(yearValue, monthValue, dayValue) {
    const year = String(yearValue || '').padStart(4, '0');
    const month = String(monthValue || '').padStart(2, '0');
    const day = String(dayValue || '').padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return '';
    }

    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
        return '';
    }

    return isoDate;
}

function addMonthsClamped(isoDate, monthDelta) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return '';
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const baseMonthIndex = (year * 12) + (month - 1);
    const targetMonthIndex = baseMonthIndex + monthDelta;
    const targetYear = Math.floor(targetMonthIndex / 12);
    const targetMonth = (targetMonthIndex % 12) + 1;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

    return buildValidatedIsoDate(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth));
}

function calculateWarrantyExpiryDate(startDateValue, durationValue, durationUnit) {
    const parsedDurationValue = parseDurationValue(durationValue);
    if (!startDateValue || !parsedDurationValue) {
        return '';
    }

    if (!WARRANTY_DURATION_OPTIONS.some((option) => option.code === durationUnit)) {
        return '';
    }

    const monthDelta = durationUnit === 'years'
        ? parsedDurationValue * 12
        : parsedDurationValue;

    return addMonthsClamped(startDateValue, monthDelta);
}

function hasInvoiceContent(formState) {
    return Boolean(
        formState.invoice_price ||
        (formState.invoice_currency === CUSTOM_CURRENCY_OPTION ? formState.invoice_currency_custom : formState.invoice_currency) ||
        formState.invoice_date ||
        formState.warranty_start_date ||
        formState.warranty_duration_value ||
        formState.warranty_duration_unit ||
        formState.warranty_expiry_date
    );
}

function formatLocalDate(dateValue, locale) {
    const isoDate = String(dateValue || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return '-';
    }

    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        return isoDate;
    }

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(parsed);
}

function formatLocalDateTime(dateValue, locale) {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(parsed);
}

function normalizeVaultItemPayload(payload, fallbackId, createdAt, updatedAt) {
    const quantity = Number.parseInt(payload?.quantity, 10);
    const category = payload?.category || null;
    const room = payload?.room || null;

    return {
        id: fallbackId,
        name: String(payload?.name || '').trim(),
        description: String(payload?.description || payload?.notes || '').trim(),
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
        category_id: category?.id || String(payload?.category_id || ''),
        category_name: String(category?.name || payload?.category_name || '').trim(),
        category_icon: String(category?.icon || payload?.category_icon || ''),
        category_color: String(category?.color || payload?.category_color || ''),
        room_id: room?.id || String(payload?.room_id || ''),
        room_name: String(room?.name || payload?.room_name || '').trim(),
        location_details: String(payload?.location_details || '').trim(),
        barcode: String(payload?.barcode || '').trim(),
        invoice_price: String(payload?.invoice_price || '').trim(),
        invoice_currency: String(payload?.invoice_currency || '').trim(),
        invoice_date: String(payload?.invoice_date || '').trim(),
        warranty_start_date: String(payload?.warranty_start_date || '').trim(),
        warranty_duration_value: String(payload?.warranty_duration_value || '').trim(),
        warranty_duration_unit: String(payload?.warranty_duration_unit || '').trim(),
        warranty_expiry_date: String(payload?.warranty_expiry_date || '').trim(),
        created_at: createdAt,
        updated_at: updatedAt
    };
}

function buildVaultItemPayload(formState, categories, rooms) {
    const selectedCategory = categories.find((category) => String(category.id) === String(formState.category_id));
    const selectedRoom = rooms.find((room) => String(room.id) === String(formState.room_id));
    const resolvedInvoiceCurrency = formState.invoice_currency === CUSTOM_CURRENCY_OPTION
        ? formState.invoice_currency_custom
        : formState.invoice_currency;
    const effectiveWarrantyStartDate = formState.warranty_start_date || formState.invoice_date;
    const calculatedWarrantyExpiryDate = calculateWarrantyExpiryDate(
        effectiveWarrantyStartDate,
        formState.warranty_duration_value,
        formState.warranty_duration_unit
    );

    return {
        type: 'personal-vault-item',
        schemaVersion: 2,
        name: String(formState.name || '').trim(),
        description: String(formState.description || '').trim(),
        quantity: Number.parseInt(formState.quantity, 10) || 1,
        category: selectedCategory
            ? {
                id: String(selectedCategory.id),
                name: selectedCategory.name,
                icon: selectedCategory.icon,
                color: selectedCategory.color
            }
            : (formState.category_name
                ? {
                    id: String(formState.category_id || ''),
                    name: formState.category_name,
                    icon: formState.category_icon,
                    color: formState.category_color
                }
                : null),
        room: selectedRoom
            ? {
                id: String(selectedRoom.id),
                name: selectedRoom.name
            }
            : (formState.room_name
                ? {
                    id: String(formState.room_id || ''),
                    name: formState.room_name
                }
                : null),
        location_details: String(formState.location_details || '').trim(),
        barcode: String(formState.barcode || '').trim(),
        invoice_price: String(formState.invoice_price || '').trim(),
        invoice_currency: String(resolvedInvoiceCurrency || '').trim().toUpperCase(),
        invoice_date: String(formState.invoice_date || '').trim(),
        warranty_start_date: String(
            formState.warranty_duration_value || formState.warranty_duration_unit
                ? effectiveWarrantyStartDate
                : formState.warranty_start_date
        ).trim(),
        warranty_duration_value: String(formState.warranty_duration_value || '').trim(),
        warranty_duration_unit: String(formState.warranty_duration_unit || '').trim(),
        warranty_expiry_date: String(calculatedWarrantyExpiryDate || formState.warranty_expiry_date || '').trim()
    };
}

function downloadRecoveryKeyFile(recoveryKey, labels) {
    const content = [
        labels.title,
        '',
        `${labels.createdLabel}: ${new Date().toISOString()}`,
        `${labels.keyLabel}: ${recoveryKey}`,
        '',
        labels.warning
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'homeinventory-personal-vault-recovery-key.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export default function PersonalVault() {
    const { t, i18n } = useTranslation();
    const {
        vaultConfigured,
        vaultItemCount,
        vaultUnlocked,
        vaultLoading,
        setupVault,
        unlockWithPassphrase,
        unlockWithRecoveryKey,
        encryptPayload,
        decryptPayload,
        lockVault,
        refreshVaultStatus
    } = useVault();
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [itemsError, setItemsError] = useState('');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [roomFilter, setRoomFilter] = useState('');
    const [vaultActionLoading, setVaultActionLoading] = useState(false);
    const [savingItem, setSavingItem] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [formState, setFormState] = useState(createInitialVaultFormData);
    const [showInvoiceSection, setShowInvoiceSection] = useState(false);
    const [setupPassphrase, setSetupPassphrase] = useState('');
    const [setupPassphraseConfirm, setSetupPassphraseConfirm] = useState('');
    const [setupError, setSetupError] = useState('');
    const [setupSuccessKey, setSetupSuccessKey] = useState('');
    const [unlockMode, setUnlockMode] = useState('passphrase');
    const [unlockSecret, setUnlockSecret] = useState('');
    const [unlockError, setUnlockError] = useState('');

    const filteredItems = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return items
            .filter((item) => {
                if (needle) {
                    const searchable = [
                        item.name,
                        item.description,
                        item.location_details,
                        item.barcode,
                        item.category_name,
                        item.room_name
                    ].join(' ').toLowerCase();

                    if (!searchable.includes(needle)) {
                        return false;
                    }
                }

                if (categoryFilter) {
                    const categoryMatches = String(item.category_id || '') === String(categoryFilter)
                        || categories.find((category) => String(category.id) === String(categoryFilter))?.name === item.category_name;
                    if (!categoryMatches) {
                        return false;
                    }
                }

                if (roomFilter) {
                    const roomMatches = String(item.room_id || '') === String(roomFilter)
                        || rooms.find((room) => String(room.id) === String(roomFilter))?.name === item.room_name;
                    if (!roomMatches) {
                        return false;
                    }
                }

                return true;
            })
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
    }, [items, search, categoryFilter, roomFilter, categories, rooms]);

    const fetchVaultOptions = async () => {
        setOptionsLoading(true);
        try {
            const [categoriesResponse, roomsResponse] = await Promise.all([
                axios.get('/api/categories'),
                axios.get('/api/rooms')
            ]);
            setCategories(categoriesResponse.data.categories || []);
            setRooms(roomsResponse.data.rooms || []);
        } catch (error) {
            console.error('Vault options fetch error:', error);
            setItemsError((currentError) => currentError || t('vault.messages.options_failed'));
        } finally {
            setOptionsLoading(false);
        }
    };

    const fetchItems = async () => {
        if (!vaultUnlocked) {
            setItems([]);
            return;
        }

        setItemsLoading(true);
        setItemsError('');
        try {
            const response = await axios.get('/api/vault/items');
            const decryptedItems = await Promise.all(
                (response.data.items || []).map(async (item) => {
                    const payload = await decryptPayload(item.encrypted_payload);
                    return normalizeVaultItemPayload(payload, item.id, item.created_at, item.updated_at);
                })
            );
            setItems(decryptedItems);
        } catch (error) {
            console.error('Vault items fetch error:', error);
            setItems([]);
            setItemsError(error.response?.data?.error || t('vault.messages.decrypt_failed'));
        } finally {
            setItemsLoading(false);
        }
    };

    useEffect(() => {
        if (!vaultUnlocked) {
            setItems([]);
            setItemsError('');
            return;
        }

        void Promise.all([
            fetchVaultOptions(),
            fetchItems()
        ]);
    }, [vaultUnlocked]);

    const resetForm = () => {
        setEditingId(null);
        setFormState(createInitialVaultFormData());
        setShowInvoiceSection(false);
    };

    const handleSetup = async (event) => {
        event.preventDefault();
        setSetupError('');

        const validation = validateVaultPassphrase(setupPassphrase);
        if (!validation.valid) {
            setSetupError(validation.issues[0]);
            return;
        }

        if (setupPassphrase !== setupPassphraseConfirm) {
            setSetupError(t('vault.messages.passphrase_mismatch'));
            return;
        }

        setVaultActionLoading(true);
        try {
            const result = await setupVault(setupPassphrase);
            setSetupSuccessKey(result.recoveryKey);
            setSetupPassphrase('');
            setSetupPassphraseConfirm('');
            setUnlockSecret('');
            await refreshVaultStatus();
            await fetchVaultOptions();
        } catch (error) {
            console.error('Vault setup error:', error);
            setSetupError(error.response?.data?.error || error.message || t('vault.messages.setup_failed'));
        } finally {
            setVaultActionLoading(false);
        }
    };

    const handleUnlock = async (event) => {
        event.preventDefault();
        setUnlockError('');
        setVaultActionLoading(true);

        try {
            if (unlockMode === 'recovery') {
                await unlockWithRecoveryKey(unlockSecret);
            } else {
                await unlockWithPassphrase(unlockSecret);
            }
            setUnlockSecret('');
        } catch (error) {
            console.error('Vault unlock error:', error);
            setUnlockError(t('vault.messages.unlock_failed'));
        } finally {
            setVaultActionLoading(false);
        }
    };

    const handleFieldChange = (event) => {
        const { name, value } = event.target;

        if (name === 'category_id') {
            const selectedCategory = categories.find((category) => String(category.id) === String(value));
            setFormState((prev) => ({
                ...prev,
                category_id: value,
                category_name: value ? (selectedCategory?.name || prev.category_name) : '',
                category_icon: value ? (selectedCategory?.icon || prev.category_icon) : '',
                category_color: value ? (selectedCategory?.color || prev.category_color) : ''
            }));
            return;
        }

        if (name === 'room_id') {
            const selectedRoom = rooms.find((room) => String(room.id) === String(value));
            setFormState((prev) => ({
                ...prev,
                room_id: value,
                room_name: value ? (selectedRoom?.name || prev.room_name) : ''
            }));
            return;
        }

        if (name === 'invoice_currency') {
            setFormState((prev) => ({
                ...prev,
                invoice_currency: value,
                invoice_currency_custom: value === CUSTOM_CURRENCY_OPTION ? prev.invoice_currency_custom : ''
            }));
            return;
        }

        setFormState((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleCustomCurrencyChange = (value) => {
        setFormState((prev) => ({
            ...prev,
            invoice_currency_custom: String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
        }));
    };

    const handleWarrantyDurationChange = (value) => {
        setFormState((prev) => ({
            ...prev,
            warranty_duration_value: normalizeDurationValue(value)
        }));
    };

    const handleSubmitItem = async (event) => {
        event.preventDefault();
        const payload = buildVaultItemPayload(formState, categories, rooms);

        if (!payload.name) {
            setItemsError(t('vault.messages.name_required'));
            return;
        }

        setSavingItem(true);
        setItemsError('');
        try {
            const encryptedPayload = await encryptPayload(payload);
            if (editingId) {
                await axios.put(`/api/vault/items/${editingId}`, {
                    encrypted_payload: encryptedPayload
                });
            } else {
                await axios.post('/api/vault/items', {
                    encrypted_payload: encryptedPayload
                });
            }

            await refreshVaultStatus();
            await fetchItems();
            resetForm();
        } catch (error) {
            console.error('Vault item save error:', error);
            setItemsError(error.response?.data?.error || t('vault.messages.save_failed'));
        } finally {
            setSavingItem(false);
        }
    };

    const handleEdit = (item) => {
        setEditingId(item.id);
        setFormState({
            name: item.name,
            description: item.description || '',
            quantity: String(item.quantity || 1),
            category_id: item.category_id || '',
            category_name: item.category_name || '',
            category_icon: item.category_icon || '',
            category_color: item.category_color || '',
            room_id: item.room_id || '',
            room_name: item.room_name || '',
            location_details: item.location_details || '',
            barcode: item.barcode || '',
            invoice_price: item.invoice_price || '',
            invoice_currency: item.invoice_currency
                ? (CURRENCY_OPTIONS.some((currency) => currency.code === item.invoice_currency) ? item.invoice_currency : CUSTOM_CURRENCY_OPTION)
                : '',
            invoice_currency_custom: item.invoice_currency && !CURRENCY_OPTIONS.some((currency) => currency.code === item.invoice_currency)
                ? item.invoice_currency
                : '',
            invoice_date: item.invoice_date || '',
            warranty_start_date: item.warranty_start_date || '',
            warranty_duration_value: item.warranty_duration_value || '',
            warranty_duration_unit: item.warranty_duration_unit || '',
            warranty_expiry_date: item.warranty_expiry_date || ''
        });
        setShowInvoiceSection(Boolean(
            item.invoice_price ||
            item.invoice_currency ||
            item.invoice_date ||
            item.warranty_start_date ||
            item.warranty_duration_value ||
            item.warranty_duration_unit ||
            item.warranty_expiry_date
        ));
    };

    const handleDelete = async (itemId) => {
        if (!confirm(t('vault.delete_confirm'))) {
            return;
        }

        setDeletingId(itemId);
        setItemsError('');
        try {
            await axios.delete(`/api/vault/items/${itemId}`);
            await refreshVaultStatus();
            await fetchItems();
            if (editingId === itemId) {
                resetForm();
            }
        } catch (error) {
            console.error('Vault item delete error:', error);
            setItemsError(error.response?.data?.error || t('vault.messages.delete_failed'));
        } finally {
            setDeletingId(null);
        }
    };

    if (vaultLoading) {
        return <div className="flex justify-center py-20"><div className="spinner"></div></div>;
    }

    const hasStructuredInvoiceContent = hasInvoiceContent(formState);
    const effectiveWarrantyStartDate = formState.warranty_start_date || formState.invoice_date;
    const calculatedWarrantyExpiryDate = calculateWarrantyExpiryDate(
        effectiveWarrantyStartDate,
        formState.warranty_duration_value,
        formState.warranty_duration_unit
    );
    const displayedWarrantyExpiryDate = calculatedWarrantyExpiryDate || formState.warranty_expiry_date;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('vault.title')}</h1>
                    <p className="text-slate-500 dark:text-slate-400">{t('vault.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium ${vaultUnlocked ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                        {vaultUnlocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                        {vaultUnlocked ? t('vault.status_unlocked') : t('vault.status_locked')}
                    </span>
                    {vaultConfigured && vaultUnlocked && (
                        <button type="button" onClick={lockVault} className="btn-secondary inline-flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            {t('vault.lock_action')}
                        </button>
                    )}
                </div>
            </div>

            {!vaultConfigured && (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <form onSubmit={handleSetup} className="card space-y-5 p-6">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('vault.setup_title')}</h2>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('vault.setup_description')}</p>
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            {t('vault.setup_warning')}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('vault.passphrase')}</label>
                                <input
                                    type="password"
                                    value={setupPassphrase}
                                    onChange={(event) => setSetupPassphrase(event.target.value)}
                                    className="input-field"
                                    placeholder={t('vault.passphrase_placeholder')}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('vault.passphrase_confirm')}</label>
                                <input
                                    type="password"
                                    value={setupPassphraseConfirm}
                                    onChange={(event) => setSetupPassphraseConfirm(event.target.value)}
                                    className="input-field"
                                    placeholder={t('vault.passphrase_confirm_placeholder')}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        {setupError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {setupError}
                            </div>
                        )}

                        <button type="submit" disabled={vaultActionLoading} className="btn-primary inline-flex items-center gap-2">
                            <KeyRound className="h-4 w-4" />
                            {vaultActionLoading ? t('vault.setting_up') : t('vault.setup_action')}
                        </button>
                    </form>

                    <div className="card space-y-4 p-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('vault.protection_title')}</h2>
                        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                            <p>{t('vault.protection_item_1')}</p>
                            <p>{t('vault.protection_item_2')}</p>
                            <p>{t('vault.protection_item_3')}</p>
                        </div>
                    </div>
                </div>
            )}

            {vaultConfigured && !vaultUnlocked && (
                <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                    <form onSubmit={handleUnlock} className="card space-y-5 p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('vault.unlock_title')}</h2>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('vault.unlock_description')}</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {vaultItemCount}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setUnlockMode('passphrase')}
                                className={`rounded-xl px-4 py-2 text-sm font-medium ${unlockMode === 'passphrase' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                            >
                                {t('vault.unlock_with_passphrase')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setUnlockMode('recovery')}
                                className={`rounded-xl px-4 py-2 text-sm font-medium ${unlockMode === 'recovery' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                            >
                                {t('vault.unlock_with_recovery')}
                            </button>
                        </div>

                        <input
                            type={unlockMode === 'recovery' ? 'text' : 'password'}
                            value={unlockSecret}
                            onChange={(event) => setUnlockSecret(event.target.value)}
                            className="input-field"
                            placeholder={unlockMode === 'recovery' ? t('vault.unlock_recovery_placeholder') : t('vault.unlock_passphrase_placeholder')}
                            autoComplete={unlockMode === 'recovery' ? 'off' : 'current-password'}
                        />

                        {unlockError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {unlockError}
                            </div>
                        )}

                        <button type="submit" disabled={vaultActionLoading} className="btn-primary inline-flex items-center gap-2">
                            <LockOpen className="h-4 w-4" />
                            {vaultActionLoading ? t('vault.unlocking') : t('vault.unlock_action')}
                        </button>
                    </form>

                    <div className="card space-y-4 p-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('vault.security_note_title')}</h2>
                        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                            <p>{t('vault.security_note_1')}</p>
                            <p>{t('vault.security_note_2')}</p>
                        </div>
                    </div>
                </div>
            )}

            {setupSuccessKey && (
                <div className="card space-y-4 border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">{t('vault.recovery_ready_title')}</h2>
                            <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">{t('vault.recovery_ready_description')}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={async () => { await copyTextToClipboard(setupSuccessKey); }}
                                className="btn-secondary"
                            >
                                {t('common.copy')}
                            </button>
                            <button
                                type="button"
                                onClick={() => downloadRecoveryKeyFile(setupSuccessKey, {
                                    title: t('vault.recovery_file_title'),
                                    createdLabel: t('vault.recovery_file_created_label'),
                                    keyLabel: t('vault.recovery_file_key_label'),
                                    warning: t('vault.recovery_file_warning')
                                })}
                                className="btn-secondary"
                            >
                                {t('common.download')}
                            </button>
                        </div>
                    </div>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">{t('vault.recovery_visible_once')}</p>
                    <div className="rounded-2xl bg-white px-4 py-4 font-mono text-sm tracking-[0.2em] text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                        {setupSuccessKey}
                    </div>
                </div>
            )}

            {vaultConfigured && vaultUnlocked && (
                <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
                    <form onSubmit={handleSubmitItem} className="card space-y-6 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {editingId ? t('vault.record_edit_title') : t('vault.record_new_title')}
                                </h2>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('vault.record_form_subtitle')}</p>
                            </div>
                            {editingId && (
                                <button type="button" onClick={resetForm} className="btn-secondary inline-flex items-center gap-2">
                                    <XCircle className="h-4 w-4" />
                                    {t('common.cancel')}
                                </button>
                            )}
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t('items.form.name')} <span className="text-red-500">{t('items.form.required')}</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formState.name}
                                    onChange={handleFieldChange}
                                    className="input-field"
                                    placeholder={t('items.form.name_placeholder')}
                                    required
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.description')}</label>
                                <textarea
                                    name="description"
                                    value={formState.description}
                                    onChange={handleFieldChange}
                                    className="input-field min-h-[110px] resize-none"
                                    placeholder={t('items.form.description_placeholder')}
                                    rows={4}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.quantity')}</label>
                                    <input
                                        type="number"
                                        name="quantity"
                                        value={formState.quantity}
                                        onChange={handleFieldChange}
                                        className="input-field"
                                        min="1"
                                        step="1"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.barcode')}</label>
                                    <input
                                        type="text"
                                        name="barcode"
                                        value={formState.barcode}
                                        onChange={handleFieldChange}
                                        className="input-field font-mono"
                                        placeholder={t('items.form.barcode_placeholder')}
                                    />
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('vault.barcode_privacy_hint')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.category')}</label>
                                    <select
                                        name="category_id"
                                        value={formState.category_id}
                                        onChange={handleFieldChange}
                                        className="input-field"
                                        disabled={optionsLoading}
                                    >
                                        <option value="">{t('items.form.select_category')}</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.icon} {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.room')}</label>
                                    <select
                                        name="room_id"
                                        value={formState.room_id}
                                        onChange={handleFieldChange}
                                        className="input-field"
                                        disabled={optionsLoading}
                                    >
                                        <option value="">{t('items.form.select_room')}</option>
                                        {rooms.map((room) => (
                                            <option key={room.id} value={room.id}>
                                                {room.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.location_details')}</label>
                                <input
                                    type="text"
                                    name="location_details"
                                    value={formState.location_details}
                                    onChange={handleFieldChange}
                                    className="input-field"
                                    placeholder={t('items.form.location_help')}
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <button
                                    type="button"
                                    onClick={() => setShowInvoiceSection((currentValue) => !currentValue)}
                                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70"
                                >
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white">{t('items.form.invoice_section')}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {showInvoiceSection ? t('items.form.invoice_section_help') : t('items.form.invoice_section_collapsed')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {hasStructuredInvoiceContent && !showInvoiceSection && (
                                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                                {t('items.form.invoice_section_filled')}
                                            </span>
                                        )}
                                        <CalendarDays className="h-5 w-5 text-slate-400" />
                                    </div>
                                </button>

                                {showInvoiceSection && (
                                    <div className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-4 pb-4 pt-4 dark:border-slate-700 dark:bg-slate-900">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('items.form.invoice_security')}</p>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.invoice_price')}</label>
                                                <input
                                                    type="number"
                                                    name="invoice_price"
                                                    value={formState.invoice_price}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder={t('items.form.invoice_price_placeholder')}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.invoice_currency')}</label>
                                                <select
                                                    name="invoice_currency"
                                                    value={formState.invoice_currency}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                >
                                                    <option value="">{t('common.select')}</option>
                                                    {CURRENCY_OPTIONS.map((currency) => (
                                                        <option key={currency.code} value={currency.code}>
                                                            {currency.label}
                                                        </option>
                                                    ))}
                                                    <option value={CUSTOM_CURRENCY_OPTION}>{t('common.other')}</option>
                                                </select>
                                                {formState.invoice_currency === CUSTOM_CURRENCY_OPTION && (
                                                    <input
                                                        type="text"
                                                        value={formState.invoice_currency_custom}
                                                        onChange={(event) => handleCustomCurrencyChange(event.target.value)}
                                                        className="input-field mt-3 uppercase"
                                                        inputMode="text"
                                                        autoComplete="off"
                                                        maxLength={10}
                                                        placeholder="NOK / BTC"
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.invoice_date')}</label>
                                                <input
                                                    type="date"
                                                    name="invoice_date"
                                                    value={formState.invoice_date}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.warranty_start_date')}</label>
                                                <input
                                                    type="date"
                                                    name="warranty_start_date"
                                                    value={formState.warranty_start_date}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                />
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('items.form.warranty_calculation_help')}</p>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.warranty_duration_value')}</label>
                                                <input
                                                    type="text"
                                                    name="warranty_duration_value"
                                                    value={formState.warranty_duration_value}
                                                    onChange={(event) => handleWarrantyDurationChange(event.target.value)}
                                                    className="input-field"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    placeholder={t('items.form.warranty_duration_placeholder')}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.warranty_duration_unit')}</label>
                                                <select
                                                    name="warranty_duration_unit"
                                                    value={formState.warranty_duration_unit}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                >
                                                    <option value="">{t('common.select')}</option>
                                                    {WARRANTY_DURATION_OPTIONS.map((option) => (
                                                        <option key={option.code} value={option.code}>
                                                            {t(option.labelKey)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.warranty_expiry_date')}</label>
                                            <input
                                                type="date"
                                                name="warranty_expiry_date"
                                                value={displayedWarrantyExpiryDate}
                                                onChange={handleFieldChange}
                                                className={`input-field ${calculatedWarrantyExpiryDate ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''}`}
                                                readOnly={Boolean(calculatedWarrantyExpiryDate)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                            {t('vault.media_note')}
                        </div>

                        <button type="submit" disabled={savingItem} className="btn-primary inline-flex items-center gap-2">
                            <Save className="h-4 w-4" />
                            {savingItem
                                ? t('items.form.submitting')
                                : editingId
                                    ? t('vault.record_save_edit')
                                    : t('vault.record_save_new')}
                        </button>
                    </form>

                    <div className="space-y-4">
                        <div className="card space-y-4 p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="relative sm:col-span-2">
                                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        className="input-field pl-12"
                                        placeholder={t('vault.search_placeholder')}
                                    />
                                </div>
                                <select
                                    value={categoryFilter}
                                    onChange={(event) => setCategoryFilter(event.target.value)}
                                    className="input-field"
                                >
                                    <option value="">{t('vault.all_categories')}</option>
                                    {categories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.icon} {category.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={roomFilter}
                                    onChange={(event) => setRoomFilter(event.target.value)}
                                    className="input-field"
                                >
                                    <option value="">{t('vault.all_rooms')}</option>
                                    {rooms.map((room) => (
                                        <option key={room.id} value={room.id}>
                                            {room.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {itemsError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {itemsError}
                            </div>
                        )}

                        {itemsLoading ? (
                            <div className="card flex justify-center py-16"><div className="spinner"></div></div>
                        ) : filteredItems.length === 0 ? (
                            <div className="card p-8 text-center">
                                <Package className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {items.length === 0 ? t('vault.empty_title') : t('vault.empty_filter_title')}
                                </h3>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {items.length === 0 ? t('vault.empty_description') : t('vault.empty_filter_description')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredItems.map((item) => (
                                    <article key={item.id} className="card p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.name}</h3>
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                        x{item.quantity}
                                                    </span>
                                                </div>

                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {item.category_name && (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                                                            style={{
                                                                backgroundColor: item.category_color ? `${item.category_color}15` : 'rgba(15, 23, 42, 0.08)',
                                                                color: item.category_color || '#475569'
                                                            }}
                                                        >
                                                            {item.category_icon || <Tag className="h-3 w-3" />}
                                                            {item.category_name}
                                                        </span>
                                                    )}
                                                    {item.room_name && (
                                                        <span className="badge text-xs py-0.5">{item.room_name}</span>
                                                    )}
                                                    {item.barcode && (
                                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                            {item.barcode}
                                                        </span>
                                                    )}
                                                </div>

                                                {item.description && (
                                                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                                        {item.description}
                                                    </p>
                                                )}

                                                {item.location_details && (
                                                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                                        {t('items.form.location_details')}: {item.location_details}
                                                    </p>
                                                )}

                                                {(item.invoice_price || item.invoice_date || item.warranty_expiry_date) && (
                                                    <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                                        {item.invoice_price && (
                                                            <p>
                                                                {t('items.form.invoice_price')}: {item.invoice_price} {item.invoice_currency || ''}
                                                            </p>
                                                        )}
                                                        {item.invoice_date && (
                                                            <p>
                                                                {t('items.form.invoice_date')}: {formatLocalDate(item.invoice_date, i18n.language)}
                                                            </p>
                                                        )}
                                                        {item.warranty_expiry_date && (
                                                            <p>
                                                                {t('items.form.warranty_expiry_date')}: {formatLocalDate(item.warranty_expiry_date, i18n.language)}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                <p className="mt-4 text-xs text-slate-400">
                                                    {t('vault.updated_at')}: {formatLocalDateTime(item.updated_at || item.created_at, i18n.language)}
                                                </p>
                                            </div>

                                            <div className="flex gap-2 lg:flex-shrink-0">
                                                <button type="button" onClick={() => handleEdit(item)} className="btn-secondary">
                                                    {t('common.edit')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(item.id)}
                                                    disabled={deletingId === item.id}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    {deletingId === item.id ? t('common.loading') : t('common.delete')}
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
