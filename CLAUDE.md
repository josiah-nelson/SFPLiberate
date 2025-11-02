# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SFPLiberate is a Web Bluetooth companion app for the Ubiquiti SFP Wizard (UACC-SFP-Wizard) that captures SFP/SFP+ module EEPROM data over BLE, stores it in a local library, and aims to enable cloning/reprogramming modules. The architecture is a **browser-based BLE client** (vanilla JS) + **Dockerized Python FastAPI backend** with SQLite storage, served through NGINX reverse proxy.

## Commands

### Running the Application
```bash
# Start the full stack (builds both containers if needed)
docker-compose up --build

# Access the app at http://localhost:8080
# Access API docs at http://localhost:8080/api/docs

# Stop the application
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Development Workflows

#### Viewing Logs
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend/NGINX only
docker-compose logs -f frontend
```

#### Backend Development (Optional Local Mode)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# Access at http://localhost:8000/api/docs
```

#### Database Access
```bash
# Connect to SQLite database
docker exec -it sfpliberate-backend sqlite3 /app/data/sfp_library.db

# View schema
.schema

# Query modules
SELECT id, name, vendor, model, created_at FROM sfp_modules;
```

## Architecture

### Single-Origin Reverse Proxy Design
- **Frontend (NGINX)**: Serves static HTML/CSS/JS at `/` and reverse-proxies `/api/*` to backend
- **Backend (FastAPI)**: Python backend on port 80 internally, exposes REST API at `/api`
- **External Access**: Port 8080 → NGINX → routes to frontend or backend based on path
- **No CORS Issues**: Same-origin in production; dev CORS middleware enabled on backend

### BLE Communication Pattern (Critical)
- **Core operations happen on-device**: The SFP Wizard reads/writes EEPROM internally via button presses
- **BLE broadcasts data**: Device sends human-readable logs (`sysmon: ... sfp:[x]`) and binary EEPROM dumps over BLE characteristics for capture
- **Commands are speculative**: Text commands like `[POST] /sfp/write/start` in code are **guesses**—not verified. Write functionality requires reverse-engineering the actual BLE protocol from official app
- **Frontend uses Web Bluetooth API** (`navigator.bluetooth`) to connect and subscribe to notifications
- **Safari limitations**: Limited Web Bluetooth support; code includes fallbacks (`acceptAllDevices` when UUID filtering fails)

### Data Storage & Deduplication
- Backend stores modules in SQLite with SHA-256 checksum (unique index on `sha256` column)
- `database_manager.add_module()` returns `(id, is_duplicate)` tuple; duplicates reuse existing ID
- EEPROM stored as BLOB; metadata (vendor/model/serial) parsed server-side via `sfp_parser.parse_sfp_data()`
- Client-side SHA-256 duplicate detection not yet implemented (future enhancement)

## Key Files & Responsibilities

### Frontend (`frontend/`)
- **`script.js`**: BLE state machine, notification handler, SFF-8472 EEPROM parser, API client
  - `handleNotifications()`: Core dispatcher—heuristic text vs binary detection for incoming BLE data
  - `parseAndDisplaySfpData()`: Client-side SFF-8472 parser (vendor @ bytes 20-36, model @ 40-56, serial @ 68-84)
  - Safari compatibility: `acceptAllDevices` fallback, `DataView → Uint8Array` conversion
  - **IMPORTANT**: BLE UUIDs (`SFP_SERVICE_UUID`, `WRITE_CHAR_UUID`, `NOTIFY_CHAR_UUID`) are placeholders—must be discovered via nRF Connect and configured before use
- **`index.html`**: Static UI with status indicators (`bleStatus`, `sfpStatus`), module library list, placeholder community sections
- **`style.css`**: Minimalist CSS styling
- **`nginx.conf`**: Reverse proxy config—`location /api/` passes to `http://backend:80`

### Backend (`backend/`)
- **`main.py`**: FastAPI app with 6 endpoints:
  - `GET /api/modules` → list all (excludes BLOB)
  - `POST /api/modules` → save new module (Base64 EEPROM in payload)
  - `GET /api/modules/{id}/eeprom` → raw binary BLOB (`application/octet-stream`)
  - `DELETE /api/modules/{id}` → delete module
  - `POST /api/submissions` → community inbox (writes to disk: `{uuid}/eeprom.bin` + `metadata.json`)
  - Root `/` → returns API info JSON
- **`database_manager.py`**: SQLite wrapper with SHA-256 duplicate detection, `setup_database()` migration logic
- **`sfp_parser.py`**: SFF-8472 spec parser (identical logic to frontend, validates server-side)
- **Dependencies**: `fastapi`, `uvicorn[standard]`, `pydantic` (Python 3.11+)

### Docker & Infrastructure
- **`docker-compose.yml`**: Two services (`backend`, `frontend`)
  - Backend volume: `backend_data:/app/data` for SQLite persistence
  - Backend env: `DATABASE_FILE=/app/data/sfp_library.db`, `SUBMISSIONS_DIR=/app/data/submissions`
- **`backend/Dockerfile`**: Python 3.11-slim base, installs requirements, runs uvicorn
- **`frontend/Dockerfile`**: NGINX base, copies static files and nginx.conf

## API Endpoints Reference

```
GET    /api/modules              → [{id, name, vendor, model, serial, created_at}, ...]
POST   /api/modules              → {name, eeprom_data_base64} → {status, message, id}
GET    /api/modules/{id}/eeprom  → binary/octet-stream (raw BLOB)
DELETE /api/modules/{id}         → {status, message}
POST   /api/submissions          → {name, vendor, model, serial, eeprom_data_base64, notes?} → {status, inbox_id, sha256}
```

FastAPI docs auto-generated at: `http://localhost:8080/api/docs`

## BLE Protocol Reverse-Engineering

### Current Status
- **Placeholder commands** (e.g., `[POST] /sfp/write/start` in `script.js`) are **speculative guesses**—do not rely on them
- **Write functionality is incomplete**—requires discovering actual BLE command protocol from official app
- To discover commands: use nRF Connect app to sniff BLE traffic during official app operations
- Document findings in code comments with firmware version tested (behavior may change across firmware updates)

### Reference Artifacts
- `artifacts/nRFscanner Output.txt`: Sample BLE scanner output
- `artifacts/support_file_*`: Additional reference captures

### Safety Reminders
- Test with non-critical modules first
- Never force-write to unknown modules
- Validate checksums before writing
- Document any bricking risks discovered

## Browser Compatibility

### Supported Browsers
- **Primary**: Chrome, Edge (Chromium-based)
- **Secondary**: Safari (limited Web Bluetooth support)
- **Not Supported**: Firefox (no Web Bluetooth API), iOS/iPadOS Safari

### Safari-Specific Handling
- Always convert `DataView` to `Uint8Array` before processing (Safari quirk in `handleNotifications()`)
- Provide `acceptAllDevices` fallback when UUID filtering fails (see `connectToDevice()` try/catch)
- Feature detection via `isWebBluetoothAvailable()` and `isSafari()` helpers disables UI gracefully
- macOS Safari: Enable Web Bluetooth in Develop → Experimental Features if available

## Database Schema Evolution

When adding columns to `sfp_modules` table:
- Use `database_manager.setup_database()` migration pattern (see `sha256` column addition logic with `PRAGMA table_info` check)
- **Never** break existing column contracts—add nullable columns or provide defaults

## Community Module Submission Flow (Planned)

1. User reads module → clicks "Upload to Community" → frontend calls `POST /api/submissions`
2. Backend writes to disk inbox: `/app/data/submissions/{uuid}/eeprom.bin` + `metadata.json`
3. Maintainers manually review inbox, validate, and PR to `SFPLiberate/modules` repo with CI validation
4. App fetches `index.json` from GitHub Pages to populate community list (import endpoint pending)

## TODOs and Placeholders

- Functions suffixed with `TODO` (e.g., `loadCommunityModulesTODO()`) are scaffolds—alert user when clicked
- `COMMUNITY_INDEX_URL` constant awaits real GitHub Pages URL from separate `SFPLiberate/modules` repo
- Write logic in `writeSfp()` is intentionally incomplete—requires BLE command discovery (see inline comments)
- BLE UUIDs in `frontend/script.js` are placeholders—must be configured per device

## Coding Conventions

### Frontend (JavaScript)
- Vanilla JS (ES6+), no frameworks
- Use `async/await` for asynchronous code
- Prefer `const` and `let` over `var`
- Functions: `camelCase` (e.g., `handleNotifications`, `parseAndDisplaySfpData`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `SFP_SERVICE_UUID`)
- Suffix placeholder functions with `TODO` (e.g., `loadCommunityModulesTODO()`)

### Backend (Python)
- Python 3.11+ features encouraged
- Type hints preferred (but not enforced)
- Functions: `snake_case` (e.g., `add_module`, `get_all_modules`)
- Classes: `PascalCase` (e.g., `SfpModuleIn`, `StatusMessage`)
- Use context managers for DB connections: `with get_db_connection() as conn:`
- Use FastAPI's `HTTPException` for API errors

## Common Pitfalls

### BLE Assumptions
- **Do not assume** BLE can trigger reads/writes unless verified across firmware versions
- Current code relies on on-device button presses; BLE only captures broadcasts
- Any code sending commands must be tested with real hardware and documented with firmware version

### Base64 Encoding
- Frontend sends EEPROM as Base64 in JSON (`eeprom_data_base64` field)
- Backend decodes to bytes before parsing/storing—**always validate** with `try/except` for malformed data

### NGINX Reverse Proxy Paths
- Backend endpoints **must** start with `/api/` to match NGINX location block
- FastAPI route definitions include `/api` prefix explicitly (e.g., `@app.get("/api/modules")`)

## External References

- **SFF-8472 Spec**: EEPROM layout standard for SFP modules
- **Web Bluetooth API**: [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- **Official Hardware**: Ubiquiti UACC-SFP-Wizard (ESP32-class SFP programmer, not affiliated with this project)

## Modernization Status

**✅ Backend Modernization: COMPLETE**
**⏳ Frontend Modernization: PENDING**

### What's Been Implemented

The backend has been completely modernized with:
- ✅ **SQLAlchemy 2.0 + Alembic:** Type-safe ORM with migrations
- ✅ **Service/Repository Pattern:** Clean separation of concerns
- ✅ **Comprehensive Tests:** 70%+ coverage with pytest
- ✅ **API Versioning:** New `/api/v1/` endpoints
- ✅ **Structured Logging:** JSON logs with structlog
- ✅ **Enhanced CI/CD:** Full linting, testing, coverage pipeline
- ✅ **Pre-commit Hooks:** Automated code quality checks
- ✅ **Poetry:** Modern dependency management

### Quick Start (New Backend)

```bash
cd backend
poetry install
poetry run alembic upgrade head
poetry run pytest
poetry run uvicorn app.main:app --reload
# Visit http://localhost:8000/api/v1/docs
```

### Documentation

- **Getting Started:** [MODERNIZATION_README.md](MODERNIZATION_README.md)
- **Migration Guide:** [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)
- **Implementation Status:** [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
- **Full Proposal:** [docs/MODERNIZATION_PROPOSAL.md](docs/MODERNIZATION_PROPOSAL.md)
- **Quick Reference:** [docs/MODERNIZATION_SUMMARY.md](docs/MODERNIZATION_SUMMARY.md)

## Disclaimer

This project is an independent, community-driven effort and is not affiliated with, endorsed by, or supported by Ubiquiti. The SFP Wizard's firmware and BLE behavior may change at any time; this tool may stop working without notice if a firmware update alters the observed interfaces.
