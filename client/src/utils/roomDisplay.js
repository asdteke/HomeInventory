import i18n from '../i18n';
import { ROOM_ALIAS_TO_ID, normalizeAliasText } from './defaultEntityAliases';

const ROOM_DEFAULTS = [
    {
        id: 'living_room',
        tr: { name: 'Oturma Odası', description: 'Ana yaşam alanı' },
        fallback: { name: 'Living Room', description: 'Main everyday living area' }
    },
    {
        id: 'bedroom',
        tr: { name: 'Yatak Odası', description: 'Uyku ve dinlenme alanı' },
        fallback: { name: 'Bedroom', description: 'Sleeping and rest area' }
    },
    {
        id: 'kitchen',
        tr: { name: 'Mutfak', description: 'Yemek hazırlama alanı' },
        fallback: { name: 'Kitchen', description: 'Food preparation area' }
    },
    {
        id: 'bathroom',
        tr: { name: 'Banyo', description: 'Temizlik ve bakım alanı' },
        fallback: { name: 'Bathroom', description: 'Cleaning and care area' }
    },
    {
        id: 'office',
        tr: { name: 'Çalışma Odası', description: 'Ofis ve çalışma alanı' },
        fallback: { name: 'Office', description: 'Focused work area' }
    },
    {
        id: 'kids_room',
        tr: { name: 'Çocuk Odası', description: 'Çocuklar için oda' },
        fallback: { name: 'Kids Room', description: 'Children’s room' }
    },
    {
        id: 'garage',
        tr: { name: 'Garaj', description: 'Araç ve depolama alanı' },
        fallback: { name: 'Garage', description: 'Vehicle and storage area' }
    },
    {
        id: 'balcony',
        tr: { name: 'Balkon', description: 'Dış mekan alanı' },
        fallback: { name: 'Balcony', description: 'Outdoor extension area' }
    },
    {
        id: 'storage',
        tr: { name: 'Depo', description: 'Genel depolama alanı' },
        fallback: { name: 'Storage', description: 'General storage area' }
    }
];

const ROOM_LEGACY_LOOKUP = new Map();

for (const room of ROOM_DEFAULTS) {
    ROOM_LEGACY_LOOKUP.set(`${room.tr.name}|${room.tr.description}`, room);
    ROOM_LEGACY_LOOKUP.set(`${room.fallback.name}|${room.fallback.description}`, room);
}

function normalizeLanguageCode(language) {
    return String(language || '')
        .split('-')[0]
        .trim()
        .toLowerCase();
}

function getRoomFallback(roomDefault, language) {
    return normalizeLanguageCode(language) === 'tr' ? roomDefault.tr : roomDefault.fallback;
}

export function getRoomPresentation(room, language) {
    const rawName = String(room?.name || '').trim();
    const rawDescription = String(room?.description || '').trim();
    const normalizedName = normalizeAliasText(rawName);
    const roomDefaultId = ROOM_ALIAS_TO_ID[normalizedName];
    const roomDefault = roomDefaultId
        ? ROOM_DEFAULTS.find((entry) => entry.id === roomDefaultId)
        : ROOM_LEGACY_LOOKUP.get(`${rawName}|${rawDescription}`);

    if (!roomDefault) {
        return {
            name: rawName,
            description: rawDescription
        };
    }

    const t = i18n.getFixedT(language);
    const fallback = getRoomFallback(roomDefault, language);

    return {
        name: t(`rooms.defaults.${roomDefault.id}.name`, { defaultValue: fallback.name }),
        description: t(`rooms.defaults.${roomDefault.id}.description`, { defaultValue: fallback.description })
    };
}
