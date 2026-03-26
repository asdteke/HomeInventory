import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { toSqliteUtcTimestamp } from '../utils/sqliteDate.js';

test('toSqliteUtcTimestamp emits SQLite-compatible UTC timestamps', () => {
    assert.equal(
        toSqliteUtcTimestamp('2026-03-26T01:02:03.999Z'),
        '2026-03-26 01:02:03'
    );
});

test('SQLite-compatible timestamps preserve same-day ordering in SQL comparisons', () => {
    const db = new Database(':memory:');
    const earlier = toSqliteUtcTimestamp('2026-03-26T01:00:00.000Z');
    const later = toSqliteUtcTimestamp('2026-03-26T23:59:59.000Z');

    assert.equal(
        db.prepare('SELECT ? > ? AS gt').get(earlier, '2026-03-26 23:59:59').gt,
        0
    );
    assert.equal(
        db.prepare('SELECT ? > ? AS gt').get(later, '2026-03-26 01:00:00').gt,
        1
    );
});
