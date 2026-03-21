import db from '../database.js';
import {
    decryptHouseJoinRequestRecord,
    decryptHouseRecord,
    decryptUserRecord,
    decryptUsername,
    encryptHouseName
} from './protectedFields.js';

export const HOUSE_JOIN_REQUEST_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled'
};
const HOUSE_KEY_REGEX = /^[a-f0-9]{64}$/i;

function createMembershipError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeRequestedHouseName(value) {
    return String(value || '').trim();
}

function getFirstHouseMembership(userId) {
    return db.prepare(`
        SELECT id, house_key
        FROM user_houses
        WHERE user_id = ?
        ORDER BY joined_at ASC, id ASC
        LIMIT 1
    `).get(userId);
}

export function getHouseDisplayRecord(houseKey) {
    if (!houseKey) {
        return null;
    }

    const row = db.prepare(`
        SELECT id, house_key, house_name, is_owner, joined_at
        FROM user_houses
        WHERE house_key = ?
        ORDER BY is_owner DESC, joined_at ASC, id ASC
        LIMIT 1
    `).get(houseKey);

    return row ? decryptHouseRecord(row) : null;
}

export function getHouseOwners(houseKey) {
    return db.prepare(`
        SELECT u.id, u.username, u.email
        FROM user_houses uh
        JOIN users u ON u.id = uh.user_id
        WHERE uh.house_key = ? AND uh.is_owner = 1
        ORDER BY uh.joined_at ASC, uh.id ASC
    `).all(houseKey).map((owner) => decryptUserRecord(owner));
}

export function isHouseOwner(userId, houseKey) {
    return !!db.prepare(`
        SELECT 1
        FROM user_houses
        WHERE user_id = ? AND house_key = ? AND is_owner = 1
        LIMIT 1
    `).get(userId, houseKey);
}

export function syncUserHousePointers(userId) {
    const user = db.prepare(`
        SELECT id, house_key, active_house_key
        FROM users
        WHERE id = ?
    `).get(userId);

    if (!user) {
        return null;
    }

    const memberships = db.prepare(`
        SELECT house_key
        FROM user_houses
        WHERE user_id = ?
        ORDER BY joined_at ASC, id ASC
    `).all(userId);

    const membershipKeys = new Set(memberships.map((membership) => membership.house_key));
    const firstHouseKey = memberships[0]?.house_key || null;
    const activeHouseKey = membershipKeys.has(user.active_house_key) ? user.active_house_key : null;
    const primaryHouseKey = membershipKeys.has(user.house_key) ? user.house_key : null;

    const nextActiveHouseKey = activeHouseKey || firstHouseKey || null;
    const nextHouseKey = primaryHouseKey || nextActiveHouseKey || null;

    if (nextActiveHouseKey !== user.active_house_key || nextHouseKey !== user.house_key) {
        db.prepare(`
            UPDATE users
            SET house_key = ?, active_house_key = ?
            WHERE id = ?
        `).run(nextHouseKey, nextActiveHouseKey, userId);
    }

    return {
        ...user,
        house_key: nextHouseKey,
        active_house_key: nextActiveHouseKey
    };
}

export function getPendingJoinRequestSummary(userId) {
    const row = db.prepare(`
        SELECT id, requester_user_id, house_key, requested_house_name, status, created_at, decided_at, decided_by_user_id
        FROM house_join_requests
        WHERE requester_user_id = ? AND status = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(userId, HOUSE_JOIN_REQUEST_STATUS.PENDING);

    return row ? decryptHouseJoinRequestRecord(row) : null;
}

export function listPendingJoinRequestsForUser(userId) {
    return db.prepare(`
        SELECT id, requester_user_id, house_key, requested_house_name, status, created_at, decided_at, decided_by_user_id
        FROM house_join_requests
        WHERE requester_user_id = ? AND status = ?
        ORDER BY created_at DESC, id DESC
    `).all(userId, HOUSE_JOIN_REQUEST_STATUS.PENDING).map(decryptHouseJoinRequestRecord);
}

export function listPendingJoinRequestsForHouse(houseKey) {
    return db.prepare(`
        SELECT
            hjr.id,
            hjr.requester_user_id,
            hjr.house_key,
            hjr.requested_house_name,
            hjr.status,
            hjr.created_at,
            hjr.decided_at,
            hjr.decided_by_user_id,
            u.username
        FROM house_join_requests hjr
        JOIN users u ON u.id = hjr.requester_user_id
        WHERE hjr.house_key = ? AND hjr.status = ?
        ORDER BY hjr.created_at ASC, hjr.id ASC
    `).all(houseKey, HOUSE_JOIN_REQUEST_STATUS.PENDING).map((request) => ({
        ...decryptHouseJoinRequestRecord(request),
        username: decryptUsername(request.username)
    }));
}

export function getMembershipStateForUser(userId) {
    const normalizedUser = syncUserHousePointers(userId);

    if (!normalizedUser) {
        return {
            membershipState: 'no_house',
            pendingHouseRequest: null
        };
    }

    if (normalizedUser.active_house_key) {
        return {
            membershipState: 'active',
            pendingHouseRequest: null
        };
    }

    const pendingHouseRequest = getPendingJoinRequestSummary(userId);
    return {
        membershipState: pendingHouseRequest ? 'pending_approval' : 'no_house',
        pendingHouseRequest
    };
}

function buildRequestedHouseName(houseKey, requestedHouseName) {
    const normalizedRequestedName = normalizeRequestedHouseName(requestedHouseName);
    if (normalizedRequestedName) {
        return normalizedRequestedName;
    }

    return getHouseDisplayRecord(houseKey)?.name || 'Katildigim Ev';
}

export function createJoinRequest({ requesterUserId, houseKey, requestedHouseName }) {
    if (!HOUSE_KEY_REGEX.test(String(houseKey || '').trim())) {
        throw createMembershipError(400, 'Gecersiz ev anahtari formati');
    }

    const house = getHouseDisplayRecord(houseKey);
    if (!house) {
        throw createMembershipError(400, 'Gecersiz ev anahtari. Lutfen dogru anahtari girin.');
    }

    const existingMembership = db.prepare(`
        SELECT id
        FROM user_houses
        WHERE user_id = ? AND house_key = ?
        LIMIT 1
    `).get(requesterUserId, houseKey);
    if (existingMembership) {
        throw createMembershipError(400, 'Zaten bu evin uyesisiniz');
    }

    const existingPendingRequest = db.prepare(`
        SELECT id
        FROM house_join_requests
        WHERE requester_user_id = ? AND house_key = ? AND status = ?
        LIMIT 1
    `).get(requesterUserId, houseKey, HOUSE_JOIN_REQUEST_STATUS.PENDING);
    if (existingPendingRequest) {
        throw createMembershipError(400, 'Bu ev icin zaten bekleyen bir katilim isteginiz var');
    }

    const result = db.prepare(`
        INSERT INTO house_join_requests (
            requester_user_id,
            house_key,
            requested_house_name,
            status
        )
        VALUES (?, ?, ?, ?)
    `).run(
        requesterUserId,
        houseKey,
        encryptHouseName(buildRequestedHouseName(houseKey, requestedHouseName)),
        HOUSE_JOIN_REQUEST_STATUS.PENDING
    );

    const request = db.prepare(`
        SELECT id, requester_user_id, house_key, requested_house_name, status, created_at, decided_at, decided_by_user_id
        FROM house_join_requests
        WHERE id = ?
    `).get(result.lastInsertRowid);

    return {
        request: decryptHouseJoinRequestRecord(request),
        house
    };
}

export function approveJoinRequest({ requestId, actorUserId }) {
    const runApproval = db.transaction((joinRequestId, approverUserId) => {
        const request = db.prepare(`
            SELECT *
            FROM house_join_requests
            WHERE id = ?
        `).get(joinRequestId);

        if (!request) {
            throw createMembershipError(404, 'Katilim istegi bulunamadi');
        }

        if (request.status !== HOUSE_JOIN_REQUEST_STATUS.PENDING) {
            throw createMembershipError(400, 'Bu katilim istegi zaten sonuclandirildi');
        }

        if (!isHouseOwner(approverUserId, request.house_key)) {
            throw createMembershipError(403, 'Bu katilim istegini yonetme yetkiniz yok');
        }

        const requester = db.prepare(`
            SELECT id, username, email, house_key, active_house_key
            FROM users
            WHERE id = ?
        `).get(request.requester_user_id);

        if (!requester) {
            throw createMembershipError(404, 'Istek sahibi kullanici bulunamadi');
        }

        const existingMembership = db.prepare(`
            SELECT id
            FROM user_houses
            WHERE user_id = ? AND house_key = ?
            LIMIT 1
        `).get(request.requester_user_id, request.house_key);

        if (!existingMembership) {
            db.prepare(`
                INSERT INTO user_houses (user_id, house_key, house_name, is_owner)
                VALUES (?, ?, ?, 0)
            `).run(
                request.requester_user_id,
                request.house_key,
                request.requested_house_name
            );
        }

        const normalizedRequester = syncUserHousePointers(request.requester_user_id);
        if (!normalizedRequester?.active_house_key) {
            db.prepare(`
                UPDATE users
                SET house_key = ?, active_house_key = ?
                WHERE id = ?
            `).run(request.house_key, request.house_key, request.requester_user_id);
        } else if (!normalizedRequester.house_key) {
            db.prepare(`
                UPDATE users
                SET house_key = ?
                WHERE id = ?
            `).run(normalizedRequester.active_house_key, request.requester_user_id);
        }

        db.prepare(`
            UPDATE house_join_requests
            SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by_user_id = ?
            WHERE id = ?
        `).run(HOUSE_JOIN_REQUEST_STATUS.APPROVED, approverUserId, joinRequestId);

        return {
            request: decryptHouseJoinRequestRecord({
                ...request,
                status: HOUSE_JOIN_REQUEST_STATUS.APPROVED,
                decided_by_user_id: approverUserId
            }),
            house: getHouseDisplayRecord(request.house_key),
            requester: decryptUserRecord(requester)
        };
    });

    return runApproval(requestId, actorUserId);
}

export function rejectJoinRequest({ requestId, actorUserId }) {
    const runRejection = db.transaction((joinRequestId, approverUserId) => {
        const request = db.prepare(`
            SELECT *
            FROM house_join_requests
            WHERE id = ?
        `).get(joinRequestId);

        if (!request) {
            throw createMembershipError(404, 'Katilim istegi bulunamadi');
        }

        if (request.status !== HOUSE_JOIN_REQUEST_STATUS.PENDING) {
            throw createMembershipError(400, 'Bu katilim istegi zaten sonuclandirildi');
        }

        if (!isHouseOwner(approverUserId, request.house_key)) {
            throw createMembershipError(403, 'Bu katilim istegini yonetme yetkiniz yok');
        }

        const requester = db.prepare(`
            SELECT id, username, email
            FROM users
            WHERE id = ?
        `).get(request.requester_user_id);

        if (!requester) {
            throw createMembershipError(404, 'Istek sahibi kullanici bulunamadi');
        }

        db.prepare(`
            UPDATE house_join_requests
            SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by_user_id = ?
            WHERE id = ?
        `).run(HOUSE_JOIN_REQUEST_STATUS.REJECTED, approverUserId, joinRequestId);

        syncUserHousePointers(request.requester_user_id);

        return {
            request: decryptHouseJoinRequestRecord({
                ...request,
                status: HOUSE_JOIN_REQUEST_STATUS.REJECTED,
                decided_by_user_id: approverUserId
            }),
            house: getHouseDisplayRecord(request.house_key),
            requester: decryptUserRecord(requester)
        };
    });

    return runRejection(requestId, actorUserId);
}

export function kickHouseMember({ actorUserId, houseKey, memberId }) {
    const runKick = db.transaction((ownerUserId, targetHouseKey, targetMemberId) => {
        if (!isHouseOwner(ownerUserId, targetHouseKey)) {
            throw createMembershipError(403, 'Bu uyeyi evden cikarma yetkiniz yok');
        }

        const membership = db.prepare(`
            SELECT
                uh.id,
                uh.user_id,
                uh.house_key,
                uh.is_owner,
                u.username,
                u.email
            FROM user_houses uh
            JOIN users u ON u.id = uh.user_id
            WHERE uh.user_id = ? AND uh.house_key = ?
            LIMIT 1
        `).get(targetMemberId, targetHouseKey);

        if (!membership) {
            throw createMembershipError(404, 'Uye bulunamadi');
        }

        if (membership.user_id === ownerUserId) {
            throw createMembershipError(400, 'Ev sahibi kendisini evden cikarmaz');
        }

        if (membership.is_owner === 1) {
            throw createMembershipError(400, 'Baska bir ev sahibini evden cikarmazsiniz');
        }

        db.prepare(`
            DELETE FROM user_houses
            WHERE id = ?
        `).run(membership.id);

        const updatedUser = syncUserHousePointers(membership.user_id);

        return {
            house: getHouseDisplayRecord(targetHouseKey),
            member: decryptUserRecord(membership),
            updatedUser
        };
    });

    return runKick(actorUserId, houseKey, memberId);
}

export function ensureHouseAccessForUser(userId, houseKey) {
    if (!houseKey) {
        throw createMembershipError(403, 'Aktif ev bulunamadi');
    }

    const membership = db.prepare(`
        SELECT id
        FROM user_houses
        WHERE user_id = ? AND house_key = ?
        LIMIT 1
    `).get(userId, houseKey);

    if (!membership) {
        throw createMembershipError(403, 'Bu eve erisim izniniz yok');
    }

    return membership;
}

export function getUserHouseList(userId) {
    return db.prepare(`
        SELECT
            uh.id,
            uh.house_key,
            uh.house_name as name,
            uh.is_owner,
            uh.joined_at,
            (SELECT COUNT(*) FROM user_houses WHERE house_key = uh.house_key) as member_count,
            (SELECT COUNT(*) FROM items WHERE house_key = uh.house_key) as item_count
        FROM user_houses uh
        WHERE uh.user_id = ?
        ORDER BY uh.joined_at ASC, uh.id ASC
    `).all(userId).map(decryptHouseRecord);
}
