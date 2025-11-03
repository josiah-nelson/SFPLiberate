# SFPLiberate

**A community-driven web tool to unlock the full potential of the Unifi SFP Wizard.**

`SFPLiberate` is a companion web application for the **Ubiquiti SFP Wizard (UACC‑SFP‑Wizard)**, a portable, ESP32‑class SFP/SFP+ module programmer. The SFP Wizard performs reading/writing on‑device; meanwhile it broadcasts diagnostic logs and data over BLE. This app connects over Web Bluetooth to capture those broadcasts, parse module details, and save profiles to a local library you control. It aims to enable writing saved profiles back to modules, historical DDM logging (CSV, future), and a community repository of module data, compatibility notes, and statistics.

This project is built on a modern web stack, using your browser's **Web Bluetooth API** to subscribe to the SFP Wizard’s BLE logs/data and a **Dockerized Python backend** to manage your module library. The frontend is a **Next.js 16** app (with shadcn/ui) that proxies API calls at `/api` to the backend for a single‑origin experience.

## Operating Modes

`SFPLiberate` supports two connection/hosting modes:

- **Direct (Web Bluetooth in Browser)** — Default. Your browser connects directly to the SFP Wizard via the Web Bluetooth API (Chrome/Edge/Opera, Bluefy on iOS). No special backend access to Bluetooth is required.
- **BLE Proxy (via Backend)** — Optional. For environments where Web Bluetooth is not available (e.g., Safari/iOS), the backend acts as a BLE proxy over WebSocket. The browser connects to the backend, which talks to the local Bluetooth adapter on the host. Adapter selection is supported in the UI when proxy mode is active.

## The Goal

The Ubiquiti SFP Wizard is a powerful standalone device designed to reprogram, test, and unlock compatibility for optical modules. Two practical limitations for power users today:

- It cannot store more than one module profile at a time for writing.
- There’s no way to "copy" a module unless you already have one inserted.

The goal of `SFPLiberate` is to complement the device with a "pro" workflow for network engineers and hobbyists to:

-   **Read & Archive:** Read the full EEPROM from any SFP module and save it to a persistent, searchable library.
    
-   **Document:** Store diagnostic metrics and historical data for documentation and review.
    
-   **Clone & Reprogram:** Write EEPROM data from your library (e.g., a "known-good" Cisco config) onto a new or rewritable module. If BLE write is not supported, use the device’s on‑device push while the app provides your saved profiles.
    
-   **Liberate:** Free your modules from vendor lock‑ins by creating and sharing your own library of configurations, plus compatibility notes and statistics.
    

## How It Works (The Method)

This tool is the result of reverse‑engineering the SFP Wizard's Bluetooth LE (BLE) behavior.

1.  **Discovery:** By analyzing `syslog` output and sniffing BLE with nRF Connect, we observed that the device broadcasts human‑readable logs and data frames over a BLE characteristic. Core read/write actions occur on‑device; BLE primarily mirrors state and data.
    
2.  **BLE Interface:** Status updates like `sysmon: ... sfp:[x]` indicate module presence. Some command strings may exist (e.g., text that looks like `[POST] ...`) but their availability and behavior are not guaranteed. Reading/writing is known to be performed on‑device; triggering such actions via BLE requires further discovery.
    
3.  **Architecture:** This app is split into two parts:
    
    -   **Frontend (Browser):** A Next.js 16 app (TypeScript + shadcn/ui) that uses the **Web Bluetooth API** (`navigator.bluetooth`) to connect directly to the SFP Wizard and capture logs/data (including EEPROM dumps) for parsing and saving.
        
    -   **Backend (Docker):** A lightweight **Python (FastAPI)** server that runs in a Docker container. Its only job is to provide a REST API for storing and retrieving module data from an **SQLite** database.
        

This architecture means the complex BLE communication happens securely in your browser, while your module library is safely managed and stored by a robust backend. When Proxy mode is enabled, the backend exposes a WebSocket for BLE operations on a local adapter.

### Deployment Modes

- **Public Server (no proxy):** Core functionality and public database access (read/submit) with client‑side BLE only. Expected concurrency: ~2–5 concurrent users. Deployed without Bluetooth passthrough. No proxy features are exposed.
- **Self‑Hosted (LAN, optional proxy):** Primary mode. A single Docker Compose stack that serves the UI, manages a private local database (SQLite), and optionally exposes BLE Proxy over WebSocket for Safari/iOS users on the same LAN. Designed to work fully air‑gapped (no Internet access required). No auth by default on LAN.

### Security & Privacy

- The app handles non‑sensitive, generic device data (SFP vendor/model/serial and binary EEPROM contents). Security is low‑priority by design.
- The planned public community site will be invite‑only with per‑user passphrases (hosted on Appwrite Cloud). Submissions will be moderated.
- Self‑hosted deployments are intended for trusted LANs. If you expose the stack publicly, add reverse proxy auth, rate limiting, and TLS as needed.

## Current Features & Functionality

-   **Connect to Device:** Scan for and connect to the SFP Wizard via Web Bluetooth.
    
-   **Live Status:** Real-time status detection for BLE connection and SFP module presence.
    
-   **Capture SFP EEPROM:** Capture EEPROM data (e.g., 256+ bytes) broadcast by the device when a read is performed on‑device. If a BLE trigger command exists, it will be integrated once discovered.
    
-   **Parse SFP Data:** On‑the‑fly parsing of SFP EEPROM data (based on SFF‑8472 spec) to display Vendor, Model, and Serial Number.
    
-   **Module Library (Backend):**
    
    -   `GET /api/modules`: Load all saved modules.
        
    -   `POST /api/modules`: Save a newly read module to the database.
        
    -   `DELETE /api/modules/{id}`: Delete a module from the library.
        
    -   `GET /api/modules/{id}/eeprom`: Get the raw binary EEPROM data for a specific module, ready for writing.
        
-   **Save to Library:** Save a newly captured module with a friendly name to your library. Duplicate detection by checksum is implemented.
    
-   **Load from Library:** View your entire library of saved modules in the UI.
    

### BLE Proxy (Safari/iOS Workaround)

- Optional WebSocket endpoint at `/api/v1/ble/ws` (enable with `BLE_PROXY_ENABLED=true`).
- Frontend auto‑detects when Web Bluetooth isn’t available and falls back to Proxy (or you can select "BLE Proxy").
- Adapter selection (e.g., `hci0`) supported via a dropdown; adapters are enumerated by the backend (BlueZ/DBus).
- Environment keys: `BLE_PROXY_ENABLED`, `BLE_PROXY_DEFAULT_TIMEOUT`, `BLE_PROXY_ADAPTER`. See `docs/DOCKER_DEPLOYMENT.md`.

## Project Roadmap & TODO

This project is fully functional for capturing and archiving profiles. Writing saved profiles back to modules will depend on discovering a safe, compatible workflow (on‑device only, or BLE‑assisted if available).

-   [x] **UI:** Create the HTML/CSS/JS frontend.
    
-   [x] **Backend:** Create the Dockerized FastAPI/SQLite backend.
    
-   [x] **Documentation Site (GitHub Pages) + Community Modules Repository:**

    -   **Task:** Create a companion GitHub Pages site with docs and a public, curated repository of community‑shared SFP modules.
    
    -   **Plan:** See `docs/SIDECAR_SITE_TODO.md` for structure, `index.json` schema, and CI validation ideas.
    
    -   **Implement:** Bootstrap site (MkDocs/Docusaurus), create `SFPLiberate/modules` repo with `index.json`, CI validation, and contribution docs.

-   [ ] **Upload to Community (from Web UI):**

    -   **Task:** After reading an SFP, allow users to opt‑in to share their module to the community repository.
    
    -   **Plan:** Add an “Upload to Community (TODO)” button in the UI. No GitHub sign‑in required: submissions are posted to a backend inbox (`POST /api/submissions`) for maintainers to triage and publish to the modules repo. Also support a downloadable ZIP for manual PRs.
    
    -   **Implement:** Add an `uploadToCommunity()` stub that prepares `metadata.json` and raw `.bin` data, then either initiates OAuth flow or downloads an archive for manual PR.

-   [ ] **Import Community Modules (to Local DB):**

    -   **Task:** Let users browse and import community modules from the GitHub Pages index into their local database.
    
    -   **Plan:** Add a “Load Community Modules (TODO)” UI, fetch the public `index.json`, render a list, and allow import of selected items via a new backend endpoint (or direct binary fetch + existing save flow).
    
    -   **Implement:** Frontend `loadCommunityModulesTODO()` to fetch the index and display; backend `POST /api/modules/import` (TODO) to accept metadata + binary URL and persist. Use checksum to dedupe.

-   [x] **BLE Proxy Mode:** Backend WS + adapter selection; UI auto‑detect and fallback for Safari/iOS
    -   **Env‑driven:** `BLE_PROXY_ENABLED=true` enables WS proxy; default is disabled for public mode.
    -   **Adapters:** Auto‑enumerate via DBus; allow selecting `hci0` etc. Optional default via env.

-   [ ] **Air‑Gapped Mode Docs:** Document air‑gapped deployment (offline Docker images, no external calls), and validate no external network requests in default configuration.

-   [ ] **iOS/Safari UX Polishing:** Clearer guidance, help links, and proxy hints when Web Bluetooth isn’t available.

-   [ ] **Checksums & Backups:**
    -   **Duplicate detection:** Use SHA‑256 during import/export; dedupe on save/import.
    -   **Backups:** Export all modules (and future DDM logs) to CSV/ZIP; support manual import of those files.

## Browser Compatibility

### ✅ Supported
- **Chrome** (Desktop, Android, ChromeOS) - Full Web Bluetooth support
- **Edge** (Desktop, Android) - Full Web Bluetooth support
- **Opera** (Desktop, Android) - Full Web Bluetooth support
- **Bluefy Browser** (iOS App Store) - Third-party iOS browser with full Web Bluetooth support

### ❌ NOT Supported
- **Safari** (macOS, iOS, iPadOS) - **NO Web Bluetooth support** as of Safari 18 / iOS 18
  - Apple's position: "Not Considering" this feature (privacy/fingerprinting concerns)
  - **No experimental flags available** - previous documentation suggesting this was incorrect
- **Firefox** - No Web Bluetooth support

### iOS Users
Safari does not support Web Bluetooth. You can:
1. Use the **BLE Proxy** mode (if your self‑hosted server has Bluetooth and Proxy is enabled).
2. Or download **Bluefy – Web BLE Browser** from the App Store for direct BLE.
3. Alternatively, use a desktop computer with Chrome/Edge/Opera.

## Build & Run Instructions

### Prerequisites

1.  **Docker & Docker Compose:** You must have Docker installed to run the backend.
    
2.  **A Compatible Browser:** Web Bluetooth API is required. Supported browsers:
    - **Chrome** (Desktop, Android, ChromeOS) ✅
    - **Edge** (Desktop, Android) ✅
    - **Opera** (Desktop, Android) ✅
    - **Bluefy Browser** (iOS) ✅ - Download from App Store for iOS devices
    - **Safari** (all platforms) ❌ - NOT supported (see Browser Compatibility section above)
    - **Firefox** ❌ - NOT supported
    
3.  **Hardware:** A Unifi SFP Wizard device.
    

### Running the Application

This project is built to run with a single command:

1.  **Clone the Repository:**
    
    ```
    git clone [https://github.com/your-username/SFPLiberate.git](https://github.com/your-username/SFPLiberate.git)
    cd SFPLiberate
    
    ```
    
2.  Build and Run with Docker Compose:
    
    This command will:
    
    -   Build the backend (FastAPI) and frontend (Next.js) containers.
    -   Serve the frontend on `http://localhost:8080` (Next.js on port 3000 inside the container).
    -   Reverse proxy/API rewrites: the frontend proxies `/api/*` to the backend in standalone mode.
        
    
    ```
    docker-compose up --build
    
    ```
    
3.  Access the App:
    
    Once the containers are running, open your Web Bluetooth-compatible browser (e.g., Chrome) and go to:
    
    http://localhost:8080
    
    _(Note: We use port `8080` mapped to Next.js port `3000` inside the container to avoid conflicts with local servers)._ 
    
4.  **Connect and Go!**

- Click “Discover SFP and Connect”. The app will:
  1) Try Web Bluetooth Scanning to find devices named like “sfp”, harvest service UUIDs, reopen the chooser with the right permissions, infer notify/write, save the profile, and connect directly.
  2) If scanning isn’t supported (or UUIDs aren’t advertised), fall back to proxy discovery and connect via backend.

- You can also use “Scan (Open Chooser)” (unfiltered chooser) and “Proxy Discovery” manually.
        

### Development

-   To stop the application: `docker-compose down`
    
-   To view logs: `docker-compose logs -f backend` or `docker-compose logs -f frontend`
    
-   The backend API docs are available at `http://localhost:8080/api/docs` when running.

## Configuration

### Device Profile (Service/Characteristic UUIDs)

- UUIDs are device-specific and are now discovered automatically via the BLE Proxy inspect flow. The profile (service UUID, write characteristic UUID, notify characteristic UUID) is saved to LocalStorage and used for subsequent connections.
- Self-hosted deployments can persist a discovered profile into `.env` using the “Save as Deployment Defaults (requires docker restart)” action. This pre-seeds the profile on startup. Env keys: `SFP_SERVICE_UUID`, `SFP_WRITE_CHAR_UUID`, `SFP_NOTIFY_CHAR_UUID`.
- Public deployments disable Proxy; iOS/Safari users should use a desktop browser or Bluefy (iOS) for direct Web Bluetooth. Manual UUID entry is intentionally not supported.

For full API documentation, see `docs/BLE_API_SPECIFICATION.md`.

### Deployment (Docker)

For self‑hosted with BLE Proxy, see `docs/DOCKER_DEPLOYMENT.md` for DBus mounts, USB passthrough, and env keys. For public hosting, leave `BLE_PROXY_ENABLED=false` and deploy without Bluetooth permissions; expect ~2–5 concurrent users.

### Artifacts & Debugging

The `artifacts/` folder includes nRF Connect captures (txt/csv) and device debug tarballs with logs and example EEPROM data. These are useful for reverse‑engineering and test verification. A future "Replay from Artifacts" debug mode will allow simulating device responses without hardware.

## Disclaimer

This project is an independent, community‑driven effort and is not affiliated with, endorsed by, or supported by Ubiquiti. The SFP Wizard’s firmware and BLE behavior may change at any time; this tool may stop working without notice if a firmware update alters the observed interfaces. Use at your own risk.
    

## Contributing

Contributions are highly encouraged! The most critical need is to reverse-engineer the SFP Write protocol. If you have any insights, please open an Issue or a Pull Request.
