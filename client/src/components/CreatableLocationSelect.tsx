import { useEffect, useId, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Check, ChevronDown, Globe, Loader2, Lock, MapPin, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CreatableLocationSelectProps {
    roomId?: string | number | null;
    value?: string | number | null;
    locations: any[];
    allowPrivate: boolean;
    onChange: (locationId: string) => void;
    onCreated: (location: any) => void;
    onError: (message: string) => void;
}

export default function CreatableLocationSelect({
    roomId,
    value,
    locations,
    allowPrivate,
    onChange,
    onCreated,
    onError
}: CreatableLocationSelectProps) {
    const { t } = useTranslation();
    const listboxId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newLocationPublic, setNewLocationPublic] = useState(!allowPrivate);
    const [saving, setSaving] = useState(false);

    const selectedLocation = useMemo(() => (
        locations.find((location) => String(location.id) === String(value || ''))
    ), [locations, value]);
    const selectedName = selectedLocation?.name || '';
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filteredLocations = useMemo(() => (
        locations.filter((location) => (
            !normalizedSearch
            || String(location.name || '').toLocaleLowerCase().includes(normalizedSearch)
        ))
    ), [locations, normalizedSearch]);
    const exactMatch = locations.some((location) => (
        String(location.name || '').trim().toLocaleLowerCase() === normalizedSearch
    ));

    useEffect(() => {
        setOpen(false);
        setSearch('');
        setCreating(false);
        setNewLocationPublic(!allowPrivate);
    }, [roomId]);

    useEffect(() => {
        if (!open) setSearch(selectedName);
    }, [open, selectedName]);

    useEffect(() => {
        if (!allowPrivate) setNewLocationPublic(true);
    }, [allowPrivate]);

    const close = (restoreSelection = true) => {
        if (saving) return;
        setOpen(false);
        setCreating(false);
        if (restoreSelection) setSearch(selectedName);
    };

    const createLocation = async () => {
        const nextName = search.trim();
        if (!nextName || !roomId || saving) return;
        setSaving(true);
        try {
            const response = await axios.post('/api/locations', {
                name: nextName,
                room_id: roomId,
                is_public: allowPrivate ? newLocationPublic : true
            });
            const newLocation = response.data.location;
            setSearch(newLocation.name);
            setOpen(false);
            setCreating(false);
            onCreated(newLocation);
        } catch {
            onError(t('items.messages.location_add_error'));
        } finally {
            setSaving(false);
        }
    };

    if (!roomId) return null;

    return (
        <div
            ref={rootRef}
            className="box-location-combobox-v26"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
            }}
        >
            <div className="box-location-combobox-input-v26">
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setOpen(true);
                        setCreating(false);
                        if (value) onChange('');
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            close();
                        }
                    }}
                    className="input-field"
                    placeholder={t('items.form.location_placeholder')}
                    aria-label={t('items.form.location')}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    maxLength={120}
                />
                <span className="box-location-combobox-actions-v26">
                    {search && (
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setSearch('');
                                setCreating(false);
                                setOpen(true);
                                inputRef.current?.focus();
                            }}
                            aria-label={t('common.clear')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setOpen((current) => !current);
                            inputRef.current?.focus();
                        }}
                        aria-label={t('items.form.location')}
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </span>
            </div>

            {open && (
                <div id={listboxId} role="listbox" className="box-location-combobox-menu-v26">
                    {!creating && filteredLocations.length > 0 && (
                        <div className="box-location-options-v26">
                            {filteredLocations.map((location) => {
                                const selected = String(location.id) === String(value || '');
                                const locationPublic = location.is_public === undefined || Boolean(location.is_public);
                                return (
                                    <button
                                        key={location.id}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        className={selected ? 'is-selected' : ''}
                                        onClick={() => {
                                            onChange(String(location.id));
                                            setSearch(location.name);
                                            setCreating(false);
                                            setOpen(false);
                                        }}
                                    >
                                        <span><MapPin className="h-4 w-4" /> {location.name}</span>
                                        <span>
                                            {locationPublic
                                                ? <Globe className="h-3.5 w-3.5" />
                                                : <Lock className="h-3.5 w-3.5" />}
                                            {selected && <Check className="h-4 w-4" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {!creating && normalizedSearch && !exactMatch && (
                        <button
                            type="button"
                            className="box-location-create-option-v26"
                            onClick={() => setCreating(true)}
                        >
                            <Plus className="h-4 w-4" />
                            {t('items.form.location_create', { name: search.trim() })}
                        </button>
                    )}

                    {!creating && filteredLocations.length === 0 && !normalizedSearch && (
                        <p className="box-location-empty-v26">{t('items.form.location_empty')}</p>
                    )}

                    {creating && (
                        <div className="box-location-create-panel-v26">
                            <div className="box-location-create-name-v26">
                                <MapPin className="h-4 w-4" />
                                <strong>{search.trim()}</strong>
                            </div>
                            <div className="box-location-privacy-v26">
                                <span className={newLocationPublic ? 'is-shared' : 'is-private'}>
                                    {newLocationPublic
                                        ? <Globe className="h-4 w-4" />
                                        : <Lock className="h-4 w-4" />}
                                </span>
                                <span>
                                    <strong>{t('items.form.location_privacy')}</strong>
                                    <small>
                                        {newLocationPublic
                                            ? t('items.form.location_public')
                                            : t('items.form.location_private')}
                                    </small>
                                </span>
                                {allowPrivate && (
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={newLocationPublic}
                                        aria-label={t('items.form.location_privacy')}
                                        className={`box-location-privacy-switch-v26 ${newLocationPublic ? 'is-shared' : ''}`}
                                        onClick={() => setNewLocationPublic((current) => !current)}
                                    >
                                        <span />
                                    </button>
                                )}
                            </div>
                            <div className="box-location-create-actions-v26">
                                <button
                                    type="button"
                                    onClick={() => void createLocation()}
                                    disabled={saving}
                                    className="btn-primary"
                                >
                                    {saving
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Plus className="h-4 w-4" />}
                                    {saving ? t('items.form.location_saving') : t('items.form.location_save')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreating(false)}
                                    disabled={saving}
                                    className="btn-secondary"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
