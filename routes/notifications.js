import express from 'express';
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { decryptBorrowRecord, decryptItemRecord } from '../utils/protectedFields.js';

const router = express.Router();
const CLOSE_DAYS = 30;

router.use(authenticateToken);
router.use(requireActiveHouse);

function visibleItemCondition(alias = 'items') {
    return `(${alias}.is_public = 1 OR ${alias}.user_id = ?)`;
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function daysUntil(dateValue, todayStr) {
    const target = new Date(`${dateValue}T00:00:00.000Z`).getTime();
    const today = new Date(`${todayStr}T00:00:00.000Z`).getTime();
    return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

function itemTarget(item) {
    return `/items/${item.id}/edit`;
}

function itemTitle(item) {
    return item.name || 'Untitled item';
}

function pushItemDateNotification(notifications, {
    idPrefix,
    type,
    expiredTitleKey,
    expiredTitle,
    closeTitleKey,
    closeTitle,
    item,
    dateValue,
    todayStr,
    closeDateStr,
    target
}) {
    if (!dateValue) {
        return;
    }

    if (dateValue < todayStr) {
        notifications.push({
            id: `${idPrefix}-expired-${item.id}`,
            type,
            severity: 'danger',
            titleKey: expiredTitleKey,
            titleParams: {},
            title: expiredTitle,
            bodyKey: 'notifications.items.date_body',
            bodyParams: { item: itemTitle(item), date: dateValue },
            body: `${itemTitle(item)}: ${dateValue}`,
            target: target || itemTarget(item),
            sort_date: dateValue
        });
        return;
    }

    if (dateValue <= closeDateStr) {
        const remainingDays = daysUntil(dateValue, todayStr);
        notifications.push({
            id: `${idPrefix}-close-${item.id}`,
            type,
            severity: remainingDays <= 7 ? 'warning' : 'info',
            titleKey: closeTitleKey,
            titleParams: {},
            title: closeTitle,
            bodyKey: 'notifications.items.remaining_body',
            bodyParams: { item: itemTitle(item), count: remainingDays, date: dateValue },
            body: `${itemTitle(item)}: ${remainingDays} days left (${dateValue})`,
            target: target || itemTarget(item),
            sort_date: dateValue
        });
    }
}

router.get('/', (req, res) => {
    try {
        const todayStr = todayIsoDate();
        const closeDateStr = addDaysIsoDate(CLOSE_DAYS);
        const notifications = [];

        const items = db.prepare(`
            SELECT
                items.*,
                categories.name AS category_name,
                rooms.name AS room_name,
                locations.name AS location_name
            FROM items
            LEFT JOIN categories ON categories.id = items.category_id AND categories.house_key = items.house_key
            LEFT JOIN rooms ON rooms.id = items.room_id AND rooms.house_key = items.house_key
            LEFT JOIN locations ON locations.id = items.location_id AND locations.house_key = items.house_key
            WHERE items.house_key = ? AND ${visibleItemCondition('items')}
        `).all(req.user.house_key, req.user.id).map(decryptItemRecord);

        for (const item of items) {
            const quantity = Number.parseInt(String(item.quantity || 0), 10) || 0;
            const minQuantity = Number.parseInt(String(item.min_quantity || 0), 10) || 0;
            if (minQuantity > 0 && quantity < minQuantity) {
                notifications.push({
                    id: `stock-low-${item.id}`,
                    type: 'stock',
                    severity: quantity === 0 ? 'danger' : 'warning',
                    titleKey: quantity === 0 ? 'notifications.items.stock_empty_title' : 'notifications.items.stock_low_title',
                    titleParams: {},
                    title: quantity === 0 ? 'Out of stock' : 'Low stock',
                    bodyKey: 'notifications.items.stock_body',
                    bodyParams: { item: itemTitle(item), quantity, min: minQuantity },
                    body: `${itemTitle(item)}: ${quantity}/${minQuantity}`,
                    target: itemTarget(item),
                    sort_date: todayStr
                });
            }

            pushItemDateNotification(notifications, {
                idPrefix: 'expiry',
                type: 'expiry',
                expiredTitleKey: 'notifications.items.expiry_expired_title',
                expiredTitle: 'Expiration date passed',
                closeTitleKey: 'notifications.items.expiry_close_title',
                closeTitle: 'Expiration date approaching',
                item,
                dateValue: item.expiry_date,
                todayStr,
                closeDateStr
            });

            pushItemDateNotification(notifications, {
                idPrefix: 'warranty',
                type: 'warranty',
                expiredTitleKey: 'notifications.items.warranty_expired_title',
                expiredTitle: 'Warranty expired',
                closeTitleKey: 'notifications.items.warranty_close_title',
                closeTitle: 'Warranty ending soon',
                item,
                dateValue: item.warranty_expiry_date,
                todayStr,
                closeDateStr,
                target: '/service'
            });
        }

        const maintenanceTasks = db.prepare(`
            SELECT im.*, items.name AS item_name
            FROM item_maintenance im
            JOIN items ON items.id = im.item_id AND items.house_key = im.house_key
            WHERE im.house_key = ?
              AND im.next_due_date IS NOT NULL
              AND im.next_due_date <= ?
              AND ${visibleItemCondition('items')}
        `).all(req.user.house_key, closeDateStr, req.user.id);

        for (const task of maintenanceTasks) {
            const item = decryptItemRecord({ id: task.item_id, name: task.item_name });
            const overdue = task.next_due_date < todayStr;
            notifications.push({
                id: `maintenance-${task.id}`,
                type: 'maintenance',
                severity: overdue ? 'danger' : 'warning',
                titleKey: overdue ? 'notifications.items.maintenance_overdue_title' : 'notifications.items.maintenance_close_title',
                titleParams: {},
                title: overdue ? 'Maintenance overdue' : 'Maintenance due soon',
                bodyKey: 'notifications.items.maintenance_body',
                bodyParams: { item: itemTitle(item), task: task.task_name, date: task.next_due_date },
                body: `${itemTitle(item)}: ${task.task_name} (${task.next_due_date})`,
                target: '/service',
                sort_date: task.next_due_date
            });
        }

        const activeBorrows = db.prepare(`
            SELECT ib.*, items.name AS item_name
            FROM item_borrows ib
            JOIN items ON items.id = ib.item_id AND items.house_key = ib.house_key
            WHERE ib.house_key = ?
              AND ib.returned_at IS NULL
              AND ib.due_date IS NOT NULL
              AND ib.due_date <= ?
              AND ${visibleItemCondition('items')}
        `).all(req.user.house_key, closeDateStr, req.user.id);

        for (const row of activeBorrows) {
            const borrow = decryptBorrowRecord(row);
            const item = decryptItemRecord({ id: row.item_id, name: row.item_name });
            const overdue = borrow.due_date < todayStr;
            notifications.push({
                id: `borrow-${borrow.id}`,
                type: 'borrow',
                severity: overdue ? 'danger' : 'warning',
                titleKey: overdue ? 'notifications.items.borrow_overdue_title' : 'notifications.items.borrow_close_title',
                titleParams: {},
                title: overdue ? 'Borrow return overdue' : 'Borrow return due soon',
                bodyKey: 'notifications.items.date_body',
                bodyParams: { item: itemTitle(item), date: borrow.due_date },
                body: `${itemTitle(item)}: ${borrow.due_date}`,
                target: itemTarget(item),
                sort_date: borrow.due_date
            });
        }

        const severityOrder = { danger: 0, warning: 1, info: 2 };
        notifications.sort((left, right) => {
            const severityDiff = (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9);
            if (severityDiff !== 0) {
                return severityDiff;
            }
            return String(left.sort_date || '').localeCompare(String(right.sort_date || ''));
        });

        res.json({
            notifications: notifications.map(({ sort_date, ...notification }) => notification),
            summary: {
                total: notifications.length,
                danger: notifications.filter((item) => item.severity === 'danger').length,
                warning: notifications.filter((item) => item.severity === 'warning').length,
                info: notifications.filter((item) => item.severity === 'info').length
            }
        });
    } catch (err) {
        console.error('Notifications error:', err);
        res.status(500).json({ error: 'Bildirimler yüklenirken hata oluştu' });
    }
});

export default router;
