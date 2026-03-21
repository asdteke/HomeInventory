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

Edit `.env` and set the required values:

```env
# Required
JWT_SECRET=your-random-secret-at-least-32-characters
APP_ENCRYPTION_KEY=your-32-byte-base64-key
APP_ENCRYPTION_KEY_ID=2026-docker

# Optional but recommended
SITE_URL=https://your-domain.com
```

Generate secure keys:

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate APP_ENCRYPTION_KEY
openssl rand -base64 32
```

### 3. Start with Docker Compose

```bash
docker-compose up -d
```

The app will be available at `http://localhost:3001`

### 4. Verify

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Test health endpoint
curl http://localhost:3001/api/health
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | Secret for JWT signing (min 32 chars) |
| `APP_ENCRYPTION_KEY` | ✅ | AES-256 key for field encryption |
| `APP_ENCRYPTION_KEY_ID` | ✅ | Key identifier for encryption |
| `SITE_URL` | ⬜ | Public URL (default: http://localhost:3001) |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth secret |
| `RESEND_API_KEY` | ⬜ | Resend.com API key for emails |
| `SUPPORT_EMAIL` | ⬜ | Support email address |
| `BOOTSTRAP_ADMIN_EMAIL` | ⬜ | Auto-promote this email to admin |

### Data Persistence

Docker volumes store persistent data:

| Volume | Path | Contents |
|--------|------|----------|
| `homeinventory_data` | `/app/data` | SQLite database |
| `homeinventory_uploads` | `/app/uploads` | Encrypted photos |

### Backup

```bash
# Backup database
docker cp homeinventory:/app/data/inventory.db ./backup-$(date +%Y%m%d).db

# Backup uploads
docker cp homeinventory:/app/uploads ./uploads-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Stop container
docker-compose down

# Restore database
docker cp ./backup.db homeinventory:/app/data/inventory.db

# Restore uploads
docker cp ./uploads-backup/. homeinventory:/app/uploads/

# Start container
docker-compose up -d
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

### Traefik (docker-compose)

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
docker-compose build --no-cache
docker-compose up -d
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs homeinventory

# Common issues:
# - Missing JWT_SECRET or APP_ENCRYPTION_KEY
# - Port 3001 already in use
```

### Permission issues

```bash
# Fix volume permissions
docker-compose down
sudo chown -R 1001:1001 ./data ./uploads
docker-compose up -d
```

### Database locked

```bash
# Restart container (clears SQLite locks)
docker-compose restart
```

## Unraid Deployment

For Unraid users, add via Community Applications or manually:

1. Create appdata folder: `/mnt/user/appdata/homeinventory`
2. Clone repo there or copy files
3. Create `.env` file with secrets
4. Run: `docker-compose up -d`

Paths for Unraid:
```yaml
volumes:
  - /mnt/user/appdata/homeinventory/data:/app/data
  - /mnt/user/appdata/homeinventory/uploads:/app/uploads
```

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
