# SFPLiberate – AI Coding Agent Instructions

## Project Overview
SFPLiberate is a Web Bluetooth companion app for the Ubiquiti SFP Wizard (UACC-SFP-Wizard) that captures SFP/SFP+ module EEPROM data over BLE, stores it in a local library, and aims to enable cloning/reprogramming modules. The architecture is a **browser-based BLE client** (vanilla JS) + **Dockerized Python FastAPI backend** with SQLite storage, served through NGINX reverse proxy.

## Architecture & Data Flow

### Single-Origin Design
- NGINX container serves static frontend at `/` and reverse-proxies `/api/*` to backend container
- Frontend uses relative URL `/api` (no CORS needed in production; dev CORS middleware enabled on backend)
- Backend exposes on port 80 internally; frontend NGINX exposes port 8080 externally
- Start with: `docker-compose up --build` → `http://localhost:8080`

### BLE Communication Pattern
- **Critical**: Core read/write operations occur **on-device**; BLE primarily broadcasts logs/data for capture
- Device broadcasts human-readable status logs (`sysmon: ... sfp:[x]`) and binary EEPROM dumps over BLE characteristics
- Frontend uses Web Bluetooth API (`navigator.bluetooth`) to connect and subscribe to notifications
- Write functionality is **placeholder only**—requires reverse-engineering actual BLE command protocol from official app

### Data Storage & Deduplication
- Backend stores modules in SQLite with SHA-256 checksum (`sha256` column with unique index)
- `database_manager.add_module()` returns `(id, is_duplicate)` tuple; duplicates reuse existing ID
- EEPROM stored as BLOB; metadata (vendor/model/serial) parsed server-side via `sfp_parser.parse_sfp_data()`

## Key Files & Responsibilities

### Frontend (`frontend/`)
- **`script.js`** (575 lines): BLE state machine, notification handler, SFF-8472 EEPROM parser, API client
  - `handleNotifications()`: Core dispatcher—heuristic text vs binary detection for incoming BLE data
  - `parseAndDisplaySfpData()`: Client-side SFF-8472 parser (bytes 20-36 vendor, 40-56 model, 68-84 serial)
  - Safari compatibility: `acceptAllDevices` fallback, `DataView → Uint8Array` conversion for broad support
- **`index.html`**: Static UI with status indicators (`bleStatus`, `sfpStatus`), module library list, placeholder community sections
- **`nginx.conf`**: Reverse proxy config—`location /api/` passes to `http://backend:80`

### Backend (`backend/`)
- **`main.py`**: FastAPI app with 6 endpoints:
  - `GET /api/modules` → list all (excludes BLOB)
  - `POST /api/modules` → save new module (Base64 EEPROM in payload)
  - `GET /api/modules/{id}/eeprom` → raw binary BLOB (`application/octet-stream`)
  - `DELETE /api/modules/{id}` → delete module
  - `POST /api/submissions` → community inbox (writes to disk: `{uuid}/eeprom.bin` + `metadata.json`)
- **`database_manager.py`**: SQLite wrapper with SHA-256 duplicate detection, `setup_database()` migration logic
- **`sfp_parser.py`**: SFF-8472 spec parser (identical logic to frontend, validates server-side)

### Docker & Infra
- **`docker-compose.yml`**: Two services (`backend`, `frontend`); backend volume mounted at `/app/data` for SQLite persistence
- Backend env: `DATABASE_FILE=/app/data/sfp_library.db`, `SUBMISSIONS_DIR=/app/data/submissions`
- Dependencies: `fastapi`, `uvicorn[standard]`, `pydantic` (Python 3.11+)

## Development Workflows

### Local Iteration
```bash
docker-compose up --build    # Full stack at localhost:8080
docker-compose logs -f backend  # Backend logs (FastAPI + SQLite)
```
- API docs auto-generated: `http://localhost:8080/api/docs` (FastAPI Swagger)
- Frontend changes: rebuild frontend container or mount volume for live edits
- Backend changes: restart backend service or use `--reload` in Dockerfile (dev only)

### Testing BLE (requires hardware)
1. Power on SFP Wizard with module inserted
2. Open app in Chrome/Edge (Safari has limited Web Bluetooth support—see feature detection in `script.js`)
3. Click "Connect to Device" → browser shows device picker (UUID filters may fail on Safari, code falls back to `acceptAllDevices`)
4. Trigger read **on device** (button press)—app listens for binary broadcast via `notifyCharacteristic`
5. Parsed data appears in UI; click "Save" to persist to backend

### Database Schema Evolution
When adding columns to `sfp_modules` table:
- Use `database_manager.setup_database()` migration pattern (see `sha256` column addition logic with `PRAGMA table_info` check)
- **Never** break existing column contracts—add nullable columns or provide defaults

## Project-Specific Conventions

### BLE Protocol Reverse-Engineering
- **Placeholder commands** (e.g., `[POST] /sfp/write/start` in `script.js`) are **speculative guesses**—do not rely on them
- To discover actual commands: use nRF Connect app to sniff BLE traffic during official app operations
- Document findings in code comments with firmware version tested (behavior may change across updates)
- See `artifacts/nRFscanner Output.txt` and `artifacts/support_file_*` for reference captures

### Safari Compatibility Requirements
- Always convert `DataView` to `Uint8Array` before processing (Safari quirk in `handleNotifications()`)
- Provide `acceptAllDevices` fallback when UUID filtering fails (see `connectToDevice()` try/catch)
- Feature detection via `isWebBluetoothAvailable()` and `isSafari()` helpers disables UI gracefully

### TODOs and Placeholders
- Functions suffixed with `TODO` (e.g., `loadCommunityModulesTODO()`) are scaffolds—alert user when clicked
- `COMMUNITY_INDEX_URL` constant awaits real GitHub Pages URL from separate `SFPLiberate/modules` repo
- Write logic in `writeSfp()` is intentionally incomplete—requires BLE command discovery (see inline comments)

### Community Module Submission Flow
1. User reads module → clicks "Upload to Community" → frontend calls `POST /api/submissions`
2. Backend writes to disk inbox: `/app/data/submissions/{uuid}/eeprom.bin` + `metadata.json`
3. Maintainers manually review inbox, validate, and PR to `SFPLiberate/modules` repo with CI validation
4. App fetches `index.json` from GitHub Pages to populate community list (import endpoint pending)

## Common Pitfalls

### BLE Assumptions
- **Do not assume** BLE can trigger reads/writes unless verified across firmware versions
- Current code relies on on-device button presses; BLE only captures broadcasts
- Any code sending commands must be tested with real hardware and documented with firmware version

### Base64 Encoding
- Frontend sends EEPROM as Base64 in JSON (`eeprom_data_base64` field)
- Backend decodes to bytes before parsing/storing—**always validate** with `try/except` for malformed data

### SHA-256 Deduplication
- Enforced at DB level (unique index)—backend catches `sqlite3.IntegrityError` and returns existing ID
- Frontend should eventually compute SHA-256 client-side for instant duplicate warnings (not yet implemented)

### NGINX Reverse Proxy Paths
- Backend endpoints **must** start with `/api/` to match NGINX location block
- FastAPI route definitions include `/api` prefix explicitly (e.g., `@app.get("/api/modules")`)

## External Dependencies & References

- **SFF-8472 Spec**: EEPROM layout standard (vendor @ bytes 20-36, model @ 40-56, serial @ 68-84)
- **Web Bluetooth API**: Browser support varies—Chrome/Edge preferred, Safari experimental
- **Planned GitHub Repos**: `SFPLiberate/modules` (community index + blobs), `SFPLiberate/site` (docs via MkDocs/Docusaurus)
- **Official Hardware**: Ubiquiti UACC-SFP-Wizard (ESP32-class SFP programmer, not affiliated with this project)

## Documentation Files
- `README.md`: User-facing overview, current features, roadmap
- `TODO.md`: Consolidated task list with completed/in-progress/backlog sections
- `CONTRIBUTING.md`: PR guidelines, BLE protocol reverse-engineering notes
- `docs/SIDECAR_SITE_TODO.md`: Planning doc for GitHub Pages site + community repo structure

## API at a Glance
```
GET    /api/modules              → [{id, name, vendor, model, serial, created_at}, ...]
POST   /api/modules              → {name, eeprom_data_base64} → {status, message, id}
GET    /api/modules/{id}/eeprom  → binary/octet-stream (raw BLOB)
DELETE /api/modules/{id}         → {status, message}
POST   /api/submissions          → {name, vendor, model, serial, eeprom_data_base64, notes?} → {status, inbox_id, sha256}
```

FastAPI docs: `http://localhost:8080/api/docs`
