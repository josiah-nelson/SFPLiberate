# SFPLiberate Deployment Guide

Complete guide for deploying SFPLiberate in production and development environments.

---

## Deployment Options

This guide covers **self-hosted full-stack deployment**. For other deployment modes:

- **Public Server (Appwrite + Standalone BLE Proxy)**: See [PUBLIC_DEPLOYMENT.md](./PUBLIC_DEPLOYMENT.md) for iOS/Safari users with Appwrite-hosted UI
- **Standalone BLE Proxy Only**: See [../ble-proxy-service/README.md](../ble-proxy-service/README.md) for lightweight BLE proxy container

---

## Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Environment Variables](#environment-variables)
- [Scaling & Performance](#scaling--performance)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Quick Start

### Prerequisites

- Docker 24.0+ with BuildKit enabled
- Docker Compose 2.20+
- Git
- 2GB RAM minimum (4GB recommended)
- 10GB disk space

### One-Command Start

```bash
# Clone repository
git clone https://github.com/josiah-nelson/SFPLiberate.git
cd SFPLiberate

# Start production environment
make prod

# Or start development environment with hot-reload
make dev
```

Access the application at: http://localhost:8080

---

## Development Setup

### Using Make (Recommended)

```bash
# Start development with hot-reload
make dev

# Follow logs
make dev-logs

# Stop development
make dev-stop

# Run tests
make test

# Run linters
make lint
```

### Manual Setup

```bash
# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Backend only (for testing)
cd backend
poetry install
poetry run uvicorn app.main:app --reload

# Frontend only (for testing)
cd frontend
npm install
npm run dev
```

### Development Features

- **Hot-reload**: Source code changes reflected immediately
- **Volume mounts**: No rebuild needed for code changes
- **Debug logging**: `LOG_LEVEL=debug` enabled
- **No resource limits**: Full CPU/memory access
- **Fast health checks**: 10s intervals instead of 30s

---

## Production Deployment

### Quick Deploy

```bash
# Automated deployment with health checks
make deploy

# Or use deployment script directly
./scripts/deploy.sh
```

### Manual Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Set environment variables
cp .env.example .env
nano .env  # Configure your settings

# 3. Build images
make build

# 4. Start services
make prod

# 5. Verify health
make health
```

### Deployment Script Options

```bash
# Deploy with options
./scripts/deploy.sh --no-backup    # Skip database backup
./scripts/deploy.sh --skip-health  # Skip health checks
./scripts/deploy.sh --rollback     # Rollback to previous version
```

### Deployment with Health Checks

The deployment script automatically:

1. ✅ Backs up database
2. ✅ Builds new images
3. ✅ Starts new containers (with brief downtime for single-instance setups)
4. ✅ Runs health checks
5. ✅ Rolls back on failure

**Note**: For single-instance deployments, `docker-compose up -d` will stop the existing containers before starting new ones, resulting in brief downtime (typically a few seconds). For true zero-downtime deployments, consider implementing a blue-green deployment strategy with multiple instances behind a load balancer

---

## Environment Variables

### Required Variables

```bash
# .env file
VERSION=1.0.0                    # Application version
ENVIRONMENT=production           # production | development | staging
HOST_PORT=8080                   # External port for frontend
```

### Backend Configuration

```bash
# Database
DATABASE_FILE=/app/data/sfp_library.db
DATA_PATH=./data                 # Host path for persistent data

# Logging
LOG_LEVEL=info                   # debug | info | warning | error

# BLE Proxy (optional)
BLE_PROXY_ENABLED=false          # Enable Bluetooth proxy mode
BLE_PROXY_DEFAULT_TIMEOUT=5      # Timeout for BLE operations (seconds)
BLE_PROXY_ADAPTER=hci0           # Bluetooth adapter (Linux)
```

### Frontend Configuration

```bash
# Next.js
NEXT_PUBLIC_API_URL=/api         # API endpoint (proxied by Next.js)
NEXT_PUBLIC_DEPLOYMENT_MODE=standalone
NEXT_TELEMETRY_DISABLED=1        # Disable Next.js telemetry

# Internal
BACKEND_URL=http://backend       # Backend service URL (Docker network)
```

### Docker Compose Variables

```bash
# Build arguments
PYTHON_VERSION=3.11
POETRY_VERSION=1.8.5
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF=$(git rev-parse --short HEAD)

# Resource limits (adjust based on your server)
# See docker-compose.yml for CPU/memory limits
```

---

## Scaling & Performance

### Horizontal Scaling

**Backend scaling:**

```bash
# Scale backend to 3 replicas
docker-compose up -d --scale backend=3

# Add load balancer (nginx, traefik, etc.)
# See docker-compose.yml for traefik labels
```

**Database scaling:**

SQLite has limitations for high concurrency. For production at scale:

```bash
# Option 1: Switch to PostgreSQL
# Update backend/app/database.py
# Update DATABASE_FILE env var

# Option 2: Use read replicas (advanced)
# Implement master-slave SQLite setup
```

### Performance Tuning

**Backend optimizations:**

```python
# backend/app/main.py
uvicorn app.main:app \
  --workers 4 \              # CPU cores
  --limit-concurrency 100 \  # Max concurrent requests
  --backlog 200              # Connection queue
```

**Frontend optimizations:**

```typescript
// frontend/next.config.ts
export default {
  compress: true,              // Enable gzip
  generateEtags: true,         // Enable ETags
  poweredByHeader: false,      // Remove X-Powered-By
  reactStrictMode: true        // Optimize React
}
```

**Docker optimizations:**

```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'      # Increase based on load
          memory: 1G       # Increase for large datasets
```

### Caching Strategy

1. **Docker layer caching**: BuildKit enabled by default
2. **Dependency caching**: Poetry and npm use lock files
3. **GitHub Actions caching**: GHA cache for CI/CD
4. **Browser caching**: Static assets cached via Next.js

---

## Monitoring & Logging

### View Logs

```bash
# All services
make logs

# Backend only
make logs-backend

# Frontend only
make logs-frontend

# Last 100 lines
docker-compose logs --tail=100

# Follow specific container
docker logs -f sfpliberate-backend
```

### Health Checks

```bash
# Check all services
make health

# Manual checks
curl http://localhost:8080/api/modules  # Backend
curl http://localhost:8080/             # Frontend

# Docker health status
docker-compose ps
docker inspect sfpliberate-backend | jq '.[0].State.Health'
```

### Monitoring Stack (Optional)

Add to `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secret
```

### Log Aggregation

```bash
# Option 1: Loki + Grafana
# See: https://grafana.com/docs/loki/latest/

# Option 2: ELK Stack
# See: https://www.elastic.co/elk-stack

# Option 3: Simple file rotation
docker-compose --log-opt max-size=10m --log-opt max-file=3
```

---

## Backup & Recovery

### Automated Backups

```bash
# Manual backup
make db-backup

# Automated daily backups (crontab)
0 2 * * * cd /app/SFPLiberate && make db-backup

# Backup to external storage
make db-backup && \
  aws s3 cp backups/ s3://my-bucket/homeassistant/ --recursive
```

### Backup Strategy

1. **Database**: SQLite file at `/app/data/sfp_library.db`
2. **Submissions**: Files in `/app/data/submissions/`
3. **Configuration**: `.env` file
4. **Docker volumes**: `backend_data` volume

**Backup script:**

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

# Backup database
docker-compose exec -T backend cat /app/data/sfp_library.db \
  > "$BACKUP_DIR/sfp_library.db"

# Backup submissions
docker cp sfpliberate-backend:/app/data/submissions \
  "$BACKUP_DIR/submissions"

# Backup config
cp .env "$BACKUP_DIR/.env"

# Compress
tar -czf "backup_${TIMESTAMP}.tar.gz" "$BACKUP_DIR"
```

### Recovery

```bash
# Stop services
make down

# Restore database
cat backups/sfp_library_YYYYMMDD_HHMMSS.db | \
  docker-compose exec -T backend tee /app/data/sfp_library.db > /dev/null

# Or restore volume
docker volume rm sfpliberate_backend_data
docker volume create sfpliberate_backend_data
docker run --rm -v sfpliberate_backend_data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/backup.tar.gz"

# Restart services
make prod
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Error: port 8080 already in use
# Solution: Change port in .env
echo "HOST_PORT=8081" >> .env
make prod
```

#### 2. Docker Build Fails

```bash
# Clear cache and rebuild
docker system prune -a
make clean
make build
```

#### 3. Database Locked

```bash
# SQLite database locked
# Solution: Check for stale connections
docker-compose restart backend

# Or clear locks
docker-compose exec backend rm -f /app/data/sfp_library.db-journal
```

#### 4. Frontend Build Fails

```bash
# Out of memory during build
# Solution: Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory: 4GB+

# Or build with more memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

#### 5. Health Checks Failing

```bash
# Check container logs
make logs

# Check health status
docker-compose ps

# Test endpoints manually
curl -v http://localhost:8080/api/modules
curl -v http://localhost:8080/

# Restart services
make restart
```

#### 6. BLE Proxy Not Working

```bash
# Linux: Check Bluetooth permissions
sudo usermod -a -G bluetooth $USER
sudo chmod 777 /var/run/dbus/system_bus_socket

# Restart BlueZ
sudo systemctl restart bluetooth

# Check logs
make logs-backend | grep BLE
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Increase limits in docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G

# Check database size
docker-compose exec backend du -sh /app/data/sfp_library.db

# Optimize database
docker-compose exec backend sqlite3 /app/data/sfp_library.db "VACUUM;"
```

### Debugging

```bash
# Shell into containers
make shell-backend
make shell-frontend

# Check environment variables
docker-compose exec backend env
docker-compose exec frontend env

# Network debugging
docker network inspect sfpliberate_sfp-internal
docker-compose exec backend ping frontend
docker-compose exec frontend ping backend

# Database debugging
make db-shell
# Inside SQLite:
.tables
.schema sfp_modules
SELECT COUNT(*) FROM sfp_modules;
```

---

## Security Considerations

### Production Checklist

- [ ] Change default passwords/secrets
- [ ] Enable HTTPS (use reverse proxy)
- [ ] Set up firewall rules
- [ ] Enable rate limiting (already configured)
- [ ] Regular security updates
- [ ] Backup encryption
- [ ] Access logs review
- [ ] Vulnerability scanning

### HTTPS Setup (Nginx)

```nginx
# /etc/nginx/sites-available/sfpliberate
server {
    listen 443 ssl http2;
    server_name sfpliberate.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Firewall (UFW)

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny direct access to app
sudo ufw deny 8080/tcp

sudo ufw enable
```

### Docker Security

```yaml
# docker-compose.yml
services:
  backend:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    user: "1000:1000"
```

---

## CI/CD Integration

### GitHub Actions

Already configured in `.github/workflows/ci.yml`:

- ✅ Backend tests (Python 3.11, 3.12)
- ✅ Frontend tests (type-check, lint, build)
- ✅ Docker build & push to GHCR
- ✅ Integration tests
- ✅ Automated deployment on main branch

### Manual Deployment

```bash
# On your server
git clone https://github.com/josiah-nelson/SFPLiberate.git
cd SFPLiberate
cp .env.example .env
# Edit .env with production settings
make deploy
```

### Automated Deployment (GitHub Actions)

```yaml
# Add to .github/workflows/ci.yml
deploy:
  runs-on: ubuntu-latest
  steps:
    - name: Deploy to production
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.PROD_HOST }}
        username: ${{ secrets.PROD_USER }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /app/SFPLiberate
          git pull
          make deploy
```

---

## Additional Resources

- **Docker Documentation**: https://docs.docker.com/
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **FastAPI Production**: https://fastapi.tiangolo.com/deployment/
- **SQLite Performance**: https://www.sqlite.org/optoverview.html
- **Web Bluetooth API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API

---

## Support

- **Issues**: https://github.com/josiah-nelson/SFPLiberate/issues
- **Discussions**: https://github.com/josiah-nelson/SFPLiberate/discussions
- **Contributing**: See `CONTRIBUTING.md`

---

## License

MIT License - See `LICENSE` file for details.
