import { decryptFromStorage, encryptForStorage, hashLookupToken } from './encryption.js';

export const ITEM_NAME_PURPOSE = 'inventory.item.name';
export const ITEM_DESCRIPTION_PURPOSE = 'inventory.item.description';
export const ITEM_BARCODE_PURPOSE = 'inventory.item.barcode';
export const ROOM_NAME_PURPOSE = 'inventory.room.name';
export const ROOM_DESCRIPTION_PURPOSE = 'inventory.room.description';
export const LOCATION_NAME_PURPOSE = 'inventory.location.name';
export const CATEGORY_NAME_PURPOSE = 'inventory.category.name';
export const USERNAME_PURPOSE = 'identity.username';
export const EMAIL_PURPOSE = 'identity.email';
export const HOUSE_NAME_PURPOSE = 'inventory.house.name';

function compareDisplayText(left, right) {
    return String(left || '').localeCompare(String(right || ''), undefined, {
        sensitivity: 'base'
    });
}

function normalizeLookupValue(value) {
    return String(value || '').trim();
}

export function normalizeEmailForLookup(value) {
    return normalizeLookupValue(value).toLowerCase();
}

export function normalizeUsernameForLookup(value) {
    return normalizeLookupValue(value);
}

export function normalizeBarcodeForLookup(value) {
    return normalizeLookupValue(value);
}

export function buildEmailLookup(value) {
    const normalized = normalizeEmailForLookup(value);
    return normalized ? hashLookupToken(normalized) : null;
}

export function buildUsernameLookup(value) {
    const normalized = normalizeUsernameForLookup(value);
    return normalized ? hashLookupToken(normalized) : null;
}

export function buildBarcodeLookup(value) {
    const normalized = normalizeBarcodeForLookup(value);
    return normalized ? hashLookupToken(normalized) : null;
}

export function encryptItemName(value) {
    return encryptForStorage(value, { purpose: ITEM_NAME_PURPOSE });
}

export function decryptItemName(value) {
    return decryptFromStorage(value, { purpose: ITEM_NAME_PURPOSE });
}

export function encryptItemDescription(value) {
    return encryptForStorage(value, { purpose: ITEM_DESCRIPTION_PURPOSE });
}

export function decryptItemDescription(value) {
    return decryptFromStorage(value, { purpose: ITEM_DESCRIPTION_PURPOSE });
}

export function encryptItemBarcode(value) {
    return encryptForStorage(value, { purpose: ITEM_BARCODE_PURPOSE });
}

export function decryptItemBarcode(value) {
    return decryptFromStorage(value, { purpose: ITEM_BARCODE_PURPOSE });
}

export function encryptRoomName(value) {
    return encryptForStorage(value, { purpose: ROOM_NAME_PURPOSE });
}

export function decryptRoomName(value) {
    return decryptFromStorage(value, { purpose: ROOM_NAME_PURPOSE });
}

export function encryptRoomDescription(value) {
    return encryptForStorage(value, { purpose: ROOM_DESCRIPTION_PURPOSE });
}

export function decryptRoomDescription(value) {
    return decryptFromStorage(value, { purpose: ROOM_DESCRIPTION_PURPOSE });
}

export function encryptLocationName(value) {
    return encryptForStorage(value, { purpose: LOCATION_NAME_PURPOSE });
}

export function decryptLocationName(value) {
    return decryptFromStorage(value, { purpose: LOCATION_NAME_PURPOSE });
}

export function encryptCategoryName(value) {
    return encryptForStorage(value, { purpose: CATEGORY_NAME_PURPOSE });
}

export function decryptCategoryName(value) {
    return decryptFromStorage(value, { purpose: CATEGORY_NAME_PURPOSE });
}

export function encryptUsername(value) {
    return encryptForStorage(value, { purpose: USERNAME_PURPOSE });
}

export function decryptUsername(value) {
    return decryptFromStorage(value, { purpose: USERNAME_PURPOSE });
}

export function encryptEmail(value) {
    return encryptForStorage(value, { purpose: EMAIL_PURPOSE });
}

export function decryptEmail(value) {
    return decryptFromStorage(value, { purpose: EMAIL_PURPOSE });
}

export function encryptHouseName(value) {
    return encryptForStorage(value, { purpose: HOUSE_NAME_PURPOSE });
}

export function decryptHouseName(value) {
    return decryptFromStorage(value, { purpose: HOUSE_NAME_PURPOSE });
}

export function decryptItemRecord(record) {
    if (!record) {
        return record;
    }

    const nextRecord = {
        ...record,
        name: decryptItemName(record.name),
        description: decryptItemDescription(record.description),
        barcode: decryptItemBarcode(record.barcode),
        category_name: decryptCategoryName(record.category_name),
        room_name: decryptRoomName(record.room_name),
        location_name: decryptLocationName(record.location_name)
    };

    if (record.username) {
        nextRecord.username = decryptUsername(record.username);
    }

    if (record.username && !record.owner_name) {
        nextRecord.owner_name = nextRecord.username;
    }

    return nextRecord;
}

export function decryptCategoryRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        name: decryptCategoryName(record.name)
    };
}

export function decryptRoomRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        name: decryptRoomName(record.name),
        description: decryptRoomDescription(record.description)
    };
}

export function decryptLocationRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        name: decryptLocationName(record.name),
        room_name: decryptRoomName(record.room_name),
        created_by_name: decryptUsername(record.created_by_name)
    };
}

export function decryptUserRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        username: decryptUsername(record.username),
        email: decryptEmail(record.email)
    };
}

export function decryptPendingRegistrationRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        username: decryptUsername(record.username),
        email: decryptEmail(record.email)
    };
}

export function decryptHouseRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        house_name: decryptHouseName(record.house_name),
        name: decryptHouseName(record.name ?? record.house_name)
    };
}

export function decryptHouseJoinRequestRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        requested_house_name: decryptHouseName(record.requested_house_name)
    };
}

export function sortByName(records) {
    return [...records].sort((left, right) => compareDisplayText(left?.name, right?.name));
}
