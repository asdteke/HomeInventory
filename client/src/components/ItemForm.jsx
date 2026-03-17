import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Camera, X, Lock, Globe, MapPin, Plus, Loader2, ChevronDown, Check, QrCode, ScanBarcode, Search, ExternalLink } from 'lucide-react';
import ItemQRCode from './ItemQRCode';
import BarcodeScanner from './BarcodeScanner';
import SecureImage from './SecureImage';

export default function ItemForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const isEditing = Boolean(id);

    const [formData, setFormData] = useState({
        name: '', description: '', quantity: 1, category_id: '', room_id: '', location_id: '', is_public: true, barcode: ''
    });
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [existingPhoto, setExistingPhoto] = useState(null);
    const [categories, setCategories] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [locations, setLocations] = useState([]);

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

    useEffect(() => { fetchOptions(); if (isEditing) fetchItem(); }, [id]);
    useEffect(() => {
        if (formData.room_id) {
            fetchLocations();
            setFormData(prev => ({ ...prev, location_id: '' }));
            setLocationSearch('');
        } else {
            setLocations([]);
        }
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

    const fetchOptions = async () => {
        try {
            const [catRes, roomRes] = await Promise.all([axios.get('/api/categories'), axios.get('/api/rooms')]);
            setCategories(catRes.data.categories);
            setRooms(roomRes.data.rooms);
        } catch (e) { console.error(e); }
    };

    const fetchLocations = async () => {
        try {
            const res = await axios.get(`/api/locations?room_id=${formData.room_id}`);
            setLocations(res.data.locations);
        } catch (e) { console.error(e); }
    };

    const fetchItem = async () => {
        try {
            const res = await axios.get(`/api/items/${id}`);
            const item = res.data.item;
            setFormData({
                name: item.name, description: item.description || '', quantity: item.quantity,
                category_id: item.category_id || '', room_id: item.room_id || '',
                location_id: item.location_id || '', is_public: item.is_public === 1, barcode: item.barcode || ''
            });
            if (item.photo_path) setExistingPhoto(item.photo_path);
            if (item.location_name) setLocationSearch(item.location_name);
        } catch (e) { setError(t('items.load_error')); }
        finally { setFetching(false); }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'room_id') {
            setFormData({ ...formData, [name]: value, location_id: '' });
            setLocationSearch('');
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setPhoto(null); setPhotoPreview(null); setExistingPhoto(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
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
            const res = await axios.post('/api/locations', {
                name: locationSearch.trim(),
                room_id: formData.room_id,
                is_public: newLocationPublic
            });
            const newLoc = res.data.location;
            setLocations([...locations, newLoc]);
            setFormData({ ...formData, location_id: newLoc.id });
            setShowLocationDropdown(false);
            setIsCreatingLocation(false);
            setNewLocationPublic(false);
        } catch (e) {
            alert(e.response?.data?.error || t('items.messages.location_add_error'));
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

    // Quick add - save item with just barcode for later editing
    const handleQuickAdd = async (barcode) => {
        try {
            const data = new FormData();
            data.append('name', `Bilinmeyen Ürün - ${barcode}`);
            data.append('barcode', barcode);
            data.append('quantity', '1');
            data.append('is_public', 'true');
            data.append('description', t('items.messages.quick_add_success', { barcode }));

            await axios.post('/api/items', data, { headers: { 'Content-Type': 'multipart/form-data' } });
            setBarcodeMessage(t('items.messages.quick_add_success', { barcode }));
        } catch (err) {
            console.error('Quick add error:', err);
            setBarcodeMessage(t('items.messages.quick_add_fail'));
        }
    };

    // Manual barcode search - uses backend proxy with waterfall API + Google scraper
    const handleManualBarcodeSearch = async () => {
        if (!formData.barcode) return;

        setSearchingBarcode(true);
        setBarcodeMessage(t('items.messages.searching'));

        const barcode = formData.barcode.trim();

        try {
            // Use backend proxy for waterfall lookup
            const response = await axios.get(`/api/barcode/${barcode}`);
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

        // Prevent double submission
        if (loading) return;

        if (!formData.name.trim()) { setError(t('items.messages.name_required')); return; }
        setError(''); setLoading(true);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            if (photo) data.append('photo', photo);

            const config = { headers: { 'Content-Type': 'multipart/form-data' } };

            if (isEditing) {
                await axios.put(`/api/items/${id}`, data, config);
            } else {
                await axios.post('/api/items', data, config);
                // Clear form state after successful creation
                setFormData({ name: '', description: '', quantity: 1, category_id: '', room_id: '', location_id: '', is_public: true, barcode: '' });
                setPhoto(null);
                setPhotoPreview(null);
            }

            navigate('/items');
        } catch (err) {
            setError(err.response?.data?.error || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <div className="flex justify-center py-20"><div className="spinner"></div></div>;

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEditing ? t('items.title_edit') : t('items.title_new')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('items.subtitle')}</p>
                </div>
            </div>

            <div className="card">
                {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Item Privacy Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            {formData.is_public ? <Globe className="w-5 h-5 text-green-500" /> : <Lock className="w-5 h-5 text-amber-500" />}
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('items.form.visibility')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {formData.is_public ? t('items.form.visibility_public') : t('items.form.visibility_private')}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setFormData({ ...formData, is_public: !formData.is_public })}
                            className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${formData.is_public ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${formData.is_public ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    {/* Photo Upload */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.photo')}</label>
                        <div className="flex items-start gap-4">
                            <div onClick={() => fileInputRef.current?.click()}
                                className="w-32 h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary-500 transition-colors">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                                ) : existingPhoto ? (
                                    <SecureImage
                                        src={existingPhoto}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        fallback={
                                            <div className="text-center">
                                                <Camera className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                                                <span className="text-xs text-slate-400">{t('items.form.add_photo')}</span>
                                            </div>
                                        }
                                    />
                                ) : (
                                    <div className="text-center">
                                        <Camera className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                                        <span className="text-xs text-slate-400">{t('items.form.add_photo')}</span>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                            {(photoPreview || existingPhoto) && (
                                <button type="button" onClick={handleRemovePhoto} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Name with Barcode Scanner */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.name')} <span className="text-red-500">{t('items.form.required')}</span></label>
                        <div className="flex gap-2">
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-field flex-1" placeholder={t('items.form.name_placeholder')} required />
                            <button type="button" onClick={() => setShowBarcodeScanner(true)}
                                className="px-4 py-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-2"
                                title={t('items.form.scan_barcode')}>
                                <ScanBarcode className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Barcode Field with Manual Search */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {t('items.form.barcode')} <span className="text-slate-400 font-normal">{t('items.form.barcode_optional')}</span>
                        </label>
                        <div className="flex gap-2">
                            <input type="text" name="barcode" value={formData.barcode} onChange={(e) => {
                                handleChange(e);
                                setBarcodeMessage('');
                            }}
                                className="input-field flex-1 font-mono" placeholder={t('items.form.barcode_placeholder')} />
                            <button type="button" onClick={handleManualBarcodeSearch}
                                disabled={!formData.barcode || searchingBarcode}
                                className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                                title={t('items.form.search_db')}>
                                {searchingBarcode ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                            </button>
                            {formData.barcode && (
                                <a href={`https://www.google.com/search?q=${formData.barcode}`} target="_blank" rel="noopener noreferrer"
                                    className="px-3 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
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
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('items.form.barcode_saved')}</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.description')}</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} className="input-field min-h-[100px] resize-none" placeholder={t('items.form.description_placeholder')} rows={3} />
                    </div>

                    {/* Quantity & Category */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.quantity')}</label>
                            <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className="input-field" min="1" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.category')}</label>
                            <select name="category_id" value={formData.category_id} onChange={handleChange} className="input-field">
                                <option value="">{t('items.form.select_category')}</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Room Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('items.form.room')}</label>
                        <select name="room_id" value={formData.room_id} onChange={handleChange} className="input-field">
                            <option value="">{t('items.form.select_room')}</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    {/* Smart Sub-Location Selector */}
                    {formData.room_id && (
                        <div className="p-4 rounded-xl bg-gradient-to-br from-primary-50 to-purple-50 dark:from-slate-800 dark:to-slate-800 border border-primary-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-3">
                                <MapPin className="w-4 h-4 text-primary-500" />
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {t('items.form.location_details')} <span className="text-slate-400 font-normal">{t('items.form.location_optional')}</span>
                                </label>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
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
                                            <button type="button" onClick={handleClearLocation} className="p-1 text-slate-400 hover:text-slate-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showLocationDropdown ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>

                                {/* Dropdown */}
                                {showLocationDropdown && (
                                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-64 overflow-auto">
                                        {filteredLocations.length > 0 && (
                                            <div className="p-1">
                                                {filteredLocations.map(loc => (
                                                    <button
                                                        key={loc.id}
                                                        type="button"
                                                        onClick={() => handleSelectLocation(loc)}
                                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors
                              ${formData.location_id === loc.id
                                                                ? 'bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300'
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <MapPin className="w-4 h-4 text-slate-400" />
                                                            {loc.name}
                                                        </span>
                                                        <span className="flex items-center gap-2">
                                                            {loc.is_public ? (
                                                                <Globe className="w-3.5 h-3.5 text-green-500" />
                                                            ) : (
                                                                <Lock className="w-3.5 h-3.5 text-amber-500" />
                                                            )}
                                                            {formData.location_id === loc.id && <Check className="w-4 h-4 text-primary-500" />}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Create new location option */}
                                        {locationSearch.trim() && !exactMatch && (
                                            <>
                                                {filteredLocations.length > 0 && <div className="border-t border-slate-200 dark:border-slate-700" />}

                                                {!isCreatingLocation ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsCreatingLocation(true)}
                                                        className="w-full flex items-center gap-2 px-3 py-3 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        <span>{t('items.form.location_create', { name: locationSearch })}</span>
                                                    </button>
                                                ) : (
                                                    <div className="p-3 space-y-3">
                                                        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="w-4 h-4 text-primary-500" />
                                                                <span className="font-medium text-slate-900 dark:text-white">{locationSearch}</span>
                                                            </div>
                                                        </div>

                                                        {/* Location Privacy Toggle */}
                                                        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                                            <div className="flex items-center gap-2">
                                                                {newLocationPublic ? (
                                                                    <Globe className="w-4 h-4 text-green-500" />
                                                                ) : (
                                                                    <Lock className="w-4 h-4 text-amber-500" />
                                                                )}
                                                                <div>
                                                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('items.form.location_privacy')}</p>
                                                                    <p className="text-xs text-slate-500">
                                                                        {newLocationPublic ? t('items.form.location_public') : t('items.form.location_private')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNewLocationPublic(!newLocationPublic)}
                                                                className={`relative w-12 h-6 rounded-full transition-colors ${newLocationPublic ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                                            >
                                                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newLocationPublic ? 'left-6' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={handleCreateLocation}
                                                                disabled={savingLocation}
                                                                className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
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
                                            <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                                                {t('items.form.location_empty')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Selected location indicator */}
                            {formData.location_id && (
                                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300">
                                    <Check className="w-4 h-4" />
                                    <span className="text-sm font-medium">{t('items.form.location_selected', { name: locationSearch })}</span>
                                    <button type="button" onClick={handleClearLocation} className="ml-auto p-1 hover:bg-primary-200 dark:hover:bg-primary-500/30 rounded">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Submit */}
                    <div className="flex gap-3 pt-4">
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
                <div className="mt-6 card">
                    <div className="flex items-center gap-3 mb-4">
                        <QrCode className="w-5 h-5 text-primary-500" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('items.qrcode.title')}</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        {t('items.qrcode.desc')}
                    </p>
                    <ItemQRCode itemId={id} itemName={formData.name} />
                </div>
            )}

            {/* Barcode Scanner Modal */}
            <BarcodeScanner
                isOpen={showBarcodeScanner}
                onClose={() => setShowBarcodeScanner(false)}
                onProductFound={handleProductFound}
                onBarcodeOnly={handleBarcodeOnly}
                onQuickAdd={handleQuickAdd}
            />
        </div>
    );
}
