# Docker Deployment Guide

Deploy HomeInventory using Docker for easy self-hosting.

This guide targets the v2.8.0 release line and later releases. Docker upgrades should pull the latest image rather than only restarting an old container.

A pre-built image is published to `ghcr.io/asdteke/homeinventory` by [`.github/workflows/docker-image.yml`](.github/workflows/docker-image.yml) for every release and every push to `main`, so running HomeInventory needs neither the source code nor a local build. Each tag is a multi-architecture image for `linux/amd64`, `linux/arm64` (Raspberry Pi 4/5, Apple Silicon hosts, ARM servers) and `linux/arm/v7` (32-bit Raspberry Pi OS); Docker picks the right one automatically. All dependencies are bundled, so the container starts without internet access.

| Tag | Meaning |
|-----|---------|
| `latest` | Newest release (recommended) |
| `2.8.0`, `2.8` | A specific release, or the newest patch of a minor line |
| `edge` | Newest build from `main`; may contain unreleased changes |
| `sha-<short-sha>` | Immutable build of one specific commit, useful for pinning and rollback |

## Quick Start

### 1. Get the Compose File

```bash
mkdir -p homeinventory && cd homeinventory
curl -O https://raw.githubusercontent.com/asdteke/HomeInventory/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/asdteke/HomeInventory/main/.env.example
```

If you plan to modify the application, clone the repository instead — the Compose file behaves identically either way.

### 2. Configure Environment File

Edit `.env` for non-secret settings:

```env
# Recommended
SITE_URL=https://your-domain.com
APP_DATA_CONTROLLER_NAME=Your Company Ltd.
APP_DATA_CONTROLLER_ADDRESS=Your Company Ltd., Example Street 1, City, Country
APP_DPO_EMAIL=privacy@your-domain.com
APP_PRIVACY_TRANSFER_DISCLOSURE=EU-hosted infrastructure; optional Google services may involve transfers outside your jurisdiction.
APP_PRIVACY_COMPLAINT_AUTHORITY=Your competent data protection authority (for Turkey: KVKK)
SUPPORT_EMAIL=privacy@your-domain.com
```

### 3. Create Docker Secret Files

`docker-compose.yml` expects the required runtime secrets as files in `${HOMEINVENTORY_SECRETS_DIR:-./secrets}` on the host. The setup command generates all three with strong random values. It needs nothing but the published image:

```bash
mkdir -p secrets
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/secrets:/secrets" \
  ghcr.io/asdteke/homeinventory:latest node scripts/setup.mjs --docker --out /secrets
```

`--user` makes the files belong to you instead of the image's built-in user (uid 1001), which could not write to your `secrets/` folder. On Docker Desktop for Windows (PowerShell), use `docker run --rm -v "${PWD}/secrets:/secrets" ghcr.io/asdteke/homeinventory:latest node scripts/setup.mjs --docker --out /secrets`. With a source checkout, `npm run setup -- --docker` does the same without Docker.

The command creates `jwt_secret.txt`, `app_encryption_key.txt` and `app_encryption_key_id.txt`, never overwrites a file that already has a value, and is safe to run again. The folder is restricted to your user (`700`); the files stay readable (`644`) because Compose mounts each one into the container, where HomeInventory reads it as uid 1001.

> [!WARNING]
> Back up `app_encryption_key.txt` and `app_encryption_key_id.txt` somewhere outside this machine. Encrypted data, including uploaded photos, cannot be recovered without them; a database backup alone is not enough.

<details>
<summary>Manual alternative with openssl</summary>

```bash
mkdir -p secrets
printf '%s' "$(openssl rand -hex 32)" > secrets/jwt_secret.txt
printf '%s' "$(openssl rand -base64 32)" > secrets/app_encryption_key.txt
printf '%s' "$(date +%Y-%m)-primary" > secrets/app_encryption_key_id.txt
```

`APP_ENCRYPTION_KEY` must decode to exactly 32 bytes (base64) or be 64 hex characters. `APP_ENCRYPTION_KEY_ID` is any stable label of 1-64 letters, numbers, dots, underscores or hyphens; do not change it after data has been encrypted.

</details>

If you want to keep the secret files elsewhere on the host, set `HOMEINVENTORY_SECRETS_DIR=/absolute/path/to/secrets` before running Compose.

### 4. Start with Docker Compose

```bash
docker compose up -d
```

Compose pulls `ghcr.io/asdteke/homeinventory:latest` on first run; no image is built locally.

The app will be available at `http://localhost:3001`

To pin a specific release or build instead of tracking `latest`, set `HOMEINVENTORY_IMAGE` before starting the stack:

```bash
HOMEINVENTORY_IMAGE=ghcr.io/asdteke/homeinventory:2.8.0 docker compose up -d
```

### 5. Verify

```bash
# Check container status
docker compose ps

# View logs
docker compose logs -f

# Test health endpoint
curl http://localhost:3001/api/health
```

## Configuration

### Docker Secret Files

| Host file | Mounted as | Required | Description |
|----------|------------|----------|-------------|
| `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/jwt_secret.txt` | `/run/secrets/jwt_secret` | ✅ | JWT signing secret |
| `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/app_encryption_key.txt` | `/run/secrets/app_encryption_key` | ✅ | AES-256 key for field encryption |
| `${HOMEINVENTORY_SECRETS_DIR:-./secrets}/app_encryption_key_id.txt` | `/run/secrets/app_encryption_key_id` | ✅ | Stable key identifier for new encrypted payloads |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SITE_URL` | ⬜ | Public URL (default: http://localhost:3001) |
| `APP_DATA_CONTROLLER_NAME` | ⬜ | Legal name of the self-hosted operator/controller shown in privacy documents |
| `APP_DATA_CONTROLLER_ADDRESS` | ⬜ | Postal or registered address shown in the privacy notice |
| `APP_DPO_EMAIL` | ⬜ | Privacy or DPO contact email if different from support |
| `APP_PRIVACY_TRANSFER_DISCLOSURE` | ⬜ | Human-readable disclosure of countries/providers/safeguards used for transfers |
| `APP_PRIVACY_COMPLAINT_AUTHORITY` | ⬜ | Authority named in the complaint-rights section of the privacy notice |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API key for emails |
| `SUPPORT_EMAIL` | ⬜ | Support email address |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Auto-promote this email to admin |
| `DOCKER_SECRETS_DIR` | ⬜ | Override the in-container secret directory when it is not `/run/secrets` |
| `UPDATE_CHECK` | ⬜ | Set to `false` to turn off the admin panel's new-version notice and its request to GitHub (see [Updating](#updating)) |

`docker compose` loads the full `.env` file into the container, so optional settings from [`.env.example`](.env.example) such as `APP_ENCRYPTION_KEYRING`, `EXPOSE_SERVER_INFO`, and `INDEXNOW_*` work without editing `docker-compose.yml`.

### Data Persistence

Docker Compose creates project-scoped volumes for persistent data:

| Volume | Path | Contents |
|--------|------|----------|
| `homeinventory_data` | `/app/data` | SQLite database |
| `homeinventory_uploads` | `/app/uploads` | Encrypted photos |

The actual Docker volume names are automatically prefixed with the Compose project name, which prevents collisions when you run multiple stacks on the same host.

### Backup

```bash
CONTAINER_ID=$(docker compose ps -q homeinventory)

# Backup database
docker cp "$CONTAINER_ID":/app/data/inventory.db ./backup-$(date +%Y%m%d).db

# Backup uploads
docker cp "$CONTAINER_ID":/app/uploads ./uploads-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Stop and recreate the service container without starting it
docker compose down
docker compose pull
docker compose create
CONTAINER_ID=$(docker compose ps -q homeinventory)

# Restore database
docker cp ./backup.db "$CONTAINER_ID":/app/data/inventory.db

# Restore uploads
docker cp ./uploads-backup/. "$CONTAINER_ID":/app/uploads/

# Start container
docker compose start
```

## Reverse Proxy

### Nginx

```nginx
server {
    listen 80;
    server_name inventory.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Traefik (docker compose)

```yaml
services:
  homeinventory:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.homeinventory.rule=Host(`inventory.yourdomain.com`)"
      - "traefik.http.routers.homeinventory.tls.certresolver=letsencrypt"
      - "traefik.http.services.homeinventory.loadbalancer.server.port=3001"
```

### Cloudflare Tunnel

```yaml
# cloudflared config
ingress:
  - hostname: inventory.yourdomain.com
    service: http://localhost:3001
```

## Updating

```bash
# Fetch the newest published image and restart
docker compose pull
docker compose up -d
```

Compose recreates the container only when the pulled image actually changed, so this pair of commands is safe to run on a schedule.

To roll back, pin the previous release (or a `sha-` tag):

```bash
HOMEINVENTORY_IMAGE=ghcr.io/asdteke/homeinventory:2.8.0 docker compose up -d
```

### New-version notice

When a newer release exists, admins see a notice at the top of the admin panel with the new version number, a link to the release notes and the upgrade command above. Each admin can dismiss it per version in their browser.

To know about new releases, the server asks GitHub's public releases API (`https://api.github.com/repos/asdteke/HomeInventory/releases/latest`) for the latest version number. It does so only when an admin opens the admin panel, never at startup or for regular users, sends no user or inventory data (only a `HomeInventory/<version>` User-Agent), and caches the answer in memory for 12 hours. Without internet access the notice simply stays hidden. Set `UPDATE_CHECK=false` in `.env` to never contact GitHub.

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs homeinventory

# Common issues:
# - Missing JWT_SECRET or APP_ENCRYPTION_KEY (create them with the setup command in step 3)
# - Port 3001 already in use
```

### Permission issues

With the default named-volume setup, permission issues are uncommon. If they do happen, reset ownership inside the mounted volumes:

```bash
docker compose run --rm --user root --entrypoint sh homeinventory -lc 'chown -R 1001:1001 /app/data /app/uploads'
docker compose up -d
```

If you switch to bind mounts instead of named volumes, apply the same ownership to the host directories before starting the stack.

### Database locked

```bash
# Restart container (clears SQLite locks)
docker compose restart
```

## Unraid Deployment

For Unraid users:

1. SSH into Unraid or use the terminal in the WebUI
2. Choose a location for the app (e.g., your appdata share)
3. Download the Compose file:
   ```bash
   mkdir -p /your/chosen/path/homeinventory
   cd /your/chosen/path/homeinventory
   curl -O https://raw.githubusercontent.com/asdteke/HomeInventory/main/docker-compose.yml
   ```
4. Download `.env.example` as `.env` and create the secret files as in [step 3](#3-create-docker-secret-files)
5. If using bind mounts instead of Docker volumes, edit `docker-compose.yml`:
   ```yaml
   volumes:
     - /your/chosen/path/homeinventory/data:/app/data
     - /your/chosen/path/homeinventory/uploads:/app/uploads
   ```
6. Run: `docker compose up -d`

## Running Without Compose

```bash
docker run -d \
  --name homeinventory \
  -p 3001:3001 \
  -e JWT_SECRET=your-secret-here \
  -e APP_ENCRYPTION_KEY=your-key-here \
  -e APP_ENCRYPTION_KEY_ID=2026-local \
  -v homeinventory_data:/app/data \
  -v homeinventory_uploads:/app/uploads \
  ghcr.io/asdteke/homeinventory:latest
```

## Building From Source (Optional)

Only needed when developing changes to the application itself — normal deployments use the published image.

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
docker build -t homeinventory:local .

# Run your local build through the same Compose file
HOMEINVENTORY_IMAGE=homeinventory:local docker compose up -d
```
