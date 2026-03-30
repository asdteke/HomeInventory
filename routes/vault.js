import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
    normalizePersonalVaultEnvelope,
    normalizePersonalVaultSetupPayload,
    PERSONAL_VAULT_PHOTO_MAX_BYTES,
    PERSONAL_VAULT_PHOTO_PREVIEW_MAX_BYTES,
    serializePersonalVaultEnvelope
} from '../utils/personalVault.js';

const router = express.Router();

function createRequestError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getVaultConfigRow(userId) {
    return db.prepare(`
        SELECT
            user_id,
            kdf_algorithm,
            kdf_salt,
            kdf_iterations,
            wrap_algorithm,
            wrap_iv,
            wrapped_vault_key,
            recovery_kdf_algorithm,
            recovery_kdf_salt,
            recovery_kdf_iterations,
            recovery_wrap_algorithm,
            recovery_wrap_iv,
            recovery_wrapped_vault_key,
            created_at,
            updated_at
        FROM personal_vaults
        WHERE user_id = ?
        LIMIT 1
    `).get(userId);
}

function getVaultItemRow(userId, itemId) {
    return db.prepare(`
        SELECT
            id,
            encrypted_payload,
            photo_encrypted_payload,
            photo_preview_encrypted_payload,
            created_at,
            updated_at
        FROM personal_vault_items
        WHERE id = ? AND user_id = ?
        LIMIT 1
    `).get(itemId, userId);
}

function ensureVaultConfigured(userId) {
    const vaultRow = getVaultConfigRow(userId);
    if (!vaultRow) {
        throw createRequestError('Personal vault henuz kurulmamis', 404);
    }

    return vaultRow;
}

function ensureVaultItem(userId, itemId) {
    const itemRow = getVaultItemRow(userId, itemId);
    if (!itemRow) {
        throw createRequestError('Personal vault kaydi bulunamadi', 404);
    }

    return itemRow;
}

function mapVaultConfig(row) {
    if (!row) {
        return null;
    }

    return {
        kdfAlgorithm: row.kdf_algorithm,
        kdfSalt: row.kdf_salt,
        kdfIterations: row.kdf_iterations,
        wrapAlgorithm: row.wrap_algorithm,
        wrapIv: row.wrap_iv,
        wrappedVaultKey: row.wrapped_vault_key,
        recoveryKdfAlgorithm: row.recovery_kdf_algorithm,
        recoveryKdfSalt: row.recovery_kdf_salt,
        recoveryKdfIterations: row.recovery_kdf_iterations,
        recoveryWrapAlgorithm: row.recovery_wrap_algorithm,
        recoveryWrapIv: row.recovery_wrap_iv,
        recoveryWrappedVaultKey: row.recovery_wrapped_vault_key,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapVaultItem(row) {
    return {
        id: row.id,
        encrypted_payload: normalizePersonalVaultEnvelope(row.encrypted_payload),
        has_photo: Boolean(row.photo_encrypted_payload || row.photo_preview_encrypted_payload),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function parseVaultItemId(rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createRequestError('Gecersiz vault kaydi');
    }

    return parsed;
}

function parseBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeOptionalPhotoPayloads(body = {}) {
    const hasPhotoPayload = body.encrypted_photo_payload !== undefined && body.encrypted_photo_payload !== null;
    const hasPhotoPreviewPayload = body.encrypted_photo_preview_payload !== undefined && body.encrypted_photo_preview_payload !== null;

    if (hasPhotoPayload !== hasPhotoPreviewPayload) {
        throw createRequestError('Fotograf icin tam boyut ve onizleme birlikte gonderilmelidir');
    }

    if (!hasPhotoPayload) {
        return {
            hasPhotoUpdate: false,
            serializedPhotoEnvelope: null,
            serializedPhotoPreviewEnvelope: null
        };
    }

    return {
        hasPhotoUpdate: true,
        serializedPhotoEnvelope: serializePersonalVaultEnvelope(
            body.encrypted_photo_payload,
            'encrypted_photo_payload',
            { maxBytes: PERSONAL_VAULT_PHOTO_MAX_BYTES }
        ),
        serializedPhotoPreviewEnvelope: serializePersonalVaultEnvelope(
            body.encrypted_photo_preview_payload,
            'encrypted_photo_preview_payload',
            { maxBytes: PERSONAL_VAULT_PHOTO_PREVIEW_MAX_BYTES }
        )
    };
}

router.get('/', authenticateToken, (req, res) => {
    try {
        const vaultRow = getVaultConfigRow(req.user.id);
        const itemCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM personal_vault_items
            WHERE user_id = ?
        `).get(req.user.id);

        return res.json({
            configured: Boolean(vaultRow),
            itemCount: Number(itemCount?.count || 0),
            config: mapVaultConfig(vaultRow)
        });
    } catch (error) {
        console.error('Get personal vault status error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault bilgisi alinamadi' });
    }
});

router.post('/setup', authenticateToken, (req, res) => {
    try {
        const existingVault = getVaultConfigRow(req.user.id);
        if (existingVault) {
            return res.status(409).json({ error: 'Personal vault zaten kurulmus' });
        }

        const payload = normalizePersonalVaultSetupPayload(req.body);

        db.prepare(`
            INSERT INTO personal_vaults (
                user_id,
                kdf_algorithm,
                kdf_salt,
                kdf_iterations,
                wrap_algorithm,
                wrap_iv,
                wrapped_vault_key,
                recovery_kdf_algorithm,
                recovery_kdf_salt,
                recovery_kdf_iterations,
                recovery_wrap_algorithm,
                recovery_wrap_iv,
                recovery_wrapped_vault_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            payload.kdfAlgorithm,
            payload.kdfSalt,
            payload.kdfIterations,
            payload.wrapAlgorithm,
            payload.wrapIv,
            payload.wrappedVaultKey,
            payload.recoveryKdfAlgorithm,
            payload.recoveryKdfSalt,
            payload.recoveryKdfIterations,
            payload.recoveryWrapAlgorithm,
            payload.recoveryWrapIv,
            payload.recoveryWrappedVaultKey
        );

        return res.status(201).json({
            success: true,
            configured: true,
            config: mapVaultConfig(getVaultConfigRow(req.user.id))
        });
    } catch (error) {
        console.error('Setup personal vault error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kurulumu basarisiz' });
    }
});

router.get('/items', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);

        const items = db.prepare(`
            SELECT
                id,
                encrypted_payload,
                photo_encrypted_payload,
                photo_preview_encrypted_payload,
                created_at,
                updated_at
            FROM personal_vault_items
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
        `).all(req.user.id).map(mapVaultItem);

        return res.json({ items });
    } catch (error) {
        console.error('List personal vault items error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kayitlari alinamadi' });
    }
});

router.get('/items/:itemId/photo', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const itemId = parseVaultItemId(req.params.itemId);
        const item = ensureVaultItem(req.user.id, itemId);

        if (!item.photo_encrypted_payload) {
            return res.status(404).json({ error: 'Vault fotografi bulunamadi' });
        }

        return res.json({
            encrypted_photo_payload: normalizePersonalVaultEnvelope(
                item.photo_encrypted_payload,
                'encrypted_photo_payload',
                { maxBytes: PERSONAL_VAULT_PHOTO_MAX_BYTES }
            )
        });
    } catch (error) {
        console.error('Get personal vault photo error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Vault fotografi alinamadi' });
    }
});

router.get('/items/:itemId/photo-preview', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const itemId = parseVaultItemId(req.params.itemId);
        const item = ensureVaultItem(req.user.id, itemId);

        if (!item.photo_preview_encrypted_payload) {
            return res.status(404).json({ error: 'Vault fotograf onizlemesi bulunamadi' });
        }

        return res.json({
            encrypted_photo_preview_payload: normalizePersonalVaultEnvelope(
                item.photo_preview_encrypted_payload,
                'encrypted_photo_preview_payload',
                { maxBytes: PERSONAL_VAULT_PHOTO_PREVIEW_MAX_BYTES }
            )
        });
    } catch (error) {
        console.error('Get personal vault photo preview error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Vault fotograf onizlemesi alinamadi' });
    }
});

router.post('/items', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const serializedEnvelope = serializePersonalVaultEnvelope(req.body?.encrypted_payload);
        const {
            serializedPhotoEnvelope,
            serializedPhotoPreviewEnvelope
        } = normalizeOptionalPhotoPayloads(req.body);

        const result = db.prepare(`
            INSERT INTO personal_vault_items (
                user_id,
                encrypted_payload,
                photo_encrypted_payload,
                photo_preview_encrypted_payload
            )
            VALUES (?, ?, ?, ?)
        `).run(
            req.user.id,
            serializedEnvelope,
            serializedPhotoEnvelope,
            serializedPhotoPreviewEnvelope
        );

        const created = ensureVaultItem(req.user.id, result.lastInsertRowid);

        return res.status(201).json({
            item: mapVaultItem(created)
        });
    } catch (error) {
        console.error('Create personal vault item error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kaydi olusturulamadi' });
    }
});

router.put('/items/:itemId', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const itemId = parseVaultItemId(req.params.itemId);
        const existingItem = ensureVaultItem(req.user.id, itemId);
        const serializedEnvelope = serializePersonalVaultEnvelope(req.body?.encrypted_payload);
        const removePhoto = parseBoolean(req.body?.remove_photo);
        const {
            hasPhotoUpdate,
            serializedPhotoEnvelope,
            serializedPhotoPreviewEnvelope
        } = normalizeOptionalPhotoPayloads(req.body);

        if (removePhoto && hasPhotoUpdate) {
            throw createRequestError('Fotograf ayni istekte hem guncellenip hem silinemez');
        }

        const nextPhotoEnvelope = hasPhotoUpdate
            ? serializedPhotoEnvelope
            : (removePhoto ? null : existingItem.photo_encrypted_payload);
        const nextPhotoPreviewEnvelope = hasPhotoUpdate
            ? serializedPhotoPreviewEnvelope
            : (removePhoto ? null : existingItem.photo_preview_encrypted_payload);

        const result = db.prepare(`
            UPDATE personal_vault_items
            SET
                encrypted_payload = ?,
                photo_encrypted_payload = ?,
                photo_preview_encrypted_payload = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            serializedEnvelope,
            nextPhotoEnvelope,
            nextPhotoPreviewEnvelope,
            itemId,
            req.user.id
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Personal vault kaydi bulunamadi' });
        }

        const updated = ensureVaultItem(req.user.id, itemId);

        return res.json({
            item: mapVaultItem(updated)
        });
    } catch (error) {
        console.error('Update personal vault item error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kaydi guncellenemedi' });
    }
});

router.delete('/items/:itemId', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const itemId = parseVaultItemId(req.params.itemId);

        const result = db.prepare(`
            DELETE FROM personal_vault_items
            WHERE id = ? AND user_id = ?
        `).run(itemId, req.user.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Personal vault kaydi bulunamadi' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Delete personal vault item error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kaydi silinemedi' });
    }
});

export default router;
