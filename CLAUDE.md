# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**SFPLiberate** is a Web Bluetooth companion app for the Ubiquiti SFP Wizard (UACC-SFP-Wizard) that captures SFP/SFP+ module EEPROM data over BLE, stores it in a local library, and enables cloning/reprogramming modules.

**Architecture:**
- **Frontend:** Next.js 16 (App Router) + TypeScript + React 19 + shadcn/ui
- **Backend:** FastAPI + SQLAlchemy 2.0 + Python 3.14 + Poetry
- **Database:** SQLite (standalone) or Appwrite (cloud)
- **Deployment:** Docker Compose with two containers

---

## Project Status: Pre-Alpha

- **Current State:** Single-user development/testing (no external users yet)
- **Development Philosophy:** "Make it work" → "Make it right"
- **Breaking Changes:** Acceptable - no production users to maintain compatibility for

**Core Problem:**
- SFP Wizard can only store ONE module profile at a time
- No way to "copy" modules without physically having the original
- No persistent library of configurations

**Solution:**
- Unlimited module storage (local SQLite or cloud Appwrite)
- Clone modules from saved profiles
- Community sharing (planned)

---

## Architecture

### Frontend (`/frontend`)

**Tech Stack:**
- Next.js 16 with App Router (`src/app/`)
- TypeScript + React 19
- shadcn/ui components + Tailwind CSS
- Web Bluetooth API for direct BLE communication
- ESPHome WebSocket client for iOS/Safari

**Key Directories:**
```
frontend/src/
├── app/              # Next.js pages (App Router)
│   ├── page.tsx      # Home page
│   ├── modules/      # Module library UI
│   └── settings/     # Settings page
├── components/       # React components
│   ├── ble/          # Web Bluetooth components
│   ├── esphome/      # ESPHome proxy UI
│   ├── modules/      # Module management
│   └── ui/           # shadcn/ui components
├── lib/              # Utilities & clients
│   ├── api/          # Backend API client
│   ├── ble/          # Web Bluetooth abstraction
│   └── esphome/      # ESPHome WebSocket client
└── types/            # TypeScript type definitions
```

**Reverse Proxy:**
- Next.js `rewrites` in `next.config.ts` proxy `/api/*` to backend
- No nginx - native Next.js functionality
- Config handles standalone vs Appwrite deployment modes

**BLE Communication:**
- Primary: Web Bluetooth API (`navigator.bluetooth`)
- Fallback: ESPHome proxy via WebSocket (for iOS/Safari)
- UUIDs cached in localStorage after discovery

---

### Backend (`/backend`)

**Tech Stack:**
- FastAPI with Python 3.14
- SQLAlchemy 2.0 (async) with SQLite
- Poetry for dependency management
- structlog for structured logging
- ESPHome Native API integration

**Key Directories:**
```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings (Pydantic BaseSettings)
│   ├── api/v1/              # API endpoints
│   │   ├── modules.py       # Module CRUD
│   │   ├── esphome.py       # ESPHome REST endpoints
│   │   └── esphome_websocket.py  # ESPHome WebSocket
│   ├── core/                # Core utilities
│   │   ├── database.py      # SQLAlchemy setup (create_all)
│   │   └── logging.py       # structlog configuration
│   ├── models/              # SQLAlchemy models
│   │   └── module.py        # SFP module model
│   ├── repositories/        # Data access layer
│   │   └── module_repository.py
│   ├── schemas/             # Pydantic schemas (API)
│   │   └── module.py
│   └── services/            # Business logic
│       ├── esphome/         # ESPHome proxy service
│       └── sfp_parser.py    # SFF-8472 parser
├── tests/                   # Unit & integration tests
├── Dockerfile               # Production build (Poetry)
├── pyproject.toml           # Dependencies + config
└── poetry.lock              # Locked dependencies
```

**Database Setup:**
- **No Alembic** - using `Base.metadata.create_all()` for simplicity (pre-alpha)
- Tables created on startup via `init_db()` in lifespan
- Add Alembic post-alpha when schema migrations needed

**API Versioning:**
- All endpoints under `/api/v1/`
- Auto-generated docs at `/api/docs` (Swagger UI)

---

## Deployment Modes

### 1. Standalone Docker (Default)

**Purpose:** Complete local deployment with SQLite

**Stack:**
- Frontend: Next.js standalone server (port 3000 → host 8080)
- Backend: FastAPI + SQLite (port 80 → host 8081)
- Database: SQLite file in Docker volume
- Networking: Bridge mode (172.25.0.0/24)

**Access:** http://localhost:8080

**Commands:**
```bash
docker-compose up --build          # Start services
docker-compose down                # Stop services
docker-compose logs -f backend     # View backend logs
```

**Environment:**
- `DEPLOYMENT_MODE=standalone` (default)
- `ESPHOME_PROXY_MODE=false` (default)

---

### 2. Appwrite Cloud

**Purpose:** Hosted deployment with Appwrite backend

**Stack:**
- Frontend: Static export to Appwrite Sites
- Backend: Appwrite Functions (serverless)
- Database: Appwrite Database
- Auth: Appwrite Auth

**Build:**
- `DEPLOYMENT_MODE=appwrite` triggers `output: 'export'` in Next.js
- Frontend uses Appwrite SDK instead of REST API
- Backend repository layer routes to Appwrite Database

**Deployment:**
- GitHub Actions workflow (planned)
- Manual: `npm run build && appwrite deploy`

---

### 3. Home Assistant Add-On

**Purpose:** Simplified deployment for Home Assistant users

**Stack:**
- Frontend: Next.js standalone (ingress at port 3000)
- Backend: FastAPI + SQLite (port 80)
- Database: SQLite in `/config/sfpliberate/`
- Bluetooth: HA Bluetooth API (not mDNS)

**Architecture Differences:**
- Backend uses `HomeAssistantBluetoothClient` instead of `ESPHomeProxyService`
- No mDNS discovery - queries HA's `/api/states` for bluetooth entities
- Auto-discovery via pattern matching on device names
- Single-click connection flow (no UUID entry needed)
- Single container (backend + frontend) with s6-overlay process supervision

**Installation:**
```bash
# Via "Add to Home Assistant" button in README
# OR manually add repository: https://github.com/josiah-nelson/SFPLiberate
```

**Environment:**
- `HA_ADDON_MODE=true` (set in run.sh)
- `DEPLOYMENT_MODE=homeassistant`
- `DATABASE_FILE=/config/sfpliberate/sfp_library.db`
- `SUPERVISOR_TOKEN` (provided by HA)

**Configuration:**
Users configure via HA UI (Settings → Add-ons → SFPLiberate → Configuration):
- `log_level`: Logging verbosity
- `auto_discover`: Enable/disable auto-discovery
- `device_name_patterns`: List of patterns to match (e.g., ["SFP", "Wizard"])
- `connection_timeout`: BLE connection timeout
- `device_expiry_seconds`: How long to keep stale devices

**Development:**
```bash
# Build add-on locally
docker build -f homeassistant/Dockerfile -t sfpliberate-addon .

# Test in dev mode (requires running HA instance)
docker-compose -f docker-compose.ha-dev.yml up
```

**Key Files:**
- `homeassistant/config.yaml` - Add-on metadata & schema
- `homeassistant/Dockerfile` - Multi-stage build
- `homeassistant/run.sh` - Startup script
- `homeassistant/rootfs/etc/services.d/` - s6-overlay services
- `backend/app/services/ha_bluetooth/` - HA Bluetooth client
- `backend/app/api/v1/ha_bluetooth.py` - HA Bluetooth endpoints

**API Endpoints:**
```
GET  /api/v1/ha-bluetooth/status    # Service status
GET  /api/v1/ha-bluetooth/devices   # Auto-discovered devices
POST /api/v1/ha-bluetooth/connect   # Connect & get UUIDs
```

**Bluetooth Discovery Flow:**
1. Backend polls HA's `/api/states` every 5 seconds
2. Filters for entities with `bluetooth` or `ble` in source
3. Matches device names against configured patterns
4. Updates cached device list
5. WebSocket listener provides real-time updates

**Ingress Integration:**
- Add-on exposes frontend at port 3000
- HA's ingress proxy handles authentication & routing
- Users access via Settings → Add-ons → SFPLiberate → OPEN WEB UI
- No port configuration needed

---

### 4. ESPHome Proxy Mode (Optional)

**Purpose:** BLE proxy for iOS/Safari users without Web Bluetooth

**When Enabled:**
- Frontend uses WebSocket instead of Web Bluetooth
- Backend discovers ESPHome proxies via mDNS
- Backend forwards BLE commands to ESPHome → device

**Docker Configuration:**
```bash
# Enable in .env
ESPHOME_PROXY_MODE=true

# Start with host networking (required for mDNS)
docker-compose -f docker-compose.yml -f docker-compose.esphome.yml up
```

**Requirements:**
- ESPHome Bluetooth proxy on network (Home Assistant users typically have this)
- mDNS enabled OR manual proxy configuration

**Key Difference from Standalone:**
- `docker-compose.esphome.yml` sets frontend to `network_mode: host`
- Backend stays in bridge mode (connects to frontend via localhost)
- See `docs/ESPHOME.md` for complete guide

---

## BLE Protocol (Firmware v1.0.10)

**Service UUID:** `8E60F02E-F699-4865-B83F-F40501752184`
**Write Characteristic:** `9280F26C-A56F-43EA-B769-D5D732E1AC67`
**Notify Characteristic:** `DC272A22-43F2-416B-8FA5-63A071542FAC`

**Discovered Endpoints:**
- `GET /api/1.0/version` - Firmware version
- `GET /stats` - Device status (battery, SFP presence)
- `POST /sif/start` - Read SFP EEPROM
- `POST /sif/write` - Write SFP EEPROM (binary data chunking)
- `POST /sif/erase` - Erase SFP EEPROM
- `POST /sif/stop` - Stop operation

**Data Format:**
- Text commands sent to write characteristic
- Binary EEPROM data sent in 20-byte chunks
- Responses received via notify characteristic
- SFF-8472 spec for EEPROM structure (vendor @ bytes 20-36, model @ 40-56, serial @ 68-84)

See `docs/BLE_API_SPECIFICATION.md` for complete protocol documentation.

---

## Key Files & Responsibilities

### Frontend

**`frontend/src/app/page.tsx`**
- Home page with BLE connection UI
- Integrates Web Bluetooth and ESPHome proxy
- Device status display

**`frontend/src/lib/ble/manager.ts`**
- Web Bluetooth abstraction layer
- Connection lifecycle management
- Notification handling

**`frontend/src/lib/esphome/esphomeWebSocketClient.ts`**
- WebSocket client for ESPHome proxy
- Provides Web Bluetooth-like API via adapter
- Used when Web Bluetooth unavailable (iOS/Safari)

**`frontend/src/lib/api/backendClient.ts`**
- Backend API client (module CRUD)
- Axios-based with TypeScript types
- Error handling and retry logic

**`frontend/next.config.ts`**
- Dual deployment mode configuration
- Rewrites for API proxying in standalone mode
- Build output: `standalone` or `export`

---

### Backend

**`backend/app/main.py`**
- FastAPI app initialization
- Lifespan manager (startup/shutdown)
- CORS middleware for development
- Structured logging setup
- ESPHome service startup (if enabled)

**`backend/app/core/database.py`**
- SQLAlchemy async engine
- Session management (`get_db` dependency)
- `init_db()` - creates tables via `Base.metadata.create_all()`

**`backend/app/api/v1/modules.py`**
- Module CRUD endpoints
- `/api/v1/modules` - List, create modules
- `/api/v1/modules/{id}` - Get, update, delete
- `/api/v1/modules/{id}/eeprom` - Get raw binary

**`backend/app/services/esphome/proxy_service.py`**
- ESPHome proxy discovery via mDNS
- Device advertisement tracking
- RSSI-based proxy selection
- Singleton service (started in lifespan)

**`backend/app/api/v1/esphome_websocket.py`**
- WebSocket endpoint (`/api/v1/esphome/ws`)
- Forwards BLE commands to ESPHome proxy
- Handles notifications from device
- Connection lifecycle management

---

## Docker Configuration

### Files

**`docker-compose.yml`** (Main)
- Defines `backend` and `frontend` services
- Bridge networking with custom subnet
- Volume for backend data persistence
- Health checks for both services

**`docker-compose.dev.yml`** (Development Override)
- Mounts source code for hot-reload
- Backend: Poetry + uvicorn reload
- Frontend: npm dev server

**`docker-compose.esphome.yml`** (ESPHome Override)
- Sets frontend to `network_mode: host`
- Updates `BACKEND_URL` to localhost
- Required for ESPHome proxy mode

### Backend Dockerfile

**`backend/Dockerfile`** (Poetry-based)
```dockerfile
FROM python:3.14-slim
# Install Poetry
# Export requirements via Poetry
# Install dependencies
# Copy app code
# CMD: uvicorn app.main:app
```

**No migrations on startup** - `create_all()` is idempotent

### Frontend Dockerfile

**`frontend/Dockerfile`** (Next.js standalone)
```dockerfile
# Build stage: npm install + npm run build
# Production stage: Copy standalone output
# CMD: node server.js
```

---

## Common Development Tasks

### Running Locally

```bash
# Full stack
docker-compose up --build

# Dev mode (hot-reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# ESPHome proxy mode
docker-compose -f docker-compose.yml -f docker-compose.esphome.yml up
```

### Backend Development

```bash
cd backend
poetry install
poetry run pytest                       # Run tests
poetry run pytest --cov=app             # With coverage
poetry run uvicorn app.main:app --reload  # Dev server
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev                             # Dev server (port 3000)
npm run build                           # Production build
npm run start                           # Serve production build
```

### Database

```bash
# Access SQLite database
docker exec -it sfpliberate-backend sqlite3 /app/data/sfp_library.db

# Common queries
SELECT id, name, vendor, model FROM sfp_modules;
SELECT COUNT(*) FROM sfp_modules;

# Reset database
docker-compose down -v  # Removes volume
docker-compose up       # Recreates with empty DB
```

---

## API Endpoints Reference

### Module Management (`/api/v1/modules`)

```
GET    /api/v1/modules               List all modules
POST   /api/v1/modules               Create module
GET    /api/v1/modules/{id}          Get module details
GET    /api/v1/modules/{id}/eeprom   Get raw EEPROM binary
DELETE /api/v1/modules/{id}          Delete module
```

**Example Request:**
```json
POST /api/v1/modules
{
  "name": "Cisco GLC-SX-MMD",
  "eeprom_data": "base64-encoded-binary-data..."
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Cisco GLC-SX-MMD",
  "vendor": "CISCO-AVAGO",
  "model": "SFBR-5766ALZ",
  "serial": "AV12345678",
  "sha256": "abc123...",
  "created_at": "2025-11-04T10:00:00Z"
}
```

### ESPHome Proxy (`/api/v1/esphome/*`)

```
GET  /api/v1/esphome/status    Service status
GET  /api/v1/esphome/devices   SSE stream of devices
POST /api/v1/esphome/connect   Connect & get UUIDs
WS   /api/v1/esphome/ws        WebSocket for BLE
```

**WebSocket Messages:**
```json
// Connect to device
{"type": "connect", "mac_address": "AA:BB:CC:DD:EE:FF"}

// Write command
{"type": "write", "data": "base64-data"}

// Subscribe to notifications
{"type": "subscribe"}

// Disconnect
{"type": "disconnect"}
```

---

## Environment Variables

**Key Variables (.env):**

```bash
# Deployment Mode
DEPLOYMENT_MODE=standalone          # or "appwrite"

# ESPHome Proxy
ESPHOME_PROXY_MODE=false            # true to enable

# SFP Wizard UUIDs (v1.0.10)
SFP_SERVICE_UUID=8E60F02E-F699-4865-B83F-F40501752184
SFP_WRITE_CHAR_UUID=9280F26C-A56F-43EA-B769-D5D732E1AC67
SFP_NOTIFY_CHAR_UUID=DC272A22-43F2-416B-8FA5-63A071542FAC

# Docker Ports
BACKEND_HOST_PORT=8081
FRONTEND_HOST_PORT=8080

# Logging
LOG_LEVEL=info

# Backend
DATABASE_FILE=/app/data/sfp_library.db
SUBMISSIONS_DIR=/app/data/submissions
ENVIRONMENT=production

# Frontend
BACKEND_URL=http://backend:80
FRONTEND_PORT=3000
```

See `.env.example` for complete reference.

---

## Browser Compatibility

### ✅ Supported (Web Bluetooth)
- Chrome (Desktop, Android, ChromeOS)
- Edge (Desktop, Android)
- Opera (Desktop, Android)
- Bluefy Browser (iOS) - third-party app

### ❌ Not Supported
- Safari (all platforms) - NO Web Bluetooth support
  - Apple's position: "Not Considering"
  - No experimental flags
- Firefox - No Web Bluetooth support

**Workaround for iOS/Safari:** Enable ESPHome proxy mode

---

## Testing

### Backend Tests

```bash
cd backend
poetry run pytest                     # All tests
poetry run pytest -v                  # Verbose
poetry run pytest --cov=app           # Coverage
poetry run pytest tests/test_modules.py  # Specific file
```

**Test Structure:**
```
backend/tests/
├── test_api/           # API endpoint tests
├── test_services/      # Service layer tests
├── test_repositories/  # Repository tests
└── conftest.py         # Pytest fixtures
```

### Frontend Tests

```bash
cd frontend
npm run test            # All tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

---

## Coding Conventions

### Frontend (TypeScript/React)

- **Components:** PascalCase (e.g., `BleConnectionManager.tsx`)
- **Functions:** camelCase (e.g., `connectToDevice()`)
- **Hooks:** `use` prefix (e.g., `useBleConnection()`)
- **Types:** PascalCase interfaces (e.g., `interface ModuleData`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `SFP_SERVICE_UUID`)
- **File naming:** kebab-case for utilities, PascalCase for components
- **Async/await:** Prefer over `.then()/.catch()`

### Backend (Python)

- **Functions:** snake_case (e.g., `get_module_by_id()`)
- **Classes:** PascalCase (e.g., `class ModuleRepository`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `DATABASE_URL`)
- **Type hints:** Always use (e.g., `def get_module(id: int) -> Module`)
- **Async functions:** `async def` for I/O operations
- **Imports:** Group by stdlib, third-party, local
- **Docstrings:** Google style for functions/classes

---

## Common Pitfalls & Gotchas

### 1. BLE UUID Discovery

**Issue:** UUIDs are firmware-specific and may change between versions

**Solution:**
- UUIDs cached in localStorage after first connection
- Can be pre-seeded via .env
- Discovery flow auto-detects and saves
- Document firmware version with discovered UUIDs

### 2. Web Bluetooth Browser Requirements

**Issue:** Safari/Firefox don't support Web Bluetooth

**Solution:**
- Feature detection: `if ('bluetooth' in navigator)`
- ESPHome proxy fallback for unsupported browsers
- Clear UI messaging about browser compatibility

### 3. Docker Networking

**Issue:** ESPHome requires mDNS which needs host networking

**Solution:**
- Use `docker-compose.esphome.yml` override
- Only frontend needs host mode (backend stays in bridge)
- Manual proxy config available if mDNS unavailable

### 4. EEPROM Data Encoding

**Issue:** Binary EEPROM data must be Base64 encoded for JSON APIs

**Solution:**
- Frontend: `btoa()` / `atob()` for encode/decode
- Backend: `base64.b64decode()` with validation
- Raw binary served as `application/octet-stream` at `/eeprom` endpoint

### 5. Database State During Development

**Issue:** Schema changes don't auto-apply (no migrations)

**Solution:**
- For now: `docker-compose down -v && docker-compose up` to reset
- Post-alpha: Add Alembic for proper migrations
- `create_all()` is idempotent but doesn't modify existing tables

---

## Documentation Structure

**Core Docs (`/docs`):**
- `DEPLOYMENT.md` - Deployment guide (all modes)
- `ESPHOME.md` - ESPHome proxy setup
- `BLUETOOTH.md` - BLE connection guide
- `BLE_API_SPECIFICATION.md` - Device protocol reference
- `ENVIRONMENT_VARIABLES.md` - Configuration reference
- `APPWRITE.md` - Cloud deployment guide
- `NEXTJS_FILE_STRUCTURE.md` - Code organization
- `AUTH_SYSTEM.md` - Authentication (Appwrite mode)
- `ISSUE_4_IMPLEMENTATION.md` - BLE write protocol discovery

**Keep docs up-to-date** when making architectural changes.

---

## TODOs & Future Work

### Short Term (Pre-Alpha)
- [ ] Fix Appwrite integration in new backend (repository layer routing)
- [ ] Add integration tests for ESPHome proxy
- [ ] Improve error handling in frontend BLE manager
- [ ] Add frontend type safety checks (strict TypeScript)

### Medium Term (Alpha)
- [ ] Add Alembic for database migrations
- [ ] Community module repository (GitHub Pages)
- [ ] Bulk import/export (CSV/ZIP)
- [ ] Advanced search and filtering

### Long Term (Beta)
- [ ] DDM (Digital Diagnostics Monitoring) logging
- [ ] Multi-firmware version support
- [ ] Cloud sync for standalone deployments
- [ ] Mobile app (React Native)

---

## Community & Contributing

This is a pre-alpha project in active development. Contributions welcome!

**Before contributing:**
1. Check existing issues and PRs
2. Open an issue to discuss approach for large changes
3. Follow existing code style and conventions
4. Add tests for new functionality
5. Update documentation as needed

**Priority areas:**
- Testing with different SFP modules
- Additional firmware version support
- UI/UX improvements
- Bug reports with detailed reproduction steps

---

## Disclaimer

This project is an independent, community-driven effort and is **not affiliated with, endorsed by, or supported by Ubiquiti**. The SFP Wizard's firmware and BLE behavior may change at any time; this tool may stop working without notice if a firmware update alters the observed interfaces.

Use at your own risk. Always test with non-critical modules first.

---

**Last Updated:** November 4, 2025 (Pre-Alpha Cleanup)
**Architecture:** Next.js 16 + FastAPI + SQLAlchemy 2.0 + ESPHome
**Status:** Pre-Alpha (active development, no external users)
