import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Box, Camera, X, Lock, Globe, MapPin, Plus, Loader2, ChevronDown, Check, QrCode, ScanBarcode, Search, ExternalLink, CalendarDays, Edit3, ChevronRight, Download, FileText, Paperclip, Trash2, Upload, ArrowRightLeft, History } from 'lucide-react';
import SecureImage from './SecureImage';
import FullscreenImage from './FullscreenImage';
import { MAX_PHOTO_UPLOAD_MB, isPhotoUploadTooLarge } from '../utils/mediaLimits';
import { formatBorrowDate, formatBorrowDateTime, isBorrowOverdue } from '../utils/borrowFormatting';
import {
    ACTION_REQUEST_TIMEOUT_MS,
    createRequestConfig,
    getRequestErrorMessage,
    isRequestCanceled
} from '../utils/httpRequests';
import { resolveVisibleItemTitle } from '../utils/itemDisplay';
import { getCategoryPresentation } from '../utils/categoryDisplay';
import { getRoomPresentation } from '../utils/roomDisplay';
import { invalidateCache } from '../utils/apiCache';

const ItemQRCode = lazy(() => import('./ItemQRCode'));
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));
const ITEM_CACHE_PATTERN = /^\/api\/items/;

interface MaintenanceTask {
    id: number;
    item_id: number;
    task_name: string;
    description?: string;
    frequency_value?: number | null;
    frequency_unit: string;
    next_due_date?: string | null;
    last_performed_at?: string | null;
}

function createInitialFormData() {
    return {
        name: '',
        description: '',
        quantity: 1,
        category_id: '',
        room_id: '',
        location_id: '',
        box_id: '',
        is_public: true,
        barcode: '',
        invoice_price: '',
        invoice_currency: '',
        invoice_currency_custom: '',
        invoice_date: '',
        warranty_start_date: '',
        warranty_duration_value: '',
        warranty_duration_unit: '',
        warranty_expiry_date: '',
        expiry_date: '',
        min_quantity: 0
    };
}

function normalizeReturnToPath(value) {
    const path = String(value || '').trim();
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
}

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

const DATE_INPUT_PLACEHOLDER = 'DD.MM.YYYY';

function DetailField({ label, value, mono = false }) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    return (
        <div className="item-detail-field">
            <p className="text-xs text-[var(--hi-text-muted)]">{label}</p>
            <p className={`mt-1 font-medium text-[var(--hi-text)] [overflow-wrap:anywhere] ${mono ? 'font-mono text-sm' : ''}`}>
                {value}
            </p>
        </div>
    );
}

function isPresetCurrency(code) {
    return CURRENCY_OPTIONS.some((currency) => currency.code === code);
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

function normalizeDateForSubmit(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    let match = normalized.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (match) {
        return buildValidatedIsoDate(match[1], match[2], match[3]) || normalized;
    }

    match = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
        return buildValidatedIsoDate(match[3], match[2], match[1]) || normalized;
    }

    return normalized;
}

function formatDateInputValue(value) {
    const normalized = String(value || '').replace(/[^\d./-]/g, '').trim();
    if (!normalized) {
        return '';
    }

    const fullyNormalized = normalizeDateForSubmit(normalized);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fullyNormalized)) {
        return formatIsoDateForDisplay(fullyNormalized);
    }

    const digits = normalized.replace(/\D/g, '').slice(0, 8);
    if (!digits) {
        return '';
    }

    const leadingYear = Number.parseInt(digits.slice(0, 4), 10);
    const looksLikeYearFirst = digits.length > 4 && leadingYear >= 1900 && leadingYear <= 2200;

    if (looksLikeYearFirst) {
        if (digits.length <= 4) {
            return digits;
        }
        if (digits.length <= 6) {
            return `${digits.slice(0, 4)}-${digits.slice(4)}`;
        }
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }

    if (digits.length <= 2) {
        return digits;
    }

    if (digits.length <= 4) {
        return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }

    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
}

function formatIsoDateForDisplay(value) {
    const isoDate = normalizeDateForSubmit(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return String(value || '');
    }

    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
}

function formatAttachmentSize(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 KB';
    }
    if (bytes < 1024 * 1024) {
        return `${Math.ceil(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFreqText(val: any, unit: any, t: any) {
    if (!val || !unit) return t('maintenance.freq.one_time', { defaultValue: 'Tek Seferlik' });
    const unitTranslation = t(`maintenance.freq.unit.${unit}`, {
        defaultValue: unit === 'days' ? 'Gün' : unit === 'weeks' ? 'Hafta' : unit === 'months' ? 'Ay' : 'Yıl'
    });
    return t('maintenance.freq.format', { val, unit: unitTranslation, defaultValue: `Her ${val} ${unitTranslation}` });
}

function calculateWarrantyExpiryDisplay(startDateValue, durationValue, durationUnit) {
    const normalizedStartDate = normalizeDateForSubmit(startDateValue);
    const parsedDurationValue = parseDurationValue(durationValue);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedStartDate) || !parsedDurationValue) {
        return '';
    }

    if (!WARRANTY_DURATION_OPTIONS.some((option) => option.code === durationUnit)) {
        return '';
    }

    const monthDelta = durationUnit === 'years'
        ? parsedDurationValue * 12
        : parsedDurationValue;
    const expiryDate = addMonthsClamped(normalizedStartDate, monthDelta);

    return expiryDate ? formatIsoDateForDisplay(expiryDate) : '';
}

export default function ItemForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [returnToPath] = useState(() => normalizeReturnToPath(searchParams.get('return_to')));
    const { t, i18n } = useTranslation();
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const invoiceFileInputRef = useRef(null);
    const invoiceCameraInputRef = useRef(null);
    const attachmentInputRef = useRef(null);
    const invoiceDatePickerRef = useRef(null);
    const warrantyStartDatePickerRef = useRef(null);
    const warrantyDatePickerRef = useRef(null);
    const expiryDatePickerRef = useRef(null);
    const isMountedRef = useRef(true);
    const isEditing = Boolean(id);

    const [formData, setFormData] = useState(createInitialFormData);
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [existingPhoto, setExistingPhoto] = useState(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [invoicePhoto, setInvoicePhoto] = useState(null);
    const [invoicePhotoPreview, setInvoicePhotoPreview] = useState(null);
    const [existingInvoicePhoto, setExistingInvoicePhoto] = useState(null);
    const [removeInvoicePhoto, setRemoveInvoicePhoto] = useState(false);
    const [showInvoiceSection, setShowInvoiceSection] = useState(false);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [attachmentUploading, setAttachmentUploading] = useState(false);
    const [attachmentDeletingId, setAttachmentDeletingId] = useState<number | null>(null);
    const [categories, setCategories] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [locations, setLocations] = useState([]);
    const [boxes, setBoxes] = useState([]);
    const [activeBorrow, setActiveBorrow] = useState(null);
    const [borrowHistory, setBorrowHistory] = useState([]);
    const [borrowHistoryLoading, setBorrowHistoryLoading] = useState(isEditing);
    const [canManageVisibility, setCanManageVisibility] = useState(!isEditing);
    const [canEditItem, setCanEditItem] = useState(!isEditing);
    const [privatePlacementHidden, setPrivatePlacementHidden] = useState(false);
    const [isDetailEditMode, setIsDetailEditMode] = useState(!isEditing);
    const currentLanguage = i18n.resolvedLanguage || i18n.language;

    // Maintenance state & modal states
    const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
    const [isMaintenanceLoading, setIsMaintenanceLoading] = useState(false);
    const [showMaintenanceSection, setShowMaintenanceSection] = useState(false);

    const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);
    const [taskName, setTaskName] = useState('');
    const [taskDescription, setTaskDescription] = useState('');
    const [freqValue, setFreqValue] = useState('');
    const [freqUnit, setFreqUnit] = useState('months');
    const [nextDueDate, setNextDueDate] = useState('');

    const fetchMaintenanceTasks = async () => {
        if (!id) return;
        setIsMaintenanceLoading(true);
        try {
            const res = await axios.get('/api/maintenance');
            if (isMountedRef.current) {
                const allTasks = res.data.tasks || [];
                const itemTasks = allTasks.filter((t: any) => t.item_id === Number.parseInt(id));
                setMaintenanceTasks(itemTasks);
            }
        } catch (error) {
            console.error('Fetch maintenance tasks error:', error);
        } finally {
            if (isMountedRef.current) {
                setIsMaintenanceLoading(false);
            }
        }
    };

    const fetchAttachments = async (signal?: AbortSignal) => {
        if (!id) return;
        try {
            const res = await axios.get(`/api/items/${id}/attachments`, createRequestConfig({ signal }));
            if (isMountedRef.current) {
                setAttachments(res.data.attachments || []);
            }
        } catch (error) {
            if (!isRequestCanceled(error)) {
                console.error('Fetch attachments error:', error);
            }
        }
    };

    const handleOpenAddTask = () => {
        setEditingTask(null);
        setTaskName('');
        setTaskDescription('');
        setFreqValue('6');
        setFreqUnit('months');
        setNextDueDate(new Date().toISOString().split('T')[0]);
        setIsTaskFormOpen(true);
    };

    const handleOpenEditTask = (task: MaintenanceTask) => {
        setEditingTask(task);
        setTaskName(task.task_name || '');
        setTaskDescription(task.description || '');
        setFreqValue(task.frequency_value ? String(task.frequency_value) : '');
        setFreqUnit(task.frequency_unit || 'months');
        setNextDueDate(task.next_due_date || '');
        setIsTaskFormOpen(true);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskName.trim()) {
            return;
        }
        if (!nextDueDate) {
            return;
        }

        const payload = {
            item_id: Number.parseInt(id!),
            task_name: taskName,
            description: taskDescription,
            frequency_value: freqValue ? Number.parseInt(freqValue, 10) : null,
            frequency_unit: freqValue ? freqUnit : null,
            next_due_date: nextDueDate
        };

        try {
            if (editingTask) {
                await axios.put(`/api/maintenance/${editingTask.id}`, payload);
            } else {
                await axios.post('/api/maintenance', payload);
            }
            invalidateCache('/api/items/dashboard-summary');
            setIsTaskFormOpen(false);
            await fetchMaintenanceTasks();
        } catch (error) {
            console.error('Save maintenance task error:', error);
        }
    };

    const handlePerformTask = async (task: MaintenanceTask) => {
        try {
            await axios.post(`/api/maintenance/${task.id}/perform`);
            invalidateCache('/api/items/dashboard-summary');
            await fetchMaintenanceTasks();
        } catch (error) {
            console.error('Perform maintenance task error:', error);
        }
    };

    const handleDeleteTask = async (task: MaintenanceTask) => {
        if (!window.confirm(t('maintenance.confirm_delete', { defaultValue: 'Bu görev silinecek. Emin misiniz?' }))) {
            return;
        }
        try {
            await axios.delete(`/api/maintenance/${task.id}`);
            invalidateCache('/api/items/dashboard-summary');
            await fetchMaintenanceTasks();
        } catch (error) {
            console.error('Delete maintenance task error:', error);
        }
    };

    const getVisibleCategoryName = (category) => getCategoryPresentation(category, currentLanguage).name;
    const getVisibleRoomName = (room) => getRoomPresentation(room, currentLanguage).name;

    // Location selector state
    const [locationSearch, setLocationSearch] = useState('');
    const [showLocationDropdown, setShowLocationDropdown] = useState(false);
    const [isCreatingLocation, setIsCreatingLocation] = useState(false);
    const [newLocationPublic, setNewLocationPublic] = useState(false);
    const [savingLocation, setSavingLocation] = useState(false);

    // Barcode scanner state
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [searchingBarcode, setSearchingBarcode] = useState(false);
    const [barcodeMessage, setBarcodeMessage] = useState('');

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(isEditing);
    const [error, setError] = useState('')

    const locationDropdownRef = useRef(null);

    useEffect(() => {
        const optionsController = new AbortController();
        fetchOptions(optionsController.signal);

        if (isEditing) {
            const itemController = new AbortController();

            setFetching(true);
            setBorrowHistoryLoading(true);
            fetchItem(itemController.signal);
            fetchAttachments(itemController.signal);

            return () => {
                optionsController.abort();
                itemController.abort();
            };
        }

        setFetching(false);
        setFormData({
            ...createInitialFormData(),
            box_id: searchParams.get('box_id') || '',
            room_id: searchParams.get('room_id') || '',
            location_id: searchParams.get('location_id') || '',
            is_public: searchParams.get('is_public') !== 'false'
        });
        setPhoto(null);
        setPhotoPreview(null);
        setExistingPhoto(null);
        setRemovePhoto(false);
        setInvoicePhoto(null);
        setInvoicePhotoPreview(null);
        setExistingInvoicePhoto(null);
        setRemoveInvoicePhoto(false);
        setShowInvoiceSection(false);
        setAttachments([]);
        setActiveBorrow(null);
        setBorrowHistory([]);
        setBorrowHistoryLoading(false);
        setCanManageVisibility(true);
        setCanEditItem(true);
        setPrivatePlacementHidden(false);
        setIsDetailEditMode(true);
        setLocationSearch('');
        setLocations([]);

        return () => {
            optionsController.abort();
        };
    }, [id, isEditing]);

    useEffect(() => {
        const controller = new AbortController();

        if (formData.room_id) {
            fetchLocations(controller.signal);
        } else {
            setLocations([]);
        }

        return () => {
            controller.abort();
        };
    }, [formData.room_id]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
                setShowLocationDropdown(false);
                setIsCreatingLocation(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const fetchOptions = async (signal) => {
        try {
            const [catRes, roomRes, boxRes] = await Promise.all([
                axios.get('/api/categories', createRequestConfig({ signal })),
                axios.get('/api/rooms', createRequestConfig({ signal })),
                axios.get('/api/boxes?archived=include', createRequestConfig({ signal }))
            ]);

            if (!isMountedRef.current) {
                return;
            }

            setCategories(catRes.data.categories);
            setRooms(roomRes.data.rooms);
            const nextBoxes = boxRes.data.boxes || [];
            setBoxes(nextBoxes);

            if (!isEditing) {
                const requestedBoxId = searchParams.get('box_id');
                const requestedBox = nextBoxes.find((box: any) => String(box.id) === String(requestedBoxId || ''));
                if (requestedBox && !requestedBox.archived) {
                    const requestedVisibility = searchParams.get('is_public');
                    setFormData((current) => ({
                        ...current,
                        box_id: String(requestedBox.id),
                        room_id: requestedBox.room_id ? String(requestedBox.room_id) : '',
                        location_id: requestedBox.location_id ? String(requestedBox.location_id) : '',
                        is_public: requestedVisibility === null
                            ? (requestedBox.is_public === undefined ? true : Boolean(requestedBox.is_public))
                            : requestedVisibility !== 'false'
                    }));
                    if (requestedBox.location_name) {
                        setLocationSearch(requestedBox.location_name);
                    }
                } else if (requestedBoxId) {
                    setFormData((current) => ({
                        ...current,
                        box_id: '',
                        room_id: '',
                        location_id: ''
                    }));
                    setLocationSearch('');
                }
            }
        } catch (error) {
            if (!isRequestCanceled(error)) {
                console.error(error);
            }
        }
    };

    const fetchLocations = async (signal) => {
        try {
            const res = await axios.get(
                `/api/locations?room_id=${formData.room_id}`,
                createRequestConfig({ signal })
            );

            if (!isMountedRef.current) {
                return;
            }

            const nextLocations = res.data.locations || [];
            setLocations(nextLocations);
            const selectedLocation = nextLocations.find((location: any) =>
                String(location.id) === String(formData.location_id || '')
            );
            if (selectedLocation) {
                setLocationSearch(selectedLocation.name);
            }
        } catch (error) {
            if (!isRequestCanceled(error)) {
                console.error(error);
            }
        }
    };

    const fetchItem = async (signal) => {
        try {
            setIsMaintenanceLoading(true);
            const [itemRes, historyRes, maintenanceRes] = await Promise.all([
                axios.get(`/api/items/${id}`, createRequestConfig({ signal })),
                axios.get(`/api/items/${id}/borrow-history`, createRequestConfig({ signal })).catch((error) => {
                    if (isRequestCanceled(error)) {
                        throw error;
                    }
                    return { data: { history: [] } };
                }),
                axios.get('/api/maintenance', createRequestConfig({ signal })).catch((error) => {
                    if (isRequestCanceled(error)) {
                        throw error;
                    }
                    return { data: { tasks: [] } };
                })
            ]);
            const item = itemRes.data.item;
            const allTasks = maintenanceRes.data.tasks || [];
            const itemTasks = allTasks.filter((t: any) => t.item_id === Number.parseInt(id!));

            if (!isMountedRef.current) {
                return;
            }

            setMaintenanceTasks(itemTasks);
            setPrivatePlacementHidden(Boolean(item.private_placement || item.private_location_hidden));

            setFormData({
                name: resolveVisibleItemTitle(item, t('inventory.untitled_item')),
                description: item.description || '',
                quantity: item.quantity,
                category_id: item.category_id || '',
                room_id: item.room_id || '',
                location_id: item.location_id || '',
                box_id: item.box_id || '',
                is_public: item.is_public === 1,
                barcode: item.barcode || '',
                invoice_price: item.invoice_price || '',
                invoice_currency: item.invoice_currency
                    ? (isPresetCurrency(item.invoice_currency) ? item.invoice_currency : CUSTOM_CURRENCY_OPTION)
                    : '',
                invoice_currency_custom: item.invoice_currency && !isPresetCurrency(item.invoice_currency)
                    ? item.invoice_currency
                    : '',
                invoice_date: formatIsoDateForDisplay(item.invoice_date || ''),
                warranty_start_date: formatIsoDateForDisplay(item.warranty_start_date || ''),
                warranty_duration_value: item.warranty_duration_value || '',
                warranty_duration_unit: item.warranty_duration_unit || '',
                warranty_expiry_date: formatIsoDateForDisplay(item.warranty_expiry_date || ''),
                expiry_date: formatIsoDateForDisplay(item.expiry_date || ''),
                min_quantity: item.min_quantity || 0
            });
            setPhoto(null);
            setPhotoPreview(null);
            setExistingPhoto(item.photo_path || null);
            setRemovePhoto(false);
            setInvoicePhoto(null);
            setInvoicePhotoPreview(null);
            setExistingInvoicePhoto(item.invoice_photo_path || null);
            setRemoveInvoicePhoto(false);
            setShowInvoiceSection(Boolean(
                item.invoice_photo_path ||
                item.invoice_price ||
                item.invoice_currency ||
                item.invoice_date ||
                item.warranty_start_date ||
                item.warranty_duration_value ||
                item.warranty_duration_unit ||
                item.warranty_expiry_date
            ));
            setLocationSearch(item.location_name || '');
            setActiveBorrow(item.active_borrow || null);
            setCanManageVisibility(Boolean(item.can_manage_visibility));
            const itemCanEdit = item.can_edit !== undefined
                ? Boolean(item.can_edit)
                : Boolean(item.can_manage_visibility);
            setCanEditItem(itemCanEdit);
            if (!itemCanEdit) {
                setIsDetailEditMode(false);
            }
            setBorrowHistory(historyRes.data.history || []);
        } catch (error) {
            if (!isRequestCanceled(error) && isMountedRef.current) {
                setError(t('items.load_error'));
            }
        }
        finally {
            if (isMountedRef.current) {
                setBorrowHistoryLoading(false);
                setFetching(false);
                setIsMaintenanceLoading(false);
            }
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'room_id') {
            setFormData({ ...formData, [name]: value, location_id: '' });
            setLocationSearch('');
        } else if (name === 'box_id') {
            const nextBox = boxes.find((box: any) => String(box.id) === String(value));
            if (nextBox) {
                setFormData((current) => ({
                    ...current,
                    box_id: value,
                    room_id: nextBox.room_id ? String(nextBox.room_id) : '',
                    location_id: nextBox.location_id ? String(nextBox.location_id) : ''
                }));
                setLocationSearch(nextBox.location_name || '');
            } else {
                setFormData((current) => ({ ...current, box_id: '' }));
            }
        } else if (name === 'invoice_currency') {
            setFormData((prev) => ({
                ...prev,
                invoice_currency: value,
                invoice_currency_custom: value === CUSTOM_CURRENCY_OPTION ? prev.invoice_currency_custom : ''
            }));
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleCustomCurrencyChange = (value) => {
        setFormData((prev) => ({
            ...prev,
            invoice_currency_custom: String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
        }));
    };

    const handleWarrantyDurationChange = (value) => {
        setFormData((prev) => ({
            ...prev,
            warranty_duration_value: normalizeDurationValue(value)
        }));
    };

    const handleDateInputChange = (name, value) => {
        setFormData((prev) => ({
            ...prev,
            [name]: formatDateInputValue(value)
        }));
    };

    const handleDateInputBlur = (name) => {
        setFormData((prev) => {
            const normalized = normalizeDateForSubmit(prev[name]);
            return {
                ...prev,
                [name]: /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? formatIsoDateForDisplay(normalized) : String(prev[name] || '').trim()
            };
        });
    };

    const handleDatePickerChange = (name, value) => {
        setFormData((prev) => ({
            ...prev,
            [name]: formatIsoDateForDisplay(value)
        }));
    };

    const getDatePickerValue = (value) => {
        const normalized = normalizeDateForSubmit(value);
        return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
    };

    const openDatePicker = (inputRef) => {
        const input = inputRef.current;
        if (!input) {
            return;
        }

        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }

        input.focus();
        input.click();
    };

    const updateImagePreview = (file, onPreviewReady) => {
        const reader = new FileReader();
        reader.onloadend = () => onPreviewReady(reader.result);
        reader.readAsDataURL(file);
    };

    const clearPhotoLimitError = () => {
        const photoLimitMessage = t('items.messages.photo_too_large', { maxSizeMb: MAX_PHOTO_UPLOAD_MB });
        setError((currentError) => (currentError === photoLimitMessage ? '' : currentError));
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (isPhotoUploadTooLarge(file)) {
                setError(t('items.messages.photo_too_large', { maxSizeMb: MAX_PHOTO_UPLOAD_MB }));
                e.target.value = '';
                return;
            }

            clearPhotoLimitError();
            setPhoto(file);
            setRemovePhoto(false);
            updateImagePreview(file, setPhotoPreview);
        }
    };

    const handleRemovePhoto = () => {
        if (photo) {
            setPhoto(null);
            setPhotoPreview(null);
            setRemovePhoto(false);
        } else if (photoPreview) {
            // Product catalogue images are URL-backed previews rather than
            // uploaded files. They still need to be removable on touch/mobile.
            setPhotoPreview(null);
            setRemovePhoto(false);
        } else if (existingPhoto) {
            setExistingPhoto(null);
            setRemovePhoto(true);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const handleInvoicePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (isPhotoUploadTooLarge(file)) {
                setError(t('items.messages.photo_too_large', { maxSizeMb: MAX_PHOTO_UPLOAD_MB }));
                e.target.value = '';
                return;
            }

            clearPhotoLimitError();
            setInvoicePhoto(file);
            setRemoveInvoicePhoto(false);
            updateImagePreview(file, setInvoicePhotoPreview);
        }
    };

    const handleAttachmentUpload = async (event) => {
        const files = Array.from(event.target.files || []) as File[];
        if (!files.length || !id) {
            return;
        }

        setAttachmentUploading(true);
        setError('');
        try {
            const uploadedAttachments = [];
            for (const file of files) {
                const data = new FormData();
                data.append('attachment', file);
                const response = await axios.post(`/api/items/${id}/attachments`, data, {
                    timeout: ACTION_REQUEST_TIMEOUT_MS,
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                uploadedAttachments.push(response.data.attachment);
            }
            setAttachments((current) => [...uploadedAttachments.reverse(), ...current]);
            invalidateCache(ITEM_CACHE_PATTERN);
        } catch (err) {
            setError(getRequestErrorMessage(err, t('items.attachments.upload_error', { defaultValue: 'Ek dosya yüklenemedi' })));
        } finally {
            setAttachmentUploading(false);
            if (attachmentInputRef.current) {
                attachmentInputRef.current.value = '';
            }
        }
    };

    const handleDeleteAttachment = async (attachmentId) => {
        if (!window.confirm(t('items.attachments.delete_confirm', { defaultValue: 'Bu ek dosya silinecek. Emin misiniz?' }))) {
            return;
        }

        setAttachmentDeletingId(attachmentId);
        try {
            await axios.delete(`/api/items/attachments/${attachmentId}`);
            setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
            invalidateCache(ITEM_CACHE_PATTERN);
        } catch (err) {
            setError(getRequestErrorMessage(err, t('items.attachments.delete_error', { defaultValue: 'Ek dosya silinemedi' })));
        } finally {
            setAttachmentDeletingId(null);
        }
    };

    const handleRemoveInvoicePhoto = () => {
        if (invoicePhoto) {
            setInvoicePhoto(null);
            setInvoicePhotoPreview(null);
            setRemoveInvoicePhoto(false);
        } else if (existingInvoicePhoto) {
            setExistingInvoicePhoto(null);
            setRemoveInvoicePhoto(true);
        }

        if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
        if (invoiceCameraInputRef.current) invoiceCameraInputRef.current.value = '';
    };

    // Location selection
    const handleSelectLocation = (location) => {
        setFormData({ ...formData, location_id: location.id });
        setLocationSearch(location.name);
        setShowLocationDropdown(false);
        setIsCreatingLocation(false);
    };

    const handleClearLocation = () => {
        setFormData({ ...formData, location_id: '' });
        setLocationSearch('');
    };

    // Create new location
    const handleCreateLocation = async () => {
        if (!locationSearch.trim()) return;
        setSavingLocation(true);
        try {
            const res = await axios.post(
                '/api/locations',
                {
                    name: locationSearch.trim(),
                    room_id: formData.room_id,
                    is_public: newLocationPublic
                },
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            const newLoc = res.data.location;
            setLocations([...locations, newLoc]);
            setFormData({ ...formData, location_id: newLoc.id });
            setShowLocationDropdown(false);
            setIsCreatingLocation(false);
            setNewLocationPublic(false);
        } catch (e) {
            alert(getRequestErrorMessage(e, t('items.messages.location_add_error')));
        } finally {
            setSavingLocation(false);
        }
    };

    // Barcode scanner callbacks
    const handleProductFound = (product) => {
        setFormData(prev => ({
            ...prev,
            name: product.name || prev.name,
            barcode: product.barcode || ''
        }));
        // If product has image URL, we could potentially use it
        if (product.imageUrl && !photoPreview && !existingPhoto) {
            setPhotoPreview(product.imageUrl);
        }
    };

    const handleBarcodeOnly = (barcode) => {
        setFormData(prev => ({ ...prev, barcode }));
    };

    // Box-only batch capture: save a minimal item and keep the scanner open.
    const handleQuickAdd = async (barcode) => {
        try {
            const data = new FormData();
            data.append('name', barcode);
            data.append('barcode', barcode);
            data.append('quantity', '1');
            data.append('is_public', formData.is_public ? 'true' : 'false');
            const targetBox = boxes.find((box: any) => String(box.id) === String(formData.box_id || ''));
            const targetBoxId = targetBox?.id || formData.box_id;
            if (targetBoxId) {
                data.append('box_id', String(targetBoxId));
                data.append('room_id', targetBox?.room_id ? String(targetBox.room_id) : String(formData.room_id || ''));
                data.append('location_id', targetBox?.location_id ? String(targetBox.location_id) : String(formData.location_id || ''));
            }

            await axios.post('/api/items', data, createRequestConfig({
                timeout: ACTION_REQUEST_TIMEOUT_MS,
                headers: { 'Content-Type': 'multipart/form-data' }
            }));
            invalidateCache(ITEM_CACHE_PATTERN);
            invalidateCache(/^\/api\/boxes/);
            setBarcodeMessage(t('items.messages.quick_add_success', { barcode }));
        } catch (err) {
            console.error('Quick add error:', err);
            const message = getRequestErrorMessage(err, t('items.messages.quick_add_fail'));
            setBarcodeMessage(message);
            throw new Error(message);
        }
    };

    const handleExistingBarcodeItem = async (item) => {
        const targetBox = boxes.find((box: any) => String(box.id) === String(formData.box_id || ''));
        if (!targetBox) {
            return;
        }

        if (String(item.box_id || '') !== String(targetBox.id)) {
            try {
                await axios.post('/api/items/bulk', {
                    action: 'update',
                    item_ids: [item.id],
                    payload: {
                        box_id: targetBox.id,
                        room_id: targetBox.room_id || null,
                        location_id: targetBox.location_id || null
                    }
                }, createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS }));
                invalidateCache(ITEM_CACHE_PATTERN);
                invalidateCache(/^\/api\/boxes/);
            } catch (err) {
                const message = getRequestErrorMessage(err, t('boxes.move_error', {
                    defaultValue: 'The item could not be assigned to this box.'
                }));
                setBarcodeMessage(message);
                throw new Error(message);
            }
        }

        setBarcodeMessage(t('boxes.items_moved_body', {
            defaultValue: 'The item is now in this box.'
        }));
        navigate(returnToPath || `/organize/boxes/${targetBox.id}`);
    };

    // Manual barcode search - uses backend proxy with waterfall API + Google scraper
    const handleManualBarcodeSearch = async () => {
        if (!formData.barcode) return;

        setSearchingBarcode(true);
        setBarcodeMessage(t('items.messages.searching'));

        const barcode = formData.barcode.trim();

        try {
            // Use backend proxy for waterfall lookup
            const response = await axios.get(
                `/api/barcode/${encodeURIComponent(barcode)}`,
                createRequestConfig({ timeout: ACTION_REQUEST_TIMEOUT_MS })
            );
            const result = response.data;

            if (result.found) {
                if (result.existingItem) {
                    setBarcodeMessage(t('items.messages.found_local', { name: result.name }));
                } else {
                    const fullName = result.brand ? `${result.brand} ${result.name}` : result.name;
                    setFormData(prev => ({ ...prev, name: fullName }));

                    if (result.image && !photoPreview && !existingPhoto) {
                        setPhotoPreview(result.image);
                    }

                    const sourceNote = result.isGoogleResult ? '(Google)' : '';
                    setBarcodeMessage(t('items.messages.found_remote', { source: result.source, note: sourceNote, name: fullName }));
                }
            } else {
                setBarcodeMessage(t('items.messages.not_found'));
            }
        } catch (err) {
            console.error('Barcode search error:', err);
            setBarcodeMessage(t('items.messages.search_fail'));
        } finally {
            setSearchingBarcode(false);
        }
    };

    // Filtered locations based on search
    const filteredLocations = locations.filter(l =>
        l.name.toLowerCase().includes(locationSearch.toLowerCase())
    );

    const exactMatch = locations.some(l => l.name.toLowerCase() === locationSearch.toLowerCase());

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isEditing && !canEditItem) {
            setIsDetailEditMode(false);
            return;
        }

        // Prevent double submission
        if (loading) return;

        if (!formData.name.trim()) { setError(t('items.messages.name_required')); return; }
        setError(''); setLoading(true);

        try {
            const data = new FormData();
            const resolvedInvoiceCurrency = formData.invoice_currency === CUSTOM_CURRENCY_OPTION
                ? formData.invoice_currency_custom
                : formData.invoice_currency;
            const effectiveWarrantyStartDate = formData.warranty_start_date || formData.invoice_date;
            const hasWarrantyCalculationInput = Boolean(
                formData.warranty_start_date ||
                formData.warranty_duration_value ||
                formData.warranty_duration_unit
            );
            const calculatedWarrantyExpiryDate = calculateWarrantyExpiryDisplay(
                effectiveWarrantyStartDate,
                formData.warranty_duration_value,
                formData.warranty_duration_unit
            );
            const normalizedFormData = {
                ...formData,
                ...(selectedBox ? {
                    room_id: selectedBox.room_id ? String(selectedBox.room_id) : '',
                    location_id: selectedBox.location_id ? String(selectedBox.location_id) : ''
                } : {}),
                invoice_currency: resolvedInvoiceCurrency,
                invoice_date: normalizeDateForSubmit(formData.invoice_date),
                warranty_start_date: hasWarrantyCalculationInput
                    ? normalizeDateForSubmit(effectiveWarrantyStartDate)
                    : normalizeDateForSubmit(formData.warranty_start_date),
                warranty_duration_value: String(formData.warranty_duration_value || '').trim(),
                warranty_duration_unit: formData.warranty_duration_unit,
                warranty_expiry_date: normalizeDateForSubmit(
                    calculatedWarrantyExpiryDate || formData.warranty_expiry_date
                ),
                expiry_date: normalizeDateForSubmit(formData.expiry_date),
                min_quantity: String(formData.min_quantity ?? 0)
            };

            Object.keys(normalizedFormData).forEach(key => {
                if (key === 'invoice_currency_custom') {
                    return;
                }
                if (isEditing && key === 'is_public' && !canManageVisibility) {
                    return;
                }
                data.append(key, String((normalizedFormData as any)[key] ?? ''));
            });
            if (photo) data.append('photo', photo);
            if (invoicePhoto) data.append('invoice_photo', invoicePhoto);
            if (isEditing) {
                data.append('remove_photo', removePhoto ? 'true' : 'false');
                data.append('remove_invoice_photo', removeInvoicePhoto ? 'true' : 'false');
            }

            const config = { headers: { 'Content-Type': 'multipart/form-data' } };

            if (isEditing) {
                await axios.put(`/api/items/${id}`, data, {
                    ...config,
                    timeout: ACTION_REQUEST_TIMEOUT_MS
                });
            } else {
                await axios.post(
                    '/api/items',
                    data,
                    {
                        ...config,
                        timeout: ACTION_REQUEST_TIMEOUT_MS
                    }
                );
                // Clear form state after successful creation
                setFormData(createInitialFormData());
                setPhoto(null);
                setPhotoPreview(null);
                setExistingPhoto(null);
                setRemovePhoto(false);
                setInvoicePhoto(null);
                setInvoicePhotoPreview(null);
                setExistingInvoicePhoto(null);
                setRemoveInvoicePhoto(false);
                setShowInvoiceSection(false);
            }

            invalidateCache(ITEM_CACHE_PATTERN);
            navigate(returnToPath || '/items');
        } catch (err) {
            setError(getRequestErrorMessage(err, t('common.error')));
        } finally {
            setLoading(false);
        }
    };

    const effectiveWarrantyStartDate = formData.warranty_start_date || formData.invoice_date;
    const hasWarrantyCalculationInput = Boolean(
        formData.warranty_start_date ||
        formData.warranty_duration_value ||
        formData.warranty_duration_unit
    );
    const calculatedWarrantyExpiryDate = calculateWarrantyExpiryDisplay(
        effectiveWarrantyStartDate,
        formData.warranty_duration_value,
        formData.warranty_duration_unit
    );
    const displayedWarrantyExpiryDate = calculatedWarrantyExpiryDate || formData.warranty_expiry_date;
    const selectedCategory = categories.find((category) => String(category.id) === String(formData.category_id));
    const selectedRoom = rooms.find((room) => String(room.id) === String(formData.room_id));
    const selectedBox = boxes.find((box) => String(box.id) === String(formData.box_id));
    const assignableBoxes = boxes.filter((box: any) => (
        !box.archived || String(box.id) === String(formData.box_id)
    ));
    const selectedBoxRoom = selectedBox
        ? rooms.find((room) => String(room.id) === String((selectedBox as any).room_id || ''))
        : null;
    const selectedBoxLocation = selectedBox
        ? locations.find((location) => String(location.id) === String((selectedBox as any).location_id || ''))
        : null;
    const selectedBoxPlace = [
        selectedBoxRoom ? getVisibleRoomName(selectedBoxRoom) : (selectedBox as any)?.room_name,
        (selectedBoxLocation as any)?.name || (selectedBox as any)?.location_name
    ].filter(Boolean).join(' / ');
    const visibleCategoryName = selectedCategory ? getVisibleCategoryName(selectedCategory) : '';
    const visibleRoomName = selectedRoom ? getVisibleRoomName(selectedRoom) : '';
    const displayInvoiceCurrency = formData.invoice_currency === CUSTOM_CURRENCY_OPTION
        ? formData.invoice_currency_custom
        : formData.invoice_currency;
    const displayWarrantyDuration = formData.warranty_duration_value && formData.warranty_duration_unit
        ? `${formData.warranty_duration_value} ${t(WARRANTY_DURATION_OPTIONS.find((option) => option.code === formData.warranty_duration_unit)?.labelKey || 'items.form.warranty_duration_months')}`
        : '';

    const hasInvoiceContent = Boolean(
        invoicePhotoPreview ||
        existingInvoicePhoto ||
        formData.invoice_price ||
        (formData.invoice_currency === CUSTOM_CURRENCY_OPTION ? formData.invoice_currency_custom : formData.invoice_currency) ||
        formData.invoice_date ||
        formData.warranty_start_date ||
        formData.warranty_duration_value ||
        formData.warranty_duration_unit ||
        formData.warranty_expiry_date
    );
    const activeBorrowOverdue = isBorrowOverdue(activeBorrow);
    const activeBorrowReturnPending = Boolean(activeBorrow?.return_requested_at);
    const getActiveBorrowTitle = (borrow) => {
        if (!borrow) {
            return '';
        }

        const borrowerName = borrow.borrower_display_name || t('inventory.borrow.unknown');
        if (borrow.return_requested_at) {
            if (borrow.role === 'borrower') {
                return t('inventory.borrow.return_pending_self_title', { defaultValue: 'With you, waiting for receipt confirmation' });
            }

            return t('inventory.borrow.return_pending_lender_title', {
                name: borrowerName,
                defaultValue: '{{name}} marked this item as delivered back'
            });
        }

        if (borrow.role === 'borrower') {
            return t('inventory.borrow.borrowed_by_you', { defaultValue: 'With you' });
        }

        return t('inventory.borrow.borrowed_to', { name: borrowerName });
    };
    const getHistoryTitle = (entry) => {
        if (entry.returned_at) {
            return t('inventory.borrow.history_returned', { name: entry.borrower_display_name || t('inventory.borrow.unknown') });
        }

        if (activeBorrow && entry.id === activeBorrow.id) {
            return getActiveBorrowTitle(activeBorrow);
        }

        return t('inventory.borrow.history_active', { name: entry.borrower_display_name || t('inventory.borrow.unknown') });
    };

    if (fetching) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    if (isEditing && !isDetailEditMode) {
        return (
            <div className="item-detail-page mx-auto max-w-5xl animate-fade-in">
                <header className="item-detail-intro">
                    <div className="flex min-w-0 items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="item-form-back"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="min-w-0">
                            <h1>{formData.name || t('inventory.untitled_item')}</h1>
                            <p>{t('items.detail_subtitle', { defaultValue: 'Item details' })}</p>
                        </div>
                    </div>
                    {canEditItem && (
                        <button
                            type="button"
                            onClick={() => setIsDetailEditMode(true)}
                            className="item-detail-edit"
                        >
                            <Edit3 className="h-4 w-4" />
                            {t('common.edit')}
                        </button>
                    )}
                </header>

                <div className="item-detail-layout">
                    <section className="item-detail-overview">
                        {existingPhoto && !removePhoto && (
                            <FullscreenImage
                                src={existingPhoto}
                                alt={formData.name || t('items.form.photo')}
                                secure
                                className="w-full"
                            >
                                <SecureImage src={existingPhoto} alt={formData.name} className="h-64 w-full object-cover" />
                            </FullscreenImage>
                        )}
                        <div className="item-detail-overview-copy space-y-4">
                            {formData.description && (
                                <p className="text-sm leading-6 text-[var(--hi-text-soft)]">{formData.description}</p>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <DetailField label={t('items.form.quantity')} value={formData.quantity} />
                                <DetailField label={t('items.form.visibility')} value={formData.is_public ? t('items.form.visibility_public') : t('items.form.visibility_private')} />
                                <DetailField label={t('items.form.category')} value={visibleCategoryName ? `${selectedCategory?.icon || ''} ${visibleCategoryName}`.trim() : ''} />
                                <DetailField label={t('items.form.room')} value={visibleRoomName} />
                                <DetailField label={t('items.form.location')} value={locationSearch} />
                                <DetailField
                                    label={t('items.form.box', { defaultValue: 'Box' })}
                                    value={selectedBox
                                        ? `${selectedBox.code} · ${selectedBox.name}${selectedBox.is_public !== undefined && !Boolean(selectedBox.is_public) ? ` · ${t('boxes.visibility_private')}` : ''}`
                                        : privatePlacementHidden ? t('box_labels.private_box_hint') : ''}
                                />
                                <DetailField label={t('items.form.barcode')} value={formData.barcode} mono />
                                <DetailField label={t('items.form.expiry_date', { defaultValue: 'Son Kullanma Tarihi' })} value={formData.expiry_date} />
                                <DetailField label={t('items.form.min_quantity', { defaultValue: 'Asgari Stok Limiti' })} value={formData.min_quantity > 0 ? formData.min_quantity : null} />
                            </div>
                        </div>
                    </section>

                    <div className="item-detail-sections">
                        <div className="card space-y-4 p-5">
                            <div>
                                <h2 className="font-semibold text-[var(--hi-text)]">{t('items.form.invoice_section')}</h2>
                                <p className="text-sm text-[var(--hi-text-soft)]">{t('items.form.invoice_security')}</p>
                            </div>
                            {hasInvoiceContent ? (
                                <div className="space-y-4">
                                    {existingInvoicePhoto && !removeInvoicePhoto && (
                                        <FullscreenImage
                                            src={existingInvoicePhoto}
                                            alt={t('items.form.invoice_photo')}
                                            secure
                                            className="w-full rounded-xl"
                                        >
                                            <SecureImage src={existingInvoicePhoto} alt={t('items.form.invoice_photo')} className="max-h-64 w-full rounded-xl object-cover" />
                                        </FullscreenImage>
                                    )}
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <DetailField label={t('items.form.invoice_price')} value={formData.invoice_price} />
                                        <DetailField label={t('items.form.invoice_currency')} value={displayInvoiceCurrency} />
                                        <DetailField label={t('items.form.invoice_date')} value={formData.invoice_date} />
                                        <DetailField label={t('items.form.warranty_start_date')} value={formData.warranty_start_date || formData.invoice_date} />
                                        <DetailField label={t('items.form.warranty_duration_value')} value={displayWarrantyDuration} />
                                        <DetailField label={t('items.form.warranty_expiry_date')} value={displayedWarrantyExpiryDate} />
                                    </div>
                                </div>
                            ) : (
                                <p className="rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                                    {t('items.form.invoice_section_collapsed')}
                                </p>
                            )}
                        </div>

                        <div className="card space-y-4 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-semibold text-[var(--hi-text)]">{t('items.attachments.title', { defaultValue: 'Ek Dosyalar' })}</h2>
                                    <p className="text-sm text-[var(--hi-text-soft)]">
                                        {t('items.attachments.detail_desc', { defaultValue: 'Garanti belgesi, PDF kılavuz veya ilgili belge ekleri.' })}
                                    </p>
                                </div>
                                {canEditItem && (
                                    <button
                                        type="button"
                                        onClick={() => setIsDetailEditMode(true)}
                                        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--hi-brand-text)] hover:underline"
                                    >
                                        <Upload className="h-4 w-4" />
                                        {t('common.manage', { defaultValue: 'Yönet' })}
                                    </button>
                                )}
                            </div>
                            {attachments.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                                    {t('items.attachments.empty', { defaultValue: 'Bu eşyaya eklenmiş dosya yok.' })}
                                </p>
                            ) : (
                                <div className="divide-y divide-[var(--hi-border)]">
                                    {attachments.map((attachment) => (
                                        <div key={attachment.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)]">
                                                    <FileText className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-[var(--hi-text)]">{attachment.original_name}</p>
                                                    <p className="text-xs text-[var(--hi-text-soft)]">{formatAttachmentSize(attachment.size_bytes)}</p>
                                                </div>
                                            </div>
                                            <a
                                                href={`/api/items/attachments/${attachment.id}/download`}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]"
                                                title={t('common.download', { defaultValue: 'İndir' })}
                                            >
                                                <Download className="h-4 w-4" />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Maintenance Calendar Card */}
                        <div className="card space-y-4 p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="font-semibold text-[var(--hi-text)]">{t('maintenance.page.title', { defaultValue: 'Bakım Takvimi' })}</h2>
                                    <p className="text-sm text-[var(--hi-text-soft)]">
                                        {t('maintenance.detail_card_desc', { defaultValue: 'Bu eşya için planlanmış periyodik veya tek seferlik bakım takipleri.' })}
                                    </p>
                                </div>
                                {canEditItem && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsDetailEditMode(true);
                                            setShowMaintenanceSection(true);
                                        }}
                                        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--hi-brand-text)] hover:underline"
                                    >
                                        <Plus className="h-4 w-4" />
                                        {t('maintenance.actions.manage', { defaultValue: 'Yönet' })}
                                    </button>
                                )}
                            </div>

                            {isMaintenanceLoading ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-[var(--hi-text-soft)]" />
                                </div>
                            ) : maintenanceTasks.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                                    {t('maintenance.no_tasks', { defaultValue: 'Bu eşyaya atanmış herhangi bir bakım görevi bulunmuyor.' })}
                                </p>
                            ) : (
                                <div className="divide-y divide-[var(--hi-border)]">
                                    {maintenanceTasks.map((task) => {
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        const isOverdue = task.next_due_date && task.next_due_date < todayStr;
                                        return (
                                            <div key={task.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                                <div className="space-y-1">
                                                    <p className="font-medium text-[var(--hi-text)]">{task.task_name}</p>
                                                    {task.description && (
                                                        <p className="text-xs text-[var(--hi-text-soft)]">{task.description}</p>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--hi-text-soft)]">
                                                        <span>{formatFreqText(task.frequency_value, task.frequency_unit, t)}</span>
                                                        {task.next_due_date && (
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                                                                isOverdue
                                                                    ? 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/20'
                                                                    : 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20'
                                                            }`}>
                                                                <CalendarDays className="h-3 w-3" />
                                                                {t('maintenance.fields.next_due_date', { defaultValue: 'Gelecek Tarih' })}: {formatIsoDateForDisplay(task.next_due_date)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {canEditItem && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePerformTask(task)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] text-emerald-500 transition-colors hover:bg-emerald-500/10"
                                                        title={t('maintenance.actions.perform', { defaultValue: 'Yapıldı Olarak İşaretle' })}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="card p-5">
                            <h2 className="font-semibold text-[var(--hi-text)]">{t('items.qrcode.title')}</h2>
                            <p className="mb-4 text-sm text-[var(--hi-text-soft)]">{t('items.qrcode.desc')}</p>
                            <Suspense fallback={
                                <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-8 text-sm text-[var(--hi-text-soft)]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>{t('item_qr.loading', { defaultValue: 'Preparing QR tools...' })}</span>
                                </div>
                            }>
                                <ItemQRCode itemId={id} />
                            </Suspense>
                        </div>
                    </div>

                    <section className="card item-borrow-tracking-v26 overflow-hidden p-0">
                        <div className="item-borrow-header-v26 border-b border-[var(--hi-border)] bg-[var(--hi-panel-strong)] px-4 py-4">
                            <span className="item-borrow-heading-icon-v26" aria-hidden="true">
                                <ArrowRightLeft className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="font-semibold text-[var(--hi-text)]">{t('inventory.borrow.section_title')}</h2>
                                <p className="text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.section_subtitle')}</p>
                            </div>
                        </div>

                        <div className="item-borrow-body-v26 space-y-4 bg-[var(--hi-panel)] p-4">
                            {activeBorrow ? (
                                <div className={`item-borrow-status-v26 rounded-2xl border px-4 py-3 ${activeBorrowReturnPending
                                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                                    : activeBorrowOverdue
                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                                    : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                                    }`}>
                                    <div className="flex flex-col gap-1">
                                        <p className="font-medium">{getActiveBorrowTitle(activeBorrow)}</p>
                                        {activeBorrowReturnPending && (
                                            <p className="text-sm">{t('inventory.borrow.return_pending_hint', { defaultValue: 'The record will close after the lender confirms they received the item back.' })}</p>
                                        )}
                                        <p className="text-sm">{t('inventory.borrow.borrowed_at', { date: formatBorrowDateTime(activeBorrow.borrowed_at, i18n.language) })}</p>
                                        {activeBorrow.due_date && (
                                            <p className="text-sm">{t('inventory.borrow.due_date_label', { date: formatBorrowDate(activeBorrow.due_date, i18n.language) })}</p>
                                        )}
                                        {activeBorrow.note && (
                                            <p className="text-sm">{t('inventory.borrow.note_label', { note: activeBorrow.note })}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="item-borrow-status-v26 is-empty rounded-xl border border-dashed border-[var(--hi-border-strong)] bg-[var(--hi-panel-muted)] px-4 py-3">
                                    <span aria-hidden="true"><ArrowRightLeft className="h-4 w-4" /></span>
                                    <p className="text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.no_active')}</p>
                                </div>
                            )}

                            <div className="item-borrow-history-v26">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--hi-text)]">
                                        <History className="h-4 w-4 text-[var(--hi-accent)]" />
                                        {t('inventory.borrow.history_title')}
                                    </h3>
                                    <span className="text-xs text-[var(--hi-text-muted)]">{borrowHistory.length}</span>
                                </div>

                                {borrowHistoryLoading ? (
                                    <div className="flex justify-center py-6"><div className="spinner"></div></div>
                                ) : borrowHistory.length > 0 ? (
                                    <div className="space-y-3">
                                        {borrowHistory.map((entry) => (
                                            <div key={entry.id} className="rounded-xl border border-[var(--hi-border)] px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <p className="font-medium text-[var(--hi-text)]">{getHistoryTitle(entry)}</p>
                                                    {!entry.returned_at && activeBorrow && entry.id === activeBorrow.id && activeBorrow.return_requested_at && (
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.return_pending_hint', { defaultValue: 'The record will close after the lender confirms they received the item back.' })}
                                                        </p>
                                                    )}
                                                    <p className="text-sm text-[var(--hi-text-soft)]">
                                                        {t('inventory.borrow.borrowed_at', { date: formatBorrowDateTime(entry.borrowed_at, i18n.language) })}
                                                    </p>
                                                    {entry.returned_at && (
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.returned_at', { date: formatBorrowDateTime(entry.returned_at, i18n.language) })}
                                                        </p>
                                                    )}
                                                    {entry.due_date && (
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.due_date_label', { date: formatBorrowDate(entry.due_date, i18n.language) })}
                                                        </p>
                                                    )}
                                                    {entry.note && (
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.note_label', { note: entry.note })}
                                                        </p>
                                                    )}
                                                    {entry.return_note && (
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.return_note_label', { note: entry.return_note })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="item-borrow-empty-v26 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.no_history')}</p>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="item-form-page mx-auto max-w-5xl animate-fade-in">
            <header className="item-form-intro">
                <button
                    onClick={() => navigate(-1)}
                    className="item-form-back"
                    aria-label={t('common.back', { defaultValue: 'Back' })}
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="item-form-intro-copy">
                    <p>{t('navigation.inventory', { defaultValue: 'Inventory' })}</p>
                    <h1>{isEditing ? t('items.title_edit') : t('items.title_new')}</h1>
                    <span>{t('items.subtitle')}</span>
                </div>
            </header>

            <div className="item-form-surface">
                {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6">{error}</div>}

                <form onSubmit={handleSubmit} noValidate className="item-form-workspace space-y-6">
                    {/* Item Privacy Toggle */}
                    <div className="item-form-visibility flex items-center justify-between rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow-soft)]">
                        <div className="flex items-center gap-3">
                            {formData.is_public ? <Globe className="w-5 h-5 text-[var(--hi-accent)]" /> : <Lock className="w-5 h-5 text-[var(--hi-secondary)]" />}
                            <div>
                                <p className="font-medium text-[var(--hi-text)]">{t('items.form.visibility')}</p>
                                <p className="text-sm text-[var(--hi-text-soft)]">
                                    {formData.is_public ? t('items.form.visibility_public') : t('items.form.visibility_private')}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={() => canManageVisibility && setFormData({ ...formData, is_public: !formData.is_public })}
                            disabled={!canManageVisibility}
                            aria-disabled={!canManageVisibility}
                            title={!canManageVisibility ? t('items.form.visibility_owner_only', { defaultValue: 'Only the person who added the item can change visibility' }) : undefined}
                            className={`relative h-8 w-14 rounded-full border transition-colors duration-200 ${formData.is_public ? 'border-[var(--hi-border-strong)] bg-[var(--hi-accent)]' : 'border-[var(--hi-border)] bg-[var(--hi-panel-muted)]'} ${!canManageVisibility ? 'cursor-not-allowed opacity-55' : ''}`}>
                            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${formData.is_public ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                    {isEditing && !canManageVisibility && (
                        <p className="-mt-4 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-sm text-[var(--hi-text-soft)]">
                            {t('items.form.visibility_owner_only', { defaultValue: 'Only the person who added the item can change visibility.' })}
                        </p>
                    )}

                    {isEditing && (
                        <section className="item-borrow-tracking-v26 item-borrow-tracking-form-v26 overflow-hidden rounded-xl border border-[var(--hi-border)]">
                            <div className="item-borrow-header-v26 border-b border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-4">
                                <span className="item-borrow-heading-icon-v26" aria-hidden="true">
                                    <ArrowRightLeft className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="font-semibold text-[var(--hi-text)]">{t('inventory.borrow.section_title')}</h2>
                                    <p className="text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.section_subtitle')}</p>
                                </div>
                            </div>

                            <div className="item-borrow-body-v26 p-4 space-y-4">
                                {activeBorrow ? (
                                    <div className={`item-borrow-status-v26 rounded-2xl border px-4 py-3 ${activeBorrowReturnPending
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                                        : activeBorrowOverdue
                                        ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                                        : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                                        }`}>
                                        <div className="flex flex-col gap-1">
                                            <p className="font-medium">
                                                {getActiveBorrowTitle(activeBorrow)}
                                            </p>
                                            {activeBorrowReturnPending && (
                                                <p className="text-sm">
                                                    {t('inventory.borrow.return_pending_hint', { defaultValue: 'The record will close after the lender confirms they received the item back.' })}
                                                </p>
                                            )}
                                            <p className="text-sm">
                                                {t('inventory.borrow.borrowed_at', { date: formatBorrowDateTime(activeBorrow.borrowed_at, i18n.language) })}
                                            </p>
                                            {activeBorrow.due_date && (
                                                <p className="text-sm">
                                                    {t('inventory.borrow.due_date_label', { date: formatBorrowDate(activeBorrow.due_date, i18n.language) })}
                                                </p>
                                            )}
                                            {activeBorrow.note && (
                                                <p className="text-sm">
                                                    {t('inventory.borrow.note_label', { note: activeBorrow.note })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="item-borrow-status-v26 is-empty rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-3">
                                        <span aria-hidden="true"><ArrowRightLeft className="h-4 w-4" /></span>
                                        <p className="text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.no_active')}</p>
                                    </div>
                                )}

                                <div className="item-borrow-history-v26">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--hi-text)]">
                                            <History className="h-4 w-4 text-[var(--hi-accent)]" />
                                            {t('inventory.borrow.history_title')}
                                        </h3>
                                        <span className="text-xs text-[var(--hi-text-muted)]">{borrowHistory.length}</span>
                                    </div>

                                    {borrowHistoryLoading ? (
                                        <div className="flex justify-center py-6"><div className="spinner"></div></div>
                                    ) : borrowHistory.length > 0 ? (
                                        <div className="space-y-3">
                                            {borrowHistory.map((entry) => (
                                                <div key={entry.id} className="rounded-xl border border-[var(--hi-border)] px-4 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <p className="font-medium text-[var(--hi-text)]">
                                                            {getHistoryTitle(entry)}
                                                        </p>
                                                        {!entry.returned_at && activeBorrow && entry.id === activeBorrow.id && activeBorrow.return_requested_at && (
                                                            <p className="text-sm text-[var(--hi-text-soft)]">
                                                                {t('inventory.borrow.return_pending_hint', { defaultValue: 'The record will close after the lender confirms they received the item back.' })}
                                                            </p>
                                                        )}
                                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                                            {t('inventory.borrow.borrowed_at', { date: formatBorrowDateTime(entry.borrowed_at, i18n.language) })}
                                                        </p>
                                                        {entry.returned_at && (
                                                            <p className="text-sm text-[var(--hi-text-soft)]">
                                                                {t('inventory.borrow.returned_at', { date: formatBorrowDateTime(entry.returned_at, i18n.language) })}
                                                            </p>
                                                        )}
                                                        {entry.due_date && (
                                                            <p className="text-sm text-[var(--hi-text-soft)]">
                                                                {t('inventory.borrow.due_date_label', { date: formatBorrowDate(entry.due_date, i18n.language) })}
                                                            </p>
                                                        )}
                                                        {entry.note && (
                                                            <p className="text-sm text-[var(--hi-text-soft)]">
                                                                {t('inventory.borrow.note_label', { note: entry.note })}
                                                            </p>
                                                        )}
                                                        {entry.return_note && (
                                                            <p className="text-sm text-[var(--hi-text-soft)]">
                                                                {t('inventory.borrow.return_note_label', { note: entry.return_note })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="item-borrow-empty-v26 text-sm text-[var(--hi-text-soft)]">{t('inventory.borrow.no_history')}</p>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    <div className="item-form-primary-grid">
                    {/* Photo Upload */}
                    <div className="item-form-photo-section space-y-3">
                        <label className="block text-sm font-semibold tracking-wide text-[var(--hi-text)]">
                            {t('items.form.photo')}
                        </label>
                        <div className="item-form-photo-workspace flex flex-col gap-5 p-5 rounded-[24px] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)] overflow-hidden relative group/widget transition-all duration-300 hover:border-[var(--hi-border-strong)]">

                            {/* Left Side: Premium Preview Zone */}
                            <div className="relative flex h-52 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] transition-all duration-300 shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] group/preview">
                                {photoPreview ? (
                                    <FullscreenImage
                                        src={photoPreview}
                                        alt={formData.name || t('items.form.photo')}
                                        className="h-full w-full"
                                    >
                                        <img src={photoPreview} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover/preview:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/preview:opacity-100 transition duration-300 flex items-end justify-center p-3">
                                            <span className="text-[10px] font-bold text-white bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full uppercase tracking-wider border border-white/20">
                                                {t('items.form.photo_selected_badge', { defaultValue: 'Yeni Fotoğraf' })}
                                            </span>
                                        </div>
                                    </FullscreenImage>
                                ) : existingPhoto ? (
                                    <FullscreenImage
                                        src={existingPhoto}
                                        alt={formData.name || t('items.form.photo')}
                                        secure
                                        className="h-full w-full"
                                    >
                                        <SecureImage
                                            src={existingPhoto}
                                            alt=""
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover/preview:scale-105"
                                            fallback={
                                                <div className="text-center">
                                                    <Camera className="mx-auto h-10 w-10 text-[var(--hi-text-muted)] animate-pulse" />
                                                </div>
                                            }
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/preview:opacity-100 transition duration-300 flex items-end justify-center p-3">
                                            <span className="text-[10px] font-bold text-white bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full uppercase tracking-wider border border-white/20">
                                                {t('items.form.photo_existing_badge', { defaultValue: 'Mevcut Fotoğraf' })}
                                            </span>
                                        </div>
                                    </FullscreenImage>
                                ) : (
                                    <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[var(--hi-panel-muted)] to-[var(--hi-bg)] gap-3 p-4">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)] border border-[var(--hi-border)] text-[var(--hi-text-soft)] group-hover/preview:scale-110 group-hover/preview:border-[var(--hi-accent)] group-hover/preview:text-[var(--hi-accent)] transition duration-300">
                                            <Camera className="w-6 h-6" />
                                        </div>
                                        <span className="text-[11px] font-medium text-[var(--hi-text-muted)] text-center max-w-[120px]">
                                            {t('items.form.no_photo_yet', { defaultValue: 'Görsel Eklenmedi' })}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Sleek Option Rows */}
                            <div className="flex flex-col justify-between flex-1 gap-3">
                                <div className="space-y-2.5">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--hi-text-soft)] px-1">
                                        {t('items.form.photo_options_title', { defaultValue: 'Görsel Kaynağı' })}
                                    </div>

                                    {/* Action Row 1: Camera */}
                                    <button
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="group/btn flex items-center justify-between w-full p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] hover:bg-[var(--hi-panel-strong)] hover:border-[var(--hi-accent)] hover:shadow-[0_4px_12px_rgba(var(--hi-accent-rgb),0.05)] transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)] group-hover/btn:scale-105 transition duration-200">
                                                <Camera className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="block font-semibold text-sm text-[var(--hi-text)] leading-snug">
                                                    {t('items.form.take_photo', { defaultValue: 'Kamerayla Çek' })}
                                                </span>
                                                <span className="block text-[11px] text-[var(--hi-text-soft)] leading-normal mt-0.5 truncate">
                                                    {t('items.form.take_photo_sub', { defaultValue: 'Cihaz kamerasını aç' })}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[var(--hi-text-muted)] group-hover/btn:text-[var(--hi-accent)] group-hover/btn:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                                    </button>

                                    {/* Action Row 2: Gallery */}
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="group/btn flex items-center justify-between w-full p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] hover:bg-[var(--hi-panel-strong)] hover:border-[var(--hi-secondary-strong)] hover:shadow-[0_4px_12px_rgba(var(--hi-secondary-rgb),0.05)] transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary-strong)]"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)] group-hover/btn:scale-105 transition duration-200">
                                                <Plus className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="block font-semibold text-sm text-[var(--hi-text)] leading-snug">
                                                    {t('items.form.choose_from_gallery', { defaultValue: 'Galeriden Seç' })}
                                                </span>
                                                <span className="block text-[11px] text-[var(--hi-text-soft)] leading-normal mt-0.5 truncate">
                                                    {t('items.form.choose_from_gallery_sub', { defaultValue: 'Albümden görsel seç' })}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[var(--hi-text-muted)] group-hover/btn:text-[var(--hi-secondary-strong)] group-hover/btn:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                                    </button>
                                </div>

                                {(photoPreview || existingPhoto) && (
                                    <button
                                        type="button"
                                        onClick={handleRemovePhoto}
                                        className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/35 py-3 text-xs font-semibold text-red-500 dark:text-red-400 transition-all duration-200 active:scale-[0.98]"
                                    >
                                        <X className="w-4 h-4" />
                                        {t('items.form.remove_photo', { defaultValue: 'Fotoğrafı Kaldır' })}
                                    </button>
                                )}
                            </div>

                            {/* Hidden inputs */}
                            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                        </div>
                    </div>

                    <section className="item-form-core-fields">
                    {/* Name with Barcode Scanner */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.name')} <span className="text-red-500">{t('items.form.required')}</span></label>
                        <div className="flex gap-2">
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-field flex-1" placeholder={t('items.form.name_placeholder')} aria-required="true" />
                            <button type="button" onClick={() => setShowBarcodeScanner(true)}
                                aria-label={t('items.form.scan_barcode')}
                                className="flex items-center gap-2 rounded-[12px] bg-[var(--hi-accent)] px-4 py-3 text-white transition-colors hover:bg-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"
                                title={t('items.form.scan_barcode')}>
                                <ScanBarcode className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Barcode Field with Manual Search */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                            {t('items.form.barcode')} <span className="font-normal text-[var(--hi-text-muted)]">{t('items.form.barcode_optional')}</span>
                        </label>
                        <div className="flex gap-2">
                            <input type="text" name="barcode" value={formData.barcode} onChange={(e) => {
                                handleChange(e);
                                setBarcodeMessage('');
                            }}
                                className="input-field flex-1 font-mono" placeholder={t('items.form.barcode_placeholder')} />
                            <button type="button" onClick={handleManualBarcodeSearch}
                                disabled={!formData.barcode || searchingBarcode}
                                aria-label={t('items.form.search_db')}
                                className="flex items-center gap-2 rounded-[12px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3 text-[var(--hi-text-soft)] transition-colors hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] disabled:opacity-50"
                                title={t('items.form.search_db')}>
                                {searchingBarcode ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                            </button>
                            {formData.barcode && (
                                <a href={`https://www.google.com/search?q=${formData.barcode}`} target="_blank" rel="noopener noreferrer"
                                    aria-label={t('items.form.search_google')}
                                    className="rounded-[12px] border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-3 py-3 text-[var(--hi-accent)] transition-colors hover:bg-[var(--hi-panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"
                                    title={t('items.form.search_google')}>
                                    <ExternalLink className="w-5 h-5" />
                                </a>
                            )}
                        </div>
                        {barcodeMessage && (
                            <p className={`text-xs mt-2 ${barcodeMessage.includes('bulundu') || barcodeMessage.includes('found') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {barcodeMessage}
                            </p>
                        )}
                        {formData.barcode && !barcodeMessage && (
                            <p className="mt-1 text-xs text-[var(--hi-text-soft)]">{t('items.form.barcode_saved')}</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.description')}</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} className="input-field min-h-[100px] resize-none" placeholder={t('items.form.description_placeholder')} rows={3} />
                    </div>

                    <div className="rounded-[1rem] border border-[rgba(184,153,104,0.18)] bg-[linear-gradient(180deg,rgba(184,153,104,0.06),rgba(184,153,104,0.02))] px-4 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(184,153,104,0.18)] bg-[rgba(184,153,104,0.1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hi-secondary-strong)]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--hi-secondary-strong)]" aria-hidden="true" />
                                    <span>{t('navigation.personal_vault', { defaultValue: 'Personal Vault' })}</span>
                                </span>
                                <p className="mt-3 text-sm font-semibold leading-6 text-[var(--hi-text)]">
                                    {t('items.form.vault_hint_title', { defaultValue: 'Very sensitive record?' })}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                    {t('items.form.vault_hint_description', {
                                        defaultValue: 'For passports, deeds, identity details, access codes, and other records that should stay out of the standard inventory flow, keep them in Personal Vault instead.'
                                    })}
                                </p>
                            </div>

                            <a
                                href="/vault"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 self-start rounded-full px-1 py-1 text-sm font-semibold text-[var(--hi-accent)] transition-colors hover:text-[var(--hi-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)] md:shrink-0"
                            >
                                <span>{t('items.form.vault_hint_action', { defaultValue: 'Open Personal Vault' })}</span>
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </div>
                    </div>
                    </section>
                    </div>

                    {/* Optional Invoice Section */}
                    <div className="item-invoice-accordion-v27 overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)]">
                        <button
                            type="button"
                            onClick={() => setShowInvoiceSection(prev => !prev)}
                            className="item-invoice-toggle-v27 flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors"
                        >
                            <div>
                                <p className="font-medium text-[var(--hi-text)]">{t('items.form.invoice_section')}</p>
                                <p className="text-sm text-[var(--hi-text-soft)]">
                                    {showInvoiceSection ? t('items.form.invoice_section_help') : t('items.form.invoice_section_collapsed')}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {hasInvoiceContent && !showInvoiceSection && (
                                    <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--hi-accent)]">
                                        {t('items.form.invoice_section_filled')}
                                    </span>
                                )}
                                <ChevronDown className={`w-5 h-5 text-[var(--hi-text-soft)] transition-transform ${showInvoiceSection ? 'rotate-180' : ''}`} />
                            </div>
                        </button>

                        {showInvoiceSection && (
                            <div className="space-y-4 border-t border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 pb-4 pt-3">
                                <p className="text-xs text-[var(--hi-text-soft)]">
                                    {t('items.form.invoice_security')}
                                </p>

                                <div>
                                    <label className="block text-sm font-semibold tracking-wide text-[var(--hi-text)]">
                                        {t('items.form.invoice_photo')}
                                    </label>
                                    <div className="flex flex-col md:flex-row gap-5 p-5 rounded-[24px] border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)] overflow-hidden relative group/widget transition-all duration-300 hover:border-[var(--hi-border-strong)]">

                                        {/* Left Side: Premium Preview Zone */}
                                        <div className="relative flex h-52 w-full md:w-52 flex-shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] transition-all duration-300 shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] group/preview">
                                            {invoicePhotoPreview ? (
                                                <FullscreenImage
                                                    src={invoicePhotoPreview}
                                                    alt={t('items.form.invoice_photo')}
                                                    className="h-full w-full"
                                                >
                                                    <img src={invoicePhotoPreview} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover/preview:scale-105" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/preview:opacity-100 transition duration-300 flex items-end justify-center p-3">
                                                        <span className="text-[10px] font-bold text-white bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full uppercase tracking-wider border border-white/20">
                                                            {t('items.form.photo_selected_badge', { defaultValue: 'Yeni Fotoğraf' })}
                                                        </span>
                                                    </div>
                                                </FullscreenImage>
                                            ) : existingInvoicePhoto ? (
                                                <FullscreenImage
                                                    src={existingInvoicePhoto}
                                                    alt={t('items.form.invoice_photo')}
                                                    secure
                                                    className="h-full w-full"
                                                >
                                                    <SecureImage
                                                        src={existingInvoicePhoto}
                                                        alt=""
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/preview:scale-105"
                                                        fallback={
                                                            <div className="text-center">
                                                                <Camera className="mx-auto h-10 w-10 text-[var(--hi-text-muted)] animate-pulse" />
                                                            </div>
                                                        }
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/preview:opacity-100 transition duration-300 flex items-end justify-center p-3">
                                                        <span className="text-[10px] font-bold text-white bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full uppercase tracking-wider border border-white/20">
                                                            {t('items.form.photo_existing_badge', { defaultValue: 'Mevcut Fotoğraf' })}
                                                        </span>
                                                    </div>
                                                </FullscreenImage>
                                            ) : (
                                                <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[var(--hi-panel-muted)] to-[var(--hi-bg)] gap-3 p-4">
                                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)] border border-[var(--hi-border)] text-[var(--hi-text-soft)] group-hover/preview:scale-110 group-hover/preview:border-[var(--hi-accent)] group-hover/preview:text-[var(--hi-accent)] transition duration-300">
                                                        <Camera className="w-6 h-6" />
                                                    </div>
                                                    <span className="text-[11px] font-medium text-[var(--hi-text-muted)] text-center max-w-[120px]">
                                                        {t('items.form.no_photo_yet', { defaultValue: 'Görsel Eklenmedi' })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right Side: Sleek Option Rows */}
                                        <div className="flex flex-col justify-between flex-1 gap-3">
                                            <div className="space-y-2.5">
                                                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--hi-text-soft)] px-1">
                                                    {t('items.form.photo_options_title', { defaultValue: 'Görsel Kaynağı' })}
                                                </div>

                                                {/* Action Row 1: Camera */}
                                                <button
                                                    type="button"
                                                    onClick={() => invoiceCameraInputRef.current?.click()}
                                                    className="group/btn flex items-center justify-between w-full p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] hover:bg-[var(--hi-panel-strong)] hover:border-[var(--hi-accent)] hover:shadow-[0_4px_12px_rgba(var(--hi-accent-rgb),0.05)] transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-accent)]"
                                                >
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)] group-hover/btn:scale-105 transition duration-200">
                                                            <Camera className="w-5 h-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block font-semibold text-sm text-[var(--hi-text)] leading-snug">
                                                                {t('items.form.take_photo', { defaultValue: 'Kamerayla Çek' })}
                                                            </span>
                                                            <span className="block text-[11px] text-[var(--hi-text-soft)] leading-normal mt-0.5 truncate">
                                                                {t('items.form.take_photo_sub', { defaultValue: 'Cihaz kamerasını aç' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 text-[var(--hi-text-muted)] group-hover/btn:text-[var(--hi-accent)] group-hover/btn:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                                                </button>

                                                {/* Action Row 2: Gallery */}
                                                <button
                                                    type="button"
                                                    onClick={() => invoiceFileInputRef.current?.click()}
                                                    className="group/btn flex items-center justify-between w-full p-3.5 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] hover:bg-[var(--hi-panel-strong)] hover:border-[var(--hi-secondary-strong)] hover:shadow-[0_4px_12px_rgba(var(--hi-secondary-rgb),0.05)] transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-secondary-strong)]"
                                                >
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--hi-secondary-soft)] text-[var(--hi-secondary-strong)] group-hover/btn:scale-105 transition duration-200">
                                                            <Plus className="w-5 h-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block font-semibold text-sm text-[var(--hi-text)] leading-snug">
                                                                {t('items.form.choose_from_gallery', { defaultValue: 'Galeriden Seç' })}
                                                            </span>
                                                            <span className="block text-[11px] text-[var(--hi-text-soft)] leading-normal mt-0.5 truncate">
                                                                {t('items.form.choose_from_gallery_sub', { defaultValue: 'Albümden görsel seç' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 text-[var(--hi-text-muted)] group-hover/btn:text-[var(--hi-secondary-strong)] group-hover/btn:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                                                </button>
                                            </div>

                                            {(invoicePhotoPreview || existingInvoicePhoto) && (
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveInvoicePhoto}
                                                    className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/35 py-3 text-xs font-semibold text-red-500 dark:text-red-400 transition-all duration-200 active:scale-[0.98]"
                                                >
                                                    <X className="w-4 h-4" />
                                                    {t('items.form.remove_photo', { defaultValue: 'Fotoğrafı Kaldır' })}
                                                </button>
                                            )}
                                        </div>

                                        {/* Hidden inputs */}
                                        <input
                                            ref={invoiceCameraInputRef}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleInvoicePhotoChange}
                                            className="hidden"
                                        />
                                        <input
                                            ref={invoiceFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleInvoicePhotoChange}
                                            className="hidden"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.invoice_price')}</label>
                                        <input
                                            type="number"
                                            name="invoice_price"
                                            value={formData.invoice_price}
                                            onChange={handleChange}
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
                                            value={formData.invoice_currency}
                                            onChange={handleChange}
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
                                        {formData.invoice_currency === CUSTOM_CURRENCY_OPTION && (
                                            <input
                                                type="text"
                                                value={formData.invoice_currency_custom}
                                                onChange={(e) => handleCustomCurrencyChange(e.target.value)}
                                                className="input-field mt-3 uppercase"
                                                inputMode="text"
                                                autoComplete="off"
                                                maxLength={10}
                                                placeholder="NOK / BTC"
                                                required={Boolean(formData.invoice_price)}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.invoice_date')}</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="invoice_date"
                                                value={formData.invoice_date}
                                                onChange={(e) => handleDateInputChange('invoice_date', e.target.value)}
                                                onBlur={() => handleDateInputBlur('invoice_date')}
                                                className="input-field pr-12"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                placeholder={DATE_INPUT_PLACEHOLDER}
                                                pattern="(?:\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2})"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => openDatePicker(invoiceDatePickerRef)}
                                                className="absolute inset-y-0 right-0 px-3 text-[var(--hi-text-muted)] transition-colors hover:text-[var(--hi-text)]"
                                                aria-label={t('items.form.invoice_date')}
                                                title={t('items.form.invoice_date')}
                                            >
                                                <CalendarDays className="w-5 h-5" />
                                            </button>
                                            <input
                                                ref={invoiceDatePickerRef}
                                                type="date"
                                                value={getDatePickerValue(formData.invoice_date)}
                                                onChange={(e) => handleDatePickerChange('invoice_date', e.target.value)}
                                                className="sr-only"
                                                tabIndex={-1}
                                                aria-hidden="true"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_start_date')}</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="warranty_start_date"
                                                value={formData.warranty_start_date}
                                                onChange={(e) => handleDateInputChange('warranty_start_date', e.target.value)}
                                                onBlur={() => handleDateInputBlur('warranty_start_date')}
                                                className="input-field pr-12"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                placeholder={DATE_INPUT_PLACEHOLDER}
                                                pattern="(?:\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2})"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => openDatePicker(warrantyStartDatePickerRef)}
                                                className="absolute inset-y-0 right-0 px-3 text-[var(--hi-text-muted)] transition-colors hover:text-[var(--hi-text)]"
                                                aria-label={t('items.form.warranty_start_date')}
                                                title={t('items.form.warranty_start_date')}
                                            >
                                                <CalendarDays className="w-5 h-5" />
                                            </button>
                                            <input
                                                ref={warrantyStartDatePickerRef}
                                                type="date"
                                                value={getDatePickerValue(formData.warranty_start_date)}
                                                onChange={(e) => handleDatePickerChange('warranty_start_date', e.target.value)}
                                                className="sr-only"
                                                tabIndex={-1}
                                                aria-hidden="true"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs text-[var(--hi-text-soft)]">
                                    {t('items.form.warranty_calculation_help')}
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.warranty_duration_value')}</label>
                                        <input
                                            type="text"
                                            name="warranty_duration_value"
                                            value={formData.warranty_duration_value}
                                            onChange={(e) => handleWarrantyDurationChange(e.target.value)}
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
                                            value={formData.warranty_duration_unit}
                                            onChange={handleChange}
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
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="warranty_expiry_date"
                                                value={displayedWarrantyExpiryDate}
                                                onChange={(e) => {
                                                    if (!hasWarrantyCalculationInput) {
                                                        handleDateInputChange('warranty_expiry_date', e.target.value);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (!hasWarrantyCalculationInput) {
                                                        handleDateInputBlur('warranty_expiry_date');
                                                    }
                                                }}
                                                className={`input-field pr-12 ${hasWarrantyCalculationInput ? 'cursor-not-allowed bg-[var(--hi-panel-muted)]' : ''}`}
                                                inputMode="numeric"
                                                autoComplete="off"
                                                placeholder={DATE_INPUT_PLACEHOLDER}
                                                pattern="(?:\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2})"
                                                readOnly={hasWarrantyCalculationInput}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!hasWarrantyCalculationInput) {
                                                        openDatePicker(warrantyDatePickerRef);
                                                    }
                                                }}
                                                className={`absolute inset-y-0 right-0 px-3 transition-colors ${hasWarrantyCalculationInput ? 'cursor-not-allowed text-[var(--hi-text-muted)] opacity-50' : 'text-[var(--hi-text-muted)] hover:text-[var(--hi-text)]'}`}
                                                aria-label={t('items.form.warranty_expiry_date')}
                                                title={t('items.form.warranty_expiry_date')}
                                                disabled={hasWarrantyCalculationInput}
                                            >
                                                <CalendarDays className="w-5 h-5" />
                                            </button>
                                            <input
                                                ref={warrantyDatePickerRef}
                                                type="date"
                                                value={getDatePickerValue(displayedWarrantyExpiryDate)}
                                                onChange={(e) => handleDatePickerChange('warranty_expiry_date', e.target.value)}
                                                className="sr-only"
                                                tabIndex={-1}
                                                aria-hidden="true"
                                            />
                                        </div>
                                    </div>
                                </div>
                        )}
                    </div>

                    {/* Quantity & Category */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.quantity')}</label>
                            <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className="input-field" min="0" />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.category')}</label>
                            <select name="category_id" value={formData.category_id} onChange={handleChange} className="input-field">
                                <option value="">{t('items.form.select_category')}</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {getVisibleCategoryName(c)}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Expiry & Min Stock Limit Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] p-4 shadow-[var(--hi-shadow-soft)]">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                {t('items.form.expiry_date', { defaultValue: 'Son Kullanma Tarihi' })}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="expiry_date"
                                    value={formData.expiry_date}
                                    onChange={(e) => handleDateInputChange('expiry_date', e.target.value)}
                                    onBlur={() => handleDateInputBlur('expiry_date')}
                                    className="input-field pr-12"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder={DATE_INPUT_PLACEHOLDER}
                                    pattern="(?:\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2})"
                                />
                                <button
                                    type="button"
                                    onClick={() => openDatePicker(expiryDatePickerRef)}
                                    className="absolute inset-y-0 right-0 px-3 text-[var(--hi-text-muted)] transition-colors hover:text-[var(--hi-text)]"
                                    aria-label={t('items.form.expiry_date', { defaultValue: 'Son Kullanma Tarihi' })}
                                    title={t('items.form.expiry_date', { defaultValue: 'Son Kullanma Tarihi' })}
                                >
                                    <CalendarDays className="w-5 h-5" />
                                </button>
                                <input
                                    ref={expiryDatePickerRef}
                                    type="date"
                                    value={getDatePickerValue(formData.expiry_date)}
                                    onChange={(e) => handleDatePickerChange('expiry_date', e.target.value)}
                                    className="sr-only"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">
                                {t('items.form.min_quantity', { defaultValue: 'Asgari Stok Limiti' })}
                            </label>
                            <input
                                type="number"
                                name="min_quantity"
                                value={formData.min_quantity}
                                onChange={handleChange}
                                className="input-field"
                                min="0"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* Box assignment */}
                    <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <Box className="h-4 w-4 text-[var(--hi-accent)]" />
                            <label className="text-sm font-medium text-[var(--hi-text)]">{t('items.form.box', { defaultValue: 'Box' })}</label>
                        </div>
                        <select name="box_id" value={formData.box_id} onChange={handleChange} className="input-field">
                            <option value="">{t('items.form.no_box', { defaultValue: 'No box' })}</option>
                            {assignableBoxes.map((box: any) => (
                                <option key={box.id} value={box.id} disabled={Boolean(box.archived)}>
                                    {box.code} · {box.name}
                                    {box.is_public !== undefined && !Boolean(box.is_public) ? ` · ${t('boxes.visibility_private')}` : ''}
                                    {box.archived ? ` (${t('boxes.archived_badge')})` : ''}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-[var(--hi-text-soft)]">{t('items.form.box_help', { defaultValue: 'Assign this item to one box. You can move it later without changing its room or location.' })}</p>
                    </div>

                    {selectedBox ? (
                        <div className="rounded-xl border border-[var(--hi-accent-border)] bg-[var(--hi-accent-soft)] p-4">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-panel-strong)] text-[var(--hi-accent)]">
                                    <MapPin className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[var(--hi-text)]">
                                        {t('items.form.box_location_title', {
                                            defaultValue: 'Box location will be used'
                                        })}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-[var(--hi-text-soft)]">
                                        {selectedBoxPlace || t('boxes.location_unknown', {
                                            defaultValue: 'The box has no saved room or location.'
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Room Selection */}
                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--hi-text)]">{t('items.form.room')}</label>
                                <select name="room_id" value={formData.room_id} onChange={handleChange} className="input-field">
                                    <option value="">{t('items.form.select_room')}</option>
                                    {rooms.map(r => <option key={r.id} value={r.id}>{getVisibleRoomName(r)}</option>)}
                                </select>
                            </div>

                            {/* Smart Sub-Location Selector */}
                            {formData.room_id && (
                        <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <MapPin className="w-4 h-4 text-[var(--hi-accent)]" />
                                <label className="text-sm font-medium text-[var(--hi-text)]">
                                    {t('items.form.location_details')} <span className="font-normal text-[var(--hi-text-muted)]">{t('items.form.location_optional')}</span>
                                </label>
                            </div>
                            <p className="mb-3 text-xs text-[var(--hi-text-soft)]">
                                {t('items.form.location_help')}
                            </p>

                            {/* Creatable Select */}
                            <div className="relative" ref={locationDropdownRef}>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={locationSearch}
                                        onChange={(e) => {
                                            setLocationSearch(e.target.value);
                                            setShowLocationDropdown(true);
                                            if (formData.location_id) {
                                                setFormData({ ...formData, location_id: '' });
                                            }
                                        }}
                                        onFocus={() => setShowLocationDropdown(true)}
                                        placeholder={t('items.form.location_placeholder')}
                                        className="input-field pr-20"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        {locationSearch && (
                                            <button type="button" onClick={handleClearLocation} className="p-1 text-[var(--hi-text-muted)] hover:text-[var(--hi-text)]">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                        <ChevronDown className={`w-4 h-4 text-[var(--hi-text-muted)] transition-transform ${showLocationDropdown ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>

                                {/* Dropdown */}
                                {showLocationDropdown && (
                                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-xl">
                                        {filteredLocations.length > 0 && (
                                            <div className="p-1">
                                                {filteredLocations.map(loc => (
                                                    <button
                                                        key={loc.id}
                                                        type="button"
                                                        onClick={() => handleSelectLocation(loc)}
                                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors
                              ${formData.location_id === loc.id
                                                                ? 'bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]'
                                                                : 'text-[var(--hi-text-soft)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]'}`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <MapPin className="w-4 h-4 text-[var(--hi-text-muted)]" />
                                                            {loc.name}
                                                        </span>
                                                        <span className="flex items-center gap-2">
                                                            {loc.is_public ? (
                                                                <Globe className="w-3.5 h-3.5 text-green-500" />
                                                            ) : (
                                                                <Lock className="w-3.5 h-3.5 text-amber-500" />
                                                            )}
                                                            {formData.location_id === loc.id && <Check className="w-4 h-4 text-[var(--hi-accent)]" />}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Create new location option */}
                                        {locationSearch.trim() && !exactMatch && (
                                            <>
                                                {filteredLocations.length > 0 && <div className="border-t border-[var(--hi-border)]" />}

                                                {!isCreatingLocation ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsCreatingLocation(true)}
                                                        className="flex w-full items-center gap-2 px-3 py-3 text-[var(--hi-accent)] transition-colors hover:bg-[var(--hi-accent-soft)]"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        <span>{t('items.form.location_create', { name: locationSearch })}</span>
                                                    </button>
                                                ) : (
                                                    <div className="p-3 space-y-3">
                                                        <div className="flex items-center justify-between rounded-lg bg-[var(--hi-bg-strong)] p-3">
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="w-4 h-4 text-[var(--hi-accent)]" />
                                                                <span className="font-medium text-[var(--hi-text)]">{locationSearch}</span>
                                                            </div>
                                                        </div>

                                                        {/* Location Privacy Toggle */}
                                                        <div className="flex items-center justify-between rounded-lg bg-[var(--hi-bg-strong)] p-3">
                                                            <div className="flex items-center gap-2">
                                                                {newLocationPublic ? (
                                                                    <Globe className="w-4 h-4 text-green-500" />
                                                                ) : (
                                                                    <Lock className="w-4 h-4 text-amber-500" />
                                                                )}
                                                                <div>
                                                                    <p className="text-sm font-medium text-[var(--hi-text)]">{t('items.form.location_privacy')}</p>
                                                                    <p className="text-xs text-[var(--hi-text-soft)]">
                                                                        {newLocationPublic ? t('items.form.location_public') : t('items.form.location_private')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNewLocationPublic(!newLocationPublic)}
                                                                className={`relative w-12 h-6 rounded-full transition-colors ${newLocationPublic ? 'bg-green-500' : 'bg-[var(--hi-border-strong)]'}`}
                                                            >
                                                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newLocationPublic ? 'left-6' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={handleCreateLocation}
                                                                disabled={savingLocation}
                                                                className="btn-secondary flex-1 py-2 text-sm flex items-center justify-center gap-2"
                                                            >
                                                                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                                                {savingLocation ? t('items.form.location_saving') : t('items.form.location_save')}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsCreatingLocation(false)}
                                                                className="btn-secondary py-2 px-4 text-sm"
                                                            >
                                                                {t('common.cancel')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Empty state */}
                                        {filteredLocations.length === 0 && !locationSearch.trim() && (
                                            <div className="p-4 text-center text-sm text-[var(--hi-text-soft)]">
                                                {t('items.form.location_empty')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Selected location indicator */}
                            {formData.location_id && (
                                <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--hi-accent-soft)] px-3 py-2 text-[var(--hi-accent)]">
                                    <Check className="w-4 h-4" />
                                    <span className="text-sm font-medium">{t('items.form.location_selected', { name: locationSearch })}</span>
                                    <button type="button" onClick={handleClearLocation} className="ml-auto rounded p-1 hover:bg-[var(--hi-panel-strong)]">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                            )}
                        </>
                    )}

                    {isEditing && (
                        <div className="overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)]">
                            <div className="flex items-center justify-between gap-4 px-4 py-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Paperclip className="h-5 w-5 shrink-0 text-[var(--hi-accent)]" />
                                    <div className="min-w-0">
                                        <p className="font-medium text-[var(--hi-text)]">{t('items.attachments.title', { defaultValue: 'Ek Dosyalar' })}</p>
                                        <p className="text-sm text-[var(--hi-text-soft)]">
                                            {t('items.attachments.form_desc', { defaultValue: 'PDF, görsel veya metin dosyalarını toplu ekleyin. Dosya başına en fazla 10 MB.' })}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={!canEditItem || attachmentUploading}
                                    onClick={() => attachmentInputRef.current?.click()}
                                    className="btn-secondary shrink-0 !px-3 !py-2 text-sm disabled:opacity-50"
                                >
                                    {attachmentUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    <span>{t('items.attachments.add', { defaultValue: 'Dosya Ekle' })}</span>
                                </button>
                                <input
                                    ref={attachmentInputRef}
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"
                                    multiple
                                    onChange={handleAttachmentUpload}
                                    className="hidden"
                                />
                            </div>

                            <div className="border-t border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 py-3">
                                {attachments.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-6 text-center text-sm text-[var(--hi-text-soft)]">
                                        {t('items.attachments.empty', { defaultValue: 'Bu eşyaya eklenmiş dosya yok.' })}
                                    </p>
                                ) : (
                                    <div className="divide-y divide-[var(--hi-border)]">
                                        {attachments.map((attachment) => (
                                            <div key={attachment.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-panel-strong)] text-[var(--hi-text-soft)]">
                                                        <FileText className="h-4 w-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-[var(--hi-text)]">{attachment.original_name}</p>
                                                        <p className="text-xs text-[var(--hi-text-soft)]">
                                                            {formatAttachmentSize(attachment.size_bytes)}
                                                            {attachment.created_at ? ` • ${formatIsoDateForDisplay(String(attachment.created_at).slice(0, 10))}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <a
                                                        href={`/api/items/attachments/${attachment.id}/download`}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] text-[var(--hi-text-soft)] hover:text-[var(--hi-text)]"
                                                        title={t('common.download', { defaultValue: 'İndir' })}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </a>
                                                    {canEditItem && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteAttachment(attachment.id)}
                                                            disabled={attachmentDeletingId === attachment.id}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                                                            title={t('common.delete', { defaultValue: 'Sil' })}
                                                        >
                                                            {attachmentDeletingId === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Collapsible Maintenance Section */}
                    <div className="overflow-hidden rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-strong)] shadow-[var(--hi-shadow-soft)]">
                        <button
                            type="button"
                            onClick={() => setShowMaintenanceSection(prev => !prev)}
                            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--hi-panel-muted)]"
                        >
                            <div>
                                <p className="font-medium text-[var(--hi-text)]">{t('maintenance.page.title', { defaultValue: 'Bakım Takvimi' })}</p>
                                <p className="text-sm text-[var(--hi-text-soft)]">
                                    {showMaintenanceSection ? t('maintenance.form.section_help', { defaultValue: 'Bakım takvimlerini buradan yönetin' }) : t('maintenance.form.section_collapsed', { defaultValue: 'Periyodik kontrol ve görevleri eklemek için tıklayın' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {isEditing && maintenanceTasks.length > 0 && !showMaintenanceSection && (
                                    <span className="rounded-full border border-[var(--hi-border)] bg-[var(--hi-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--hi-accent)]">
                                        {t('maintenance.form.has_tasks', { count: maintenanceTasks.length, defaultValue: `${maintenanceTasks.length} Görev` })}
                                    </span>
                                )}
                                <ChevronDown className={`w-5 h-5 text-[var(--hi-text-soft)] transition-transform ${showMaintenanceSection ? 'rotate-180' : ''}`} />
                            </div>
                        </button>

                        {showMaintenanceSection && (
                            <div className="space-y-4 border-t border-[var(--hi-border)] bg-[var(--hi-panel-muted)] px-4 pb-4 pt-3">
                                {!isEditing ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
                                        <p className="font-medium">{t('maintenance.form.new_item_warning_title', { defaultValue: 'Eşya Kaydı Bekleniyor' })}</p>
                                        <p className="mt-1 text-xs">{t('maintenance.form.new_item_warning_desc', { defaultValue: 'Bakım takvimi eklemek için önce bu eşyayı kaydetmeniz gerekmektedir.' })}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-[var(--hi-text-soft)]">{t('maintenance.form.manage_desc', { defaultValue: 'Bu cihaza veya eşyaya ait bakımları düzenleyin.' })}</span>
                                            <button
                                                type="button"
                                                onClick={handleOpenAddTask}
                                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--hi-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--hi-accent)] transition hover:bg-[var(--hi-accent-strong)] hover:text-white"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                {t('maintenance.actions.add_task', { defaultValue: 'Yeni Görev Ekle' })}
                                            </button>
                                        </div>

                                        {isMaintenanceLoading ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="h-5 w-5 animate-spin text-[var(--hi-text-soft)]" />
                                            </div>
                                        ) : maintenanceTasks.length === 0 ? (
                                            <p className="rounded-xl border border-dashed border-[var(--hi-border-strong)] px-4 py-8 text-center text-sm text-[var(--hi-text-soft)]">
                                                {t('maintenance.no_tasks', { defaultValue: 'Henüz bir bakım görevi atanmamış.' })}
                                            </p>
                                        ) : (
                                            <div className="divide-y divide-[var(--hi-border)]">
                                                {maintenanceTasks.map((task) => (
                                                    <div key={task.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                                        <div className="space-y-1">
                                                            <p className="font-medium text-sm text-[var(--hi-text)]">{task.task_name}</p>
                                                            {task.description && (
                                                                <p className="text-xs text-[var(--hi-text-soft)]">{task.description}</p>
                                                            )}
                                                            <p className="text-xs text-[var(--hi-text-muted)]">
                                                                {formatFreqText(task.frequency_value, task.frequency_unit, t)}
                                                                {task.next_due_date && ` • ${t('maintenance.fields.next_due_date', { defaultValue: 'Gelecek Tarih' })}: ${formatIsoDateForDisplay(task.next_due_date)}`}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditTask(task)}
                                                                className="rounded p-1 text-[var(--hi-text-muted)] hover:bg-[var(--hi-panel-strong)] hover:text-[var(--hi-text)]"
                                                                title={t('common.edit')}
                                                            >
                                                                <Edit3 className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteTask(task)}
                                                                className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                                                                title={t('common.delete')}
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <div className="item-form-actions flex gap-3 pt-4">
                        <button type="submit" disabled={loading} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                            {loading ? t('items.form.submitting') : (isEditing ? t('items.form.submit_save') : t('items.form.submit_add'))}
                        </button>
                        <button type="button" onClick={() => navigate(-1)} className="btn-secondary py-3 px-6">{t('common.cancel')}</button>
                    </div>
                </form>
            </div>

            {/* QR Code Section - Only for existing items */}
            {isEditing && (
                <div className="app-control-section mt-6">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[0.95rem] bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                            <QrCode className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-[var(--hi-text)]">{t('items.qrcode.title')}</h3>
                    </div>
                    <p className="mb-4 text-sm text-[var(--hi-text-soft)]">
                        {t('items.qrcode.desc')}
                    </p>
                    <Suspense
                        fallback={(
                            <div className="rounded-[1.2rem] border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-5">
                                <div className="flex items-center gap-3 text-sm text-[var(--hi-text-soft)]">
                                    <Loader2 className="h-4 w-4 animate-spin text-[var(--hi-accent)]" />
                                    <span>{t('item_qr.loading', { defaultValue: 'Preparing QR tools...' })}</span>
                                </div>
                            </div>
                        )}
                    >
                        <ItemQRCode itemId={id} />
                    </Suspense>
                </div>
            )}

            {/* Barcode Scanner Modal */}
            {showBarcodeScanner && (
                <Suspense
                    fallback={(
                        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/92 px-6 text-center text-white">
                            <Loader2 className="mb-4 h-10 w-10 animate-spin" />
                            <p className="text-base font-medium">{t('scanner.init')}</p>
                            <p className="mt-2 text-sm text-white/70">{t('scanner.hint')}</p>
                        </div>
                    )}
                >
                    <BarcodeScanner
                        isOpen={showBarcodeScanner}
                        onClose={() => setShowBarcodeScanner(false)}
                        onProductFound={handleProductFound}
                        onBarcodeOnly={handleBarcodeOnly}
                        onQuickAdd={selectedBox ? handleQuickAdd : undefined}
                        onExistingItemFound={selectedBox ? handleExistingBarcodeItem : undefined}
                        existingItemActionLabel={selectedBox
                            ? t('boxes.quick_add_item', { defaultValue: 'Add item to box' })
                            : undefined}
                    />
                </Suspense>
            )}

            {/* Inline Maintenance Task Dialog */}
            {isTaskFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-md rounded-2xl border border-[var(--hi-border)] bg-[var(--hi-panel)] p-6 shadow-2xl animate-scale-up">
                        <div className="flex items-center justify-between mb-4 border-b border-[var(--hi-border)] pb-3">
                            <h3 className="text-lg font-semibold text-[var(--hi-text)]">
                                {editingTask ? t('maintenance.actions.edit_task', { defaultValue: 'Görevi Düzenle' }) : t('maintenance.actions.add_task', { defaultValue: 'Yeni Görev Ekle' })}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsTaskFormOpen(false)}
                                className="rounded-lg p-1 text-[var(--hi-text-muted)] hover:bg-[var(--hi-panel-muted)] hover:text-[var(--hi-text)]"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTask} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">
                                    {t('maintenance.fields.task_name', { defaultValue: 'Görev Adı' })} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={taskName}
                                    onChange={(e) => setTaskName(e.target.value)}
                                    className="input-field"
                                    placeholder={t('maintenance.fields.task_name_placeholder', { defaultValue: 'örn. Klima filtresi temizliği' })}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">
                                    {t('maintenance.fields.description', { defaultValue: 'Açıklama' })}
                                </label>
                                <textarea
                                    value={taskDescription}
                                    onChange={(e) => setTaskDescription(e.target.value)}
                                    className="input-field min-h-[80px] resize-none"
                                    placeholder={t('maintenance.fields.description_placeholder', { defaultValue: 'Görev detayları veya yapılması gerekenler...' })}
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">
                                        {t('maintenance.fields.frequency_value', { defaultValue: 'Tekrarlama Sıklığı' })}
                                    </label>
                                    <input
                                        type="number"
                                        value={freqValue}
                                        onChange={(e) => setFreqValue(e.target.value)}
                                        className="input-field"
                                        placeholder={t('maintenance.fields.frequency_value_placeholder', { defaultValue: 'Tek seferlik için boş bırakın' })}
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">
                                        {t('maintenance.fields.frequency_unit', { defaultValue: 'Zaman Birimi' })}
                                    </label>
                                    <select
                                        value={freqUnit}
                                        onChange={(e) => setFreqUnit(e.target.value)}
                                        className="input-field"
                                        disabled={!freqValue}
                                    >
                                        <option value="days">{t('maintenance.freq.unit.days', { defaultValue: 'Gün' })}</option>
                                        <option value="weeks">{t('maintenance.freq.unit.weeks', { defaultValue: 'Hafta' })}</option>
                                        <option value="months">{t('maintenance.freq.unit.months', { defaultValue: 'Ay' })}</option>
                                        <option value="years">{t('maintenance.freq.unit.years', { defaultValue: 'Yıl' })}</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--hi-text)]">
                                    {t('maintenance.fields.next_due_date', { defaultValue: 'Planlanan Tarih' })} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={nextDueDate}
                                    onChange={(e) => setNextDueDate(e.target.value)}
                                    className="input-field"
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-3 border-t border-[var(--hi-border)]">
                                <button
                                    type="submit"
                                    className="btn-primary flex-1 py-2.5 text-sm"
                                >
                                    {t('common.save')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsTaskFormOpen(false)}
                                    className="btn-secondary py-2.5 px-4 text-sm"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
