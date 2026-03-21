import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const envPath = process.env.DOTENV_CONFIG_PATH
  ? resolve(process.env.DOTENV_CONFIG_PATH)
  : join(projectRoot, '.env');

loadEnv({ path: envPath, quiet: true });

const { default: db, encryptionBackfillSummary } = await import('../database.js');

const summary = encryptionBackfillSummary || {
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
  itemBarcodeLookupsBackfilled: 0,
  roomNamesEncrypted: 0,
  roomDescriptionsEncrypted: 0,
  locationNamesEncrypted: 0,
  categoryNamesEncrypted: 0,
  houseNamesEncrypted: 0,
  itemPhotosEncrypted: 0,
  itemThumbnailsEncrypted: 0
};

const summaryLabels = {
  pendingHouseKeysEncrypted: 'Pending house keys encrypted',
  pendingUsernamesEncrypted: 'Pending usernames encrypted',
  pendingEmailsEncrypted: 'Pending emails encrypted',
  pendingUsernameLookupsBackfilled: 'Pending username lookups backfilled',
  pendingEmailLookupsBackfilled: 'Pending email lookups backfilled',
  pendingVerificationTokensHashed: 'Pending verification tokens hashed',
  userUsernamesEncrypted: 'User usernames encrypted',
  userEmailsEncrypted: 'User emails encrypted',
  userUsernameLookupsBackfilled: 'User username lookups backfilled',
  userEmailLookupsBackfilled: 'User email lookups backfilled',
  userVerificationTokensHashed: 'User verification tokens hashed',
  itemNamesEncrypted: 'Item names encrypted',
  itemDescriptionsEncrypted: 'Item descriptions encrypted',
  itemBarcodesEncrypted: 'Item barcodes encrypted',
  itemBarcodeLookupsBackfilled: 'Item barcode lookups backfilled',
  roomNamesEncrypted: 'Room names encrypted',
  roomDescriptionsEncrypted: 'Room descriptions encrypted',
  locationNamesEncrypted: 'Location names encrypted',
  categoryNamesEncrypted: 'Category names encrypted',
  houseNamesEncrypted: 'House names encrypted',
  itemPhotosEncrypted: 'Item photos encrypted',
  itemThumbnailsEncrypted: 'Item thumbnails encrypted'
};

console.log('[Encryption] Sensitive field backfill completed.');
for (const [key, value] of Object.entries(summary)) {
  console.log(`[Encryption] ${summaryLabels[key] || key}: ${value}`);
}

db.close();
