SFPLiberate – Consolidated TODOs and Next Steps

Overview
- Scope: Companion app for Ubiquiti’s SFP Wizard to capture broadcasts over BLE, build a reusable module library, optionally write saved profiles (if safe/possible), add historic DDM logging, and support a community repo of module data, compatibility notes, and statistics.
- Disclaimer: Not affiliated with Ubiquiti. Firmware updates may break behavior at any time.

Completed (don’t re‑plan)
- Single‑origin app: NGINX serves frontend and proxies `/api` to backend via docker‑compose.
- Frontend uses relative API base (`/api`).
- Safari‑aware Web Bluetooth: fallback to `acceptAllDevices`, robust DataView → Uint8Array decoding.
- Dev CORS middleware enabled on backend for local iteration.
- Local DB duplicate detection: SHA‑256 checksum stored and enforced with a unique index.
- Community submissions without GitHub sign‑in: POST `/api/submissions` stores `eeprom.bin` + `metadata.json` in an inbox.
- Sidecar site planning document added: `docs/SIDECAR_SITE_TODO.md`.

In Progress / Stubs Present
- Device discovery (limited): `limitedScanTODO()` scaffold; Safari fallback to `requestDevice`.
- Community listing/import UI: placeholder section in frontend; constant `COMMUNITY_INDEX_URL` awaiting real URL.
- DDM capture: basic line capture (`ddm:` heuristic) into an in‑memory array for future CSV export.
- Write operation: explicit placeholder; current code logs that BLE write command is unknown and likely on‑device only.
 - Public site (Appwrite): plan for invite‑only access with simple per‑user passphrases; integrate submissions/import later.

Next Steps (High Value)
Frontend
- Community listing/import UI
  - Fetch `COMMUNITY_INDEX_URL` (GitHub Pages index.json), render list (name/vendor/model/size/sha256), and add Import buttons.
  - On Import, call backend `POST /api/modules/import` (see Backend), show duplicate status when applicable.
- Manual import/export
  - Implement “Import From File” for `.bin` and `.json` metadata; save via existing `/api/modules` endpoint.
  - Implement “Backup/Export All” to download CSV of metadata and a ZIP of all EEPROM blobs.
- Checksums client‑side
  - Compute SHA‑256 in browser for immediate duplicate warnings pre‑save/import.
- DDM logging (CSV)
  - Parse DDM lines into structured fields; enable CSV export of time‑series samples.
- BLE UX and accuracy
  - Keep reads/write semantics aligned with reality: instruct user to trigger reads on device; only add BLE triggers if actually discovered and verified across firmware versions.
 - iOS/Safari UX polish
  - Improve guidance banner, add links to Proxy mode instructions and Bluefy, expose minimal troubleshooting.
 - Replay from artifacts (dev)
  - Add a developer toggle to replay nRF Connect artifacts and device tar logs to simulate notifications and binary payloads without hardware.

Backend
- Community import endpoint
  - Add `POST /api/modules/import` with payload `{ name, vendor, model, serial, blob_url, expected_sha256? }`.
  - Server fetches blob_url, verifies size and optional checksum, stores via `add_module`, returns `{status, id}` with duplicate signal.
- Export endpoints
  - `GET /api/modules/export.csv` for metadata + checksums.
  - `GET /api/modules/export.zip` containing all blobs plus a manifest.json (name/vendor/model/serial/sha256/size/created_at).
- Submissions inbox tooling (optional)
  - Add minimal admin endpoints to list/review/delete submissions (for maintainers), or a CLI script.
 - Adapter enumeration (done)
  - DBus adapter listing implemented for proxy mode; consider exposing power toggle where safe.

Sidecar Site + Community Modules Repo
- Stand up public community site on Appwrite Cloud (invite‑only passphrases). Keep initial scope simple: uploads and browsing.
- Create `SFPLiberate/modules` repo or Appwrite collections with:
  - `index.json` (versioned schema), `blobs/<sha256>.bin`, CI validation for schema and blob size/hash.
  - Contribution docs describing how maintainers ingest inbox submissions from this app.
- Publish a stable `COMMUNITY_INDEX_URL` and update the frontend constant.

BLE Research (Ongoing)
- Validate whether any BLE commands reliably trigger read/write across firmware versions.
- If write is possible via BLE: define chunking, acknowledgments, error handling, and progress UI.
- If not: keep the app focused on capture, archival, and on‑device push workflows.

Security / Safety / Integrity
- Keep SHA‑256 as the canonical duplicate detector (already enforced in local DB).
- For community repo: add CI to check duplicates and basic sanity (size range, ASCII fields).
- Consider content attestation/signatures for shared modules (backlog).

Testing & Tooling
- Add backend tests for `/api/modules`, `/api/submissions`, and the future `/api/modules/import` and export endpoints.
- Add lint/type checks to CI for backend (ruff/mypy) and basic link checking for docs.
 - Add WebSocket smoke test for `/api/v1/ble/ws` (if proxy enabled) and `/api/v1/ble/adapters`.

Known Conflicts or Incorrect Assumptions (to avoid)
- Placeholder BLE write command strings (e.g., `[POST] /sfp/write/start`) are speculative. Don’t rely on them until verified.
- Reading EEPROM via BLE command is not guaranteed; current approach relies on on‑device reads with BLE broadcasts.

Backlog / Future Ideas
- Attestation of community modules (PGP or Sigstore) and trust metadata.
- Optional local tagging/notes per module and bulk edit operations.
- Simple in‑app diff/compare between two EEPROM images.
