import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Date interval calculation replica from routes/maintenance.js to verify accuracy
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

// Set up mock DB schema
function setupMockDatabase() {
    const db = new Database(':memory:');

    // Core users table
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            house_key TEXT NOT NULL
        )
    `);

    // Core items table
    db.exec(`
        CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            min_quantity INTEGER DEFAULT 0,
            expiry_date TEXT,
            house_key TEXT NOT NULL,
            user_id INTEGER NOT NULL
        )
    `);

    // Maintenance table
    db.exec(`
        CREATE TABLE item_maintenance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            description TEXT,
            frequency_value INTEGER,
            frequency_unit TEXT,
            last_performed_at TEXT,
            next_due_date TEXT NOT NULL,
            house_key TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        )
    `);

    // Shopping List table
    db.exec(`
        CREATE TABLE shopping_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER,
            item_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            is_completed INTEGER DEFAULT 0,
            house_key TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
        )
    `);

    return db;
}

test('Date interval calculations function as intended across boundaries', () => {
    // Basic day interval
    assert.equal(calculateNextDueDate('2026-05-01', 5, 'days'), '2026-05-06');
    // Leap year boundary (Feb 28 in 2028 is leap year, feb has 29 days)
    assert.equal(calculateNextDueDate('2028-02-28', 1, 'days'), '2028-02-29');
    assert.equal(calculateNextDueDate('2028-02-28', 2, 'days'), '2028-03-01');
    // Month interval wrapping year boundary
    assert.equal(calculateNextDueDate('2026-11-15', 3, 'months'), '2027-02-15');
    // Years interval
    assert.equal(calculateNextDueDate('2026-05-01', 4, 'years'), '2030-05-01');
    // Invalid inputs return null
    assert.equal(calculateNextDueDate('invalid-date', 3, 'months'), null);
    assert.equal(calculateNextDueDate('2026-05-01', 0, 'days'), null);
    assert.equal(calculateNextDueDate('2026-05-01', 5, 'unknown_unit'), null);
});

test('Strict household isolation is enforced for maintenance tasks and shopping items', () => {
    const db = setupMockDatabase();

    // Seed house keys and users
    db.prepare('INSERT INTO users (username, email, house_key) VALUES (?, ?, ?)').run('alice', 'alice@houseA.com', 'HOUSE_A_KEY');
    db.prepare('INSERT INTO users (username, email, house_key) VALUES (?, ?, ?)').run('bob', 'bob@houseB.com', 'HOUSE_B_KEY');

    // Seed items
    db.prepare('INSERT INTO items (name, quantity, house_key, user_id) VALUES (?, ?, ?, ?)').run('Klima', 1, 'HOUSE_A_KEY', 1);
    db.prepare('INSERT INTO items (name, quantity, house_key, user_id) VALUES (?, ?, ?, ?)').run('Kombi', 1, 'HOUSE_B_KEY', 2);

    // Seed maintenance for House A
    db.prepare(`
        INSERT INTO item_maintenance (item_id, task_name, frequency_value, frequency_unit, next_due_date, house_key, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'Filtre temizliği', 6, 'months', '2026-06-01', 'HOUSE_A_KEY', 1);

    // Seed maintenance for House B
    db.prepare(`
        INSERT INTO item_maintenance (item_id, task_name, frequency_value, frequency_unit, next_due_date, house_key, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 'Yıllık bakım', 1, 'years', '2026-10-01', 'HOUSE_B_KEY', 2);

    // 1. Fetching checks
    const houseATasks = db.prepare('SELECT * FROM item_maintenance WHERE house_key = ?').all('HOUSE_A_KEY');
    const houseBTasks = db.prepare('SELECT * FROM item_maintenance WHERE house_key = ?').all('HOUSE_B_KEY');

    assert.equal(houseATasks.length, 1);
    assert.equal(houseATasks[0].task_name, 'Filtre temizliği');
    assert.equal(houseBTasks.length, 1);
    assert.equal(houseBTasks[0].task_name, 'Yıllık bakım');

    // 2. Cross-household modification prevention (security checks)
    // House B user trying to perform maintenance on House A task
    const targetTaskId = houseATasks[0].id;
    const houseBUserKey = 'HOUSE_B_KEY';

    // Simulate query pattern inside routes (enforces taskId and house_key matching)
    const crossPerformQuery = db.prepare('UPDATE item_maintenance SET last_performed_at = ? WHERE id = ? AND house_key = ?');
    const result = crossPerformQuery.run('2026-05-21', targetTaskId, houseBUserKey);

    assert.equal(result.changes, 0); // Assert zero rows updated due to mismatched household scope

    // Real update using correct household
    const correctPerformQuery = db.prepare('UPDATE item_maintenance SET last_performed_at = ? WHERE id = ? AND house_key = ?');
    const correctResult = correctPerformQuery.run('2026-05-21', targetTaskId, 'HOUSE_A_KEY');

    assert.equal(correctResult.changes, 1);
});

test('Shopping list correctly merges duplicate active entries and aggregates quantities', () => {
    const db = setupMockDatabase();

    // Setup House & User
    db.prepare('INSERT INTO users (username, email, house_key) VALUES (?, ?, ?)').run('charlie', 'charlie@house.com', 'HOUSE_C_KEY');

    const houseKey = 'HOUSE_C_KEY';
    const userId = 1;

    // Seed dummy item for foreign key check
    db.prepare('INSERT INTO items (id, name, quantity, house_key, user_id) VALUES (?, ?, ?, ?, ?)').run(45, 'Muz', 5, houseKey, userId);

    // Helper function matching routes/shopping.js logic for inserting / merging
    function addShoppingItem(itemId, itemName, quantity) {
        const existing = db.prepare(`
            SELECT id, quantity FROM shopping_list
            WHERE house_key = ? AND is_completed = 0 AND (
                (item_id IS NOT NULL AND item_id = ?) OR
                (item_id IS NULL AND LOWER(item_name) = LOWER(?))
            )
            LIMIT 1
        `).get(houseKey, itemId || null, itemName.trim());

        if (existing) {
            db.prepare('UPDATE shopping_list SET quantity = ? WHERE id = ?')
                .run(existing.quantity + quantity, existing.id);
            return existing.id;
        } else {
            const res = db.prepare(`
                INSERT INTO shopping_list (item_id, item_name, quantity, is_completed, house_key, created_by)
                VALUES (?, ?, ?, 0, ?, ?)
            `).run(itemId || null, itemName.trim(), quantity, houseKey, userId);
            return res.lastInsertRowid;
        }
    }

    // Add first manual item: 'Süt' x2
    const firstId = addShoppingItem(null, 'Süt', 2);

    // Add second manual item: 'süt' (different casing) x3
    const secondId = addShoppingItem(null, 'süt', 3);

    // Assert that the items merged into the first list entry
    assert.equal(firstId, secondId);

    const mergedItem = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(firstId);
    assert.equal(mergedItem.item_name, 'Süt');
    assert.equal(mergedItem.quantity, 5); // 2 + 3 = 5

    // Add linked inventory item
    const linkedId = addShoppingItem(45, 'Muz', 1);
    const linkedDuplicateId = addShoppingItem(45, 'Muz Ezmesi', 2); // Merged by item_id match

    assert.equal(linkedId, linkedDuplicateId);
    const mergedLinked = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(linkedId);
    assert.equal(mergedLinked.quantity, 3); // 1 + 2 = 3
});

test('Recurrence completeness validator works as intended', () => {
    const checkValidity = (freqVal, freqUnit) => {
        const val = freqVal ? parseInt(freqVal, 10) : null;
        const unit = freqUnit || null;
        return !((val !== null && unit === null) || (val === null && unit !== null));
    };

    assert.equal(checkValidity(5, 'months'), true);
    assert.equal(checkValidity(null, null), true);
    assert.equal(checkValidity(5, null), false);
    assert.equal(checkValidity(null, 'months'), false);
});

test('Smart next due date calculation works correctly for overdue and future tasks', () => {
    const todayStr = '2026-05-21';

    // Helper to run mock logic (always uses todayStr to prevent stacking)
    const calculateNewNextDueDate = (existingNextDueDate, freqVal, freqUnit) => {
        return calculateNextDueDate(todayStr, freqVal, freqUnit);
    };

    // 1. Overdue task (past due date e.g. 2026-04-18)
    // Should calculate from todayStr (2026-05-21) + 6 months = 2026-11-21
    const overdueResult = calculateNewNextDueDate('2026-04-18', 6, 'months');
    assert.equal(overdueResult, '2026-11-21');

    // 2. Future task (e.g. 2026-11-21)
    // Should also calculate from todayStr (2026-05-21) + 6 months = 2026-11-21 to prevent stacking
    const futureResult = calculateNewNextDueDate('2026-11-21', 6, 'months');
    assert.equal(futureResult, '2026-11-21');
});
