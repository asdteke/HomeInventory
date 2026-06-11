# Envanterim (Home Inventory) - Disaster Recovery & Restore Playbook

This playbook provides definitive, step-by-step instructions for safely restoring the database, user uploads, or the entire application from our hardened backup infrastructure.

---

## 🚨 Critical Rules & Safety Guidelines

> [!CAUTION]
> **RULE 1: Independent Secret Recovery**
> A full application rollback or code extraction **NEVER** restores or overwrites the live `.env` file automatically. Restoring the environment configuration must always be performed as a separate, conscious, and manual step.

> [!IMPORTANT]
> **RULE 2: Database Safe-Restore Sequence**
> When restoring the SQLite database (`inventory.db`), you **MUST** follow this exact sequence:
> 1. Stop the active PM2 process.
> 2. Create an instant backup of the current live database file **AND** any active WAL/SHM files as fallbacks.
> 3. Remove or rename active `inventory.db-wal` and `inventory.db-shm` files to prevent transaction mismatch.
> 4. Perform the database file replacement.
> 5. Verify database integrity using `PRAGMA quick_check;`.
> 6. Restart the PM2 process and verify health.

> [!TIP]
> **RULE 3: Hardened Verification Commands**
> Always verify backup archive security and database integrity using the following exact commands before and after restore operations.

---

## 🔍 Backup Verification Commands

### 1. Archive Secrets Exposure Check
To ensure a backup archive `.tgz` is safe and does not leak environment secrets or logs, run:
```bash
# This command should return EMPTY (no matches found), indicating no secret leakage
tar -tzf /path/to/backup.tgz | grep -E '(^\./\.env|\.log$|/logs/)' | grep -v 'env.example' || echo "Success: Archive is clean of secrets!"
```

### 2. SQLite Database Integrity Check
To verify a restored or backed-up database is not corrupted, run:
```bash
# This command MUST return "ok"
sqlite3 /path/to/inventory.db "PRAGMA quick_check;"
```

---

## 🛠️ Step-by-Step Restoration Procedures

### Scenario A: Restoring the SQLite Database (Safe Sequence)

Follow this procedure if the database becomes corrupted or has invalid/lost data, and you want to restore it from an hourly database snapshot.

1. **Identify the Target Backup:**
   Locate the target database backup in `/home/ubuntu/backups/hourly/db-backup-YYYYMMDD_HHMMSS.db`.
   
2. **Stop the Live PM2 Process:**
   ```bash
   pm2 stop home-inventory
   ```

3. **Create an Instant Fallback Backup & Clean Active WAL/SHM:**
   Before modifying the live database, take a snapshot of its current state. You **MUST** move or rename any existing WAL/SHM transaction files so SQLite does not attempt to apply old transaction states to the newly restored database:
   ```bash
   mkdir -p /home/ubuntu/backups/instant-fallbacks
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   
   # Backup main database file
   if [ -f /home/ubuntu/home-inventory/data/inventory.db ]; then
     mv /home/ubuntu/home-inventory/data/inventory.db /home/ubuntu/backups/instant-fallbacks/inventory-pre-restore-$TIMESTAMP.db
   fi
   
   # Backup and remove active WAL file
   if [ -f /home/ubuntu/home-inventory/data/inventory.db-wal ]; then
     mv /home/ubuntu/home-inventory/data/inventory.db-wal /home/ubuntu/backups/instant-fallbacks/inventory-wal-pre-restore-$TIMESTAMP
   fi
   
   # Backup and remove active SHM file
   if [ -f /home/ubuntu/home-inventory/data/inventory.db-shm ]; then
     mv /home/ubuntu/home-inventory/data/inventory.db-shm /home/ubuntu/backups/instant-fallbacks/inventory-shm-pre-restore-$TIMESTAMP
   fi
   ```

4. **Verify the Integrity of the Backup File:**
   ```bash
   sqlite3 /home/ubuntu/backups/hourly/db-backup-YYYYMMDD_HHMMSS.db "PRAGMA quick_check;"
   # Expected output: ok
   ```

5. **Perform the Replacement:**
   ```bash
   cp /home/ubuntu/backups/hourly/db-backup-YYYYMMDD_HHMMSS.db /home/ubuntu/home-inventory/data/inventory.db
   chown ubuntu:ubuntu /home/ubuntu/home-inventory/data/inventory.db
   chmod 600 /home/ubuntu/home-inventory/data/inventory.db
   ```

6. **Verify the Restored Live Database:**
   ```bash
   sqlite3 /home/ubuntu/home-inventory/data/inventory.db "PRAGMA quick_check;"
   # Expected output: ok
   ```

7. **Restart PM2 & Verify Health:**
   ```bash
   pm2 start home-inventory
   curl -I http://127.0.0.1:3001/api/health
   # Expected output: HTTP/1.1 200 OK
   ```

---

### Scenario B: Restoring Environment Secrets (`.env`)

Follow this procedure if the server `.env` file is lost or corrupted. 

> [!WARNING]
> Environment backups are stored separately in `/home/ubuntu/backups/secrets/` with strict `600` permissions. They are never bundled into the main application zip files.

1. **Locate the Target Environment Backup:**
   Find the most recent secret backup in `/home/ubuntu/backups/secrets/env-backup-YYYYMMDD_HHMMSS` (or `predeploy-env-backup-YYYYMMDD_HHMMSS`).
   
2. **Review and Copy the File:**
   ```bash
   # Restore the environment file
   cp /home/ubuntu/backups/secrets/env-backup-YYYYMMDD_HHMMSS /home/ubuntu/home-inventory/.env
   chown ubuntu:ubuntu /home/ubuntu/home-inventory/.env
   chmod 600 /home/ubuntu/home-inventory/.env
   ```

3. **Restart the PM2 Process to Apply Configuration:**
   ```bash
   pm2 restart home-inventory --update-env
   ```

---

### Scenario C: Full Application Rollback (Staging/Swap Method)

Follow this procedure if a deployment fails, or the application package is corrupted, and you need to restore the full code, assets, and database state. 

This procedure uses a **Staging/Swap (Blue-Green) Workflow** to prevent any data loss. The backup is extracted into a temporary folder on the **SAME filesystem** as the application (i.e. under `/home/ubuntu/`), enabling a rapid, sequential directory rename swap once validated, and safely retaining all uploaded media assets and secrets.

1. **Select and Verify the Backup Archive:**
   Choose a daily full archive from `/home/ubuntu/backups/daily/full-backup-YYYYMMDD_HHMMSS.tgz` and check its cleanliness:
   ```bash
   tar -tzf /home/ubuntu/backups/daily/full-backup-YYYYMMDD_HHMMSS.tgz | grep -E '(^\./\.env|\.log$|/logs/)' | grep -v 'env.example' || echo "Clean!"
   ```

2. **Prepare Same-Filesystem Staging Directory & Extract:**
   To guarantee a fast, single-inode directory rename swap later, the staging folder **MUST** reside on the exact same filesystem as `/home/ubuntu/home-inventory` (do NOT use `/tmp` as it may be on a different partition or tmpfs mount):
   ```bash
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   STAGE_DIR="/home/ubuntu/rollback-stage-$TIMESTAMP"
   mkdir -p "$STAGE_DIR"
   
   # Extract backup into the same-filesystem stage
   tar -xzf /home/ubuntu/backups/daily/full-backup-YYYYMMDD_HHMMSS.tgz -C "$STAGE_DIR"
   ```

3. **Verify Staged Database Integrity:**
   Ensure the database in the backup is fully intact and readable before applying it:
   ```bash
   sqlite3 "$STAGE_DIR/data/inventory.db" "PRAGMA quick_check;"
   # Expected output: ok
   ```

4. **Stop PM2 Process:**
   ```bash
   pm2 stop home-inventory
   ```

5. **Perform the Directory Swap:**
   Rename the active directory to a rollback fallback folder, and move the verified staging directory to the active directory. While each individual rename is atomic on a single filesystem, please note that the two-step swap sequence itself is not a transactional multi-directory atomic block:
   ```bash
   ROLLBACK_BACKUP="/home/ubuntu/home-inventory-rollback-$TIMESTAMP"
   
   # Move active live folder to fallback backup
   mv /home/ubuntu/home-inventory "$ROLLBACK_BACKUP"
   
   # Swap stage to live (instantaneous single-inode renames on the same partition)
   mv "$STAGE_DIR" /home/ubuntu/home-inventory
   ```

6. **Restore Live Configuration, Media Uploads, and Node Modules:**
   Since full backups do NOT bundle `.env`, and we want to preserve any newly uploaded files or pre-installed dependencies, copy/move them from the rollback fallback backup folder back into the active folder:
   ```bash
   # Copy live environment configuration back
   cp "$ROLLBACK_BACKUP/.env" /home/ubuntu/home-inventory/.env
   
   # RESTORE UPLOADS: Copy recently uploaded item photos and invoice documents back so they are NOT lost
   if [ -d "$ROLLBACK_BACKUP/uploads" ]; then
     cp -a "$ROLLBACK_BACKUP/uploads" /home/ubuntu/home-inventory/
     echo "Uploaded media assets successfully restored."
   fi
   
   # Move node_modules back to avoid re-installing
   if [ -d "$ROLLBACK_BACKUP/node_modules" ]; then
     mv "$ROLLBACK_BACKUP/node_modules" /home/ubuntu/home-inventory/
   fi
   if [ -d "$ROLLBACK_BACKUP/client/node_modules" ]; then
     mv "$ROLLBACK_BACKUP/client/node_modules" /home/ubuntu/home-inventory/client/
   fi
   ```

7. **Ensure Safe Ownership and Permissions:**
   ```bash
   chown -R ubuntu:ubuntu /home/ubuntu/home-inventory
   find /home/ubuntu/home-inventory -type d -exec chmod 750 {} +
   find /home/ubuntu/home-inventory -type f -exec chmod 644 {} +
   chmod 600 /home/ubuntu/home-inventory/.env
   chmod 600 /home/ubuntu/home-inventory/data/inventory.db
   ```

8. **Restart PM2 & Verify Service:**
   ```bash
   pm2 start home-inventory --update-env
   curl -I http://127.0.0.1:3001/api/health
   # Expected output: HTTP/1.1 200 OK
   ```

9. **Retain Fallback Backup for Monitoring:**
   Do **NOT** delete the `$ROLLBACK_BACKUP` folder immediately. Keep it intact for at least **24–72 hours** as a fail-safe fallback.
   Monitor production and verify that:
   - Users can log in and session states are healthy.
   - All recent item photos, uploads, and invoice attachments are visible.
   - New items and attachments can be added successfully.
   
   > [!CAUTION]
   > The `rm -rf` command is highly destructive. Double-check all directory names, variables, and paths meticulously before executing this step!
   
   Only after this verification window should you delete it to reclaim disk space:
   ```bash
   # Execute ONLY after 24-72 hours of successful production monitoring!
   # Meticulously verify the target path before running!
   rm -rf /home/ubuntu/home-inventory-rollback-YYYYMMDD_HHMMSS
   ```

---

## 🔑 Security Recommendation: Secret Rotation Playbook

Since historical backups previously contained raw text of `.env` configurations (which have now been securely quarantined and sanitized), it is highly recommended to perform a **Secret Rotation** for all sensitive parameters to ensure absolute protection.

### Steps to Rotate Envanterim Secrets:

1. **Rotate Database Session Keys:**
   Change the `SESSION_SECRET` value in `/home/ubuntu/home-inventory/.env` to a new cryptographically secure random string:
   ```bash
   # Example generation
   openssl rand -hex 32
   ```

2. **Rotate OCI Secret Mappings:**
   If using Oracle Cloud Infrastructure (OCI) vault mappings (`OCI_SECRET_MAPPINGS`), update the vault values in the OCI Console, and rotate any active OCI credentials/keys.

3. **Rotate Third-Party Email Credentials:**
   If external SMTP accounts are configured for transactional emails, change the SMTP passwords on the mail server provider and update the `.env` configuration.

4. **Apply rotated secrets to PM2:**
   ```bash
   pm2 restart home-inventory --update-env
   ```
