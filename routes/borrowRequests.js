import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { normalizeOptionalDate } from '../utils/dateValidation.js';
import { ensureHouseAccessForUser } from '../utils/houseMembership.js';
import {
    buildEmailLookup,
    buildUsernameLookup,
    decryptBorrowRecord,
    decryptBorrowRequestRecord,
    decryptItemName,
    encryptBorrowNote,
    encryptBorrowRequestItemLabel,
    encryptBorrowRequestNote,
    encryptBorrowRequestTarget,
    encryptBorrowReturnNote
} from '../utils/protectedFields.js';

const router = express.Router();

const REQUEST_DIRECTION = {
    OFFER: 'offer',
    REQUEST: 'request'
};

const REQUEST_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
};

const REQUEST_SELECT = `
    br.*,
    initiator.username AS initiator_username,
    recipient.username AS recipient_username,
    decider.username AS decided_by_username,
    items.user_id AS item_owner_user_id,
    items.name AS item_name,
    categories.icon AS item_category_icon,
    linked_borrow.id AS linked_borrow_id,
    linked_borrow.borrower_type AS linked_borrow_borrower_type,
    linked_borrow.borrower_user_id AS linked_borrow_borrower_user_id,
    linked_borrow.borrower_name AS linked_borrow_borrower_name,
    linked_borrow.borrower_contact AS linked_borrow_borrower_contact,
    linked_borrow.note AS linked_borrow_note,
    linked_borrow.borrowed_at AS linked_borrow_borrowed_at,
    linked_borrow.due_date AS linked_borrow_due_date,
    linked_borrow.returned_at AS linked_borrow_returned_at,
    linked_borrow.return_note AS linked_borrow_return_note,
    linked_borrow.lent_by_user_id AS linked_borrow_lent_by_user_id,
    linked_borrow.returned_by_user_id AS linked_borrow_returned_by_user_id,
    linked_borrower.username AS linked_borrow_borrower_username,
    linked_lender.username AS linked_borrow_lent_by_username,
    linked_returner.username AS linked_borrow_returned_by_username
`;

const REQUEST_JOINS = `
    JOIN users initiator ON initiator.id = br.initiator_user_id
    LEFT JOIN users recipient ON recipient.id = br.recipient_user_id
    LEFT JOIN users decider ON decider.id = br.decided_by_user_id
    LEFT JOIN items ON items.id = br.item_id
    LEFT JOIN categories ON categories.id = items.category_id
    LEFT JOIN item_borrows linked_borrow ON linked_borrow.id = br.borrow_id
    LEFT JOIN users linked_borrower ON linked_borrower.id = linked_borrow.borrower_user_id
    LEFT JOIN users linked_lender ON linked_lender.id = linked_borrow.lent_by_user_id
    LEFT JOIN users linked_returner ON linked_returner.id = linked_borrow.returned_by_user_id
`;

function normalizeOptionalText(value, fieldLabel, maxLength = 500) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.length > maxLength) {
        throw new Error(`${fieldLabel} çok uzun`);
    }

    return normalized;
}

function normalizeRequiredText(value, fieldLabel, maxLength = 160) {
    const normalized = normalizeOptionalText(value, fieldLabel, maxLength);
    if (!normalized) {
        throw new Error(`${fieldLabel} gerekli`);
    }

    return normalized;
}

function buildRecipientLookup(identifier) {
    const normalized = normalizeRequiredText(identifier, 'Alıcı bilgisi', 160);
    const lookupType = normalized.includes('@') ? 'email' : 'username';
    const lookupHash = lookupType === 'email'
        ? buildEmailLookup(normalized)
        : buildUsernameLookup(normalized);

    if (!lookupHash) {
        throw new Error('Alıcı bilgisi geçersiz');
    }

    return {
        recipientIdentifier: normalized,
        recipientLookupType: lookupType,
        recipientLookupHash: lookupHash
    };
}

function buildExpiresAt(days = 14) {
    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function getRequestErrorStatus(error) {
    return /ge(?:ç|c)ersiz|gerekli|uzun|bekleyen|bulunamadı|zaten|kendinize/i.test(String(error?.message || '')) ? 400 : 500;
}

function expirePendingRequests() {
    db.prepare(`
        UPDATE borrow_requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status = ?
          AND datetime(expires_at) <= CURRENT_TIMESTAMP
    `).run(REQUEST_STATUS.EXPIRED, REQUEST_STATUS.PENDING);
}

function resolveRecipientUserId({ recipientLookupType, recipientLookupHash }) {
    if (!recipientLookupHash) {
        return null;
    }

    if (recipientLookupType === 'email') {
        return db.prepare(`
            SELECT id
            FROM users
            WHERE email_lookup = ?
            LIMIT 1
        `).get(recipientLookupHash)?.id || null;
    }

    return db.prepare(`
        SELECT id
        FROM users
        WHERE username_lookup = ?
        LIMIT 1
    `).get(recipientLookupHash)?.id || null;
}

function reconcilePendingRequestsForUser(user) {
    if (!user?.id) {
        return;
    }

    const emailLookup = buildEmailLookup(user.email);
    const usernameLookup = buildUsernameLookup(user.username);

    if (emailLookup) {
        db.prepare(`
            UPDATE borrow_requests
            SET recipient_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE recipient_user_id IS NULL
              AND status = ?
              AND recipient_lookup_type = 'email'
              AND recipient_lookup_hash = ?
        `).run(user.id, REQUEST_STATUS.PENDING, emailLookup);
    }

    if (usernameLookup) {
        db.prepare(`
            UPDATE borrow_requests
            SET recipient_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE recipient_user_id IS NULL
              AND status = ?
              AND recipient_lookup_type = 'username'
              AND recipient_lookup_hash = ?
        `).run(user.id, REQUEST_STATUS.PENDING, usernameLookup);
    }
}

function getRequestById(requestId) {
    return db.prepare(`
        SELECT
            ${REQUEST_SELECT}
        FROM borrow_requests br
        ${REQUEST_JOINS}
        WHERE br.id = ?
        LIMIT 1
    `).get(requestId);
}

function buildLinkedBorrowSnapshot(record) {
    if (!record?.linked_borrow_id) {
        return null;
    }

    return decryptBorrowRecord({
        id: record.linked_borrow_id,
        borrower_type: record.linked_borrow_borrower_type,
        borrower_user_id: record.linked_borrow_borrower_user_id,
        borrower_name: record.linked_borrow_borrower_name,
        borrower_contact: record.linked_borrow_borrower_contact,
        note: record.linked_borrow_note,
        borrowed_at: record.linked_borrow_borrowed_at,
        due_date: record.linked_borrow_due_date,
        returned_at: record.linked_borrow_returned_at,
        return_note: record.linked_borrow_return_note,
        lent_by_user_id: record.linked_borrow_lent_by_user_id,
        returned_by_user_id: record.linked_borrow_returned_by_user_id,
        borrower_username: record.linked_borrow_borrower_username,
        lent_by_username: record.linked_borrow_lent_by_username,
        returned_by_username: record.linked_borrow_returned_by_username
    });
}

function serializeBorrowRequest(record, viewerUserId) {
    const decrypted = decryptBorrowRequestRecord(record);
    const linkedBorrow = buildLinkedBorrowSnapshot(record);
    const viewerRole = viewerUserId === record.initiator_user_id ? 'initiator' : 'recipient';
    const itemName = decryptItemName(record.item_name);
    const pending = decrypted.status === REQUEST_STATUS.PENDING;

    return {
        id: decrypted.id,
        direction: decrypted.direction,
        status: decrypted.status,
        created_at: decrypted.created_at,
        updated_at: decrypted.updated_at,
        decided_at: decrypted.decided_at,
        expires_at: decrypted.expires_at,
        due_date: decrypted.due_date,
        note: decrypted.note,
        requested_item_label: decrypted.requested_item_label,
        viewer_role: viewerRole,
        recipient_hint: viewerRole === 'initiator' ? decrypted.recipient_identifier : null,
        counterparty_display_name: viewerRole === 'recipient'
            ? decrypted.initiator_username
            : (pending ? decrypted.recipient_identifier : (decrypted.recipient_username || decrypted.recipient_identifier)),
        item: itemName ? {
            id: decrypted.item_id,
            name: itemName,
            category_icon: record.item_category_icon || '📦'
        } : null,
        borrow: linkedBorrow,
        can_accept: viewerRole === 'recipient' && decrypted.status === REQUEST_STATUS.PENDING,
        can_reject: viewerRole === 'recipient' && decrypted.status === REQUEST_STATUS.PENDING,
        can_cancel: viewerRole === 'initiator' && decrypted.status === REQUEST_STATUS.PENDING,
        needs_item_selection: viewerRole === 'recipient'
            && decrypted.status === REQUEST_STATUS.PENDING
            && decrypted.direction === REQUEST_DIRECTION.REQUEST
    };
}

function serializeActiveBorrow(record, viewerUserId) {
    const borrow = decryptBorrowRecord(record);
    const itemName = decryptItemName(record.item_name);

    let role = 'watcher';
    if (borrow.borrower_user_id === viewerUserId) {
        role = 'borrower';
    } else if (record.lent_by_user_id === viewerUserId) {
        role = 'lender';
    } else if (record.item_owner_user_id === viewerUserId) {
        role = 'owner';
    }

    return {
        id: borrow.id,
        borrowed_at: borrow.borrowed_at,
        due_date: borrow.due_date,
        note: borrow.note,
        role,
        item: itemName ? {
            id: record.item_id,
            name: itemName,
            category_icon: record.item_category_icon || '📦'
        } : null,
        counterpart_display_name: role === 'borrower'
            ? (borrow.lent_by_username || 'Bilinmeyen kullanıcı')
            : (borrow.borrower_display_name || 'Bilinmeyen kullanıcı'),
        borrower_display_name: borrow.borrower_display_name,
        lender_display_name: borrow.lent_by_username,
        can_mark_returned: role === 'lender' || role === 'owner',
        request_direction: record.request_direction || null
    };
}

function listRequestsForViewer(userId) {
    return db.prepare(`
        SELECT
            ${REQUEST_SELECT}
        FROM borrow_requests br
        ${REQUEST_JOINS}
        WHERE br.initiator_user_id = ? OR br.recipient_user_id = ?
        ORDER BY
            CASE WHEN br.status = '${REQUEST_STATUS.PENDING}' THEN 0 ELSE 1 END,
            br.created_at DESC,
            br.id DESC
    `).all(userId, userId).map((record) => serializeBorrowRequest(record, userId));
}

function listAvailableItemsForUser(userId, houseKey) {
    if (!userId || !houseKey) {
        return [];
    }

    return db.prepare(`
        SELECT
            items.id,
            items.name,
            categories.icon AS category_icon
        FROM items
        LEFT JOIN categories ON categories.id = items.category_id
        LEFT JOIN item_borrows active_borrow
            ON active_borrow.item_id = items.id
           AND active_borrow.returned_at IS NULL
        WHERE items.user_id = ?
          AND items.house_key = ?
          AND active_borrow.id IS NULL
        ORDER BY items.updated_at DESC, items.id DESC
    `).all(userId, houseKey).map((record) => ({
        id: record.id,
        name: decryptItemName(record.name),
        category_icon: record.category_icon || '📦'
    }));
}

function listActiveBorrowsForUser(userId) {
    return db.prepare(`
        SELECT
            ib.*,
            items.user_id AS item_owner_user_id,
            items.name AS item_name,
            categories.icon AS item_category_icon,
            borrower.username AS borrower_username,
            lender.username AS lent_by_username,
            returner.username AS returned_by_username,
            br.direction AS request_direction
        FROM item_borrows ib
        JOIN items ON items.id = ib.item_id
        LEFT JOIN categories ON categories.id = items.category_id
        LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
        LEFT JOIN users lender ON lender.id = ib.lent_by_user_id
        LEFT JOIN users returner ON returner.id = ib.returned_by_user_id
        LEFT JOIN borrow_requests br ON br.borrow_id = ib.id
        WHERE ib.returned_at IS NULL
          AND (
            ib.borrower_user_id = ?
            OR (
                (
                    ib.lent_by_user_id = ?
                    OR items.user_id = ?
                )
                AND EXISTS(
                    SELECT 1
                    FROM user_houses viewer_house
                    WHERE viewer_house.user_id = ?
                      AND viewer_house.house_key = items.house_key
                )
            )
          )
        ORDER BY ib.borrowed_at DESC, ib.id DESC
    `).all(userId, userId, userId, userId).map((record) => serializeActiveBorrow(record, userId));
}

function assertViewerCanAccessRequest(request, userId) {
    if (!request) {
        throw new Error('İstek bulunamadı');
    }

    if (request.initiator_user_id !== userId && request.recipient_user_id !== userId) {
        const error = new Error('Bu istek için yetkiniz yok');
        error.statusCode = 403;
        throw error;
    }
}

function getOwnedAvailableItem(itemId, ownerUserId) {
    const item = db.prepare(`
        SELECT items.id, items.user_id, items.house_key, items.name
        FROM items
        LEFT JOIN item_borrows active_borrow
            ON active_borrow.item_id = items.id
           AND active_borrow.returned_at IS NULL
        WHERE items.id = ?
          AND items.user_id = ?
          AND active_borrow.id IS NULL
        LIMIT 1
    `).get(itemId, ownerUserId);

    if (!item) {
        throw new Error('Seçilen eşya bulunamadı veya şu anda ödünçte');
    }

    try {
        ensureHouseAccessForUser(ownerUserId, item.house_key);
    } catch {
        const error = new Error('Seçilen eşya artık erişilebilir değil');
        error.statusCode = 409;
        throw error;
    }

    return item;
}

router.use(authenticateToken);
router.use(requireActiveHouse);

router.get('/', (req, res) => {
    try {
        expirePendingRequests();
        reconcilePendingRequestsForUser(req.user);

        const requests = listRequestsForViewer(req.user.id);
        const activeBorrows = listActiveBorrowsForUser(req.user.id);
        const availableItems = listAvailableItemsForUser(req.user.id, req.user.house_key);

        res.json({
            requests,
            activeBorrows,
            availableItems,
            counts: {
                incomingPending: requests.filter((request) => request.viewer_role === 'recipient' && request.status === REQUEST_STATUS.PENDING).length,
                outgoingPending: requests.filter((request) => request.viewer_role === 'initiator' && request.status === REQUEST_STATUS.PENDING).length,
                activeBorrows: activeBorrows.length
            }
        });
    } catch (error) {
        console.error('Borrow requests overview error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'İstekler yüklenemedi' });
    }
});

router.post('/', (req, res) => {
    try {
        expirePendingRequests();
        reconcilePendingRequestsForUser(req.user);

        const direction = String(req.body.direction || '').trim() === REQUEST_DIRECTION.OFFER
            ? REQUEST_DIRECTION.OFFER
            : String(req.body.direction || '').trim() === REQUEST_DIRECTION.REQUEST
                ? REQUEST_DIRECTION.REQUEST
                : null;

        if (!direction) {
            throw new Error('İstek tipi geçersiz');
        }

        const {
            recipientIdentifier,
            recipientLookupType,
            recipientLookupHash
        } = buildRecipientLookup(req.body.recipient_identifier);

        const selfLookup = recipientLookupType === 'email'
            ? buildEmailLookup(req.user.email)
            : buildUsernameLookup(req.user.username);
        if (selfLookup && selfLookup === recipientLookupHash) {
            throw new Error('Kendinize istek gönderemezsiniz');
        }

        const recipientUserId = resolveRecipientUserId({ recipientLookupType, recipientLookupHash });
        if (recipientUserId && recipientUserId === req.user.id) {
            throw new Error('Kendinize istek gönderemezsiniz');
        }

        const dueDate = normalizeOptionalDate(req.body.due_date, 'Planlanan teslim tarihi');
        const note = normalizeOptionalText(req.body.note, 'Not', 1000);

        let itemId = null;
        let requestedItemLabel = null;

        if (direction === REQUEST_DIRECTION.OFFER) {
            itemId = Number.parseInt(req.body.item_id, 10);
            if (!Number.isInteger(itemId)) {
                throw new Error('Teklif için eşya seçin');
            }

            const item = getOwnedAvailableItem(itemId, req.user.id);
            const existingOffer = db.prepare(`
                SELECT id
                FROM borrow_requests
                WHERE initiator_user_id = ?
                  AND direction = ?
                  AND status = ?
                  AND item_id = ?
                  AND recipient_lookup_type = ?
                  AND recipient_lookup_hash = ?
                LIMIT 1
            `).get(
                req.user.id,
                REQUEST_DIRECTION.OFFER,
                REQUEST_STATUS.PENDING,
                item.id,
                recipientLookupType,
                recipientLookupHash
            );

            if (existingOffer) {
                throw new Error('Bu eşya için aynı kullanıcıya zaten bekleyen bir teklif var');
            }
        } else {
            requestedItemLabel = normalizeRequiredText(req.body.requested_item_label, 'İstenen eşya', 160);
        }

        const result = db.prepare(`
            INSERT INTO borrow_requests (
                direction,
                status,
                initiator_user_id,
                recipient_user_id,
                recipient_lookup_type,
                recipient_lookup_hash,
                recipient_identifier,
                item_id,
                requested_item_label,
                note,
                due_date,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            direction,
            REQUEST_STATUS.PENDING,
            req.user.id,
            recipientUserId,
            recipientLookupType,
            recipientLookupHash,
            encryptBorrowRequestTarget(recipientIdentifier),
            itemId,
            requestedItemLabel ? encryptBorrowRequestItemLabel(requestedItemLabel) : null,
            note ? encryptBorrowRequestNote(note) : null,
            dueDate,
            buildExpiresAt()
        );

        const request = getRequestById(result.lastInsertRowid);

        res.status(201).json({
            message: 'İstek oluşturuldu. Eşleşen kullanıcı varsa uygulama içinde görecek.',
            request: serializeBorrowRequest(request, req.user.id)
        });
    } catch (error) {
        console.error('Create borrow request error:', error);
        res.status(error.statusCode || getRequestErrorStatus(error)).json({ error: error.message || 'İstek oluşturulamadı' });
    }
});

router.post('/:id/accept', (req, res) => {
    try {
        expirePendingRequests();
        reconcilePendingRequestsForUser(req.user);

        const requestId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(requestId)) {
            return res.status(400).json({ error: 'Geçersiz istek kimliği' });
        }

        const acceptRequest = db.transaction((normalizedRequestId) => {
            const request = getRequestById(normalizedRequestId);
            assertViewerCanAccessRequest(request, req.user.id);

            if (request.recipient_user_id !== req.user.id) {
                const error = new Error('Bu isteği yalnızca hedef kullanıcı onaylayabilir');
                error.statusCode = 403;
                throw error;
            }

            if (request.status !== REQUEST_STATUS.PENDING) {
                throw new Error('Bu istek artık beklemiyor');
            }

            const decryptedRequest = decryptBorrowRequestRecord(request);

            let selectedItem = null;
            if (request.direction === REQUEST_DIRECTION.OFFER) {
                if (!Number.isInteger(request.item_id)) {
                    throw new Error('Teklifte eşya bulunamadı');
                }

                selectedItem = getOwnedAvailableItem(request.item_id, request.initiator_user_id);
            } else {
                const chosenItemId = Number.parseInt(req.body.item_id, 10);
                if (!Number.isInteger(chosenItemId)) {
                    throw new Error('İsteği karşılamak için eşya seçin');
                }

                selectedItem = getOwnedAvailableItem(chosenItemId, req.user.id);
            }

            const borrowResult = db.prepare(`
                INSERT INTO item_borrows (
                    item_id,
                    house_key,
                    borrower_type,
                    borrower_user_id,
                    borrower_name,
                    borrower_contact,
                    note,
                    due_date,
                    lent_by_user_id
                )
                VALUES (?, ?, 'member', ?, NULL, NULL, ?, ?, ?)
            `).run(
                selectedItem.id,
                selectedItem.house_key,
                request.direction === REQUEST_DIRECTION.OFFER ? req.user.id : request.initiator_user_id,
                decryptedRequest.note ? encryptBorrowNote(decryptedRequest.note) : null,
                request.due_date || null,
                request.direction === REQUEST_DIRECTION.OFFER ? request.initiator_user_id : req.user.id
            );

            db.prepare(`
                UPDATE borrow_requests
                SET status = ?,
                    recipient_user_id = ?,
                    item_id = ?,
                    borrow_id = ?,
                    decided_at = CURRENT_TIMESTAMP,
                    decided_by_user_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                REQUEST_STATUS.ACCEPTED,
                req.user.id,
                selectedItem.id,
                borrowResult.lastInsertRowid,
                req.user.id,
                normalizedRequestId
            );

            return getRequestById(normalizedRequestId);
        });

        const acceptedRequest = acceptRequest(requestId);
        res.json({
            message: 'İstek kabul edildi',
            request: serializeBorrowRequest(acceptedRequest, req.user.id)
        });
    } catch (error) {
        console.error('Accept borrow request error:', error);
        res.status(error.statusCode || getRequestErrorStatus(error)).json({ error: error.message || 'İstek kabul edilemedi' });
    }
});

router.post('/:id/reject', (req, res) => {
    try {
        expirePendingRequests();
        reconcilePendingRequestsForUser(req.user);

        const requestId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(requestId)) {
            return res.status(400).json({ error: 'Geçersiz istek kimliği' });
        }

        const request = getRequestById(requestId);
        assertViewerCanAccessRequest(request, req.user.id);

        if (request.recipient_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Bu isteği yalnızca hedef kullanıcı reddedebilir' });
        }

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(409).json({ error: 'Bu istek artık beklemiyor' });
        }

        db.prepare(`
            UPDATE borrow_requests
            SET status = ?,
                recipient_user_id = ?,
                decided_at = CURRENT_TIMESTAMP,
                decided_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            REQUEST_STATUS.REJECTED,
            req.user.id,
            req.user.id,
            requestId
        );

        res.json({
            message: 'İstek reddedildi',
            request: serializeBorrowRequest(getRequestById(requestId), req.user.id)
        });
    } catch (error) {
        console.error('Reject borrow request error:', error);
        res.status(error.statusCode || getRequestErrorStatus(error)).json({ error: error.message || 'İstek reddedilemedi' });
    }
});

router.post('/:id/cancel', (req, res) => {
    try {
        expirePendingRequests();
        reconcilePendingRequestsForUser(req.user);

        const requestId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(requestId)) {
            return res.status(400).json({ error: 'Geçersiz istek kimliği' });
        }

        const request = getRequestById(requestId);
        assertViewerCanAccessRequest(request, req.user.id);

        if (request.initiator_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Bu isteği yalnızca gönderen kullanıcı iptal edebilir' });
        }

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(409).json({ error: 'Bu istek artık beklemiyor' });
        }

        db.prepare(`
            UPDATE borrow_requests
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(REQUEST_STATUS.CANCELLED, requestId);

        res.json({
            message: 'İstek iptal edildi',
            request: serializeBorrowRequest(getRequestById(requestId), req.user.id)
        });
    } catch (error) {
        console.error('Cancel borrow request error:', error);
        res.status(error.statusCode || getRequestErrorStatus(error)).json({ error: error.message || 'İstek iptal edilemedi' });
    }
});

router.post('/active-borrows/:id/return', (req, res) => {
    try {
        const borrowId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(borrowId)) {
            return res.status(400).json({ error: 'Geçersiz ödünç kimliği' });
        }

        const activeBorrow = db.prepare(`
            SELECT
                ib.*,
                items.user_id AS item_owner_user_id,
                items.name AS item_name,
                categories.icon AS item_category_icon,
                borrower.username AS borrower_username,
                lender.username AS lent_by_username,
                returner.username AS returned_by_username,
                br.direction AS request_direction
            FROM item_borrows ib
            JOIN items ON items.id = ib.item_id
            LEFT JOIN categories ON categories.id = items.category_id
            LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
            LEFT JOIN users lender ON lender.id = ib.lent_by_user_id
            LEFT JOIN users returner ON returner.id = ib.returned_by_user_id
            LEFT JOIN borrow_requests br ON br.borrow_id = ib.id
            WHERE ib.id = ?
              AND ib.returned_at IS NULL
              AND (ib.lent_by_user_id = ? OR items.user_id = ?)
              AND EXISTS(
                  SELECT 1
                  FROM user_houses viewer_house
                  WHERE viewer_house.user_id = ?
                    AND viewer_house.house_key = items.house_key
              )
            LIMIT 1
        `).get(borrowId, req.user.id, req.user.id, req.user.id);

        if (!activeBorrow) {
            return res.status(404).json({ error: 'Aktif ödünç kaydı bulunamadı' });
        }

        const returnNote = normalizeOptionalText(req.body.return_note, 'Teslim notu', 1000);

        db.prepare(`
            UPDATE item_borrows
            SET returned_at = CURRENT_TIMESTAMP,
                return_note = ?,
                returned_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            returnNote ? encryptBorrowReturnNote(returnNote) : null,
            req.user.id,
            borrowId
        );

        const updatedBorrow = db.prepare(`
            SELECT
                ib.*,
                items.user_id AS item_owner_user_id,
                items.name AS item_name,
                categories.icon AS item_category_icon,
                borrower.username AS borrower_username,
                lender.username AS lent_by_username,
                returner.username AS returned_by_username,
                br.direction AS request_direction
            FROM item_borrows ib
            JOIN items ON items.id = ib.item_id
            LEFT JOIN categories ON categories.id = items.category_id
            LEFT JOIN users borrower ON borrower.id = ib.borrower_user_id
            LEFT JOIN users lender ON lender.id = ib.lent_by_user_id
            LEFT JOIN users returner ON returner.id = ib.returned_by_user_id
            LEFT JOIN borrow_requests br ON br.borrow_id = ib.id
            WHERE ib.id = ?
            LIMIT 1
        `).get(borrowId);

        res.json({
            message: 'Eşya teslim alındı',
            borrow: serializeActiveBorrow(updatedBorrow, req.user.id)
        });
    } catch (error) {
        console.error('Return active borrow error:', error);
        res.status(error.statusCode || getRequestErrorStatus(error)).json({ error: error.message || 'Teslim alınamadı' });
    }
});

export default router;
