import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Camera, ChevronDown, Globe, ImagePlus, Lock, MapPin, Trash2 } from 'lucide-react';
import ModalDialog from './ModalDialog';
import SecureImage from './SecureImage';
import CreatableLocationSelect from './CreatableLocationSelect';
import { getRoomPresentation } from '../utils/roomDisplay';

export interface BoxRecord {
    id: number;
    name: string;
    code: string;
    note?: string | null;
    room_id?: number | null;
    room_name?: string | null;
    location_id?: number | null;
    location_name?: string | null;
    location_is_public?: boolean | number;
    photo_path?: string | null;
    thumbnail_path?: string | null;
    archived?: boolean;
    updated_at?: string;
    item_count?: number;
    total_item_count?: number;
    visible_item_count?: number;
    hidden_item_count?: number;
    is_public?: boolean | number;
    can_manage?: boolean;
    can_edit?: boolean;
    can_archive?: boolean;
    can_delete?: boolean;
    created_by_current_user?: boolean;
}

interface BoxEditorDialogProps {
    open: boolean;
    box?: BoxRecord | null;
    boxes: BoxRecord[];
    rooms: any[];
    locations: any[];
    saving: boolean;
    onClose: () => void;
    onSave: (payload: FormData) => Promise<void>;
    onLocationCreated: (location: any) => void;
    onError: (message: string) => void;
}

const EMPTY_FORM = {
    name: '',
    code: '',
    note: '',
    room_id: '',
    location_id: '',
    is_public: true
};

function normalizeCode(value: string) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleUpperCase('en-US')
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 24);
}

function isLocationPublic(location: any) {
    return location?.is_public === undefined ? true : Boolean(location.is_public);
}

function suggestCode(name: string, boxes: BoxRecord[], editingId?: number) {
    const words = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleUpperCase('en-US')
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const seed = normalizeCode(words.length > 1
        ? words.map((word) => word[0]).join('').slice(0, 5)
        : (words[0] || 'BOX').slice(0, 6)) || 'BOX';
    const used = new Set(boxes.filter((candidate) => candidate.id !== editingId).map((candidate) => candidate.code));
    if (!used.has(seed)) return seed;
    for (let index = 2; index < 1000; index += 1) {
        const suffix = `-${index}`;
        const candidate = `${seed.slice(0, 24 - suffix.length)}${suffix}`;
        if (!used.has(candidate)) return candidate;
    }
    return `${seed.slice(0, 17)}-${Date.now().toString().slice(-6)}`;
}

export default function BoxEditorDialog({
    open,
    box,
    boxes,
    rooms,
    locations,
    saving,
    onClose,
    onSave,
    onLocationCreated,
    onError
}: BoxEditorDialogProps) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language;
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [codeEdited, setCodeEdited] = useState(false);
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [locationPrivacyNotice, setLocationPrivacyNotice] = useState(false);
    const [shareConfirmed, setShareConfirmed] = useState(false);

    useEffect(() => {
        if (!open) return;
        const boxIsPublic = box?.is_public === undefined ? true : Boolean(box.is_public);
        const selectedLocation = locations.find((location) => (
            String(location.id) === String(box?.location_id || '')
        ));
        const shouldClearPrivateLocation = Boolean(
            boxIsPublic && selectedLocation && !isLocationPublic(selectedLocation)
        );
        setForm({
            name: box?.name || '',
            code: box?.code || '',
            note: box?.note || '',
            room_id: box?.room_id ? String(box.room_id) : '',
            location_id: box?.location_id && !shouldClearPrivateLocation ? String(box.location_id) : '',
            is_public: boxIsPublic
        });
        setCodeEdited(Boolean(box));
        setPhoto(null);
        setPhotoPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        setRemovePhoto(false);
        setLocationPrivacyNotice(shouldClearPrivateLocation);
        setShareConfirmed(false);
    }, [box, open]);

    useEffect(() => () => {
        if (photoPreview) URL.revokeObjectURL(photoPreview);
    }, [photoPreview]);

    const availableLocations = useMemo(() => (
        form.room_id
            ? locations.filter((location) => (
                String(location.room_id || '') === form.room_id
                && (!form.is_public || isLocationPublic(location))
            ))
            : []
    ), [form.is_public, form.room_id, locations]);

    const selectPhoto = (file?: File | null) => {
        if (!file) return;
        setPhoto(file);
        setRemovePhoto(false);
        setPhotoPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
        });
    };

    const clearPhoto = () => {
        setPhoto(null);
        setPhotoPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        setRemovePhoto(Boolean(box?.photo_path));
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const isSharingPrivateBox = Boolean(
            box
            && box.is_public !== undefined
            && !Boolean(box.is_public)
            && form.is_public
        );
        if (!form.name.trim() || !form.code.trim() || saving || (isSharingPrivateBox && !shareConfirmed)) return;
        const payload = new FormData();
        Object.entries(form).forEach(([key, value]) => payload.append(key, String(value)));
        if (photo) payload.append('photo', photo);
        if (box) {
            payload.append('remove_photo', removePhoto ? 'true' : 'false');
            if (box.updated_at) payload.append('expected_updated_at', box.updated_at);
        }
        await onSave(payload);
    };

    const isSharingPrivateBox = Boolean(
        box
        && box.is_public !== undefined
        && !Boolean(box.is_public)
        && form.is_public
    );
    const canChangeVisibility = !box || box.created_by_current_user !== false;

    return (
        <ModalDialog
            isOpen={open}
            title={box ? t('boxes.edit_title') : t('boxes.create_title')}
            description={t('boxes.form_description_v2', { defaultValue: 'Give the box a clear name and place. Everything else is optional.' })}
            onClose={onClose}
            icon={Box}
            widthClassName="max-w-2xl"
            footer={(
                <>
                    <button type="button" onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
                    <button
                        type="submit"
                        form="box-editor-form"
                        disabled={saving || !form.name.trim() || !form.code.trim() || (isSharingPrivateBox && !shareConfirmed)}
                        className="btn-primary"
                    >
                        {saving ? t('common.loading') : t('common.save')}
                    </button>
                </>
            )}
        >
            <form id="box-editor-form" onSubmit={submit} className="box-editor-v26">
                <div className="box-editor-primary-v26">
                    <label className="block">
                        <span className="box-field-label-v26">{t('boxes.name')}</span>
                        <input
                            autoFocus
                            value={form.name}
                            onChange={(event) => {
                                const name = event.target.value;
                                setForm((current) => ({
                                    ...current,
                                    name,
                                    code: codeEdited ? current.code : suggestCode(name, boxes, box?.id)
                                }));
                            }}
                            className="input-field"
                            maxLength={120}
                            placeholder={t('boxes.name_placeholder', { defaultValue: 'e.g. Winter clothes' })}
                            required
                        />
                    </label>

                    <fieldset className="box-visibility-picker-v26">
                        <legend className="box-field-label-v26">{t('boxes.visibility_label')}</legend>
                        <div>
                            <label className={form.is_public ? 'is-selected' : ''}>
                                <input
                                    type="radio"
                                    name="box_visibility"
                                    value="shared"
                                    checked={form.is_public}
                                    disabled={!canChangeVisibility}
                                    onChange={() => {
                                        const selectedLocation = locations.find((location) => (
                                            String(location.id) === String(form.location_id)
                                        ));
                                        const shouldClearLocation = Boolean(selectedLocation && !isLocationPublic(selectedLocation));
                                        setForm((current) => ({
                                            ...current,
                                            is_public: true,
                                            location_id: shouldClearLocation ? '' : current.location_id
                                        }));
                                        setLocationPrivacyNotice(shouldClearLocation);
                                        setShareConfirmed(false);
                                    }}
                                />
                                <span className="box-visibility-icon-v26"><Globe className="h-4 w-4" /></span>
                                <span>
                                    <strong>{t('boxes.visibility_shared')}</strong>
                                    <small>{t('boxes.visibility_shared_help')}</small>
                                </span>
                            </label>
                            <label className={!form.is_public ? 'is-selected' : ''}>
                                <input
                                    type="radio"
                                    name="box_visibility"
                                    value="private"
                                    checked={!form.is_public}
                                    disabled={!canChangeVisibility}
                                    onChange={() => {
                                        setForm((current) => ({ ...current, is_public: false }));
                                        setLocationPrivacyNotice(false);
                                        setShareConfirmed(false);
                                    }}
                                />
                                <span className="box-visibility-icon-v26"><Lock className="h-4 w-4" /></span>
                                <span>
                                    <strong>{t('boxes.visibility_private')}</strong>
                                    <small>{t('boxes.visibility_private_help')}</small>
                                </span>
                            </label>
                        </div>
                        {box && Number(box.total_item_count || 0) > 0 && (
                            <p>{t('boxes.visibility_change_help')}</p>
                        )}
                        {locationPrivacyNotice && (
                            <p className="is-notice">{t('boxes.private_location_cleared')}</p>
                        )}
                        {isSharingPrivateBox && (
                            <label className="box-share-confirm-v26">
                                <input
                                    type="checkbox"
                                    checked={shareConfirmed}
                                    onChange={(event) => setShareConfirmed(event.target.checked)}
                                />
                                <span>{t('boxes.share_confirmation')}</span>
                            </label>
                        )}
                    </fieldset>

                    <div className="box-placement-v26">
                        <span className="box-field-label-v26"><MapPin className="h-4 w-4" /> {t('boxes.last_known_place', { defaultValue: 'Location' })}</span>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label>
                                <span className="sr-only">{t('items.form.room')}</span>
                                <select
                                    value={form.room_id}
                                    onChange={(event) => {
                                        setForm((current) => ({ ...current, room_id: event.target.value, location_id: '' }));
                                        setLocationPrivacyNotice(false);
                                    }}
                                    className="input-field"
                                >
                                    <option value="">{t('boxes.no_room')}</option>
                                    {rooms.map((room) => <option key={room.id} value={room.id}>{getRoomPresentation(room, currentLanguage).name}</option>)}
                                </select>
                            </label>
                            <CreatableLocationSelect
                                roomId={form.room_id}
                                value={form.location_id}
                                locations={availableLocations}
                                allowPrivate={!form.is_public}
                                onChange={(locationId) => {
                                    setForm((current) => ({ ...current, location_id: locationId }));
                                    setLocationPrivacyNotice(false);
                                }}
                                onCreated={(location) => {
                                    onLocationCreated(location);
                                    setForm((current) => ({ ...current, location_id: String(location.id) }));
                                }}
                                onError={onError}
                            />
                        </div>
                    </div>

                    <div>
                        <span className="box-field-label-v26">{t('boxes.photo')}</span>
                        <div className="box-photo-picker-v26">
                            <div className="box-photo-preview-v26">
                                {photoPreview ? (
                                    <img src={photoPreview} alt={t('boxes.photo')} />
                                ) : box?.photo_path && !removePhoto ? (
                                    <SecureImage src={box.photo_path} alt={box.name} className="h-full w-full object-cover" />
                                ) : (
                                    <ImagePlus className="h-7 w-7" />
                                )}
                            </div>
                            <div className="box-photo-actions-v26">
                                <button type="button" onClick={() => cameraInputRef.current?.click()} className="btn-secondary">
                                    <Camera className="h-4 w-4" /> {t('items.form.take_photo')}
                                </button>
                                <button type="button" onClick={() => galleryInputRef.current?.click()} className="btn-secondary">
                                    <ImagePlus className="h-4 w-4" /> {t('items.form.choose_from_gallery')}
                                </button>
                                {(photo || (box?.photo_path && !removePhoto)) && (
                                    <button type="button" onClick={clearPhoto} className="box-inline-danger-v26">
                                        <Trash2 className="h-4 w-4" /> {t('items.form.remove_photo')}
                                    </button>
                                )}
                            </div>
                        </div>
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
                        <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
                    </div>
                </div>

                <details className="box-editor-more-v26">
                    <summary>
                        <span>{t('boxes.more_details', { defaultValue: 'More details' })}</span>
                        <ChevronDown className="h-4 w-4" />
                    </summary>
                    <div className="box-editor-more-body-v26">
                        <label className="block">
                            <span className="box-field-label-v26">{t('boxes.code')}</span>
                            <input
                                value={form.code}
                                onChange={(event) => {
                                    setCodeEdited(true);
                                    setForm((current) => ({ ...current, code: normalizeCode(event.target.value) }));
                                }}
                                className="input-field font-mono uppercase"
                                maxLength={24}
                                required
                            />
                            <small>{t('boxes.code_help', { defaultValue: 'Printed on the label; generated automatically and editable.' })}</small>
                        </label>
                        <label className="block">
                            <span className="box-field-label-v26">{t('boxes.note')}</span>
                            <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className="input-field min-h-20" maxLength={1000} />
                        </label>
                    </div>
                </details>
            </form>
        </ModalDialog>
    );
}
