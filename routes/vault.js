import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
    normalizePersonalVaultEnvelope,
    normalizePersonalVaultSetupPayload,
    serializePersonalVaultEnvelope
} from '../utils/personalVault.js';

const router = express.Router();

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

function ensureVaultConfigured(userId) {
    const vaultRow = getVaultConfigRow(userId);
    if (!vaultRow) {
        const error = new Error('Personal vault henuz kurulmamis');
        error.statusCode = 404;
        throw error;
    }

    return vaultRow;
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

function parseVaultItemId(rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        const error = new Error('Gecersiz vault kaydi');
        error.statusCode = 400;
        throw error;
    }

    return parsed;
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
            SELECT id, encrypted_payload, created_at, updated_at
            FROM personal_vault_items
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
        `).all(req.user.id).map((item) => ({
            id: item.id,
            encrypted_payload: normalizePersonalVaultEnvelope(item.encrypted_payload),
            created_at: item.created_at,
            updated_at: item.updated_at
        }));

        return res.json({ items });
    } catch (error) {
        console.error('List personal vault items error:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Personal vault kayitlari alinamadi' });
    }
});

router.post('/items', authenticateToken, (req, res) => {
    try {
        ensureVaultConfigured(req.user.id);
        const serializedEnvelope = serializePersonalVaultEnvelope(req.body?.encrypted_payload);

        const result = db.prepare(`
            INSERT INTO personal_vault_items (user_id, encrypted_payload)
            VALUES (?, ?)
        `).run(req.user.id, serializedEnvelope);

        const created = db.prepare(`
            SELECT id, encrypted_payload, created_at, updated_at
            FROM personal_vault_items
            WHERE id = ? AND user_id = ?
        `).get(result.lastInsertRowid, req.user.id);

        return res.status(201).json({
            item: {
                id: created.id,
                encrypted_payload: normalizePersonalVaultEnvelope(created.encrypted_payload),
                created_at: created.created_at,
                updated_at: created.updated_at
            }
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
        const serializedEnvelope = serializePersonalVaultEnvelope(req.body?.encrypted_payload);

        const result = db.prepare(`
            UPDATE personal_vault_items
            SET encrypted_payload = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(serializedEnvelope, itemId, req.user.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Personal vault kaydi bulunamadi' });
        }

        const updated = db.prepare(`
            SELECT id, encrypted_payload, created_at, updated_at
            FROM personal_vault_items
            WHERE id = ? AND user_id = ?
        `).get(itemId, req.user.id);

        return res.json({
            item: {
                id: updated.id,
                encrypted_payload: normalizePersonalVaultEnvelope(updated.encrypted_payload),
                created_at: updated.created_at,
                updated_at: updated.updated_at
            }
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
