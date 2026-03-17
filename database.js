import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(join(dataDir, 'inventory.db'));
db.pragma('journal_mode = WAL');

// Create tables (only creates if they don't exist)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    house_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#6366f1',
    house_key TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    house_key TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room_id INTEGER,
    created_by INTEGER NOT NULL,
    is_public INTEGER DEFAULT 0,
    house_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    photo_path TEXT,
    barcode TEXT,
    category_id INTEGER,
    room_id INTEGER,
    location_id INTEGER,
    is_public INTEGER DEFAULT 1,
    user_id INTEGER NOT NULL,
    house_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ======================================================
// MIGRATIONS - Add missing columns to existing tables
// ======================================================

// Migration: Add house_key to users table (for old databases without it)
try {
  db.exec(`ALTER TABLE users ADD COLUMN house_key TEXT`);
  console.log('[Database] house_key column added to users table');
  // Set default house_key for existing users without one
  const defaultKey = crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE users SET house_key = ? WHERE house_key IS NULL').run(defaultKey);
} catch (e) {
  // Column already exists - ignore
}

// Migration: Add house_key to items table (for old databases)
try {
  db.exec(`ALTER TABLE items ADD COLUMN house_key TEXT`);
  console.log('[Database] house_key column added to items table');
} catch (e) { /* Column exists */ }

// Migration: Add house_key to rooms table (for old databases)
try {
  db.exec(`ALTER TABLE rooms ADD COLUMN house_key TEXT`);
  console.log('[Database] house_key column added to rooms table');
} catch (e) { /* Column exists */ }

// Migration: Add house_key to categories table (for old databases)
try {
  db.exec(`ALTER TABLE categories ADD COLUMN house_key TEXT`);
  console.log('[Database] house_key column added to categories table');
} catch (e) { /* Column exists */ }

// Migration: Add house_key to locations table (for old databases)
try {
  db.exec(`ALTER TABLE locations ADD COLUMN house_key TEXT`);
  console.log('[Database] house_key column added to locations table');
} catch (e) { /* Column exists */ }

// Migration: Add thumbnail_path column to items table (for image optimization)
try {
  db.exec(`ALTER TABLE items ADD COLUMN thumbnail_path TEXT`);
  console.log('[Database] thumbnail_path column added to items table');
} catch (e) { /* Column exists */ }

// Migration: Add barcode column to items table (for older databases)
try {
  db.exec(`ALTER TABLE items ADD COLUMN barcode TEXT`);
  console.log('[Database] barcode column added to items table');
} catch (e) { /* Column exists */ }

// Migration: Add role column to users table (for admin panel)
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
  console.log('[Database] role column added to users table');
} catch (e) { /* Column exists */ }

// Optional bootstrap admin assignment from env
try {
  const bootstrapAdminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  if (bootstrapAdminEmail) {
    const adminUser = db.prepare('SELECT id, username FROM users WHERE LOWER(email) = ?').get(bootstrapAdminEmail);
    if (adminUser) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', adminUser.id);
      console.log(`[Database] Bootstrap admin set: '${adminUser.username}'`);
    }
  }
  // Ensure role is never null
  db.prepare('UPDATE users SET role = ? WHERE role IS NULL').run('user');
} catch (e) {
  console.log('[Database] Bootstrap admin setup skipped:', e.message);
}

// Migration: Add is_banned and failed_login_count to users table
try {
  db.exec(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`);
  console.log('[Database] is_banned column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0`);
  console.log('[Database] failed_login_count column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN last_login DATETIME`);
  console.log('[Database] last_login column added to users table');
} catch (e) { /* Column exists */ }

// Migration: Add email verification columns
try {
  db.exec(`ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0`);
  console.log('[Database] is_verified column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN verification_token TEXT`);
  console.log('[Database] verification_token column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN verification_token_expires DATETIME`);
  console.log('[Database] verification_token_expires column added to users table');
} catch (e) { /* Column exists */ }

// Migration: Add active_house_key to users table for tracking current house
try {
  db.exec(`ALTER TABLE users ADD COLUMN active_house_key TEXT`);
  console.log('[Database] active_house_key column added to users table');
} catch (e) { /* Column exists */ }

// ======================================================
// CREATE INDEXES (after all migrations complete)
// ======================================================
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_house_key ON users(house_key);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_room ON items(room_id);
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE INDEX IF NOT EXISTS idx_items_public ON items(is_public);
    CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
    CREATE INDEX IF NOT EXISTS idx_items_house_key ON items(house_key);
    CREATE INDEX IF NOT EXISTS idx_rooms_house_key ON rooms(house_key);
    CREATE INDEX IF NOT EXISTS idx_categories_house_key ON categories(house_key);
    CREATE INDEX IF NOT EXISTS idx_locations_room ON locations(room_id);
    CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(created_by);
    CREATE INDEX IF NOT EXISTS idx_locations_house_key ON locations(house_key);
  `);
} catch (e) {
  console.log('[Database] Index creation skipped:', e.message);
}

// ======================================================
// CREATE ADDITIONAL TABLES
// ======================================================

// Create pending_registrations table for email verification before account creation
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    house_key TEXT NOT NULL,
    mode TEXT DEFAULT 'create',
    is_new_house INTEGER DEFAULT 1,
    verification_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_registrations(email);
  CREATE INDEX IF NOT EXISTS idx_pending_token ON pending_registrations(verification_token);
`);

// Create admin_logs table for tracking admin actions and system events
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    admin_id INTEGER,
    target_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_admin_logs_type ON admin_logs(type);
  CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at);
`);

// Create user_houses junction table for multi-house support
db.exec(`
  CREATE TABLE IF NOT EXISTS user_houses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    house_key TEXT NOT NULL,
    house_name TEXT DEFAULT 'Evim',
    is_owner INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, house_key)
  );
  CREATE INDEX IF NOT EXISTS idx_user_houses_user ON user_houses(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_houses_house ON user_houses(house_key);
`);

// Migrate existing users to user_houses table
try {
  const usersWithHouses = db.prepare('SELECT id, house_key FROM users WHERE house_key IS NOT NULL').all();
  const insertUserHouse = db.prepare('INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)');
  const updateActiveHouse = db.prepare('UPDATE users SET active_house_key = ? WHERE id = ? AND active_house_key IS NULL');

  for (const user of usersWithHouses) {
    insertUserHouse.run(user.id, user.house_key, 'Evim');
    updateActiveHouse.run(user.house_key, user.id);
  }
  if (usersWithHouses.length > 0) {
    console.log(`[Database] Migrated ${usersWithHouses.length} users to user_houses table`);
  }
} catch (e) {
  console.log('[Database] User houses migration skipped:', e.message);
}

export default db;
