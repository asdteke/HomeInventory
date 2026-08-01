import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
    Archive,
    ArchiveRestore,
    ArrowLeft,
    Box,
    Check,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Edit3,
    Filter,
    Globe,
    Lock,
    MapPin,
    MoreHorizontal,
    Move,
    Package,
    Plus,
    Printer,
    Search,
    Square,
    Trash2,
    X
} from 'lucide-react';
import SecureImage from './SecureImage';
import FloatingToast from './FloatingToast';
import ModalDialog, { ConfirmDialog } from './ModalDialog';
import { LoadingState, PageHeader } from './ProductUI';
import BoxEditorDialog, { type BoxRecord } from './BoxEditorDialog';
import CreatableLocationSelect from './CreatableLocationSelect';
import { invalidateCache } from '../utils/apiCache';
import { getRoomPresentation } from '../utils/roomDisplay';
import '../boxes-v26.css';

function safeBoxLocationName(box?: BoxRecord | null) {
    return isBoxPublic(box)
        && box?.location_is_public !== undefined
        && !Boolean(box.location_is_public)
        ? null
        : box?.location_name;
}

function boxPlace(box?: BoxRecord | null) {
    return [box?.room_name, safeBoxLocationName(box)].filter(Boolean).join(' › ');
}

function itemPlace(item: any) {
    return [item.room_name, item.location_name].filter(Boolean).join(' › ');
}

function isBoxPublic(box?: BoxRecord | null) {
    return box?.is_public === undefined ? true : Boolean(box.is_public);
}

function getBoxItemCount(box?: BoxRecord | null) {
    return Number(box?.total_item_count ?? box?.item_count ?? 0);
}

function canManageBox(box?: BoxRecord | null) {
    return Boolean(box?.can_manage ?? box?.can_edit);
}

function isLocationPublic(location: any) {
    return location?.is_public === undefined ? true : Boolean(location.is_public);
}

export default function BoxManager() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language;
    const [boxes, setBoxes] = useState<BoxRecord[]>([]);
    const [rooms, setRooms] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [detailBox, setDetailBox] = useState<BoxRecord | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [listSearch, setListSearch] = useState('');
    const [detailSearch, setDetailSearch] = useState('');
    const [occupancy, setOccupancy] = useState('');
    const [roomFilter, setRoomFilter] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [archiveView, setArchiveView] = useState<'active' | 'archived'>('active');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [moveDestination, setMoveDestination] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingBox, setEditingBox] = useState<BoxRecord | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteBox, setDeleteBox] = useState<BoxRecord | null>(null);
    const [deleteDestination, setDeleteDestination] = useState('');
    const [deleteMode, setDeleteMode] = useState<'move' | 'unassign'>('move');
    const [placementOpen, setPlacementOpen] = useState(false);
    const [placementRoom, setPlacementRoom] = useState('');
    const [placementLocation, setPlacementLocation] = useState('');
    const [addItemsOpen, setAddItemsOpen] = useState(false);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [pickerSearch, setPickerSearch] = useState('');
    const [pickerSelected, setPickerSelected] = useState<Set<number>>(new Set());
    const [pickerLoading, setPickerLoading] = useState(false);
    const [toast, setToast] = useState<any>(null);

    const getBoxActionError = (error: unknown, fallback: string) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const errorCode = axios.isAxiosError(error)
            ? String(error.response?.data?.code || '').trim()
            : '';
        if (errorCode === 'BOX_CODE_DUPLICATE') return t('boxes.conflict_error');
        if (errorCode === 'BOX_STALE') return t('boxes.stale_error');
        if (errorCode === 'BOX_VISIBILITY_CONFLICT') return t('boxes.visibility_conflict_error');
        if (errorCode === 'BOX_DESTINATION_PRIVATE') return t('boxes.destination_private_error');
        if (errorCode === 'BOX_NOT_EMPTY') return t('boxes.not_empty_error');
        if (errorCode === 'BOX_PLACEMENT_CONFLICT') return t('boxes.conflict_error');
        if (status === 403) return t('boxes.permission_error');
        if (status === 409 || status === 412) return t('boxes.conflict_error');
        return fallback;
    };

    const loadOptions = async () => {
        const [boxResponse, roomResponse, locationResponse, categoryResponse] = await Promise.all([
            axios.get('/api/boxes?archived=include'),
            axios.get('/api/rooms'),
            axios.get('/api/locations'),
            axios.get('/api/categories')
        ]);
        setBoxes(boxResponse.data.boxes || []);
        setRooms(roomResponse.data.rooms || []);
        setLocations(locationResponse.data.locations || []);
        setCategories(categoryResponse.data.categories || []);
    };

    const loadDetail = async () => {
        if (!id) return;
        const params = new URLSearchParams();
        if (detailSearch.trim()) params.set('search', detailSearch.trim());
        if (categoryFilter) params.set('category_id', categoryFilter);
        const response = await axios.get(`/api/boxes/${id}${params.toString() ? `?${params}` : ''}`);
        setDetailBox(response.data.box);
        setItems(response.data.items || []);
        setSelectedIds((current) => new Set([...current].filter((itemId) =>
            (response.data.items || []).some((item: any) => item.id === itemId && item.can_edit)
        )));
    };

    const loadPage = async () => {
        setLoading(true);
        setLoadError('');
        try {
            await Promise.all([loadOptions(), id ? loadDetail() : Promise.resolve()]);
        } catch {
            const message = t('boxes.load_error');
            setLoadError(message);
            setToast({ title: t('common.error'), description: message, tone: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPage();
    }, [id]);

    useEffect(() => {
        if (!id || loading) return;
        const timer = window.setTimeout(() => {
            loadDetail().catch(() => {
                const message = t('boxes.load_error');
                setToast({ title: t('common.error'), description: message, tone: 'danger' });
            });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [categoryFilter, detailSearch]);

    useEffect(() => {
        setSelectionMode(false);
        setSelectedIds(new Set());
        setMoveDestination('');
        setDetailSearch('');
        setCategoryFilter('');
    }, [id]);

    const visibleBoxes = useMemo(() => {
        const normalizedSearch = listSearch.trim().toLocaleLowerCase();
        return boxes.filter((candidate) => {
            if (archiveView === 'active' ? candidate.archived : !candidate.archived) return false;
            if (roomFilter && String(candidate.room_id || '') !== roomFilter) return false;
            if (locationFilter && String(candidate.location_id || '') !== locationFilter) return false;
            const count = getBoxItemCount(candidate);
            if (occupancy === 'empty' && count !== 0) return false;
            if (occupancy === 'nonempty' && count === 0) return false;
            return !normalizedSearch || [candidate.name, candidate.code, candidate.note, candidate.room_name, safeBoxLocationName(candidate)]
                .some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
        });
    }, [archiveView, boxes, listSearch, locationFilter, occupancy, roomFilter]);

    const hasListFilters = Boolean(listSearch.trim() || roomFilter || locationFilter || occupancy);
    const activeBoxes = boxes.filter((candidate) => !candidate.archived);
    const destinationBoxes = activeBoxes.filter((candidate) => candidate.id !== Number(id || deleteBox?.id || 0));
    const deleteDestinationBoxes = destinationBoxes.filter((candidate) => (
        !deleteBox || !isBoxPublic(deleteBox) || isBoxPublic(candidate)
    ));
    const placementLocations = locations.filter((location) => (
        placementRoom && String(location.room_id || '') === placementRoom
        && (!isBoxPublic(detailBox) || isLocationPublic(location))
    ));
    const editableItems = items.filter((item) => item.can_edit);
    const pickerItems = useMemo(() => {
        const query = pickerSearch.trim().toLocaleLowerCase();
        return availableItems.filter((item) => {
            if (!item.can_edit || Number(item.box_id) === Number(id)) return false;
            return !query || [item.name, item.category_name, item.box_name, item.room_name, item.location_name]
                .some((value) => String(value || '').toLocaleLowerCase().includes(query));
        });
    }, [availableItems, id, pickerSearch]);

    const clearListFilters = () => {
        setListSearch('');
        setRoomFilter('');
        setLocationFilter('');
        setOccupancy('');
    };

    const openCreate = () => {
        setEditingBox(null);
        setEditorOpen(true);
    };

    const openEdit = (candidate: BoxRecord) => {
        setEditingBox(candidate);
        setEditorOpen(true);
    };

    const saveBox = async (payload: FormData) => {
        setSaving(true);
        try {
            if (editingBox) await axios.put(`/api/boxes/${editingBox.id}`, payload);
            else await axios.post('/api/boxes', payload);
            invalidateCache(/^\/api\/boxes/);
            await Promise.all([loadOptions(), id ? loadDetail() : Promise.resolve()]);
            setEditorOpen(false);
            setToast({
                title: editingBox ? t('boxes.updated_title') : t('boxes.created_title'),
                description: editingBox ? t('boxes.updated_body') : t('boxes.created_body'),
                tone: 'success'
            });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.save_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const toggleArchive = async (candidate: BoxRecord) => {
        setSaving(true);
        try {
            await axios.patch(`/api/boxes/${candidate.id}/archive`, { archived: !candidate.archived });
            await Promise.all([loadOptions(), id ? loadDetail() : Promise.resolve()]);
            setToast({
                title: candidate.archived ? t('boxes.restored_title') : t('boxes.archived_title'),
                description: candidate.archived ? t('boxes.restored_body') : t('boxes.archived_body'),
                tone: 'success'
            });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.archive_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const openDelete = (candidate: BoxRecord) => {
        setDeleteBox(candidate);
        setDeleteDestination('');
        setDeleteMode('move');
    };

    const openPlacement = (candidate: BoxRecord) => {
        const selectedLocation = locations.find((location) => (
            String(location.id) === String(candidate.location_id || '')
        ));
        setPlacementRoom(candidate.room_id ? String(candidate.room_id) : '');
        setPlacementLocation(
            candidate.location_id && (!isBoxPublic(candidate) || isLocationPublic(selectedLocation))
                ? String(candidate.location_id)
                : ''
        );
        setPlacementOpen(true);
    };

    const savePlacement = async () => {
        if (!detailBox || saving || !canManageBox(detailBox)) return;
        setSaving(true);
        try {
            const payload = new FormData();
            payload.append('room_id', placementRoom);
            payload.append('location_id', placementLocation);
            if (detailBox.updated_at) payload.append('expected_updated_at', detailBox.updated_at);
            await axios.put(`/api/boxes/${detailBox.id}`, payload);
            invalidateCache(/^\/api\/items/);
            invalidateCache(/^\/api\/boxes/);
            setPlacementOpen(false);
            await Promise.all([loadOptions(), loadDetail()]);
            setToast({
                title: t('boxes.moved_title'),
                description: t('boxes.moved_body'),
                tone: 'success'
            });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.move_box_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteBox || saving) return;
        if (getBoxItemCount(deleteBox) > 0 && deleteMode === 'move' && !deleteDestination) return;
        setSaving(true);
        try {
            await axios.delete(`/api/boxes/${deleteBox.id}`, {
                data: deleteMode === 'move'
                    ? { destination_box_id: deleteDestination || null }
                    : { confirm_unassign: true }
            });
            const deletedId = deleteBox.id;
            setDeleteBox(null);
            await loadOptions();
            if (Number(id) === deletedId) navigate('/organize/boxes', { replace: true });
            setToast({ title: t('boxes.deleted_title'), description: t('boxes.deleted_body'), tone: 'success' });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.delete_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const openAddItems = async () => {
        setAddItemsOpen(true);
        setPickerLoading(true);
        setPickerSelected(new Set());
        setPickerSearch('');
        try {
            const response = await axios.get('/api/items?sort=updated_desc');
            setAvailableItems(response.data.items || []);
        } catch {
            setToast({ title: t('common.error'), description: t('boxes.available_items_error', { defaultValue: 'Items could not be loaded.' }), tone: 'danger' });
        } finally {
            setPickerLoading(false);
        }
    };

    const assignExistingItems = async () => {
        if (!id || !pickerSelected.size || saving) return;
        setSaving(true);
        try {
            await axios.post(`/api/boxes/${id}/items`, { item_ids: [...pickerSelected] });
            invalidateCache(/^\/api\/items/);
            invalidateCache(/^\/api\/boxes/);
            setAddItemsOpen(false);
            await Promise.all([loadOptions(), loadDetail()]);
            setToast({
                title: t('boxes.items_added_title', { defaultValue: 'Items added' }),
                description: t('boxes.items_added_body', { count: pickerSelected.size, defaultValue: '{{count}} items are now in this box.' }),
                tone: 'success'
            });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.move_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const updateSelectedBox = async (destination: string | null) => {
        if (!selectedIds.size || saving) return;
        setSaving(true);
        try {
            await axios.post('/api/items/bulk', {
                action: 'update',
                item_ids: [...selectedIds],
                payload: { box_id: destination }
            });
            invalidateCache(/^\/api\/items/);
            invalidateCache(/^\/api\/boxes/);
            setSelectedIds(new Set());
            setSelectionMode(false);
            setMoveDestination('');
            await Promise.all([loadOptions(), loadDetail()]);
            setToast({
                title: destination ? t('boxes.items_moved_title') : t('boxes.items_unassigned_title', { defaultValue: 'Items removed from box' }),
                description: destination ? t('boxes.items_moved_body') : t('boxes.items_unassigned_body', { defaultValue: 'The items remain in inventory with their current room and location.' }),
                tone: 'success'
            });
        } catch (error) {
            setToast({ title: t('common.error'), description: getBoxActionError(error, t('boxes.move_error')), tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const toggleItem = (itemId: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    if (loading) return <LoadingState title={t('boxes.loading')} />;

    if (loadError && (!id || !detailBox)) {
        return (
            <section className="box-empty-v26" role="alert">
                <Box className="h-11 w-11" />
                <h1>{t('boxes.load_error')}</h1>
                <p>{loadError}</p>
                <button type="button" onClick={() => void loadPage()} className="btn-primary">{t('common.retry', { defaultValue: 'Try again' })}</button>
            </section>
        );
    }

    const renderDialogs = () => {
        const deleteItemCount = getBoxItemCount(deleteBox);
        return (
            <>
                <BoxEditorDialog
                    open={editorOpen}
                    box={editingBox}
                    boxes={boxes}
                    rooms={rooms}
                    locations={locations}
                    saving={saving}
                    onClose={() => setEditorOpen(false)}
                    onSave={saveBox}
                    onLocationCreated={(location) => setLocations((current) => [...current, location])}
                    onError={(description) => setToast({ title: t('common.error'), description, tone: 'danger' })}
                />
                <ModalDialog
                    isOpen={addItemsOpen}
                    title={t('boxes.add_items_title', { defaultValue: 'Add items to this box' })}
                    description={t('boxes.add_items_description', { defaultValue: 'Choose existing items or create a new one already assigned here.' })}
                    onClose={() => setAddItemsOpen(false)}
                    icon={Package}
                    widthClassName="max-w-3xl"
                    footer={(
                        <>
                            <Link
                                to={`/items/new?${new URLSearchParams({
                                    box_id: String(id),
                                    ...(detailBox?.room_id ? { room_id: String(detailBox.room_id) } : {}),
                                    ...(detailBox?.location_id ? { location_id: String(detailBox.location_id) } : {}),
                                    is_public: isBoxPublic(detailBox) ? 'true' : 'false',
                                    return_to: `/organize/boxes/${id}`
                                }).toString()}`}
                                className="btn-secondary"
                            >
                                <Plus className="h-4 w-4" /> {t('boxes.create_new_item', { defaultValue: 'Create new item' })}
                            </Link>
                            <button type="button" onClick={assignExistingItems} disabled={!pickerSelected.size || saving} className="btn-primary">
                                {saving ? t('common.loading') : t('boxes.add_selected', { count: pickerSelected.size, defaultValue: 'Add selected ({{count}})' })}
                            </button>
                        </>
                    )}
                >
                    <div className="box-picker-v26">
                        <label className="box-search-v26">
                            <Search className="h-4 w-4" />
                            <span className="sr-only">{t('boxes.search_available_items', { defaultValue: 'Search available items' })}</span>
                            <input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder={t('boxes.search_available_items', { defaultValue: 'Search available items' })} />
                            {pickerSearch && <button type="button" onClick={() => setPickerSearch('')} aria-label={t('common.clear')}><X className="h-4 w-4" /></button>}
                        </label>
                        {pickerLoading ? (
                            <LoadingState compact title={t('boxes.loading_items', { defaultValue: 'Loading items...' })} />
                        ) : pickerItems.length === 0 ? (
                            <div className="box-picker-empty-v26">
                                <Package className="h-8 w-8" />
                                <p>{pickerSearch ? t('boxes.no_available_matches', { defaultValue: 'No owned items match this search.' }) : t('boxes.no_available_items', { defaultValue: 'There are no other owned items to add.' })}</p>
                            </div>
                        ) : (
                            <div className="box-picker-list-v26">
                                {pickerItems.map((item) => {
                                    const selected = pickerSelected.has(item.id);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setPickerSelected((current) => {
                                                const next = new Set(current);
                                                if (selected) next.delete(item.id);
                                                else next.add(item.id);
                                                return next;
                                            })}
                                            className={selected ? 'is-selected' : ''}
                                        >
                                            <span className="box-picker-check-v26">{selected ? <Check className="h-4 w-4" /> : null}</span>
                                            <span className="box-picker-thumb-v26">
                                                <SecureImage src={item.thumbnail_path || item.photo_path} alt="" className="h-full w-full object-cover" fallback={<Package className="h-5 w-5" />} />
                                            </span>
                                            <span className="min-w-0 flex-1 text-left">
                                                <span className="box-picker-title-v26">
                                                    <strong>{item.name}</strong>
                                                    {item.is_public !== undefined && !Boolean(item.is_public) && (
                                                        <em><Lock className="h-3 w-3" /> {t('boxes.private_item_badge')}</em>
                                                    )}
                                                </span>
                                                <small>
                                                    {item.box_name
                                                        ? t('boxes.current_box', { box: `${item.box_code} · ${item.box_name}`, defaultValue: 'Currently in {{box}}' })
                                                        : itemPlace(item) || t('boxes.no_box', { defaultValue: 'Not in a box' })}
                                                </small>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </ModalDialog>
                <ModalDialog
                    isOpen={placementOpen}
                    title={t('boxes.move_box_title', { name: detailBox?.name })}
                    description={t('boxes.move_box_description')}
                    onClose={() => setPlacementOpen(false)}
                    icon={Move}
                    widthClassName="max-w-lg"
                    footer={(
                        <>
                            <button type="button" onClick={() => setPlacementOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
                            <button type="button" onClick={() => void savePlacement()} disabled={saving} className="btn-primary">
                                {saving ? t('common.loading') : t('boxes.move_box')}
                            </button>
                        </>
                    )}
                >
                    <div className="box-move-dialog-v26">
                        <label>
                            <span className="box-field-label-v26">{t('items.form.room')}</span>
                            <select
                                value={placementRoom}
                                onChange={(event) => {
                                    setPlacementRoom(event.target.value);
                                    setPlacementLocation('');
                                }}
                                className="input-field"
                            >
                                <option value="">{t('boxes.no_room')}</option>
                                {rooms.map((room) => <option key={room.id} value={room.id}>{getRoomPresentation(room, currentLanguage).name}</option>)}
                            </select>
                        </label>
                        <div>
                            <span className="box-field-label-v26">{t('items.form.location')}</span>
                            <CreatableLocationSelect
                                roomId={placementRoom}
                                value={placementLocation}
                                locations={placementLocations}
                                allowPrivate={!isBoxPublic(detailBox)}
                                onChange={setPlacementLocation}
                                onCreated={(location) => {
                                    setLocations((current) => [...current, location]);
                                    setPlacementLocation(String(location.id));
                                }}
                                onError={(message) => setToast({
                                    title: t('common.error'),
                                    description: message,
                                    tone: 'danger'
                                })}
                            />
                        </div>
                        <p><MapPin className="h-4 w-4" /> {t('boxes.move_box_contents_help')}</p>
                    </div>
                </ModalDialog>
                <ConfirmDialog
                    isOpen={Boolean(deleteBox)}
                    title={t('boxes.delete_title', { name: deleteBox?.name })}
                    description={deleteItemCount ? t('boxes.delete_nonempty_description', { count: deleteItemCount }) : t('boxes.delete_empty_description')}
                    confirmLabel={saving ? t('common.loading') : t('common.delete')}
                    confirmDisabled={deleteItemCount > 0 && deleteMode === 'move' && !deleteDestination}
                    confirming={saving}
                    onClose={() => setDeleteBox(null)}
                    onConfirm={confirmDelete}
                    tone="danger"
                >
                    {deleteItemCount > 0 && (
                        <div className="box-delete-options-v26">
                            <label className={deleteMode === 'move' ? 'is-selected' : ''}>
                                <input type="radio" checked={deleteMode === 'move'} onChange={() => setDeleteMode('move')} />
                                <span>
                                    <strong>{t('boxes.delete_move')}</strong>
                                    <select value={deleteDestination} onChange={(event) => setDeleteDestination(event.target.value)} className="input-field mt-2">
                                        <option value="">{t('boxes.choose_destination')}</option>
                                        {deleteDestinationBoxes.map((candidate) => (
                                            <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>
                                        ))}
                                    </select>
                                    {deleteBox && isBoxPublic(deleteBox) && (
                                        <small>{t('boxes.shared_destination_help')}</small>
                                    )}
                                </span>
                            </label>
                            <label className={deleteMode === 'unassign' ? 'is-selected' : ''}>
                                <input type="radio" checked={deleteMode === 'unassign'} onChange={() => setDeleteMode('unassign')} />
                                <span><strong>{t('boxes.delete_unassign')}</strong><small>{t('boxes.delete_unassign_help')}</small></span>
                            </label>
                        </div>
                    )}
                </ConfirmDialog>
            </>
        );
    };

    if (id && detailBox) {
        const place = boxPlace(detailBox);
        const hasContentFilters = Boolean(detailSearch.trim() || categoryFilter);
        const totalItemCount = getBoxItemCount(detailBox);
        const hiddenItemCount = Math.max(0, Number(
            detailBox.hidden_item_count
            ?? (totalItemCount - Number(detailBox.visible_item_count ?? totalItemCount))
        ));
        const detailCanManage = canManageBox(detailBox);
        return (
            <div className="boxes-page-v26 animate-fade-in">
                <Link to="/organize/boxes" className="box-back-link-v26"><ArrowLeft className="h-4 w-4" /> {t('navigation.boxes')}</Link>
                <header className="box-detail-hero-v26">
                    <div className="box-detail-photo-v26">
                        <SecureImage
                            src={detailBox.thumbnail_path || detailBox.photo_path}
                            alt={detailBox.name}
                            className="h-full w-full object-cover"
                            fallback={<Box className="h-9 w-9" />}
                        />
                    </div>
                    <div className="box-detail-copy-v26">
                        <div className="box-title-line-v26">
                            <h1>{detailBox.name}</h1>
                            <span>{detailBox.code}</span>
                            <em className={isBoxPublic(detailBox) ? 'box-privacy-badge-v26 is-shared' : 'box-privacy-badge-v26 is-private'}>
                                {isBoxPublic(detailBox) ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                {isBoxPublic(detailBox) ? t('boxes.visibility_shared') : t('boxes.visibility_private')}
                            </em>
                            {detailBox.archived && <em>{t('boxes.archived_badge')}</em>}
                        </div>
                        {detailBox.note && <p>{detailBox.note}</p>}
                        <div className="box-detail-meta-v26">
                            <span><MapPin className="h-4 w-4" /> {place || t('boxes.location_unknown')}</span>
                            <span><Package className="h-4 w-4" /> {t('boxes.item_count', { count: totalItemCount })}</span>
                        </div>
                    </div>
                    <div className="box-detail-actions-v26">
                        {!detailBox.archived && (
                            <button type="button" onClick={openAddItems} className="btn-primary"><Plus className="h-4 w-4" /> {t('boxes.add_items', { defaultValue: 'Add items' })}</button>
                        )}
                        {!detailBox.archived && detailCanManage && (
                            <button type="button" onClick={() => openPlacement(detailBox)} className="btn-secondary box-move-action-v26">
                                <Move className="h-4 w-4" /> {t('boxes.move_box')}
                            </button>
                        )}
                        <details className="box-overflow-v26">
                            <summary aria-label={t('boxes.more_actions', { defaultValue: 'More box actions' })}><MoreHorizontal className="h-5 w-5" /></summary>
                            <div>
                                <Link to={`/box-labels?box_id=${detailBox.id}`}><Printer className="h-4 w-4" /> {t('boxes.print_label')}</Link>
                                {detailCanManage && <button type="button" onClick={() => openEdit(detailBox)}><Edit3 className="h-4 w-4" /> {t('common.edit')}</button>}
                                {detailBox.can_archive && (
                                    <button type="button" onClick={() => void toggleArchive(detailBox)}>
                                        {detailBox.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                        {detailBox.archived ? t('boxes.restore') : t('boxes.archive')}
                                    </button>
                                )}
                                {detailBox.can_delete && <button type="button" onClick={() => openDelete(detailBox)} className="is-danger"><Trash2 className="h-4 w-4" /> {t('common.delete')}</button>}
                            </div>
                        </details>
                    </div>
                </header>

                <section className="box-contents-v26" aria-busy={loading}>
                    <div className="box-contents-toolbar-v26">
                        <div>
                            <h2>{t('boxes.contents_title', { defaultValue: 'Contents' })}</h2>
                            <p>{t('boxes.contents_hint', { defaultValue: 'Search, open, or move items without leaving this box.' })}</p>
                        </div>
                        <div className="box-contents-controls-v26">
                            <label className="box-search-v26">
                                <Search className="h-4 w-4" />
                                <span className="sr-only">{t('boxes.search_contents')}</span>
                                <input value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder={t('boxes.search_contents')} />
                                {detailSearch && <button type="button" onClick={() => setDetailSearch('')} aria-label={t('common.clear')}><X className="h-4 w-4" /></button>}
                            </label>
                            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field">
                                <option value="">{t('inventory.all_categories')}</option>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
                            </select>
                            {editableItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectionMode((current) => !current);
                                        setSelectedIds(new Set());
                                    }}
                                    className={selectionMode ? 'btn-primary' : 'btn-secondary'}
                                >
                                    {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                                    {selectionMode ? t('common.cancel') : t('boxes.select', { defaultValue: 'Select' })}
                                </button>
                            )}
                        </div>
                    </div>

                    {items.length === 0 && (hasContentFilters || hiddenItemCount === 0) ? (
                        <div className="box-empty-v26">
                            <Package className="h-10 w-10" />
                            <h2>{hasContentFilters ? t('boxes.no_content_matches_title', { defaultValue: 'No items match' }) : t('boxes.empty_contents_title_v2', { defaultValue: 'This box is ready' })}</h2>
                            <p>{hasContentFilters ? t('boxes.no_content_matches_body', { defaultValue: 'Clear the search or category filter to see the rest of the box.' }) : t('boxes.empty_contents_body_v2', { defaultValue: 'Add existing items or create a new item directly in this box.' })}</p>
                            {hasContentFilters && (
                                <button type="button" onClick={() => { setDetailSearch(''); setCategoryFilter(''); }} className="btn-secondary">{t('boxes.clear_filters', { defaultValue: 'Clear filters' })}</button>
                            )}
                        </div>
                    ) : items.length > 0 ? (
                        <div className="box-content-list-v26">
                            {items.map((item) => {
                                const selected = selectedIds.has(item.id);
                                return (
                                    <article key={item.id} className={selected ? 'is-selected' : ''}>
                                        {selectionMode && item.can_edit && (
                                            <button type="button" onClick={() => toggleItem(item.id)} className="box-select-item-v26" aria-label={t('boxes.select_item', { name: item.name })}>
                                                {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                            </button>
                                        )}
                                        <Link to={`/items/${item.id}/edit`} className="box-content-thumb-v26">
                                            <SecureImage src={item.thumbnail_path || item.photo_path} alt="" className="h-full w-full object-cover" fallback={<Package className="h-5 w-5" />} />
                                        </Link>
                                        <div className="box-content-copy-v26">
                                            <span className="box-content-title-v26">
                                                <Link to={`/items/${item.id}/edit`}>{item.name}</Link>
                                                {item.is_public !== undefined && !Boolean(item.is_public) && (
                                                    <em><Lock className="h-3 w-3" /> {t('boxes.private_item_badge')}</em>
                                                )}
                                            </span>
                                            <span>{item.category_name || t('items.form.category')} · {t('items.form.quantity')}: {item.quantity}</span>
                                        </div>
                                        <Link to={`/items/${item.id}/edit`} className="box-row-open-v26" aria-label={item.name}><ChevronRight className="h-5 w-5" /></Link>
                                    </article>
                                );
                            })}
                        </div>
                    ) : null}
                    {hiddenItemCount > 0 && (
                        <div className="box-private-items-notice-v26" role="note">
                            <span><Lock className="h-5 w-5" /></span>
                            <div>
                                <strong>{t('boxes.private_items_summary', { count: hiddenItemCount })}</strong>
                                <p>{t('boxes.private_items_help')}</p>
                            </div>
                        </div>
                    )}
                </section>

                {selectionMode && selectedIds.size > 0 && (
                    <div className="box-selection-bar-v26" role="region" aria-label={t('boxes.selected_items', { count: selectedIds.size, defaultValue: '{{count}} selected items' })}>
                        <strong>{t('boxes.selected_count', { count: selectedIds.size, defaultValue: '{{count}} selected' })}</strong>
                        <button type="button" onClick={() => void updateSelectedBox(null)} disabled={saving} className="btn-secondary">
                            <X className="h-4 w-4" /> {t('boxes.remove_from_box', { defaultValue: 'Remove from box' })}
                        </button>
                        <select value={moveDestination} onChange={(event) => setMoveDestination(event.target.value)} className="input-field">
                            <option value="">{t('boxes.choose_destination')}</option>
                            {destinationBoxes.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.code} · {candidate.name}{isBoxPublic(candidate) ? '' : ` · ${t('boxes.visibility_private')}`}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={() => void updateSelectedBox(moveDestination)} disabled={!moveDestination || saving} className="btn-primary">
                            {t('boxes.move_selected', { count: selectedIds.size })}
                        </button>
                    </div>
                )}
                {renderDialogs()}
                {toast && <FloatingToast {...toast} onClose={() => setToast(null)} />}
            </div>
        );
    }

    return (
        <div className="boxes-page-v26 animate-fade-in">
            <PageHeader
                title={t('boxes.title')}
                description={t('boxes.description_v2', { defaultValue: 'Keep grouped items findable with one box, one place, and one quick scan.' })}
                meta={[t('boxes.active_count', { count: boxes.filter((candidate) => !candidate.archived).length, defaultValue: '{{count}} active boxes' })]}
                actions={<button type="button" onClick={openCreate} className="btn-primary"><Plus className="h-4 w-4" /> {t('boxes.new_box')}</button>}
            />

            <section className="box-list-tools-v26">
                <label className="box-search-v26 box-list-search-v26">
                    <Search className="h-4 w-4" />
                    <span className="sr-only">{t('boxes.search')}</span>
                    <input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder={t('boxes.search')} />
                    {listSearch && <button type="button" onClick={() => setListSearch('')} aria-label={t('common.clear')}><X className="h-4 w-4" /></button>}
                </label>
                <div className="box-archive-tabs-v26" role="group" aria-label={t('boxes.archive_view', { defaultValue: 'Box status' })}>
                    <button type="button" onClick={() => setArchiveView('active')} className={archiveView === 'active' ? 'is-active' : ''}>{t('boxes.active', { defaultValue: 'Active' })}</button>
                    <button type="button" onClick={() => setArchiveView('archived')} className={archiveView === 'archived' ? 'is-active' : ''}>{t('boxes.archived_badge')}</button>
                </div>
                <button type="button" onClick={() => setFiltersOpen((current) => !current)} className={filtersOpen || roomFilter || locationFilter || occupancy ? 'btn-primary' : 'btn-secondary'}>
                    <Filter className="h-4 w-4" /> {t('common.filter')} {(roomFilter || locationFilter || occupancy) && <span className="box-filter-dot-v26" />}
                </button>
                <details className="box-overflow-v26 box-tools-overflow-v26">
                    <summary aria-label={t('boxes.more_actions', { defaultValue: 'More box actions' })}><MoreHorizontal className="h-5 w-5" /></summary>
                    <div><Link to="/box-labels"><Printer className="h-4 w-4" /> {t('boxes.print_labels')}</Link></div>
                </details>
            </section>

            {filtersOpen && (
                <section className="box-advanced-filters-v26">
                    <label>
                        <span>{t('items.form.room')}</span>
                        <select value={roomFilter} onChange={(event) => { setRoomFilter(event.target.value); setLocationFilter(''); }} className="input-field">
                            <option value="">{t('inventory.all_rooms')}</option>
                            {rooms.map((room) => <option key={room.id} value={room.id}>{getRoomPresentation(room, currentLanguage).name}</option>)}
                        </select>
                    </label>
                    <label>
                        <span>{t('items.form.location')}</span>
                        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="input-field">
                            <option value="">{t('inventory.all_locations')}</option>
                            {locations.filter((location) => !roomFilter || String(location.room_id || '') === roomFilter).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                    </label>
                    <label>
                        <span>{t('boxes.occupancy', { defaultValue: 'Contents' })}</span>
                        <select value={occupancy} onChange={(event) => setOccupancy(event.target.value)} className="input-field">
                            <option value="">{t('boxes.all_occupancy')}</option>
                            <option value="nonempty">{t('boxes.nonempty')}</option>
                            <option value="empty">{t('boxes.empty')}</option>
                        </select>
                    </label>
                    {hasListFilters && <button type="button" onClick={clearListFilters} className="btn-secondary">{t('boxes.clear_filters', { defaultValue: 'Clear filters' })}</button>}
                </section>
            )}

            {visibleBoxes.length === 0 ? (
                <section className="box-empty-v26">
                    <Box className="h-11 w-11" />
                    <h2>
                        {hasListFilters
                            ? t('boxes.no_matches_title', { defaultValue: 'No boxes match' })
                            : archiveView === 'archived' ? t('boxes.no_archived_title') : t('boxes.empty_title')}
                    </h2>
                    <p>
                        {hasListFilters
                            ? t('boxes.no_matches_body', { defaultValue: 'Clear a filter or try another box name or code.' })
                            : archiveView === 'archived' ? t('boxes.no_archived_body') : t('boxes.empty_body_v2', { defaultValue: 'Create a box when a real group of items needs one. Nothing else in inventory changes.' })}
                    </p>
                    {hasListFilters
                        ? <button type="button" onClick={clearListFilters} className="btn-secondary">{t('boxes.clear_filters', { defaultValue: 'Clear filters' })}</button>
                        : archiveView === 'active' && <button type="button" onClick={openCreate} className="btn-primary"><Plus className="h-4 w-4" /> {t('boxes.new_box')}</button>}
                </section>
            ) : (
                <section className="box-list-v26">
                    {visibleBoxes.map((candidate) => {
                        const place = boxPlace(candidate);
                        return (
                            <article key={candidate.id}>
                                <Link to={`/organize/boxes/${candidate.id}`} className="box-list-main-v26">
                                    <span className="box-list-photo-v26">
                                        <SecureImage src={candidate.thumbnail_path || candidate.photo_path} alt="" className="h-full w-full object-cover" fallback={<Box className="h-6 w-6" />} />
                                    </span>
                                    <span className="box-list-copy-v26">
                                        <span className="box-list-title-v26">
                                            <strong>{candidate.name}</strong>
                                            <code>{candidate.code}</code>
                                            {!isBoxPublic(candidate) && (
                                                <em className="box-privacy-badge-v26 is-private">
                                                    <Lock className="h-3 w-3" /> {t('boxes.visibility_private')}
                                                </em>
                                            )}
                                        </span>
                                        <span className="box-list-place-v26"><MapPin className="h-3.5 w-3.5" /> {place || t('boxes.location_unknown')}</span>
                                    </span>
                                    <span className="box-list-count-v26"><strong>{getBoxItemCount(candidate)}</strong><small>{t('boxes.items_short', { defaultValue: 'items' })}</small></span>
                                    <ChevronRight className="h-5 w-5" />
                                </Link>
                                {(canManageBox(candidate) || candidate.can_archive || candidate.can_delete) && (
                                    <details className="box-overflow-v26 box-row-overflow-v26">
                                        <summary aria-label={t('boxes.more_actions_for', { name: candidate.name, defaultValue: 'More actions for {{name}}' })}><MoreHorizontal className="h-5 w-5" /></summary>
                                        <div>
                                            {canManageBox(candidate) && <button type="button" onClick={() => openEdit(candidate)}><Edit3 className="h-4 w-4" /> {t('common.edit')}</button>}
                                            {candidate.can_archive && (
                                                <button type="button" onClick={() => void toggleArchive(candidate)}>
                                                    {candidate.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                                    {candidate.archived ? t('boxes.restore') : t('boxes.archive')}
                                                </button>
                                            )}
                                            {candidate.can_delete && <button type="button" onClick={() => openDelete(candidate)} className="is-danger"><Trash2 className="h-4 w-4" /> {t('common.delete')}</button>}
                                        </div>
                                    </details>
                                )}
                            </article>
                        );
                    })}
                </section>
            )}
            {renderDialogs()}
            {toast && <FloatingToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}
