# Docker Deployment Guide

This guide covers deploying SFPLiberate using Docker and Docker Compose with modern best practices (Compose v2.40+, Engine v28+).

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [BLE Proxy Mode](#ble-proxy-mode)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/josiah-nelson/SFPLiberate.git
cd SFPLiberate

# Copy environment template
cp .env.example .env

# Start the application
docker-compose up -d

# Access the application
open http://localhost:8080
```

## Deployment Modes

- Public server (no proxy): Disable BLE proxy (`BLE_PROXY_ENABLED=false`). Run without USB/DBus mounts. Intended for ~2–5 concurrent users who connect directly via Web Bluetooth (Chrome/Edge/Opera or Bluefy on iOS). Community features are accessible; no backend BLE.
- Self-hosted (LAN, optional proxy): Enable BLE proxy for Safari/iOS users. Mount DBus sockets and USB bus to the backend container and start with the `ble-proxy` profile. Intended to work fully air‑gapped.

## Prerequisites

### Required

- **Docker Engine:** v28.0+ ([Install Docker](https://docs.docker.com/engine/install/))
- **Docker Compose:** v2.40+ (included with Docker Desktop)
- **Git:** For cloning the repository

### Optional

- **Bluetooth Adapter:** For BLE proxy mode (iOS/Safari support)
- **Domain Name:** For production deployment with HTTPS

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 28.0.0 or higher

# Check Compose version
docker-compose version
# Expected: Docker Compose version v2.40.0 or higher

# Check BuildKit is enabled (should see no errors)
docker buildx version
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

**Key Variables:**

```bash
# Application
ENVIRONMENT=production          # development, staging, production
LOG_LEVEL=info                 # debug, info, warning, error
HOST_PORT=8080                 # Port to access the application

# Data
DATA_PATH=./data               # Path for persistent storage

# BLE Proxy (optional)
BLE_PROXY_ENABLED=false        # Enable for iOS/Safari support

# Production (optional)
DOMAIN=localhost               # Your domain for Traefik/HTTPS
```

**Full documentation:** See [.env.example](.env.example) for all available options.

### Data Directory

The application stores data in `DATA_PATH` (default: `./data`):

```bash
data/
├── sfp_library.db             # SQLite database
└── submissions/               # Community submission inbox
    └── {uuid}/
        ├── eeprom.bin
        └── metadata.json
```

**Important:** This directory is mounted as a Docker volume for persistence.

## Development

### Starting Development Environment

Development mode includes:
- Hot-reload for backend (uvicorn --reload)
- Source code mounted as volumes
- Direct backend API access on port 8000
- Debug logging enabled

```bash
# Automatically uses docker-compose.override.yml
docker-compose up

# Access frontend
open http://localhost:8080

# Access backend API docs
open http://localhost:8000/api/v1/docs
```

**Backend Development:**

```bash
# View backend logs
docker-compose logs -f backend

# Run database migrations
docker-compose exec backend alembic upgrade head

# Access Python shell
docker-compose exec backend poetry run python

# Run tests
docker-compose exec backend poetry run pytest
```

**Frontend Development:**

```bash
# View frontend logs
docker-compose logs -f frontend

# Static files are mounted - just refresh browser
# Changes to .js, .html, .css are live
```

### Rebuilding Containers

```bash
# Rebuild after dependency changes
docker-compose up --build

# Force clean rebuild
docker-compose build --no-cache
docker-compose up
```

### Stopping Development Environment

```bash
# Stop containers (preserves data)
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Production Deployment

### Production Build

Production mode includes:
- Optimized multi-stage builds
- Non-root users (security)
- Read-only filesystems
- Resource limits
- Health checks
- Minimal image sizes

```bash
# Build production images
docker-compose -f docker-compose.yml build --no-cache

# Start production stack
docker-compose -f docker-compose.yml up -d

# Verify health
docker-compose ps
```

### Production Environment Variables

**Minimal production `.env`:**

```bash
ENVIRONMENT=production
LOG_LEVEL=info
HOST_PORT=8080
DATA_PATH=/var/lib/sfpliberate/data
DOMAIN=sfp.yourdomain.com
```

### HTTPS with Traefik (Optional)

The docker-compose.yml includes Traefik labels for automatic HTTPS:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sfpliberate.rule=Host(`${DOMAIN}`)"
  - "traefik.http.routers.sfpliberate.entrypoints=websecure"
  - "traefik.http.routers.sfpliberate.tls.certresolver=letsencrypt"
```

**Setup Traefik:**

1. Install Traefik on your host
2. Configure Let's Encrypt
3. Set `DOMAIN` in `.env`
4. Traefik will automatically configure HTTPS

**Reference:** [Traefik Documentation](https://doc.traefik.io/traefik/)

### Systemd Service (Linux)

For automatic startup on boot:

```bash
# Create service file
sudo nano /etc/systemd/system/sfpliberate.service
```

```ini
[Unit]
Description=SFPLiberate
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/SFPLiberate
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable sfpliberate
sudo systemctl start sfpliberate

# Check status
sudo systemctl status sfpliberate
```

## BLE Proxy Mode

BLE proxy mode enables iOS/Safari users to access SFP Wizard devices through the backend instead of requiring Web Bluetooth API support.

**Architecture:**
```
┌─────────────────┐         ┌──────────────┐         ┌─────────────┐
│  Browser (Any)  │◄───WS───►│    Backend   │◄───BLE──►│ SFP Wizard  │
│  Safari/iOS/etc │         │   (bleak)    │         │   Device    │
└─────────────────┘         └──────────────┘         └─────────────┘
```

### Prerequisites

- Linux host with Bluetooth adapter
- BlueZ installed (standard on most Linux distributions)
- Bluetooth adapter permissions

### Enable BLE Proxy

**1. Update `.env`:**

```bash
BLE_PROXY_ENABLED=true
# Optional: proxy discovery timeout (seconds)
BLE_PROXY_DEFAULT_TIMEOUT=5
```

**2. Start with BLE proxy profile:**

```bash
# Install backend with BLE support
cd backend
poetry install -E ble-proxy

# Start with profile
docker-compose --profile ble-proxy up -d
```

**3. Grant Bluetooth permissions:**

```bash
# Add user to bluetooth group
sudo usermod -aG bluetooth $USER

# Verify adapter
bluetoothctl list
```

### Docker BLE Configuration

The BLE proxy profile adds:

```yaml
services:
  backend:
    profiles:
      - ble-proxy
    devices:
      - /dev/bus/usb:/dev/bus/usb
    cap_add:
      - NET_ADMIN
    environment:
      - BLE_PROXY_ENABLED=true
      - BLE_PROXY_DEFAULT_TIMEOUT=5
      # Optional: force a specific adapter (e.g., hci0)
      - BLE_PROXY_ADAPTER=
    # BlueZ D-Bus socket mounts (commonly required by bleak)
    volumes:
      - /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket:ro
      - /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro
```

### Frontend Configuration

Users can select connection mode in the UI:
- **Auto:** Detects best option (Web Bluetooth → Proxy fallback)
- **Web Bluetooth:** Direct browser connection (Chrome/Edge)
- **BLE Proxy:** Via backend (Safari/iOS)

Additional UI:
- **Discover via Proxy:** Lists nearby devices from the backend, with a one‑click “Connect via Proxy” per device. GATT is inspected server‑side to derive the device‑specific profile.
- **Adapter selection:** A dropdown appears in proxy mode to select a local adapter (auto‑enumerated via DBus).
- **Save as Deployment Defaults:** Once a profile is discovered, you can persist it into the bind‑mounted `.env`. The action label notes “requires docker restart”; after saving, restart the stack for the defaults to apply.
- The Proxy option is hidden if the backend disables BLE proxy via `BLE_PROXY_ENABLED=false` or when `PUBLIC_MODE=true`.

### Testing BLE Proxy

```bash
# View BLE logs
docker-compose logs -f backend | grep BLE

# Test WebSocket connection
wscat -c ws://localhost:8080/api/v1/ble/ws

# Send test message
{"type":"discover","service_uuid":"8e60f02e-f699-4865-b83f-f40501752184","timeout":5}
```

### Environment Keys (Proxy)

- `BLE_PROXY_ENABLED` – enable/disable backend WS + proxy features (default: false)
- `BLE_PROXY_DEFAULT_TIMEOUT` – default discovery timeout in seconds (default: 5)
- `BLE_PROXY_ADAPTER` – optional default adapter name (e.g., `hci0`); overrides only when set
 - `PUBLIC_MODE` – when true, hides proxy UI for public hosting
 - `SFP_SERVICE_UUID`, `SFP_WRITE_CHAR_UUID`, `SFP_NOTIFY_CHAR_UUID` – optional defaults persisted by the backend when saving deployment defaults

### API Endpoints (Proxy)

- `GET /api/v1/ble/adapters` – list available local Bluetooth adapters (requires DBus mount)
- `GET /api/v1/ble/inspect?device_address=&adapter=` – connect by address and return services/characteristics
- `POST /api/v1/ble/profile/env` – update bind‑mounted `.env` with SFP profile (restart required)

## Maintenance

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Database Backup

```bash
# Backup database
docker-compose exec backend sqlite3 /app/data/sfp_library.db ".backup '/app/data/backup.db'"

# Copy to host
docker cp sfpliberate-backend:/app/data/backup.db ./backup.db

# Automated backup script
docker-compose exec backend sh -c \
  "sqlite3 /app/data/sfp_library.db \".backup '/app/data/backup-\$(date +%Y%m%d).db'\""
```

### Database Restore

```bash
# Stop application
docker-compose down

# Copy backup to data directory
cp backup.db ./data/sfp_library.db

# Start application
docker-compose up -d
```

### Updating SFPLiberate

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose down
docker-compose build --pull
docker-compose up -d

# Run migrations (if needed)
docker-compose exec backend alembic upgrade head
```

### Cleanup

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (CAUTION: deletes data)
docker volume prune

# Full cleanup (CAUTION)
docker-compose down -v
docker system prune -a
```

### Troubleshooting

### Container Won't Start

```bash
# Check container status
docker-compose ps

# View detailed logs
docker-compose logs

# Check for port conflicts
sudo lsof -i :8080
sudo lsof -i :8000

# Verify Docker is running
sudo systemctl status docker
```

### Database Errors

```bash
# Check database file permissions
docker-compose exec backend ls -la /app/data/

# Recreate database
docker-compose down
rm -rf ./data/sfp_library.db
docker-compose up -d

# Run migrations manually
docker-compose exec backend alembic upgrade head
```

### BLE Proxy Issues

```bash
# Check Bluetooth adapter
bluetoothctl list
hciconfig

# Verify bleak is installed
docker-compose exec backend poetry show bleak

# Check permissions
groups | grep bluetooth

# Test adapter access
docker-compose exec backend python -c "import bleak; print(bleak.__version__)"

# View BLE-specific logs
docker-compose logs backend | grep -i "ble\|bluetooth\|bleak"
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Increase resource limits in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G

# View slow queries (if database is slow)
docker-compose exec backend sqlite3 /app/data/sfp_library.db \
  "PRAGMA compile_options;"
```

### Network Issues

```bash
# Check network
docker network inspect sfpliberate_sfp-internal

# Test backend connectivity
docker-compose exec frontend wget -O- http://backend/api/v1/health

# Test from host
curl http://localhost:8080/api/v1/health

# Recreate network
docker-compose down
docker network prune
docker-compose up -d
```

### Health Check Failures

```bash
# Check health status
docker-compose ps

# View health check logs
docker inspect sfpliberate-backend | grep -A 10 Health

# Disable health checks temporarily (debugging)
# Edit docker-compose.yml and remove healthcheck section

# Test health endpoint manually
curl http://localhost:8080/api/v1/health
```

## Architecture Details

### Container Structure

```
┌─────────────────────────────────────┐
│         Host (Port 8080)            │
└─────────────┬───────────────────────┘
              │
    ┌─────────▼──────────┐
    │  Frontend (NGINX)   │  Port 80 (internal)
    │  - Serves static    │
    │  - Reverse proxy    │
    └─────────┬───────────┘
              │
    ┌─────────▼──────────┐
    │   Backend (FastAPI) │  Port 80 (internal)
    │  - API endpoints    │
    │  - BLE proxy        │
    │  - SQLite           │
    └─────────┬───────────┘
              │
    ┌─────────▼──────────┐
    │  Volume (backend_data)
    │  - sfp_library.db   │
    │  - submissions/     │
    └─────────────────────┘
```

### Multi-Stage Builds

**Backend:**
- `base`: Python + Poetry setup
- `builder`: Dependency installation
- `development`: Dev dependencies + hot-reload
- `production`: Minimal runtime image

**Frontend:**
- `base`: NGINX + wget
- `production`: Static files + security

### Security Features

- **Non-root users:** Both containers run as unprivileged users
- **Read-only filesystems:** Production containers (with tmpfs for necessary writes)
- **No new privileges:** `security_opt: no-new-privileges:true`
- **Resource limits:** CPU and memory constraints
- **Network isolation:** Internal bridge network
- **Minimal attack surface:** Alpine base images, minimal packages

## Further Reading

- [Docker Compose Specification](https://docs.docker.com/compose/compose-file/)
- [Docker Engine Release Notes](https://docs.docker.com/engine/release-notes/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [SFPLiberate Documentation](../README.md)
- [BLE Proxy Implementation](./BLE_PROXY_STATUS.md)
