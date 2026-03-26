# Docker Deployment Guide

Deploy HomeInventory using Docker for easy self-hosting.

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/asdteke/HomeInventory.git
cd HomeInventory
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` for non-secret settings:

```env
# Recommended
SITE_URL=https://your-domain.com
```

### 3. Create Docker Secret Files

`docker-compose.yml` expects the required runtime secrets as files in `${HOMEINVENTORY_SECRETS_DIR:-./secrets}` on the host.

```bash
mkdir -p secrets
```

Generate secure values:

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate APP_ENCRYPTION_KEY
openssl rand -base64 32
```

Save them into files:

```bash
printf '%s' 'your-random-secret-at-least-32-characters' > secrets/jwt_secret.txt
printf '%s' 'your-32-byte-base64-key' > secrets/app_encryption_key.txt
printf '%s' '2026-docker' > secrets/app_encryption_key_id.txt
```

If you want to keep the secret files elsewhere on the host, set `HOMEINVENTORY_SECRETS_DIR=/absolute/path/to/secrets` before running Compose.

### 4. Start with Docker Compose

```bash
docker compose up -d
```

The app will be available at `http://localhost:3001`

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
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API key for emails |
| `SUPPORT_EMAIL` | ⬜ | Support email address |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Auto-promote this email to admin |
| `DOCKER_SECRETS_DIR` | ⬜ | Override the in-container secret directory when it is not `/run/secrets` |

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
docker compose build
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
# Pull latest code
git pull

# Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs homeinventory

# Common issues:
# - Missing JWT_SECRET or APP_ENCRYPTION_KEY
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
3. Clone the repo:
   ```bash
   mkdir -p /your/chosen/path/homeinventory
   cd /your/chosen/path/homeinventory
   git clone https://github.com/asdteke/HomeInventory.git .
   ```
4. Create `.env` file with secrets (see Configuration above)
5. If using bind mounts instead of Docker volumes, edit `docker-compose.yml`:
   ```yaml
   volumes:
     - /your/chosen/path/homeinventory/data:/app/data
     - /your/chosen/path/homeinventory/uploads:/app/uploads
   ```
6. Run: `docker compose up -d`

## Building Locally

```bash
# Build image
docker build -t homeinventory:local .

# Run without compose
docker run -d \
  --name homeinventory \
  -p 3001:3001 \
  -e JWT_SECRET=your-secret-here \
  -e APP_ENCRYPTION_KEY=your-key-here \
  -e APP_ENCRYPTION_KEY_ID=2026-local \
  -v homeinventory_data:/app/data \
  -v homeinventory_uploads:/app/uploads \
  homeinventory:local
```
