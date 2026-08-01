import { decryptFromStorage, encryptForStorage, hashLookupToken, isEncryptedPayload } from './encryption.js';

export const ITEM_NAME_PURPOSE = 'inventory.item.name';
export const ITEM_DESCRIPTION_PURPOSE = 'inventory.item.description';
export const ITEM_BARCODE_PURPOSE = 'inventory.item.barcode';
export const ITEM_INVOICE_PRICE_PURPOSE = 'inventory.item.invoice_price';
export const ITEM_INVOICE_CURRENCY_PURPOSE = 'inventory.item.invoice_currency';
export const ITEM_INVOICE_DATE_PURPOSE = 'inventory.item.invoice_date';
export const ITEM_WARRANTY_START_PURPOSE = 'inventory.item.warranty_start_date';
export const ITEM_WARRANTY_DURATION_VALUE_PURPOSE = 'inventory.item.warranty_duration_value';
export const ITEM_WARRANTY_DURATION_UNIT_PURPOSE = 'inventory.item.warranty_duration_unit';
export const ITEM_WARRANTY_EXPIRY_PURPOSE = 'inventory.item.warranty_expiry_date';
export const BORROWER_NAME_PURPOSE = 'inventory.borrow.borrower_name';
export const BORROWER_CONTACT_PURPOSE = 'inventory.borrow.borrower_contact';
export const BORROW_NOTE_PURPOSE = 'inventory.borrow.note';
export const BORROW_RETURN_NOTE_PURPOSE = 'inventory.borrow.return_note';
export const BORROW_REQUEST_TARGET_PURPOSE = 'inventory.borrow_request.target_identifier';
export const BORROW_REQUEST_ITEM_LABEL_PURPOSE = 'inventory.borrow_request.requested_item_label';
export const BORROW_REQUEST_NOTE_PURPOSE = 'inventory.borrow_request.note';
export const ROOM_NAME_PURPOSE = 'inventory.room.name';
export const ROOM_DESCRIPTION_PURPOSE = 'inventory.room.description';
export const LOCATION_NAME_PURPOSE = 'inventory.location.name';
export const BOX_NAME_PURPOSE = 'inventory.box.name';
export const BOX_CODE_PURPOSE = 'inventory.box.code';
export const BOX_NOTE_PURPOSE = 'inventory.box.note';
export const CATEGORY_NAME_PURPOSE = 'inventory.category.name';
export const USERNAME_PURPOSE = 'identity.username';
export const EMAIL_PURPOSE = 'identity.email';
export const HOUSE_NAME_PURPOSE = 'inventory.house.name';
export const ATTACHMENT_ORIGINAL_NAME_PURPOSE = 'inventory.attachment.original_name';

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

export function encryptItemInvoicePrice(value) {
    return encryptForStorage(value, { purpose: ITEM_INVOICE_PRICE_PURPOSE });
}

export function decryptItemInvoicePrice(value) {
    return decryptFromStorage(value, { purpose: ITEM_INVOICE_PRICE_PURPOSE });
}

export function encryptItemInvoiceCurrency(value) {
    return encryptForStorage(value, { purpose: ITEM_INVOICE_CURRENCY_PURPOSE });
}

export function decryptItemInvoiceCurrency(value) {
    return decryptFromStorage(value, { purpose: ITEM_INVOICE_CURRENCY_PURPOSE });
}

export function encryptItemInvoiceDate(value) {
    return encryptForStorage(value, { purpose: ITEM_INVOICE_DATE_PURPOSE });
}

export function decryptItemInvoiceDate(value) {
    return decryptFromStorage(value, { purpose: ITEM_INVOICE_DATE_PURPOSE });
}

export function encryptItemWarrantyExpiryDate(value) {
    return encryptForStorage(value, { purpose: ITEM_WARRANTY_EXPIRY_PURPOSE });
}

export function decryptItemWarrantyExpiryDate(value) {
    return decryptFromStorage(value, { purpose: ITEM_WARRANTY_EXPIRY_PURPOSE });
}

export function encryptItemWarrantyStartDate(value) {
    return encryptForStorage(value, { purpose: ITEM_WARRANTY_START_PURPOSE });
}

export function decryptItemWarrantyStartDate(value) {
    return decryptFromStorage(value, { purpose: ITEM_WARRANTY_START_PURPOSE });
}

export function encryptItemWarrantyDurationValue(value) {
    return encryptForStorage(value, { purpose: ITEM_WARRANTY_DURATION_VALUE_PURPOSE });
}

export function decryptItemWarrantyDurationValue(value) {
    return decryptFromStorage(value, { purpose: ITEM_WARRANTY_DURATION_VALUE_PURPOSE });
}

export function encryptItemWarrantyDurationUnit(value) {
    return encryptForStorage(value, { purpose: ITEM_WARRANTY_DURATION_UNIT_PURPOSE });
}

export function decryptItemWarrantyDurationUnit(value) {
    return decryptFromStorage(value, { purpose: ITEM_WARRANTY_DURATION_UNIT_PURPOSE });
}

export function encryptBorrowerName(value) {
    return encryptForStorage(value, { purpose: BORROWER_NAME_PURPOSE });
}

export function decryptBorrowerName(value) {
    return decryptFromStorage(value, { purpose: BORROWER_NAME_PURPOSE });
}

export function encryptBorrowerContact(value) {
    return encryptForStorage(value, { purpose: BORROWER_CONTACT_PURPOSE });
}

export function decryptBorrowerContact(value) {
    return decryptFromStorage(value, { purpose: BORROWER_CONTACT_PURPOSE });
}

export function encryptBorrowNote(value) {
    return encryptForStorage(value, { purpose: BORROW_NOTE_PURPOSE });
}

export function decryptBorrowNote(value) {
    return decryptFromStorage(value, { purpose: BORROW_NOTE_PURPOSE });
}

export function encryptBorrowReturnNote(value) {
    return encryptForStorage(value, { purpose: BORROW_RETURN_NOTE_PURPOSE });
}

export function decryptBorrowReturnNote(value) {
    return decryptFromStorage(value, { purpose: BORROW_RETURN_NOTE_PURPOSE });
}

export function encryptBorrowRequestTarget(value) {
    return encryptForStorage(value, { purpose: BORROW_REQUEST_TARGET_PURPOSE });
}

export function decryptBorrowRequestTarget(value) {
    const decrypted = decryptFromStorage(value, { purpose: BORROW_REQUEST_TARGET_PURPOSE });
    if (isEncryptedPayload(decrypted)) {
        try {
            return decryptFromStorage(decrypted, { purpose: BORROW_REQUEST_TARGET_PURPOSE });
        } catch {
            return decrypted;
        }
    }

    return decrypted;
}

export function encryptBorrowRequestItemLabel(value) {
    return encryptForStorage(value, { purpose: BORROW_REQUEST_ITEM_LABEL_PURPOSE });
}

export function decryptBorrowRequestItemLabel(value) {
    return decryptFromStorage(value, { purpose: BORROW_REQUEST_ITEM_LABEL_PURPOSE });
}

export function encryptBorrowRequestNote(value) {
    return encryptForStorage(value, { purpose: BORROW_REQUEST_NOTE_PURPOSE });
}

export function decryptBorrowRequestNote(value) {
    return decryptFromStorage(value, { purpose: BORROW_REQUEST_NOTE_PURPOSE });
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

export function encryptBoxName(value) {
    return encryptForStorage(value, { purpose: BOX_NAME_PURPOSE });
}

export function decryptBoxName(value) {
    return decryptFromStorage(value, { purpose: BOX_NAME_PURPOSE });
}

export function encryptBoxCode(value) {
    return encryptForStorage(value, { purpose: BOX_CODE_PURPOSE });
}

export function decryptBoxCode(value) {
    return decryptFromStorage(value, { purpose: BOX_CODE_PURPOSE });
}

export function encryptBoxNote(value) {
    return encryptForStorage(value, { purpose: BOX_NOTE_PURPOSE });
}

export function decryptBoxNote(value) {
    return decryptFromStorage(value, { purpose: BOX_NOTE_PURPOSE });
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

export function encryptAttachmentOriginalName(value) {
    return encryptForStorage(value, { purpose: ATTACHMENT_ORIGINAL_NAME_PURPOSE });
}

export function decryptAttachmentOriginalName(value) {
    return decryptFromStorage(value, { purpose: ATTACHMENT_ORIGINAL_NAME_PURPOSE });
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
        invoice_price: decryptItemInvoicePrice(record.invoice_price),
        invoice_currency: decryptItemInvoiceCurrency(record.invoice_currency),
        invoice_date: decryptItemInvoiceDate(record.invoice_date),
        warranty_start_date: decryptItemWarrantyStartDate(record.warranty_start_date),
        warranty_duration_value: decryptItemWarrantyDurationValue(record.warranty_duration_value),
        warranty_duration_unit: decryptItemWarrantyDurationUnit(record.warranty_duration_unit),
        warranty_expiry_date: decryptItemWarrantyExpiryDate(record.warranty_expiry_date),
        category_name: decryptCategoryName(record.category_name),
        room_name: decryptRoomName(record.room_name),
        location_name: decryptLocationName(record.location_name),
        box_name: decryptBoxName(record.box_name),
        box_code: decryptBoxCode(record.box_code)
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

export function decryptBoxRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        name: decryptBoxName(record.name),
        code: decryptBoxCode(record.code),
        note: decryptBoxNote(record.note),
        room_name: decryptRoomName(record.room_name),
        location_name: decryptLocationName(record.location_name),
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

export function decryptBorrowRecord(record) {
    if (!record) {
        return record;
    }

    const borrowerName = decryptBorrowerName(record.borrower_name);
    const borrowerContact = decryptBorrowerContact(record.borrower_contact);
    const note = decryptBorrowNote(record.note);
    const returnNote = decryptBorrowReturnNote(record.return_note);
    const returnRequestNote = decryptBorrowReturnNote(record.return_request_note);
    const borrowerUsername = decryptUsername(record.borrower_username);

    return {
        ...record,
        borrower_name: borrowerName,
        borrower_contact: borrowerContact,
        note,
        return_note: returnNote,
        return_request_note: returnRequestNote,
        borrower_username: borrowerUsername,
        borrower_display_name: borrowerUsername || borrowerName,
        lent_by_username: decryptUsername(record.lent_by_username),
        returned_by_username: decryptUsername(record.returned_by_username)
    };
}

export function decryptBorrowRequestRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        recipient_identifier: decryptBorrowRequestTarget(record.recipient_identifier),
        requested_item_label: decryptBorrowRequestItemLabel(record.requested_item_label),
        note: decryptBorrowRequestNote(record.note),
        initiator_username: decryptUsername(record.initiator_username),
        recipient_username: decryptUsername(record.recipient_username),
        decided_by_username: decryptUsername(record.decided_by_username)
    };
}

function normalizeViewerUserId(viewerUserId) {
    return Number.isInteger(viewerUserId) ? viewerUserId : null;
}

function buildBorrowSensitiveViewerSet(record, itemOwnerUserId) {
    const relatedUserIds = [
        normalizeViewerUserId(record?.borrower_user_id),
        normalizeViewerUserId(record?.lent_by_user_id),
        normalizeViewerUserId(record?.returned_by_user_id),
        normalizeViewerUserId(itemOwnerUserId)
    ].filter((value, index, values) => value !== null && values.indexOf(value) === index);

    return new Set(relatedUserIds);
}

export function redactBorrowRecordForViewer(record, { viewerUserId = null, itemOwnerUserId = null } = {}) {
    if (!record) {
        return record;
    }

    const normalizedViewerUserId = normalizeViewerUserId(viewerUserId);
    if (normalizedViewerUserId === null) {
        return {
            ...record,
            borrower_contact: null,
            note: null,
            return_request_note: null,
            return_note: null
        };
    }

    const allowedViewerIds = buildBorrowSensitiveViewerSet(record, itemOwnerUserId);
    if (allowedViewerIds.has(normalizedViewerUserId)) {
        return record;
    }

    return {
        ...record,
        borrower_contact: null,
        note: null,
        return_request_note: null,
        return_note: null
    };
}

export function sortByName(records) {
    return [...records].sort((left, right) => compareDisplayText(left?.name, right?.name));
}
