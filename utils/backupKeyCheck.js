import { isEncryptedPayload } from './encryption.js';
import { decryptEmail, decryptUsername } from './protectedFields.js';

const KEY_CHECK_SAMPLE_SIZE = 25;

// Instance backups keep fields encrypted with APP_ENCRYPTION_KEY. Decrypting a
// sample of protected user fields proves the backup is readable with the
// configured keyring before it is offered for restore.
export function verifyBackupEncryptionKey(backupDb) {
    const rows = backupDb.prepare('SELECT username, email FROM users ORDER BY id LIMIT ?').all(KEY_CHECK_SAMPLE_SIZE);
    for (const row of rows) {
        if (isEncryptedPayload(row.username)) {
            decryptUsername(row.username);
        }
        if (isEncryptedPayload(row.email)) {
            decryptEmail(row.email);
        }
    }
}
