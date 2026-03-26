import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  decryptFromStorage,
  encryptBufferForStorage,
  encryptForStorage,
  hashLookupToken,
  isEncryptedPayload
} from './utils/encryption.js';
import {
  buildBarcodeLookup,
  buildEmailLookup,
  buildUsernameLookup,
  decryptEmail,
  decryptUsername,
  encryptCategoryName,
  encryptEmail,
  encryptItemDescription,
  encryptItemBarcode,
  encryptItemInvoiceCurrency,
  encryptItemInvoiceDate,
  encryptItemInvoicePrice,
  encryptItemName,
  encryptItemWarrantyDurationUnit,
  encryptItemWarrantyDurationValue,
  encryptItemWarrantyExpiryDate,
  encryptItemWarrantyStartDate,
  encryptHouseName,
  encryptLocationName,
  encryptRoomDescription,
  encryptRoomName,
  encryptUsername
} from './utils/protectedFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ITEM_PHOTO_MEDIA_PURPOSE = 'inventory.media.photo';
const ITEM_THUMBNAIL_MEDIA_PURPOSE = 'inventory.media.thumbnail';
const ITEM_INVOICE_MEDIA_PURPOSE = 'inventory.media.invoice';
const ITEM_INVOICE_THUMBNAIL_MEDIA_PURPOSE = 'inventory.media.invoice_thumbnail';

function normalizeStoredPath(storedPath) {
  if (!storedPath) {
    return null;
  }

  return String(storedPath)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\/+/, '');
}

function resolveStoredPath(storedPath) {
  const normalized = normalizeStoredPath(storedPath);
  if (!normalized) {
    return null;
  }

  return join(__dirname, normalized);
}

// Ensure data directory exists
const configuredDbPath = String(process.env.HOMEINVENTORY_DB_PATH || '').trim();
const dataDir = String(process.env.HOMEINVENTORY_DATA_DIR || '').trim()
  ? resolve(process.cwd(), String(process.env.HOMEINVENTORY_DATA_DIR || '').trim())
  : join(__dirname, 'data');
const databasePath = configuredDbPath
  ? resolve(process.cwd(), configuredDbPath)
  : join(dataDir, 'inventory.db');
const databaseDir = dirname(databasePath);

if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

// Initialize database
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');

// Create tables (only creates if they don't exist)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    house_key TEXT,
    recovery_key_hash TEXT,
    recovery_key_value TEXT,
    recovery_key_generated_at DATETIME,
    password_reset_failed_count INTEGER DEFAULT 0,
    password_reset_locked_until DATETIME,
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
    thumbnail_path TEXT,
    invoice_photo_path TEXT,
    invoice_thumbnail_path TEXT,
    barcode TEXT,
    invoice_price TEXT,
    invoice_currency TEXT,
    invoice_date TEXT,
    warranty_start_date TEXT,
    warranty_duration_value TEXT,
    warranty_duration_unit TEXT,
    warranty_expiry_date TEXT,
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

try {
  db.exec(`ALTER TABLE items ADD COLUMN invoice_photo_path TEXT`);
  console.log('[Database] invoice_photo_path column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN invoice_thumbnail_path TEXT`);
  console.log('[Database] invoice_thumbnail_path column added to items table');
} catch (e) { /* Column exists */ }

// Migration: Add barcode column to items table (for older databases)
try {
  db.exec(`ALTER TABLE items ADD COLUMN barcode TEXT`);
  console.log('[Database] barcode column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN barcode_lookup TEXT`);
  console.log('[Database] barcode_lookup column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN invoice_price TEXT`);
  console.log('[Database] invoice_price column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN invoice_currency TEXT`);
  console.log('[Database] invoice_currency column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN invoice_date TEXT`);
  console.log('[Database] invoice_date column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN warranty_expiry_date TEXT`);
  console.log('[Database] warranty_expiry_date column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN warranty_start_date TEXT`);
  console.log('[Database] warranty_start_date column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN warranty_duration_value TEXT`);
  console.log('[Database] warranty_duration_value column added to items table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE items ADD COLUMN warranty_duration_unit TEXT`);
  console.log('[Database] warranty_duration_unit column added to items table');
} catch (e) { /* Column exists */ }

// Migration: Add role column to users table (for admin panel)
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
  console.log('[Database] role column added to users table');
} catch (e) { /* Column exists */ }

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
  db.exec(`ALTER TABLE users ADD COLUMN verification_token_hashed INTEGER DEFAULT 0`);
  console.log('[Database] verification_token_hashed column added to users table');
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

try {
  db.exec(`ALTER TABLE users ADD COLUMN username_lookup TEXT`);
  console.log('[Database] username_lookup column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN email_lookup TEXT`);
  console.log('[Database] email_lookup column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN recovery_key_hash TEXT`);
  console.log('[Database] recovery_key_hash column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN recovery_key_value TEXT`);
  console.log('[Database] recovery_key_value column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN recovery_key_generated_at DATETIME`);
  console.log('[Database] recovery_key_generated_at column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN password_reset_failed_count INTEGER DEFAULT 0`);
  console.log('[Database] password_reset_failed_count column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN password_reset_locked_until DATETIME`);
  console.log('[Database] password_reset_locked_until column added to users table');
} catch (e) { /* Column exists */ }

// Optional bootstrap admin assignment from env
try {
  const bootstrapAdminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  if (bootstrapAdminEmail) {
    const bootstrapAdminLookup = buildEmailLookup(bootstrapAdminEmail);
    const adminUser = db.prepare(`
      SELECT id, username
      FROM users
      WHERE email_lookup = ? OR email = ?
      LIMIT 1
    `).get(bootstrapAdminLookup, bootstrapAdminEmail);
    if (adminUser) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', adminUser.id);
      console.log(`[Database] Bootstrap admin set: '${decryptUsername(adminUser.username)}'`);
    }
  }
  // Ensure role is never null
  db.prepare('UPDATE users SET role = ? WHERE role IS NULL').run('user');
} catch (e) {
  console.log('[Database] Bootstrap admin setup skipped:', e.message);
}

// ======================================================
// CREATE INDEXES (after all migrations complete)
// ======================================================
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_house_key ON users(house_key);
    CREATE INDEX IF NOT EXISTS idx_users_username_lookup ON users(username_lookup);
    CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON users(email_lookup);
    CREATE INDEX IF NOT EXISTS idx_users_password_reset_locked_until ON users(password_reset_locked_until);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_room ON items(room_id);
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE INDEX IF NOT EXISTS idx_items_public ON items(is_public);
    CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
    CREATE INDEX IF NOT EXISTS idx_items_barcode_lookup ON items(barcode_lookup);
    CREATE INDEX IF NOT EXISTS idx_items_house_key ON items(house_key);
    CREATE INDEX IF NOT EXISTS idx_rooms_house_key ON rooms(house_key);
    CREATE INDEX IF NOT EXISTS idx_categories_house_key ON categories(house_key);
    CREATE INDEX IF NOT EXISTS idx_locations_room ON locations(room_id);
    CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(created_by);
    CREATE INDEX IF NOT EXISTS idx_locations_house_key ON locations(house_key);
    CREATE INDEX IF NOT EXISTS idx_users_verification_token_lookup ON users(verification_token_hashed, verification_token);
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
    verification_token_hashed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_registrations(email);
  CREATE INDEX IF NOT EXISTS idx_pending_token ON pending_registrations(verification_token);
`);

try {
  db.exec(`ALTER TABLE pending_registrations ADD COLUMN verification_token_hashed INTEGER DEFAULT 0`);
  console.log('[Database] verification_token_hashed column added to pending_registrations table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE pending_registrations ADD COLUMN username_lookup TEXT`);
  console.log('[Database] username_lookup column added to pending_registrations table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE pending_registrations ADD COLUMN email_lookup TEXT`);
  console.log('[Database] email_lookup column added to pending_registrations table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_token_lookup ON pending_registrations(verification_token_hashed, verification_token)`);
} catch (e) {
  console.log('[Database] pending_registrations verification token lookup index skipped:', e.message);
}

try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pending_username_lookup ON pending_registrations(username_lookup);
    CREATE INDEX IF NOT EXISTS idx_pending_email_lookup ON pending_registrations(email_lookup);
  `);
} catch (e) {
  console.log('[Database] pending_registrations lookup index creation skipped:', e.message);
}

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

db.exec(`
  CREATE TABLE IF NOT EXISTS house_join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_user_id INTEGER NOT NULL,
    house_key TEXT NOT NULL,
    requested_house_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    decided_by_user_id INTEGER,
    FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
  );
  CREATE INDEX IF NOT EXISTS idx_house_join_requests_requester ON house_join_requests(requester_user_id);
  CREATE INDEX IF NOT EXISTS idx_house_join_requests_house ON house_join_requests(house_key);
  CREATE INDEX IF NOT EXISTS idx_house_join_requests_status ON house_join_requests(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_house_join_requests_unique_pending
    ON house_join_requests(requester_user_id, house_key)
    WHERE status = 'pending';
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_lookup_hash TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    used_ip TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK (channel IN ('email'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_requests_lookup
    ON password_reset_requests(token_lookup_hash);
  CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user
    ON password_reset_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires
    ON password_reset_requests(expires_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS personal_vaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    kdf_algorithm TEXT NOT NULL,
    kdf_salt TEXT NOT NULL,
    kdf_iterations INTEGER NOT NULL,
    wrap_algorithm TEXT NOT NULL,
    wrap_iv TEXT NOT NULL,
    wrapped_vault_key TEXT NOT NULL,
    recovery_kdf_algorithm TEXT NOT NULL,
    recovery_kdf_salt TEXT NOT NULL,
    recovery_kdf_iterations INTEGER NOT NULL,
    recovery_wrap_algorithm TEXT NOT NULL,
    recovery_wrap_iv TEXT NOT NULL,
    recovery_wrapped_vault_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_personal_vaults_user ON personal_vaults(user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS personal_vault_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    encrypted_payload TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_personal_vault_items_user ON personal_vault_items(user_id);
`);

// Migration: Add TOTP 2FA columns to users table
try {
  db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
  console.log('[Database] totp_secret column added to users table');
} catch (e) { /* Column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`);
  console.log('[Database] totp_enabled column added to users table');
} catch (e) { /* Column exists */ }

// Create TOTP backup codes table
db.exec(`
  CREATE TABLE IF NOT EXISTS totp_backup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_totp_backup_codes_user ON totp_backup_codes(user_id);
`);

// Create trusted devices table for "Remember this device" feature
db.exec(`
  CREATE TABLE IF NOT EXISTS trusted_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
  CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(token_hash);
  CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON trusted_devices(expires_at);
`);

// Migrate existing users to user_houses table
try {
  const usersWithHouses = db.prepare('SELECT id, house_key FROM users WHERE house_key IS NOT NULL').all();
  const insertUserHouse = db.prepare('INSERT OR IGNORE INTO user_houses (user_id, house_key, house_name, is_owner) VALUES (?, ?, ?, 1)');
  const updateActiveHouse = db.prepare('UPDATE users SET active_house_key = ? WHERE id = ? AND active_house_key IS NULL');

  for (const user of usersWithHouses) {
    insertUserHouse.run(user.id, user.house_key, encryptHouseName('Evim'));
    updateActiveHouse.run(user.house_key, user.id);
  }
  if (usersWithHouses.length > 0) {
    console.log(`[Database] Migrated ${usersWithHouses.length} users to user_houses table`);
  }
} catch (e) {
  console.log('[Database] User houses migration skipped:', e.message);
}

function backfillSensitiveFieldProtection() {
  const summary = {
    pendingHouseKeysEncrypted: 0,
    pendingUsernamesEncrypted: 0,
    pendingEmailsEncrypted: 0,
    pendingUsernameLookupsBackfilled: 0,
    pendingEmailLookupsBackfilled: 0,
    pendingVerificationTokensHashed: 0,
    userUsernamesEncrypted: 0,
    userEmailsEncrypted: 0,
    userUsernameLookupsBackfilled: 0,
    userEmailLookupsBackfilled: 0,
    userVerificationTokensHashed: 0,
    itemNamesEncrypted: 0,
    itemDescriptionsEncrypted: 0,
    itemBarcodesEncrypted: 0,
    itemInvoicePricesEncrypted: 0,
    itemInvoiceCurrenciesEncrypted: 0,
    itemInvoiceDatesEncrypted: 0,
    itemWarrantyStartDatesEncrypted: 0,
    itemWarrantyDurationValuesEncrypted: 0,
    itemWarrantyDurationUnitsEncrypted: 0,
    itemWarrantyDatesEncrypted: 0,
    itemBarcodeLookupsBackfilled: 0,
    roomNamesEncrypted: 0,
    roomDescriptionsEncrypted: 0,
    locationNamesEncrypted: 0,
    categoryNamesEncrypted: 0,
    houseNamesEncrypted: 0,
    itemPhotosEncrypted: 0,
    itemThumbnailsEncrypted: 0,
    itemInvoicePhotosEncrypted: 0,
    itemInvoiceThumbnailsEncrypted: 0
  };

  const pendingRows = db.prepare(`
    SELECT
      id,
      username,
      email,
      username_lookup,
      email_lookup,
      house_key,
      verification_token,
      COALESCE(verification_token_hashed, 0) AS verification_token_hashed
    FROM pending_registrations
  `).all();

  const updatePendingRegistration = db.prepare(`
    UPDATE pending_registrations
    SET username = ?, email = ?, username_lookup = ?, email_lookup = ?,
        house_key = ?, verification_token = ?, verification_token_hashed = ?
    WHERE id = ?
  `);

  const migratePendingRegistrations = db.transaction((rows) => {
    for (const row of rows) {
      let changed = false;
      let nextUsername = row.username;
      let nextEmail = row.email;
      let nextUsernameLookup = row.username_lookup || null;
      let nextEmailLookup = row.email_lookup || null;
      let nextHouseKey = row.house_key;
      let nextVerificationToken = row.verification_token;
      let nextVerificationTokenHashed = row.verification_token_hashed === 1 ? 1 : 0;

      if (nextUsername && !isEncryptedPayload(nextUsername)) {
        nextUsername = encryptUsername(nextUsername);
        summary.pendingUsernamesEncrypted++;
        changed = true;
      }

      if (nextEmail && !isEncryptedPayload(nextEmail)) {
        nextEmail = encryptEmail(nextEmail);
        summary.pendingEmailsEncrypted++;
        changed = true;
      }

      const pendingUsernameValue = nextUsername ? decryptUsername(nextUsername) : '';
      const pendingEmailValue = nextEmail ? decryptEmail(nextEmail) : '';
      const expectedPendingUsernameLookup = pendingUsernameValue ? buildUsernameLookup(pendingUsernameValue) : null;
      const expectedPendingEmailLookup = pendingEmailValue ? buildEmailLookup(pendingEmailValue) : null;

      if (expectedPendingUsernameLookup !== nextUsernameLookup) {
        nextUsernameLookup = expectedPendingUsernameLookup;
        summary.pendingUsernameLookupsBackfilled++;
        changed = true;
      }

      if (expectedPendingEmailLookup !== nextEmailLookup) {
        nextEmailLookup = expectedPendingEmailLookup;
        summary.pendingEmailLookupsBackfilled++;
        changed = true;
      }

      if (nextHouseKey && !isEncryptedPayload(nextHouseKey)) {
        nextHouseKey = encryptForStorage(nextHouseKey, { purpose: 'pending_registration.house_key' });
        summary.pendingHouseKeysEncrypted++;
        changed = true;
      }

      if (nextVerificationToken && nextVerificationTokenHashed !== 1) {
        nextVerificationToken = hashLookupToken(nextVerificationToken);
        nextVerificationTokenHashed = 1;
        summary.pendingVerificationTokensHashed++;
        changed = true;
      }

      if (changed) {
        updatePendingRegistration.run(
          nextUsername,
          nextEmail,
          nextUsernameLookup,
          nextEmailLookup,
          nextHouseKey,
          nextVerificationToken,
          nextVerificationTokenHashed,
          row.id
        );
      }
    }
  });

  migratePendingRegistrations(pendingRows);

  const userRows = db.prepare(`
    SELECT
      id,
      username,
      email,
      username_lookup,
      email_lookup,
      verification_token,
      COALESCE(verification_token_hashed, 0) AS verification_token_hashed
    FROM users
  `).all();

  const updateUserProtectedFields = db.prepare(`
    UPDATE users
    SET username = ?, email = ?, username_lookup = ?, email_lookup = ?,
        verification_token = ?, verification_token_hashed = ?
    WHERE id = ?
  `);

  const migrateUserProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      let changed = false;
      let nextUsername = row.username;
      let nextEmail = row.email;
      let nextUsernameLookup = row.username_lookup || null;
      let nextEmailLookup = row.email_lookup || null;
      let nextVerificationToken = row.verification_token;
      let nextVerificationTokenHashed = row.verification_token_hashed === 1 ? 1 : 0;

      if (nextUsername && !isEncryptedPayload(nextUsername)) {
        nextUsername = encryptUsername(nextUsername);
        summary.userUsernamesEncrypted++;
        changed = true;
      }

      if (nextEmail && !isEncryptedPayload(nextEmail)) {
        nextEmail = encryptEmail(nextEmail);
        summary.userEmailsEncrypted++;
        changed = true;
      }

      const userUsernameValue = nextUsername ? decryptUsername(nextUsername) : '';
      const userEmailValue = nextEmail ? decryptEmail(nextEmail) : '';
      const expectedUserUsernameLookup = userUsernameValue ? buildUsernameLookup(userUsernameValue) : null;
      const expectedUserEmailLookup = userEmailValue ? buildEmailLookup(userEmailValue) : null;

      if (expectedUserUsernameLookup !== nextUsernameLookup) {
        nextUsernameLookup = expectedUserUsernameLookup;
        summary.userUsernameLookupsBackfilled++;
        changed = true;
      }

      if (expectedUserEmailLookup !== nextEmailLookup) {
        nextEmailLookup = expectedUserEmailLookup;
        summary.userEmailLookupsBackfilled++;
        changed = true;
      }

      if (nextVerificationToken && nextVerificationTokenHashed !== 1) {
        nextVerificationToken = hashLookupToken(nextVerificationToken);
        nextVerificationTokenHashed = 1;
        summary.userVerificationTokensHashed++;
        changed = true;
      }

      if (changed) {
        updateUserProtectedFields.run(
          nextUsername,
          nextEmail,
          nextUsernameLookup,
          nextEmailLookup,
          nextVerificationToken,
          nextVerificationTokenHashed,
          row.id
        );
      }
    }
  });

  migrateUserProtectedFields(userRows);

  const itemRows = db.prepare(`
    SELECT
      id,
      name,
      description,
      barcode,
      invoice_price,
      invoice_currency,
      invoice_date,
      warranty_start_date,
      warranty_duration_value,
      warranty_duration_unit,
      warranty_expiry_date,
      barcode_lookup
    FROM items
  `).all();

  const updateItemProtectedFields = db.prepare(`
    UPDATE items
    SET name = ?, description = ?, barcode = ?, invoice_price = ?, invoice_currency = ?, invoice_date = ?,
        warranty_start_date = ?, warranty_duration_value = ?, warranty_duration_unit = ?, warranty_expiry_date = ?, barcode_lookup = ?
    WHERE id = ?
  `);

  const migrateItemProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      let changed = false;
      let nextName = row.name;
      let nextDescription = row.description;
      let nextBarcode = row.barcode;
      let nextInvoicePrice = row.invoice_price;
      let nextInvoiceCurrency = row.invoice_currency;
      let nextInvoiceDate = row.invoice_date;
      let nextWarrantyStartDate = row.warranty_start_date;
      let nextWarrantyDurationValue = row.warranty_duration_value;
      let nextWarrantyDurationUnit = row.warranty_duration_unit;
      let nextWarrantyExpiryDate = row.warranty_expiry_date;
      let nextBarcodeLookup = row.barcode_lookup || null;

      if (nextName && !isEncryptedPayload(nextName)) {
        nextName = encryptItemName(nextName);
        summary.itemNamesEncrypted++;
        changed = true;
      }

      if (nextDescription && !isEncryptedPayload(nextDescription)) {
        nextDescription = encryptItemDescription(nextDescription);
        summary.itemDescriptionsEncrypted++;
        changed = true;
      }

      if (nextBarcode && !isEncryptedPayload(nextBarcode)) {
        nextBarcode = encryptItemBarcode(nextBarcode);
        summary.itemBarcodesEncrypted++;
        changed = true;
      }

      if (nextInvoicePrice && !isEncryptedPayload(nextInvoicePrice)) {
        nextInvoicePrice = encryptItemInvoicePrice(nextInvoicePrice);
        summary.itemInvoicePricesEncrypted++;
        changed = true;
      }

      if (nextInvoiceCurrency && !isEncryptedPayload(nextInvoiceCurrency)) {
        nextInvoiceCurrency = encryptItemInvoiceCurrency(nextInvoiceCurrency);
        summary.itemInvoiceCurrenciesEncrypted++;
        changed = true;
      }

      if (nextInvoiceDate && !isEncryptedPayload(nextInvoiceDate)) {
        nextInvoiceDate = encryptItemInvoiceDate(nextInvoiceDate);
        summary.itemInvoiceDatesEncrypted++;
        changed = true;
      }

      if (nextWarrantyStartDate && !isEncryptedPayload(nextWarrantyStartDate)) {
        nextWarrantyStartDate = encryptItemWarrantyStartDate(nextWarrantyStartDate);
        summary.itemWarrantyStartDatesEncrypted++;
        changed = true;
      }

      if (nextWarrantyDurationValue && !isEncryptedPayload(nextWarrantyDurationValue)) {
        nextWarrantyDurationValue = encryptItemWarrantyDurationValue(nextWarrantyDurationValue);
        summary.itemWarrantyDurationValuesEncrypted++;
        changed = true;
      }

      if (nextWarrantyDurationUnit && !isEncryptedPayload(nextWarrantyDurationUnit)) {
        nextWarrantyDurationUnit = encryptItemWarrantyDurationUnit(nextWarrantyDurationUnit);
        summary.itemWarrantyDurationUnitsEncrypted++;
        changed = true;
      }

      if (nextWarrantyExpiryDate && !isEncryptedPayload(nextWarrantyExpiryDate)) {
        nextWarrantyExpiryDate = encryptItemWarrantyExpiryDate(nextWarrantyExpiryDate);
        summary.itemWarrantyDatesEncrypted++;
        changed = true;
      }

      const barcodeValue = nextBarcode ? decryptFromStorage(nextBarcode, { purpose: 'inventory.item.barcode' }) : '';
      const expectedBarcodeLookup = barcodeValue ? buildBarcodeLookup(barcodeValue) : null;

      if (expectedBarcodeLookup !== nextBarcodeLookup) {
        nextBarcodeLookup = expectedBarcodeLookup;
        summary.itemBarcodeLookupsBackfilled++;
        changed = true;
      }

      if (changed) {
        updateItemProtectedFields.run(
          nextName,
          nextDescription,
          nextBarcode,
          nextInvoicePrice,
          nextInvoiceCurrency,
          nextInvoiceDate,
          nextWarrantyStartDate,
          nextWarrantyDurationValue,
          nextWarrantyDurationUnit,
          nextWarrantyExpiryDate,
          nextBarcodeLookup,
          row.id
        );
      }
    }
  });

  migrateItemProtectedFields(itemRows);

  const roomRows = db.prepare(`
    SELECT
      id,
      name,
      description
    FROM rooms
  `).all();

  const updateRoomProtectedFields = db.prepare(`
    UPDATE rooms
    SET name = ?, description = ?
    WHERE id = ?
  `);

  const migrateRoomProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      let changed = false;
      let nextName = row.name;
      let nextDescription = row.description;

      if (nextName && !isEncryptedPayload(nextName)) {
        nextName = encryptRoomName(nextName);
        summary.roomNamesEncrypted++;
        changed = true;
      }

      if (nextDescription && !isEncryptedPayload(nextDescription)) {
        nextDescription = encryptRoomDescription(nextDescription);
        summary.roomDescriptionsEncrypted++;
        changed = true;
      }

      if (changed) {
        updateRoomProtectedFields.run(nextName, nextDescription, row.id);
      }
    }
  });

  migrateRoomProtectedFields(roomRows);

  const locationRows = db.prepare(`
    SELECT
      id,
      name
    FROM locations
  `).all();

  const updateLocationProtectedFields = db.prepare(`
    UPDATE locations
    SET name = ?
    WHERE id = ?
  `);

  const migrateLocationProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.name || isEncryptedPayload(row.name)) {
        continue;
      }

      updateLocationProtectedFields.run(encryptLocationName(row.name), row.id);
      summary.locationNamesEncrypted++;
    }
  });

  migrateLocationProtectedFields(locationRows);

  const categoryRows = db.prepare(`
    SELECT
      id,
      name
    FROM categories
  `).all();

  const updateCategoryProtectedFields = db.prepare(`
    UPDATE categories
    SET name = ?
    WHERE id = ?
  `);

  const migrateCategoryProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.name || isEncryptedPayload(row.name)) {
        continue;
      }

      updateCategoryProtectedFields.run(encryptCategoryName(row.name), row.id);
      summary.categoryNamesEncrypted++;
    }
  });

  migrateCategoryProtectedFields(categoryRows);

  const houseRows = db.prepare(`
    SELECT
      id,
      house_name
    FROM user_houses
  `).all();

  const updateHouseProtectedFields = db.prepare(`
    UPDATE user_houses
    SET house_name = ?
    WHERE id = ?
  `);

  const migrateHouseProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.house_name || isEncryptedPayload(row.house_name)) {
        continue;
      }

      updateHouseProtectedFields.run(encryptHouseName(row.house_name), row.id);
      summary.houseNamesEncrypted++;
    }
  });

  migrateHouseProtectedFields(houseRows);

  const houseJoinRequestRows = db.prepare(`
    SELECT
      id,
      requested_house_name
    FROM house_join_requests
  `).all();

  const updateHouseJoinRequestProtectedFields = db.prepare(`
    UPDATE house_join_requests
    SET requested_house_name = ?
    WHERE id = ?
  `);

  const migrateHouseJoinRequestProtectedFields = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.requested_house_name || isEncryptedPayload(row.requested_house_name)) {
        continue;
      }

      updateHouseJoinRequestProtectedFields.run(encryptHouseName(row.requested_house_name), row.id);
    }
  });

  migrateHouseJoinRequestProtectedFields(houseJoinRequestRows);

  const mediaRows = db.prepare(`
    SELECT
      photo_path,
      thumbnail_path,
      invoice_photo_path,
      invoice_thumbnail_path
    FROM items
    WHERE COALESCE(photo_path, '') != ''
       OR COALESCE(thumbnail_path, '') != ''
       OR COALESCE(invoice_photo_path, '') != ''
       OR COALESCE(invoice_thumbnail_path, '') != ''
  `).all();

  for (const row of mediaRows) {
    if (row.photo_path) {
      const photoPath = resolveStoredPath(row.photo_path);
      if (photoPath && fs.existsSync(photoPath)) {
        const photoPayload = fs.readFileSync(photoPath);
        if (!isEncryptedPayload(photoPayload)) {
          fs.writeFileSync(
            photoPath,
            encryptBufferForStorage(photoPayload, { purpose: ITEM_PHOTO_MEDIA_PURPOSE }),
            'utf8'
          );
          summary.itemPhotosEncrypted++;
        }
      }
    }

    if (row.thumbnail_path) {
      const thumbnailPath = resolveStoredPath(row.thumbnail_path);
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        const thumbnailPayload = fs.readFileSync(thumbnailPath);
        if (!isEncryptedPayload(thumbnailPayload)) {
          fs.writeFileSync(
            thumbnailPath,
            encryptBufferForStorage(thumbnailPayload, { purpose: ITEM_THUMBNAIL_MEDIA_PURPOSE }),
            'utf8'
          );
          summary.itemThumbnailsEncrypted++;
        }
      }
    }

    if (row.invoice_photo_path) {
      const invoicePhotoPath = resolveStoredPath(row.invoice_photo_path);
      if (invoicePhotoPath && fs.existsSync(invoicePhotoPath)) {
        const invoicePhotoPayload = fs.readFileSync(invoicePhotoPath);
        if (!isEncryptedPayload(invoicePhotoPayload)) {
          fs.writeFileSync(
            invoicePhotoPath,
            encryptBufferForStorage(invoicePhotoPayload, { purpose: ITEM_INVOICE_MEDIA_PURPOSE }),
            'utf8'
          );
          summary.itemInvoicePhotosEncrypted++;
        }
      }
    }

    if (row.invoice_thumbnail_path) {
      const invoiceThumbnailPath = resolveStoredPath(row.invoice_thumbnail_path);
      if (invoiceThumbnailPath && fs.existsSync(invoiceThumbnailPath)) {
        const invoiceThumbnailPayload = fs.readFileSync(invoiceThumbnailPath);
        if (!isEncryptedPayload(invoiceThumbnailPayload)) {
          fs.writeFileSync(
            invoiceThumbnailPath,
            encryptBufferForStorage(invoiceThumbnailPayload, { purpose: ITEM_INVOICE_THUMBNAIL_MEDIA_PURPOSE }),
            'utf8'
          );
          summary.itemInvoiceThumbnailsEncrypted++;
        }
      }
    }
  }

  const totalChanges = Object.values(summary).reduce((total, count) => total + count, 0);
  if (totalChanges > 0) {
    console.log('[Database] Sensitive field backfill completed:', summary);
  }

  return summary;
}

export const encryptionBackfillSummary = backfillSensitiveFieldProtection();

export default db;
