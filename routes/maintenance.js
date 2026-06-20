import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { decryptItemName } from '../utils/protectedFields.js';
import { normalizeOptionalDate } from '../utils/dateValidation.js';

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);
router.use(requireActiveHouse);

function visibleItemCondition(alias = 'items') {
    return `(${alias}.is_public = 1 OR ${alias}.user_id = ?)`;
}

function calculateNextDueDate(fromDateStr, frequencyValue, frequencyUnit) {
    if (!frequencyValue || !frequencyUnit) {
        return null;
    }
    const parts = fromDateStr.split('-');
    if (parts.length !== 3) {
        return null;
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
    }

    const date = new Date(Date.UTC(year, month, day));
    if (isNaN(date.getTime())) {
        return null;
    }

    const val = parseInt(frequencyValue, 10);
    if (isNaN(val) || val <= 0) {
        return null;
    }

    switch (frequencyUnit) {
        case 'days':
            date.setUTCDate(date.getUTCDate() + val);
            break;
        case 'weeks':
            date.setUTCDate(date.getUTCDate() + val * 7);
            break;
        case 'months':
            date.setUTCMonth(date.getUTCMonth() + val);
            break;
        case 'years':
            date.setUTCFullYear(date.getUTCFullYear() + val);
            break;
        default:
            return null;
    }

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function serializeMaintenanceTask(task) {
    if (!task) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    const isOverdue = task.next_due_date < todayStr;

    return {
        ...task,
        item_name: task.item_name ? decryptItemName(task.item_name) : null,
        is_overdue: isOverdue
    };
}

// GET /api/maintenance - Fetch all maintenance tasks for the active house
router.get('/', (req, res) => {
    try {
        const tasks = db.prepare(`
            SELECT im.*, items.name as item_name
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.house_key = ?
              AND ${visibleItemCondition('items')}
            ORDER BY im.next_due_date ASC
        `).all(req.user.house_key, req.user.id);

        res.json({ tasks: tasks.map(serializeMaintenanceTask) });
    } catch (err) {
        console.error('Get maintenance tasks error:', err);
        res.status(500).json({ error: 'Bakım görevleri yüklenirken hata oluştu' });
    }
});

// POST /api/maintenance - Create a new maintenance task
router.post('/', (req, res) => {
    try {
        const {
            item_id,
            task_name,
            description,
            frequency_value,
            frequency_unit,
            next_due_date
        } = req.body;

        if (!item_id) {
            return res.status(400).json({ error: 'Eşya seçimi gerekli' });
        }
        if (task_name.length > 255) {
            return res.status(400).json({ error: 'Bakım görevi adı en fazla 255 karakter olabilir' });
        }
        if (description && description.length > 1000) {
            return res.status(400).json({ error: 'Açıklama en fazla 1000 karakter olabilir' });
        }
        if (!next_due_date) {
            return res.status(400).json({ error: 'Planlanan tarih gerekli' });
        }

        // Ensure item belongs to the same household and is visible to the current user.
        const item = db.prepare(`
            SELECT id
            FROM items
            WHERE id = ? AND house_key = ? AND ${visibleItemCondition('items')}
        `).get(item_id, req.user.house_key, req.user.id);
        if (!item) {
            return res.status(400).json({ error: 'Geçersiz eşya veya eşyaya erişim yetkiniz yok' });
        }

        const normalizedNextDueDate = normalizeOptionalDate(next_due_date, 'Planlanan tarih');
        if (!normalizedNextDueDate) {
            return res.status(400).json({ error: 'Geçersiz planlanan tarih formatı' });
        }

        const freqVal = frequency_value ? parseInt(frequency_value, 10) : null;
        const freqUnit = frequency_unit || null;

        if ((freqVal !== null && freqUnit === null) || (freqVal === null && freqUnit !== null)) {
            return res.status(400).json({ error: 'Tekrar sıklığı için hem değer hem de birim belirtilmelidir' });
        }

        if (freqVal !== null && (isNaN(freqVal) || freqVal <= 0)) {
            return res.status(400).json({ error: 'Geçersiz tekrar sıklığı değeri' });
        }
        if (freqVal !== null && !['days', 'weeks', 'months', 'years'].includes(freqUnit)) {
            return res.status(400).json({ error: 'Geçersiz tekrar sıklığı birimi' });
        }

        const result = db.prepare(`
            INSERT INTO item_maintenance (
                item_id, task_name, description, frequency_value, frequency_unit,
                next_due_date, house_key, created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            item_id,
            task_name.trim(),
            description ? description.trim() : null,
            freqVal,
            freqUnit,
            normalizedNextDueDate,
            req.user.house_key,
            req.user.id
        );

        const newTask = db.prepare(`
            SELECT im.*, items.name as item_name
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json({ message: 'Bakım görevi eklendi', task: serializeMaintenanceTask(newTask) });
    } catch (err) {
        console.error('Create maintenance task error:', err);
        res.status(500).json({ error: err.message || 'Bakım görevi eklenirken hata oluştu' });
    }
});

// PUT /api/maintenance/:id - Update an existing maintenance task
router.put('/:id', (req, res) => {
    try {
        const taskId = req.params.id;
        const {
            task_name,
            description,
            frequency_value,
            frequency_unit,
            next_due_date
        } = req.body;

        // Ensure task belongs to the same household and is tied to an item visible to the current user.
        const existingTask = db.prepare(`
            SELECT im.*
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ? AND im.house_key = ? AND ${visibleItemCondition('items')}
        `).get(taskId, req.user.house_key, req.user.id);
        if (!existingTask) {
            return res.status(404).json({ error: 'Bakım görevi bulunamadı' });
        }

        const updatedTaskName = task_name !== undefined ? task_name.trim() : existingTask.task_name;
        if (!updatedTaskName) {
            return res.status(400).json({ error: 'Bakım görevi adı gerekli' });
        }
        if (updatedTaskName.length > 255) {
            return res.status(400).json({ error: 'Bakım görevi adı en fazla 255 karakter olabilir' });
        }

        const updatedDescription = description !== undefined ? (description ? description.trim() : null) : existingTask.description;
        if (updatedDescription && updatedDescription.length > 1000) {
            return res.status(400).json({ error: 'Açıklama en fazla 1000 karakter olabilir' });
        }

        let updatedNextDueDate = existingTask.next_due_date;
        if (next_due_date !== undefined) {
            const normalized = normalizeOptionalDate(next_due_date, 'Planlanan tarih');
            if (!normalized) {
                return res.status(400).json({ error: 'Geçersiz planlanan tarih formatı' });
            }
            updatedNextDueDate = normalized;
        }

        let updatedFreqVal = existingTask.frequency_value;
        let updatedFreqUnit = existingTask.frequency_unit;
        if (frequency_value !== undefined) {
            updatedFreqVal = frequency_value ? parseInt(frequency_value, 10) : null;
            if (updatedFreqVal !== null && (isNaN(updatedFreqVal) || updatedFreqVal <= 0)) {
                return res.status(400).json({ error: 'Geçersiz tekrar sıklığı değeri' });
            }
        }
        if (frequency_unit !== undefined) {
            updatedFreqUnit = frequency_unit || null;
            if (updatedFreqVal !== null && !['days', 'weeks', 'months', 'years'].includes(updatedFreqUnit)) {
                return res.status(400).json({ error: 'Geçersiz tekrar sıklığı birimi' });
            }
        }

        if ((updatedFreqVal !== null && updatedFreqUnit === null) || (updatedFreqVal === null && updatedFreqUnit !== null)) {
            return res.status(400).json({ error: 'Tekrar sıklığı için hem değer hem de birim belirtilmelidir' });
        }

        db.prepare(`
            UPDATE item_maintenance
            SET task_name = ?, description = ?, frequency_value = ?, frequency_unit = ?,
                next_due_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND house_key = ?
        `).run(
            updatedTaskName,
            updatedDescription,
            updatedFreqVal,
            updatedFreqUnit,
            updatedNextDueDate,
            taskId,
            req.user.house_key
        );

        const task = db.prepare(`
            SELECT im.*, items.name as item_name
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ?
        `).get(taskId);

        res.json({ message: 'Bakım görevi güncellendi', task: serializeMaintenanceTask(task) });
    } catch (err) {
        console.error('Update maintenance task error:', err);
        res.status(500).json({ error: err.message || 'Bakım görevi güncellenirken hata oluştu' });
    }
});

// POST /api/maintenance/:id/perform - Perform the maintenance task
router.post('/:id/perform', (req, res) => {
    try {
        const taskId = req.params.id;

        // Ensure task belongs to the same household and is tied to an item visible to the current user.
        const existingTask = db.prepare(`
            SELECT im.*
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ? AND im.house_key = ? AND ${visibleItemCondition('items')}
        `).get(taskId, req.user.house_key, req.user.id);
        if (!existingTask) {
            return res.status(404).json({ error: 'Bakım görevi bulunamadı' });
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // Calculate new next_due_date if recurring frequency is set
        let newNextDueDate = existingTask.next_due_date;
        if (existingTask.frequency_value && existingTask.frequency_unit) {
            newNextDueDate = calculateNextDueDate(todayStr, existingTask.frequency_value, existingTask.frequency_unit);
        }

        db.prepare(`
            UPDATE item_maintenance
            SET last_performed_at = ?, next_due_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND house_key = ?
        `).run(todayStr, newNextDueDate, taskId, req.user.house_key);

        const task = db.prepare(`
            SELECT im.*, items.name as item_name
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ?
        `).get(taskId);

        res.json({ message: 'Bakım görevi tamamlandı olarak kaydedildi', task: serializeMaintenanceTask(task) });
    } catch (err) {
        console.error('Perform maintenance task error:', err);
        res.status(500).json({ error: 'Bakım görevi kaydedilirken hata oluştu' });
    }
});

// DELETE /api/maintenance/:id - Delete a maintenance task
router.delete('/:id', (req, res) => {
    try {
        const taskId = req.params.id;

        // Ensure task belongs to the same household and is tied to an item visible to the current user.
        const existingTask = db.prepare(`
            SELECT im.id
            FROM item_maintenance im
            JOIN items ON im.item_id = items.id
            WHERE im.id = ? AND im.house_key = ? AND ${visibleItemCondition('items')}
        `).get(taskId, req.user.house_key, req.user.id);
        if (!existingTask) {
            return res.status(404).json({ error: 'Bakım görevi bulunamadı' });
        }

        db.prepare('DELETE FROM item_maintenance WHERE id = ? AND house_key = ?').run(taskId, req.user.house_key);

        res.json({ message: 'Bakım görevi silindi' });
    } catch (err) {
        console.error('Delete maintenance task error:', err);
        res.status(500).json({ error: 'Bakım görevi silinirken hata oluştu' });
    }
});

export default router;
