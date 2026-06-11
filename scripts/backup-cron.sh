#!/bin/bash
# Envanterim - Tightened Backup Lifecycle Cron Script (Security Hardened)
# Runs hourly to take consistent db backups and daily full-app archives.

set -euo pipefail
umask 077  # Enforce strict default permissions: Dirs 700, Files 600

BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/home/ubuntu/home-inventory"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting secure backup process..."

# Ensure folders exist
mkdir -p "$BACKUP_DIR/hourly" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly" "$BACKUP_DIR/secrets"

# 1. Hourly SQLite Online Backup
HOURLY_DB="$BACKUP_DIR/hourly/db-backup-$TIMESTAMP.db"
echo "Creating hourly online database backup..."
sqlite3 "$APP_DIR/data/inventory.db" ".backup '$HOURLY_DB'"
echo "Hourly backup created: $HOURLY_DB"

# Clean up hourly backups older than 48 hours (2 days)
echo "Pruning hourly backups older than 48 hours..."
find "$BACKUP_DIR/hourly" -name "db-backup-*.db" -type f -mtime +2 -delete

# 2. Daily Full Backup
# Run daily backup at 03:00, or if --force-daily flag is passed
FORCE_DAILY=${1:-""}
CURRENT_HOUR=$(date +%H)

if [ "$CURRENT_HOUR" = "03" ] || [ "$FORCE_DAILY" = "--force-daily" ]; then
    echo "Running secure daily full-app backup..."
    DAILY_DB="/tmp/daily-db-backup-$TIMESTAMP.db"
    
    # Take consistent DB snapshot
    sqlite3 "$APP_DIR/data/inventory.db" ".backup '$DAILY_DB'"
    
    # Create a staging area for clean tarball
    STAGE_DIR="/tmp/envanterim-backup-stage-$TIMESTAMP"
    mkdir -p "$STAGE_DIR"
    
    # Copy app contents EXCLUDING node_modules, logs, data/uploads, and ALL environment/sensitive config files
    rsync -a \
      --exclude="node_modules" \
      --exclude="client/node_modules" \
      --exclude="data" \
      --exclude="uploads" \
      --exclude=".env" \
      --exclude=".env.*" \
      --exclude="logs" \
      --exclude="*.log" \
      "$APP_DIR/" "$STAGE_DIR/"
    
    # Create clean data and uploads folders inside staging (excluding database WAL/SHM file locks)
    mkdir -p "$STAGE_DIR/data"
    cp "$DAILY_DB" "$STAGE_DIR/data/inventory.db"
    
    if [ -d "$APP_DIR/uploads" ]; then
        cp -a "$APP_DIR/uploads" "$STAGE_DIR/uploads"
    fi
    
    # Create daily archive (guaranteed NOT to leak .env or logs)
    DAILY_TAR="$BACKUP_DIR/daily/full-backup-$TIMESTAMP.tgz"
    tar -czf "$DAILY_TAR" -C "$STAGE_DIR" .
    echo "Daily full backup created (secrets excluded): $DAILY_TAR"
    
    # Back up the environment configuration separately in dedicated secrets folder with strict 600 permission
    if [ -f "$APP_DIR/.env" ]; then
        ENV_BACKUP="$BACKUP_DIR/secrets/env-backup-$TIMESTAMP"
        cp "$APP_DIR/.env" "$ENV_BACKUP"
        chmod 600 "$ENV_BACKUP"
        echo "Environment secrets backed up separately: $ENV_BACKUP"
    fi
    
    # Cleanup staging
    rm -rf "$STAGE_DIR" "$DAILY_DB"
    
    # 3. Weekly Backup Replication (Every Sunday)
    DAY_OF_WEEK=$(date +%u) # 1-7 (7 is Sunday)
    if [ "$DAY_OF_WEEK" = "7" ]; then
        WEEKLY_TAR="$BACKUP_DIR/weekly/full-backup-$TIMESTAMP.tgz"
        cp "$DAILY_TAR" "$WEEKLY_TAR"
        echo "Weekly backup copied: $WEEKLY_TAR"
    fi
    
    # 4. Monthly Backup Replication (1st of month)
    DAY_OF_MONTH=$(date +%d) # 01-31
    if [ "$DAY_OF_MONTH" = "01" ]; then
        MONTHLY_TAR="$BACKUP_DIR/monthly/full-backup-$TIMESTAMP.tgz"
        cp "$DAILY_TAR" "$MONTHLY_TAR"
        echo "Monthly backup copied: $MONTHLY_TAR"
    fi
    
    # Prune daily backups older than 30 days
    echo "Pruning daily backups older than 30 days..."
    find "$BACKUP_DIR/daily" -name "full-backup-*.tgz" -type f -mtime +30 -delete
    
    # Prune weekly backups older than 8 weeks (56 days)
    echo "Pruning weekly backups older than 56 days..."
    find "$BACKUP_DIR/weekly" -name "full-backup-*.tgz" -type f -mtime +56 -delete
    
    # Prune monthly backups older than 6 months (180 days)
    echo "Pruning monthly backups older than 180 days..."
    find "$BACKUP_DIR/monthly" -name "full-backup-*.tgz" -type f -mtime +180 -delete
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Secure backup process completed successfully."
