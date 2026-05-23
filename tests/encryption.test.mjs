import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'test-key';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const encryptionModulePath = join(__dirname, '..', 'utils', 'encryption.js');

function importEncryptionModule(overrides = {}) {
  return runEncryptionScript(
    `import(${JSON.stringify(encryptionModulePath)}).then(() => console.log('import-ok')).catch((error) => { console.error(error.message); process.exit(1); });`,
    overrides
  );
}

function runEncryptionScript(script, overrides = {}) {
  const childEnv = { ...process.env };

  delete childEnv.APP_ENCRYPTION_KEY;
  delete childEnv.APP_ENCRYPTION_KEY_ID;
  delete childEnv.APP_ENCRYPTION_KEYRING;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }

  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script
    ],
    {
      env: childEnv,
      encoding: 'utf8'
    }
  );
}

const {
  decryptBufferFromStorage,
  decryptFromStorage,
  encryptBufferForStorage,
  encryptForStorage,
  generateOpaqueToken,
  hashLookupToken,
  isEncryptedPayload,
  listLookupTokenHashes
} = await import('../utils/encryption.js');

const {
  decryptItemRecord,
  decryptRoomRecord,
  decryptLocationRecord,
  decryptUserRecord,
  decryptCategoryRecord,
  decryptHouseRecord,
  encryptItemName,
  encryptItemDescription,
  encryptItemInvoicePrice,
  encryptItemInvoiceCurrency,
  encryptItemInvoiceDate,
  encryptItemWarrantyStartDate,
  encryptItemWarrantyDurationValue,
  encryptItemWarrantyDurationUnit,
  encryptItemWarrantyExpiryDate,
  encryptRoomName,
  encryptRoomDescription,
  encryptLocationName,
  encryptCategoryName,
  encryptHouseName,
  encryptItemBarcode,
  encryptEmail,
  buildEmailLookup,
  buildUsernameLookup,
  buildBarcodeLookup
} = await import('../utils/protectedFields.js');


test('opaque tokens generate securely and hash deterministically', () => {
  const token = generateOpaqueToken();
  const legacyDigest = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

  assert.ok(token.length >= 32);
  assert.equal(/^[a-f0-9]{64}$/i.test(token), false);
  assert.equal(hashLookupToken(token), hashLookupToken(token));
  assert.notEqual(hashLookupToken(token), legacyDigest);
  assert.deepEqual(listLookupTokenHashes(token), [hashLookupToken(token)]);
});

test('round-trip secrets encrypt and decrypt cleanly', () => {
  const secret = 'super-secret-password-123';
  const encrypted = encryptForStorage(secret, { purpose: 'test.purpose' });
  assert.ok(isEncryptedPayload(encrypted));
  const decrypted = decryptFromStorage(encrypted, { purpose: 'test.purpose' });
  assert.equal(decrypted, secret);
});

test('decryption preserves plaintext when not encrypted', () => {
  const plaintext = 'ordinary-plaintext-string';
  const decrypted = decryptFromStorage(plaintext, { purpose: 'test.purpose' });
  assert.equal(decrypted, plaintext);
});

test('tampered ciphertext fails decryption securely', () => {
  const secret = 'secure-data';
  const encrypted = encryptForStorage(secret, { purpose: 'test.purpose' });
  const payload = JSON.parse(encrypted);

  // Alter the first character of the ciphertext to guarantee tamper detection
  payload.ciphertext = 'A' + payload.ciphertext.slice(1);
  const tampered = JSON.stringify(payload);

  assert.throws(() => {
    decryptFromStorage(tampered, { purpose: 'test.purpose' });
  }, /Encrypted payload could not be decrypted securely/);
});

test('binary payloads support round-trip encryption', () => {
  const originalBuffer = Buffer.from([1, 2, 3, 4, 5, 255]);
  const encrypted = encryptBufferForStorage(originalBuffer, { purpose: 'test.purpose' });
  assert.ok(isEncryptedPayload(encrypted));
  const decrypted = decryptBufferFromStorage(encrypted, { purpose: 'test.purpose' });
  assert.deepEqual(decrypted, originalBuffer);
});

test('purpose spoofing bypass is rejected securely', () => {
  const secret = 'my-secret';
  const encryptedForA = encryptForStorage(secret, { purpose: 'purpose.A' });

  assert.throws(() => {
    decryptFromStorage(encryptedForA, { purpose: 'purpose.B' });
  }, /Encrypted payload could not be decrypted securely/);
});

test('payload-shaped plaintext is encrypted instead of bypassed', () => {
  const spoofedPayload = JSON.stringify({
    v: 1,
    alg: 'aes-256-gcm',
    kid: 'attacker-controlled',
    iv: 'fake-iv',
    tag: 'fake-tag',
    ciphertext: 'fake-ciphertext'
  });

  const encrypted = encryptForStorage(spoofedPayload, {
    purpose: 'pending_registration.house_key'
  });

  assert.notEqual(encrypted, spoofedPayload);
  assert.equal(
    decryptFromStorage(encrypted, { purpose: 'pending_registration.house_key' }),
    spoofedPayload
  );
});

test('module import fails securely when APP_ENCRYPTION_KEY is missing', () => {
  const result = importEncryptionModule({
    APP_ENCRYPTION_KEY_ID: 'test-key'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APP_ENCRYPTION_KEY environment variable(?: or Docker secret)? is not set/);
});

test('module import fails securely when APP_ENCRYPTION_KEY_ID is missing', () => {
  const result = importEncryptionModule({
    APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APP_ENCRYPTION_KEY_ID environment variable(?: or Docker secret)? is not set/);
});

test('protected inventory fields decrypt cleanly for API responses', () => {
  const item = decryptItemRecord({
    name: encryptItemName('Pasaport'),
    description: encryptItemDescription('Yatak odasi ust cekmece'),
    invoice_price: encryptItemInvoicePrice('24999.90'),
    invoice_currency: encryptItemInvoiceCurrency('TRY'),
    invoice_date: encryptItemInvoiceDate('2026-03-25'),
    warranty_start_date: encryptItemWarrantyStartDate('2026-03-25'),
    warranty_duration_value: encryptItemWarrantyDurationValue('24'),
    warranty_duration_unit: encryptItemWarrantyDurationUnit('months'),
    warranty_expiry_date: encryptItemWarrantyExpiryDate('2028-03-25'),
    room_name: encryptRoomName('Yatak Odasi'),
    location_name: encryptLocationName('Ust cekmece'),
    username: 'ahmet'
  });

  const room = decryptRoomRecord({
    name: encryptRoomName('Calisma Odasi'),
    description: encryptRoomDescription('Evrak dolabi yani')
  });

  const location = decryptLocationRecord({
    name: encryptLocationName('Mavi dolap ust raf'),
    room_name: encryptRoomName('Salon')
  });

  assert.equal(item.name, 'Pasaport');
  assert.equal(item.description, 'Yatak odasi ust cekmece');
  assert.equal(item.invoice_price, '24999.90');
  assert.equal(item.invoice_currency, 'TRY');
  assert.equal(item.invoice_date, '2026-03-25');
  assert.equal(item.warranty_start_date, '2026-03-25');
  assert.equal(item.warranty_duration_value, '24');
  assert.equal(item.warranty_duration_unit, 'months');
  assert.equal(item.warranty_expiry_date, '2028-03-25');
  assert.equal(item.room_name, 'Yatak Odasi');
  assert.equal(item.location_name, 'Ust cekmece');
  assert.equal(item.owner_name, 'ahmet');
  assert.equal(room.name, 'Calisma Odasi');
  assert.equal(room.description, 'Evrak dolabi yani');
  assert.equal(location.name, 'Mavi dolap ust raf');
  assert.equal(location.room_name, 'Salon');
});

test('user, category, house and barcode fields support encryption plus lookup hashes', () => {
  const user = decryptUserRecord({
    username: encryptForStorage('ahmet', { purpose: 'identity.username' }),
    email: encryptEmail('ahmet@example.com')
  });

  const category = decryptCategoryRecord({
    name: encryptCategoryName('Mucevherler'),
    icon: '💎'
  });

  const house = decryptHouseRecord({
    house_name: encryptHouseName('Bodrum Yazlik')
  });

  const item = decryptItemRecord({
    barcode: encryptItemBarcode('8690000000001')
  });

  assert.equal(user.username, 'ahmet');
  assert.equal(user.email, 'ahmet@example.com');
  assert.equal(category.name, 'Mucevherler');
  assert.equal(house.house_name, 'Bodrum Yazlik');
  assert.equal(item.barcode, '8690000000001');
  assert.equal(buildEmailLookup('Ahmet@example.com'), buildEmailLookup('ahmet@example.com'));
  assert.equal(buildUsernameLookup('ahmet'), buildUsernameLookup('ahmet'));
  assert.equal(buildBarcodeLookup('8690000000001'), buildBarcodeLookup('8690000000001'));
});

test('decryptFromStorage supports legacy key ids via configured keyring', () => {
  const oldKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const newKey = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const purpose = 'pending_registration.house_key';
  const token = 'legacy-rotation-token';

  const legacyResult = runEncryptionScript(
    `
      const { encryptForStorage, hashLookupToken } = await import(${JSON.stringify(encryptionModulePath)});
      console.log(JSON.stringify({
        encrypted: encryptForStorage('rotate-me', { purpose: ${JSON.stringify(purpose)} }),
        hashedToken: hashLookupToken(${JSON.stringify(token)})
      }));
    `,
    {
      APP_ENCRYPTION_KEY: oldKey,
      APP_ENCRYPTION_KEY_ID: '2026-01-old'
    }
  );

  assert.equal(legacyResult.status, 0, legacyResult.stderr);
  const legacyPayload = JSON.parse(legacyResult.stdout.trim());

  const rotatedResult = runEncryptionScript(
    `
      const { decryptFromStorage, listLookupTokenHashes } = await import(${JSON.stringify(encryptionModulePath)});
      console.log(JSON.stringify({
        decrypted: decryptFromStorage(${JSON.stringify(legacyPayload.encrypted)}, { purpose: ${JSON.stringify(purpose)} }),
        hashes: listLookupTokenHashes(${JSON.stringify(token)}, { includeLegacy: true })
      }));
    `,
    {
      APP_ENCRYPTION_KEY: newKey,
      APP_ENCRYPTION_KEY_ID: '2026-03-new',
      APP_ENCRYPTION_KEYRING: JSON.stringify({
        '2026-01-old': oldKey
      })
    }
  );

  assert.equal(rotatedResult.status, 0, rotatedResult.stderr);
  const rotatedPayload = JSON.parse(rotatedResult.stdout.trim());

  assert.equal(rotatedPayload.decrypted, 'rotate-me');
  assert.ok(rotatedPayload.hashes.includes(legacyPayload.hashedToken));
});
