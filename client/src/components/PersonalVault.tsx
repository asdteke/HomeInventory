import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
    CalendarDays,
    ImagePlus,
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
import { MAX_PHOTO_UPLOAD_MB, isPhotoUploadTooLarge } from '../utils/mediaLimits';
import { validateVaultPassphrase } from '../utils/personalVaultCrypto';
import FloatingToast from './FloatingToast';
import { ConfirmDialog } from './ModalDialog';
import { formatDateForLanguage } from '../utils/appFormatting';
import { getCategoryPresentation } from '../utils/categoryDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';

interface CurrencyOption {
    code: string;
    label: string;
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
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
const VAULT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const VAULT_PHOTO_PREVIEW_MAX_BYTES = 256 * 1024;
const VAULT_PHOTO_MAX_DIMENSION = 1600;
const VAULT_PHOTO_PREVIEW_MAX_DIMENSION = 480;
const VAULT_PHOTO_DIMENSION_FACTORS = [1, 0.92, 0.84, 0.76];
const VAULT_PHOTO_QUALITY_STEPS = [0.88, 0.82, 0.76, 0.7, 0.64];

interface WarrantyDurationOption {
    code: string;
    labelKey: string;
}

const WARRANTY_DURATION_OPTIONS: WarrantyDurationOption[] = [
    { code: 'months', labelKey: 'items.form.warranty_duration_months' },
    { code: 'years', labelKey: 'items.form.warranty_duration_years' }
];

interface VaultFormData {
    name: string;
    description: string;
    quantity: string;
    category_id: string;
    category_name: string;
    category_icon: string;
    category_color: string;
    room_id: string;
    room_name: string;
    location_details: string;
    barcode: string;
    invoice_price: string;
    invoice_currency: string;
    invoice_currency_custom: string;
    invoice_date: string;
    warranty_start_date: string;
    warranty_duration_value: string;
    warranty_duration_unit: string;
    warranty_expiry_date: string;
}

interface VaultItem {
    id: string;
    name: string;
    description: string;
    quantity: number;
    category_id: string;
    category_name: string;
    category_icon: string;
    category_color: string;
    room_id: string;
    room_name: string;
    location_details: string;
    barcode: string;
    invoice_price: string;
    invoice_currency: string;
    invoice_date: string;
    warranty_start_date: string;
    warranty_duration_value: string;
    warranty_duration_unit: string;
    warranty_expiry_date: string;
    has_photo: boolean;
    created_at: string;
    updated_at: string;
}

interface Category {
    id: string | number;
    name: string;
    icon?: string;
    color?: string;
}

interface Room {
    id: string | number;
    name: string;
}

interface PhotoCopy {
    attachAction: string;
    replaceAction: string;
    emptyState: string;
    hint: string;
    privacyNote: string;
    processing: string;
    pendingRemoval: string;
    viewerHint: string;
    viewerLoading: string;
    viewerFailed: string;
    openFullAction: string;
    unsupported: string;
    sourceTooLarge: string;
    prepareFailed: string;
    tooLarge: string;
}

interface PhotoDraft {
    fullBytes: Uint8Array;
    previewBytes: Uint8Array;
    previewUrl: string;
}

interface PhotoViewerState {
    open: boolean;
    title: string;
    caption: string;
    url: string;
    loading: boolean;
    error: string;
}

interface ToastState {
    title: string;
    description: string;
    tone?: 'success' | 'danger' | 'warning' | 'info';
}

function createInitialVaultFormData(): VaultFormData {
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

function normalizeDurationValue(value: string): string {
    return String(value || '').replace(/[^\d]/g, '').slice(0, 4);
}

function parseDurationValue(value: string): number | null {
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

function buildValidatedIsoDate(yearValue: number, monthValue: number, dayValue: number): string {
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

function addMonthsClamped(isoDate: string, monthDelta: number): string {
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

function calculateWarrantyExpiryDate(startDateValue: string, durationValue: string, durationUnit: string): string {
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

function hasInvoiceContent(formState: VaultFormData): boolean {
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

function formatLocalDate(dateValue: string, locale: string): string {
    const isoDate = String(dateValue || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return '-';
    }

    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        return isoDate;
    }

    return formatDateForLanguage(parsed, locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) || isoDate;
}

function formatLocalDateTime(dateValue: string, locale: string): string {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return formatDateForLanguage(parsed, locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }, { fallback: 'datetime' }) || '-';
}

function normalizeVaultItemPayload(
    payload: any,
    fallbackId: string,
    createdAt: string,
    updatedAt: string,
    hasPhoto = false
): VaultItem {
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
        has_photo: Boolean(hasPhoto),
        created_at: createdAt,
        updated_at: updatedAt
    };
}

function buildVaultItemPayload(formState: VaultFormData, categories: Category[], rooms: Room[]) {
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

function downloadRecoveryKeyFile(recoveryKey: string, labels: any) {
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

function getVaultPhotoCopy(t: any): PhotoCopy {
    return {
        attachAction: t('vault.photo.attach_action', { defaultValue: 'Add Photo' }),
        replaceAction: t('vault.photo.replace_action', { defaultValue: 'Replace Photo' }),
        emptyState: t('vault.photo.empty_state', {
            defaultValue: 'Any selected photo is processed in your browser, stripped of metadata, and encrypted before upload.'
        }),
        hint: t('vault.photo.hint', {
            defaultValue: 'Photos are prepared locally in your browser, stripped of EXIF metadata, and only encrypted data is sent to the server.'
        }),
        privacyNote: t('vault.photo.privacy_note', {
            defaultValue: 'Barcode lookup and external data fetches stay disabled for privacy.'
        }),
        processing: t('vault.photo.processing', {
            defaultValue: 'Preparing photo for secure upload...'
        }),
        pendingRemoval: t('vault.photo.pending_removal', {
            defaultValue: 'The current photo will be removed when you save.'
        }),
        viewerHint: t('vault.photo.viewer_hint', {
            defaultValue: 'Opened from the encrypted original stored in Personal Vault.'
        }),
        viewerLoading: t('vault.photo.viewer_loading', {
            defaultValue: 'Decrypting photo...'
        }),
        viewerFailed: t('vault.photo.viewer_failed', {
            defaultValue: 'The full-size photo could not be opened.'
        }),
        openFullAction: t('vault.photo.open_full_action', {
            defaultValue: 'Open Full Size'
        }),
        unsupported: t('vault.photo.unsupported', {
            defaultValue: 'Please choose a supported image file.'
        }),
        sourceTooLarge: t('vault.photo.source_too_large', {
            maxSizeMb: MAX_PHOTO_UPLOAD_MB,
            defaultValue: 'Source photos can be up to {{maxSizeMb}} MB.'
        }),
        prepareFailed: t('vault.photo.prepare_failed', {
            defaultValue: 'The photo could not be prepared securely.'
        }),
        tooLarge: t('vault.photo.too_large', {
            defaultValue: 'The photo did not fit within the secure size limit. Try a smaller or simpler image.'
        })
    };
}

function getVaultPassphraseValidationMessage(t: any, issue: any): string {
    switch (issue?.code) {
    case 'min_length':
        return t('vault.messages.passphrase_min_length', {
            defaultValue: 'Vault passphrase must be at least 12 characters.'
        });
    case 'lowercase':
        return t('vault.messages.passphrase_lowercase', {
            defaultValue: 'Include at least one lowercase letter.'
        });
    case 'uppercase':
        return t('vault.messages.passphrase_uppercase', {
            defaultValue: 'Include at least one uppercase letter.'
        });
    case 'number':
        return t('vault.messages.passphrase_number', {
            defaultValue: 'Include at least one number.'
        });
    default:
        return issue?.message || t('vault.messages.setup_failed');
    }
}

function revokeObjectUrl(url?: string | null) {
    if (url) {
        URL.revokeObjectURL(url);
    }
}

function revokeObjectUrlMap(urlMap: Record<string, string> = {}) {
    Object.values(urlMap).forEach(revokeObjectUrl);
}

function getScaledDimensions(width: number, height: number, maxDimension: number) {
    const longestEdge = Math.max(width, height);
    if (!Number.isFinite(longestEdge) || longestEdge <= 0) {
        throw new Error('Gecersiz fotograf boyutu');
    }

    if (longestEdge <= maxDimension) {
        return { width, height };
    }

    const ratio = maxDimension / longestEdge;
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio))
    };
}

function loadImageElementFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Fotograf okunamadi'));
        };
        image.src = objectUrl;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Fotograf olusturulamadi'));
                return;
            }

            resolve(blob);
        }, type, quality);
    });
}

async function renderImageVariant(image: HTMLImageElement, maxDimension: number, quality: number): Promise<Blob> {
    const intrinsicWidth = image.naturalWidth || image.width;
    const intrinsicHeight = image.naturalHeight || image.height;
    const { width, height } = getScaledDimensions(intrinsicWidth, intrinsicHeight, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas kullanilamiyor');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvasToBlob(canvas, 'image/webp', quality);
}

async function encodeImageWithinLimit(
    image: HTMLImageElement,
    options: { maxDimension: number; maxBytes: number; tooLargeMessage: string }
): Promise<Blob> {
    let lastBlob: Blob | null = null;

    for (const dimensionFactor of VAULT_PHOTO_DIMENSION_FACTORS) {
        const effectiveDimension = Math.max(160, Math.round(options.maxDimension * dimensionFactor));
        for (const quality of VAULT_PHOTO_QUALITY_STEPS) {
            const blob = await renderImageVariant(image, effectiveDimension, quality);
            lastBlob = blob;
            if (blob.size <= options.maxBytes) {
                return blob;
            }
        }
    }

    if (lastBlob && lastBlob.size <= options.maxBytes) {
        return lastBlob;
    }

    throw new Error(options.tooLargeMessage);
}

async function createVaultPhotoDraft(file: File, photoCopy: PhotoCopy): Promise<PhotoDraft> {
    if (!file || !String(file.type || '').startsWith('image/')) {
        throw new Error(photoCopy.unsupported);
    }

    if (isPhotoUploadTooLarge(file)) {
        throw new Error(photoCopy.sourceTooLarge);
    }

    const image = await loadImageElementFromFile(file);
    const [fullBlob, previewBlob] = await Promise.all([
        encodeImageWithinLimit(image, {
            maxDimension: VAULT_PHOTO_MAX_DIMENSION,
            maxBytes: VAULT_PHOTO_MAX_BYTES,
            tooLargeMessage: photoCopy.tooLarge
        }),
        encodeImageWithinLimit(image, {
            maxDimension: VAULT_PHOTO_PREVIEW_MAX_DIMENSION,
            maxBytes: VAULT_PHOTO_PREVIEW_MAX_BYTES,
            tooLargeMessage: photoCopy.tooLarge
        })
    ]);

    return {
        fullBytes: new Uint8Array(await fullBlob.arrayBuffer()),
        previewBytes: new Uint8Array(await previewBlob.arrayBuffer()),
        previewUrl: URL.createObjectURL(previewBlob)
    };
}

function createImageUrlFromBytes(bytes: Uint8Array, type = 'image/webp'): string {
    return URL.createObjectURL(new Blob([bytes as any], { type }));
}

export default function PersonalVault() {
    const { t: tRaw, i18n } = useTranslation();
    const t = tRaw as any;

    const {
        vaultConfigured,
        vaultUnlocked,
        vaultLoading,
        setupVault,
        unlockWithPassphrase,
        unlockWithRecoveryKey,
        encryptPayload,
        decryptPayload,
        encryptBytes,
        decryptBytes,
        lockVault,
        refreshVaultStatus
    } = useVault();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemPhotoPreviewUrlsRef = useRef<Record<string, string>>({});
    const photoDraftRef = useRef<PhotoDraft | null>(null);
    const photoViewerUrlRef = useRef<string | null>(null);
    const photoViewerRequestRef = useRef<number>(0);

    const [items, setItems] = useState<VaultItem[]>([]);
    const [itemPhotoPreviewUrls, setItemPhotoPreviewUrls] = useState<Record<string, string>>({});
    const [categories, setCategories] = useState<Category[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [itemsLoading, setItemsLoading] = useState<boolean>(false);
    const [optionsLoading, setOptionsLoading] = useState<boolean>(false);
    const [itemsError, setItemsError] = useState<string>('');
    const [search, setSearch] = useState<string>('');
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [roomFilter, setRoomFilter] = useState<string>('');
    const [vaultActionLoading, setVaultActionLoading] = useState<boolean>(false);
    const [savingItem, setSavingItem] = useState<boolean>(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pendingDeleteItem, setPendingDeleteItem] = useState<VaultItem | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formState, setFormState] = useState<VaultFormData>(createInitialVaultFormData);
    const [showInvoiceSection, setShowInvoiceSection] = useState<boolean>(false);
    const [photoDraft, setPhotoDraft] = useState<PhotoDraft | null>(null);
    const currentLanguage = i18n.resolvedLanguage || i18n.language;

    const getVisibleCategoryName = (categoryLike: any): string => {
        if (!categoryLike) {
            return '';
        }

        const fullCategory = categoryLike.id
            ? categories.find((category) => String(category.id) === String(categoryLike.id))
            : null;

        return getCategoryPresentation(fullCategory || categoryLike, currentLanguage).name;
    };

    const getVisibleRoomName = (roomLike: any): string => {
        if (!roomLike) {
            return '';
        }

        const fullRoom = roomLike.id
            ? rooms.find((room) => String(room.id) === String(roomLike.id))
            : null;

        return getRoomPresentation(fullRoom || roomLike, currentLanguage).name;
    };

    const [photoMarkedForRemoval, setPhotoMarkedForRemoval] = useState<boolean>(false);
    const [photoProcessing, setPhotoProcessing] = useState<boolean>(false);
    const [photoViewer, setPhotoViewer] = useState<PhotoViewerState>({
        open: false,
        title: '',
        caption: '',
        url: '',
        loading: false,
        error: ''
    });
    const [setupPassphrase, setSetupPassphrase] = useState<string>('');
    const [setupPassphraseConfirm, setSetupPassphraseConfirm] = useState<string>('');
    const [setupError, setSetupError] = useState<string>('');
    const [setupSuccessKey, setSetupSuccessKey] = useState<string>('');
    const [unlockMode, setUnlockMode] = useState<'passphrase' | 'recovery'>('passphrase');
    const [unlockSecret, setUnlockSecret] = useState<string>('');
    const [unlockError, setUnlockError] = useState<string>('');
    const [toast, setToast] = useState<ToastState | null>(null);

    const photoCopy = useMemo(() => getVaultPhotoCopy(t), [t]);
    const editingItem = useMemo(
        () => items.find((item) => item.id === editingId) || null,
        [items, editingId]
    );
    const hasStoredFormPhoto = Boolean(editingItem?.has_photo) && !photoMarkedForRemoval;
    const activeFormPhotoPreviewUrl = photoDraft?.previewUrl || (
        !photoMarkedForRemoval && editingItem ? itemPhotoPreviewUrls[editingItem.id] || '' : ''
    );
    const hasActiveFormPhoto = Boolean(activeFormPhotoPreviewUrl);
    const canRemoveFormPhoto = Boolean(photoDraft) || Boolean(editingItem?.has_photo);

    const replaceItemPhotoPreviewUrls = (nextUrls: Record<string, string>) => {
        const nextValues = new Set(Object.values(nextUrls));
        Object.values(itemPhotoPreviewUrlsRef.current).forEach((url) => {
            if (url && !nextValues.has(url)) {
                revokeObjectUrl(url);
            }
        });
        itemPhotoPreviewUrlsRef.current = nextUrls;
        setItemPhotoPreviewUrls(nextUrls);
    };

    const replacePhotoDraft = (nextDraft: PhotoDraft | null) => {
        const previousUrl = photoDraftRef.current?.previewUrl;
        if (previousUrl && previousUrl !== nextDraft?.previewUrl) {
            revokeObjectUrl(previousUrl);
        }

        photoDraftRef.current = nextDraft;
        setPhotoDraft(nextDraft);
    };

    const replacePhotoViewer = (nextViewer: PhotoViewerState) => {
        const previousUrl = photoViewerUrlRef.current;
        const nextUrl = nextViewer?.url || null;
        if (previousUrl && previousUrl !== nextUrl) {
            revokeObjectUrl(previousUrl);
        }

        photoViewerUrlRef.current = nextUrl;
        setPhotoViewer(nextViewer);
    };

    const closePhotoViewer = () => {
        photoViewerRequestRef.current += 1;
        replacePhotoViewer({
            open: false,
            title: '',
            caption: '',
            url: '',
            loading: false,
            error: ''
        });
    };

    const openStoredPhotoViewer = async (item: VaultItem) => {
        if (!item?.id) {
            return;
        }

        const requestId = photoViewerRequestRef.current + 1;
        photoViewerRequestRef.current = requestId;
        replacePhotoViewer({
            open: true,
            title: t('items.form.photo'),
            caption: item.name || '',
            url: '',
            loading: true,
            error: ''
        });

        try {
            const response = await axios.get(`/api/vault/items/${item.id}/photo`);
            const fullBytes = await decryptBytes(response.data.encrypted_photo_payload);

            if (photoViewerRequestRef.current !== requestId) {
                return;
            }

            replacePhotoViewer({
                open: true,
                title: t('items.form.photo'),
                caption: item.name || '',
                url: createImageUrlFromBytes(fullBytes),
                loading: false,
                error: ''
            });
        } catch (error: any) {
            console.error(`Vault full photo fetch error for item ${item.id}:`, error);
            if (photoViewerRequestRef.current !== requestId) {
                return;
            }

            replacePhotoViewer({
                open: true,
                title: t('items.form.photo'),
                caption: item.name || '',
                url: '',
                loading: false,
                error: error.response?.data?.error || photoCopy.viewerFailed
            });
        }
    };

    const openDraftPhotoViewer = () => {
        if (!photoDraft) {
            return;
        }

        photoViewerRequestRef.current += 1;
        replacePhotoViewer({
            open: true,
            title: t('items.form.photo'),
            caption: formState.name || '',
            url: createImageUrlFromBytes(photoDraft.fullBytes),
            loading: false,
            error: ''
        });
    };

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
            replaceItemPhotoPreviewUrls({});
            return;
        }

        setItemsLoading(true);
        setItemsError('');
        try {
            const response = await axios.get('/api/vault/items');
            const decryptedItems = await Promise.all(
                (response.data.items || []).map(async (item: any) => {
                    const payload = await decryptPayload(item.encrypted_payload);
                    return normalizeVaultItemPayload(
                        payload,
                        item.id,
                        item.created_at,
                        item.updated_at,
                        item.has_photo
                    );
                })
            );
            const photoPreviewEntries = await Promise.all(
                decryptedItems
                    .filter((item) => item.has_photo)
                    .map(async (item) => {
                        try {
                            const previewResponse = await axios.get(`/api/vault/items/${item.id}/photo-preview`);
                            const previewBytes = await decryptBytes(previewResponse.data.encrypted_photo_preview_payload);
                            return [item.id, createImageUrlFromBytes(previewBytes)] as [string, string];
                        } catch (error) {
                            console.error(`Vault photo preview fetch error for item ${item.id}:`, error);
                            return null;
                        }
                    })
            );
            setItems(decryptedItems);
            replaceItemPhotoPreviewUrls(
                Object.fromEntries(photoPreviewEntries.filter((entry): entry is [string, string] => entry !== null))
            );
        } catch (error: any) {
            console.error('Vault items fetch error:', error);
            setItems([]);
            replaceItemPhotoPreviewUrls({});
            setItemsError(error.response?.data?.error || t('vault.messages.decrypt_failed'));
        } finally {
            setItemsLoading(false);
        }
    };

    useEffect(() => {
        if (!vaultUnlocked) {
            setItems([]);
            setItemsError('');
            replaceItemPhotoPreviewUrls({});
            replacePhotoDraft(null);
            setPhotoMarkedForRemoval(false);
            closePhotoViewer();
            return;
        }

        void Promise.all([
            fetchVaultOptions(),
            fetchItems()
        ]);
    }, [vaultUnlocked]);

    useEffect(() => () => {
        revokeObjectUrlMap(itemPhotoPreviewUrlsRef.current);
        revokeObjectUrl(photoDraftRef.current?.previewUrl);
        revokeObjectUrl(photoViewerUrlRef.current);
    }, []);

    useEffect(() => {
        if (!photoViewer.open) {
            return undefined;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closePhotoViewer();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [photoViewer.open]);

    const resetForm = () => {
        setEditingId(null);
        setFormState(createInitialVaultFormData());
        setShowInvoiceSection(false);
        setPhotoMarkedForRemoval(false);
        replacePhotoDraft(null);
        closePhotoViewer();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSetup = async (event: React.FormEvent) => {
        event.preventDefault();
        setSetupError('');

        const validation = validateVaultPassphrase(setupPassphrase);
        if (!validation.valid) {
            setSetupError(getVaultPassphraseValidationMessage(t, validation.issues[0]));
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
        } catch (error: any) {
            console.error('Vault setup error:', error);
            setSetupError(error.response?.data?.error || error.message || t('vault.messages.setup_failed'));
        } finally {
            setVaultActionLoading(false);
        }
    };

    const handleUnlock = async (event: React.FormEvent) => {
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

    const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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

    const handleCustomCurrencyChange = (value: string) => {
        setFormState((prev) => ({
            ...prev,
            invoice_currency_custom: String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
        }));
    };

    const handleWarrantyDurationChange = (value: string) => {
        setFormState((prev) => ({
            ...prev,
            warranty_duration_value: normalizeDurationValue(value)
        }));
    };

    const handlePhotoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const [file] = Array.from(event.target.files || []);
        event.target.value = '';

        if (!file) {
            return;
        }

        setPhotoProcessing(true);
        setItemsError('');
        try {
            const nextDraft = await createVaultPhotoDraft(file, photoCopy);
            replacePhotoDraft(nextDraft);
            setPhotoMarkedForRemoval(false);
        } catch (error: any) {
            console.error('Vault photo prepare error:', error);
            setItemsError(error.message || photoCopy.prepareFailed);
        } finally {
            setPhotoProcessing(false);
        }
    };

    const handleRemovePhoto = () => {
        if (photoDraft) {
            replacePhotoDraft(null);
            setPhotoMarkedForRemoval(false);
        } else if (editingItem?.has_photo) {
            setPhotoMarkedForRemoval((current) => !current);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmitItem = async (event: React.FormEvent) => {
        event.preventDefault();
        if (photoProcessing) {
            return;
        }

        const payload = buildVaultItemPayload(formState, categories, rooms);

        if (!payload.name) {
            setItemsError(t('vault.messages.name_required'));
            return;
        }

        setSavingItem(true);
        setItemsError('');
        try {
            const encryptedPayload = await encryptPayload(payload);
            const requestBody: any = {
                encrypted_payload: encryptedPayload
            };

            if (photoDraft) {
                requestBody.encrypted_photo_payload = await encryptBytes(photoDraft.fullBytes);
                requestBody.encrypted_photo_preview_payload = await encryptBytes(photoDraft.previewBytes);
            } else if (editingId && photoMarkedForRemoval) {
                requestBody.remove_photo = true;
            }

            if (editingId) {
                await axios.put(`/api/vault/items/${editingId}`, requestBody);
            } else {
                await axios.post('/api/vault/items', requestBody);
            }

            await refreshVaultStatus();
            await fetchItems();
            resetForm();
        } catch (error: any) {
            console.error('Vault item save error:', error);
            setItemsError(error.response?.data?.error || t('vault.messages.save_failed'));
        } finally {
            setSavingItem(false);
        }
    };

    const handleEdit = (item: VaultItem) => {
        setEditingId(item.id);
        setPhotoMarkedForRemoval(false);
        replacePhotoDraft(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
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

    const handleDelete = async () => {
        if (!pendingDeleteItem) {
            return;
        }

        setDeletingId(pendingDeleteItem.id);
        setItemsError('');
        try {
            await axios.delete(`/api/vault/items/${pendingDeleteItem.id}`);
            await refreshVaultStatus();
            await fetchItems();
            if (editingId === pendingDeleteItem.id) {
                resetForm();
            }
            setToast({
                title: t('vault.messages.delete_success_title', { defaultValue: 'Vault record deleted' }),
                description: t('vault.messages.delete_success_body', { defaultValue: 'The private record was permanently removed from your vault.' })
            });
        } catch (error: any) {
            console.error('Vault item delete error:', error);
            setItemsError(error.response?.data?.error || t('vault.messages.delete_failed'));
        } finally {
            setDeletingId(null);
            setPendingDeleteItem(null);
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
    const photoActionLabel = (hasActiveFormPhoto || hasStoredFormPhoto) ? photoCopy.replaceAction : photoCopy.attachAction;
    const showPendingPhotoRemoval = Boolean(editingItem?.has_photo) && photoMarkedForRemoval && !photoDraft;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="section-title text-4xl text-[var(--hi-text)]">{t('vault.title')}</h1>
                    <p className="mt-2 text-[var(--hi-text-soft)]">{t('vault.subtitle')}</p>
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
                    <form onSubmit={handleSetup} className="card space-y-5 border-[var(--hi-border-strong)] p-6">
                        <div>
                            <h2 className="section-title text-2xl text-[var(--hi-text)]">{t('vault.setup_title')}</h2>
                            <p className="mt-2 text-sm text-[var(--hi-text-soft)]">{t('vault.setup_description')}</p>
                        </div>

                        <div className="rounded-2xl border border-[var(--hi-border-strong)] bg-[var(--hi-secondary-soft)] p-4 text-sm text-[var(--hi-text)]">
                            {t('vault.setup_warning')}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text-soft)]">{t('vault.passphrase')}</label>
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
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text-soft)]">{t('vault.passphrase_confirm')}</label>
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

                    <div className="card space-y-4 bg-[linear-gradient(180deg,var(--hi-panel-strong),var(--hi-panel-muted))] p-6">
                        <h2 className="section-title text-2xl text-[var(--hi-text)]">{t('vault.protection_title')}</h2>
                        <div className="space-y-3 text-sm text-[var(--hi-text-soft)]">
                            <p>{t('vault.protection_item_1')}</p>
                            <p>{t('vault.protection_item_2')}</p>
                            <p>{t('vault.protection_item_3')}</p>
                        </div>
                    </div>
                </div>
            )}

            {vaultConfigured && !vaultUnlocked && (
                <div>
                    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                        <form onSubmit={handleUnlock} className="card space-y-5 border-[var(--hi-border-strong)] bg-[linear-gradient(180deg,var(--hi-panel-strong),var(--hi-panel))] p-6">
                            <div>
                                <div>
                                    <h2 className="section-title text-2xl text-[var(--hi-text)]">{t('vault.unlock_title')}</h2>
                                    <p className="mt-2 text-sm text-[var(--hi-text-soft)]">{t('vault.unlock_description')}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setUnlockMode('passphrase')}
                                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${unlockMode === 'passphrase' ? 'bg-[var(--hi-accent)] text-white' : 'bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]'}`}
                                >
                                    {t('vault.unlock_with_passphrase')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUnlockMode('recovery')}
                                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${unlockMode === 'recovery' ? 'bg-[var(--hi-accent)] text-white' : 'bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]'}`}
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

                        <div className="card space-y-5 border-[var(--hi-border-strong)] bg-[linear-gradient(180deg,var(--hi-panel-strong),var(--hi-panel))] p-6">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                                    <ShieldAlert className="h-5 w-5" />
                                </div>
                                <h2 className="section-title text-2xl text-[var(--hi-text)]">{t('vault.security_note_title')}</h2>
                            </div>
                            <div className="space-y-3 text-sm leading-7 text-[var(--hi-text-soft)]">
                                <p>{t('vault.security_note_1')}</p>
                                <p>{t('vault.security_note_2')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {setupSuccessKey && (
                <div className="card space-y-4 border-[var(--hi-border-strong)] bg-[linear-gradient(180deg,var(--hi-accent-soft),var(--hi-panel-strong))] p-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="section-title text-2xl text-[var(--hi-text)]">{t('vault.recovery_ready_title')}</h2>
                            <p className="mt-2 text-sm text-[var(--hi-text-soft)]">{t('vault.recovery_ready_description')}</p>
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
                    <p className="text-sm text-[var(--hi-text-soft)]">{t('vault.recovery_visible_once')}</p>
                    <div className="rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-4 py-4 font-mono text-sm tracking-[0.2em] text-[var(--hi-text)]">
                        {setupSuccessKey}
                    </div>
                </div>
            )}

            {vaultConfigured && vaultUnlocked && (
                <div className="vault-secure-reveal grid gap-6 xl:grid-cols-[1fr_1.05fr]">
                    <form onSubmit={handleSubmitItem} className="card space-y-6 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="section-title text-2xl text-[var(--hi-text)]">
                                    {editingId ? t('vault.record_edit_title') : t('vault.record_new_title')}
                                </h2>
                                <p className="mt-2 text-sm text-[var(--hi-text-soft)]">{t('vault.record_form_subtitle')}</p>
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
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
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
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.description')}</label>
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
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.quantity')}</label>
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
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.barcode')}</label>
                                    <input
                                        type="text"
                                        name="barcode"
                                        value={formState.barcode}
                                        onChange={handleFieldChange}
                                        className="input-field font-mono"
                                        placeholder={t('items.form.barcode_placeholder')}
                                    />
                                    <p className="mt-2 text-xs text-[var(--hi-text-soft)]">{t('vault.barcode_privacy_hint')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.category')}</label>
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
                                                {category.icon} {getVisibleCategoryName(category)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.room')}</label>
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
                                                {getVisibleRoomName(room)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.location_details')}</label>
                                <input
                                    type="text"
                                    name="location_details"
                                    value={formState.location_details}
                                    onChange={handleFieldChange}
                                    className="input-field"
                                    placeholder={t('items.form.location_help')}
                                />
                            </div>

                            <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow-soft)]">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--hi-text)]">{t('items.form.photo')}</p>
                                        <p className="mt-1 text-xs text-[var(--hi-text-soft)]">{photoCopy.hint}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePhotoFileChange}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={photoProcessing || savingItem}
                                            className="btn-secondary inline-flex items-center gap-2"
                                        >
                                            <ImagePlus className="h-4 w-4" />
                                            {photoActionLabel}
                                        </button>
                                        {canRemoveFormPhoto && (
                                            <button
                                                type="button"
                                                onClick={handleRemovePhoto}
                                                disabled={photoProcessing || savingItem}
                                                className="inline-flex items-center gap-2 rounded-[12px] border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                {showPendingPhotoRemoval ? t('common.cancel') : t('common.delete')}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {photoProcessing && (
                                    <p className="mt-3 text-xs text-[var(--hi-text-soft)]">{photoCopy.processing}</p>
                                )}

                                {showPendingPhotoRemoval && (
                                    <p className="mt-3 rounded-2xl border border-[rgba(184,153,104,0.24)] bg-[var(--hi-secondary-soft)] px-3 py-2 text-xs text-[var(--hi-secondary-strong)]">
                                        {photoCopy.pendingRemoval}
                                    </p>
                                )}

                                {hasActiveFormPhoto ? (
                                    <div className="mt-4 space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (photoDraft) {
                                                    openDraftPhotoViewer();
                                                } else if (editingItem?.has_photo && !photoMarkedForRemoval) {
                                                    void openStoredPhotoViewer(editingItem);
                                                }
                                            }}
                                            className="group block w-full overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] text-left transition hover:border-[var(--hi-border-strong)]"
                                        >
                                            <img
                                                src={activeFormPhotoPreviewUrl}
                                                alt={formState.name || t('items.form.photo')}
                                                className="h-56 w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (photoDraft) {
                                                    openDraftPhotoViewer();
                                                } else if (editingItem?.has_photo && !photoMarkedForRemoval) {
                                                    void openStoredPhotoViewer(editingItem);
                                                }
                                            }}
                                            className="text-xs font-medium text-[var(--hi-accent)] underline-offset-4 transition hover:text-[var(--hi-accent-strong)] hover:underline"
                                        >
                                            {photoCopy.openFullAction}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-xl border border-dashed border-[var(--hi-border-strong)] bg-[var(--hi-bg-strong)] px-4 py-6 text-sm text-[var(--hi-text-soft)]">
                                        {photoCopy.emptyState}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)]">
                                <button
                                    type="button"
                                    onClick={() => setShowInvoiceSection((currentValue) => !currentValue)}
                                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--hi-panel-muted)]"
                                >
                                    <div>
                                        <p className="font-medium text-[var(--hi-text)]">{t('items.form.invoice_section')}</p>
                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                            {showInvoiceSection ? t('items.form.invoice_section_help') : t('items.form.invoice_section_collapsed')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {hasStructuredInvoiceContent && !showInvoiceSection && (
                                            <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--hi-accent)]">
                                                {t('items.form.invoice_section_filled')}
                                            </span>
                                        )}
                                        <CalendarDays className="h-5 w-5 text-[var(--hi-text-soft)]" />
                                    </div>
                                </button>

                                {showInvoiceSection && (
                                    <div className="space-y-4 border-t border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 pb-4 pt-4">
                                        <p className="text-xs text-[var(--hi-text-soft)]">{t('items.form.invoice_security')}</p>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.invoice_price')}</label>
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
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.invoice_currency')}</label>
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
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.invoice_date')}</label>
                                                <input
                                                    type="date"
                                                    name="invoice_date"
                                                    value={formState.invoice_date}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_start_date')}</label>
                                                <input
                                                    type="date"
                                                    name="warranty_start_date"
                                                    value={formState.warranty_start_date}
                                                    onChange={handleFieldChange}
                                                    className="input-field"
                                                />
                                            </div>
                                        </div>

                                        <p className="text-xs text-[var(--hi-text-soft)]">{t('items.form.warranty_calculation_help')}</p>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_duration_value')}</label>
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
                                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_duration_unit')}</label>
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
                                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_expiry_date')}</label>
                                            <input
                                                type="date"
                                                name="warranty_expiry_date"
                                                value={displayedWarrantyExpiryDate}
                                                onChange={handleFieldChange}
                                                className={`input-field ${calculatedWarrantyExpiryDate ? 'cursor-not-allowed bg-[var(--hi-panel-muted)]' : ''}`}
                                                readOnly={Boolean(calculatedWarrantyExpiryDate)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                            <p>{photoCopy.hint}</p>
                            <p className="mt-1">{photoCopy.privacyNote}</p>
                        </div>

                        <button type="submit" disabled={savingItem || photoProcessing} className="btn-primary inline-flex items-center gap-2">
                            <Save className="h-4 w-4" />
                            {savingItem || photoProcessing
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
                                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--hi-text-muted)]" />
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
                                            {category.icon} {getVisibleCategoryName(category)}
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
                                            {getVisibleRoomName(room)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {itemsError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                {itemsError}
                            </div>
                        )}

                        {itemsLoading ? (
                            <div className="card flex justify-center py-16"><div className="spinner"></div></div>
                        ) : filteredItems.length === 0 ? (
                            <div className="card p-8 text-center">
                                <Package className="mx-auto mb-4 h-12 w-12 text-[var(--hi-text-muted)] opacity-45" />
                                <h3 className="text-lg font-semibold text-[var(--hi-text)]">
                                    {items.length === 0 ? t('vault.empty_title') : t('vault.empty_filter_title')}
                                </h3>
                                <p className="mt-2 text-sm text-[var(--hi-text-soft)]">
                                    {items.length === 0 ? t('vault.empty_description') : t('vault.empty_filter_description')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredItems.map((item) => (
                                    <article key={item.id} className="card p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start gap-2">
                                                    <h3 className="min-w-0 flex-1 text-lg font-semibold text-[var(--hi-text)] [overflow-wrap:anywhere]">
                                                        {item.name}
                                                    </h3>
                                                    <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-2.5 py-1 text-xs font-medium text-[var(--hi-text-soft)]">
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
                                                            {getVisibleCategoryName({ id: item.category_id, name: item.category_name })}
                                                        </span>
                                                    )}
                                                    {item.room_name && (
                                                        <span className="badge text-xs py-0.5">
                                                            {getVisibleRoomName({ id: item.room_id, name: item.room_name })}
                                                        </span>
                                                    )}
                                                    {item.barcode && (
                                                        <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-2.5 py-1 font-mono text-xs text-[var(--hi-text-soft)]">
                                                            {item.barcode}
                                                        </span>
                                                    )}
                                                </div>

                                                {itemPhotoPreviewUrls[item.id] && (
                                                    <div className="mt-4 space-y-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => { void openStoredPhotoViewer(item); }}
                                                            className="group block w-full overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] text-left transition hover:border-[var(--hi-border-strong)]"
                                                        >
                                                            <img
                                                                src={itemPhotoPreviewUrls[item.id]}
                                                                alt={item.name || t('items.form.photo')}
                                                                className="h-52 w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                                                                loading="lazy"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void openStoredPhotoViewer(item); }}
                                                            className="text-xs font-medium text-[var(--hi-accent)] underline-offset-4 transition hover:text-[var(--hi-accent-strong)] hover:underline"
                                                        >
                                                            {photoCopy.openFullAction}
                                                        </button>
                                                    </div>
                                                )}

                                                {item.description && (
                                                    <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--hi-text-soft)]">
                                                        {item.description}
                                                    </p>
                                                )}

                                                {item.location_details && (
                                                    <p className="mt-3 text-sm text-[var(--hi-text-soft)]">
                                                        {t('items.form.location_details')}: {item.location_details}
                                                    </p>
                                                )}

                                                {(item.invoice_price || item.invoice_date || item.warranty_expiry_date) && (
                                                    <div className="mt-4 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
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

                                                <p className="mt-4 text-xs text-[var(--hi-text-muted)]">
                                                    {t('vault.updated_at')}: {formatLocalDateTime(item.updated_at || item.created_at, i18n.language)}
                                                </p>
                                            </div>

                                            <div className="flex gap-2 lg:flex-shrink-0">
                                                <button type="button" onClick={() => handleEdit(item)} className="btn-secondary">
                                                    {t('common.edit')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingDeleteItem(item)}
                                                    aria-haspopup="dialog"
                                                    disabled={deletingId === item.id}
                                                    className="inline-flex items-center gap-2 rounded-[12px] border border-red-500/18 bg-red-500/6 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    {deletingId === item.id ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete')}
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

            <ConfirmDialog
                isOpen={Boolean(pendingDeleteItem)}
                title={t('vault.delete_title', { defaultValue: 'Delete this vault record?' })}
                description={t('vault.delete_description', { defaultValue: 'Deleting a personal vault record permanently removes its encrypted content.' })}
                confirmLabel={deletingId ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete')}
                cancelLabel={t('common.cancel')}
                confirmButtonClassName="btn-danger"
                tone="danger"
                confirming={Boolean(deletingId)}
                onClose={() => !deletingId && setPendingDeleteItem(null)}
                onConfirm={handleDelete}
            >
                <div className="rounded-[1rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                    <p className="font-medium text-[var(--hi-text)]">{pendingDeleteItem?.name}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('vault.delete_warning', { defaultValue: 'This action cannot be undone. Remove the record only if you no longer need it in your private vault.' })}
                    </p>
                </div>
            </ConfirmDialog>

            <FloatingToast
                open={Boolean(toast)}
                title={toast?.title}
                description={toast?.description}
                tone={toast?.tone}
                onClose={() => setToast(null)}
            />

            {photoViewer.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm" onClick={closePhotoViewer}>
                    <div
                        className="w-full max-w-6xl rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h2 className="truncate text-lg font-semibold text-[var(--hi-text)]">
                                    {photoViewer.title || t('items.form.photo')}
                                </h2>
                                {photoViewer.caption && (
                                    <p className="mt-1 truncate text-sm text-[var(--hi-text-soft)]">{photoViewer.caption}</p>
                                )}
                                <p className="mt-1 text-xs text-[var(--hi-text-muted)]">{photoCopy.viewerHint}</p>
                            </div>
                            <button type="button" onClick={closePhotoViewer} className="btn-secondary inline-flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                {t('common.close')}
                            </button>
                        </div>

                        <div className="flex min-h-[320px] max-h-[78vh] items-center justify-center overflow-auto rounded-xl border border-[var(--hi-border)] bg-[var(--hi-bg-strong)] p-3">
                            {photoViewer.loading ? (
                                <div className="flex flex-col items-center gap-3 text-sm text-[var(--hi-text-soft)]">
                                    <div className="spinner"></div>
                                    <p>{photoCopy.viewerLoading}</p>
                                </div>
                            ) : photoViewer.error ? (
                                <p className="text-sm text-red-300">{photoViewer.error}</p>
                            ) : (
                                <img
                                    src={photoViewer.url}
                                    alt={photoViewer.caption || photoViewer.title || t('items.form.photo')}
                                    className="max-h-[72vh] w-auto max-w-full object-contain"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
