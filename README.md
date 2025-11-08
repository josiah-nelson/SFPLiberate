# SFPLiberate

**A community-driven web tool to unlock the full potential of the Ubiquiti SFP Wizard.**

SFPLiberate is a companion web application for the **Ubiquiti SFP Wizard (UACC-SFP-Wizard)**, enabling you to capture, store, and manage unlimited SFP/SFP+ module EEPROM profiles on your local machine or in the cloud.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](docker-compose.yml)

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/josiah-nelson/SFPLiberate.git
cd SFPLiberate

# Start the application
docker-compose up --build

# Access at http://localhost:8080
```

That's it! The app runs entirely on your machine with a local SQLite database. No cloud services or authentication required.

---

## What Problem Does This Solve?

The Ubiquiti SFP Wizard is a powerful standalone device, but has limitations:

- **Can only store ONE module profile at a time** for writing
- **No way to "copy" a module** unless you physically have one to read
- **No persistent library** of your SFP configurations

**SFPLiberate solves this** by providing:

✅ **Unlimited Storage** - Save as many module profiles as you want
✅ **Clone Without Originals** - Write profiles you've saved previously
✅ **Community Sharing** - Access shared profiles from other users (coming soon)
✅ **Full Control** - Self-hosted with SQLite, or cloud-hosted with Appwrite

---

## Architecture

### Frontend
- **Next.js 16** with App Router
- **TypeScript** + **React 19**
- **shadcn/ui** components with Tailwind CSS
- **Web Bluetooth API** for direct device communication
- **ESPHome WebSocket Client** for iOS/Safari support

### Backend
- **FastAPI** with Python 3.14
- **SQLAlchemy 2.0** for database (SQLite or Appwrite)
- **Poetry** for dependency management
- **structlog** for structured logging
- **ESPHome Native API** integration for BLE proxy

### Deployment Modes

**1. Home Assistant Add-On (NEW!) 🏠**

**Easiest setup for Home Assistant users!**

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjosiah-nelson%2FSFPLiberate)

- ✅ **One-click installation** - No Docker knowledge required
- ✅ **Automatic Bluetooth discovery** - Leverages HA's Bluetooth integration
- ✅ **ESPHome integration** - Uses your existing BLE proxies
- ✅ **Built-in backup** - Included in HA backups automatically
- ✅ **Web UI via Ingress** - No port conflicts or reverse proxy needed

**Installation:**
1. Click the "Add to Home Assistant" button above
2. Install the "SFPLiberate" add-on
3. Start the add-on
4. Click "OPEN WEB UI"

**Requirements:**
- Home Assistant OS or Supervised
- Bluetooth adapter OR ESPHome Bluetooth proxy
- SFP Wizard firmware v1.0.10+

See [homeassistant/README.md](homeassistant/README.md) for complete add-on documentation.

---

**2. Standalone (Docker)**
- Full stack runs locally
- SQLite database
- Web Bluetooth in browser (Chrome/Edge/Opera)
- Optional ESPHome proxy for iOS/Safari

**3. Appwrite Cloud**
- Frontend hosted on Appwrite Sites (static export)
- Backend as Appwrite Functions
- Appwrite Database for storage
- Authentication with Appwrite Auth
- Community module repository

---

## Browser Compatibility

### ✅ Supported (Web Bluetooth)
- **Chrome** (Desktop, Android, ChromeOS)
- **Edge** (Desktop, Android)
- **Opera** (Desktop, Android)
- **Bluefy Browser** (iOS App Store) - Third-party with Web Bluetooth

### ❌ Not Supported
- **Safari** (macOS, iOS, iPadOS) - NO Web Bluetooth support
  - Apple's position: "Not Considering" (privacy concerns)
  - No experimental flags available
- **Firefox** - No Web Bluetooth support

### iOS/Safari Users - ESPHome Proxy

For users without Web Bluetooth, enable ESPHome proxy mode:

```bash
# 1. Set environment variable
echo "ESPHOME_PROXY_MODE=true" >> .env

# 2. Start with host networking
docker-compose -f docker-compose.yml -f docker-compose.esphome.yml up --build

# 3. Access at http://localhost:8080
```

**Requirements:**
- ESPHome Bluetooth proxy on your network (common in Home Assistant setups)
- mDNS enabled (for auto-discovery) or manual proxy configuration

See [docs/ESPHOME.md](docs/ESPHOME.md) for complete setup guide.

---

## Features

### Current Features ✅

- **Device Connection** - Connect to SFP Wizard via Web Bluetooth or ESPHome proxy
- **Live Status** - Real-time BLE connection and module presence detection
- **EEPROM Capture** - Read full module EEPROM (256+ bytes)
- **SFP Parsing** - Extract vendor, model, serial from SFF-8472 spec
- **Module Library** - Save, view, delete modules in local database
- **Duplicate Detection** - SHA-256 checksum prevents duplicate saves
- **Write Support** - Write saved profiles back to blank modules
- **ESPHome Integration** - iOS/Safari support via ESPHome Bluetooth proxies

### Coming Soon 🚧

- **Community Module Repository** - Share and download profiles
- **Bulk Import/Export** - CSV/ZIP backup and restore
- **Advanced Search** - Filter by vendor, model, wavelength
- **DDM Logging** - Capture diagnostic monitoring data
- **Air-Gapped Mode** - Complete offline operation

---

## API Endpoints

### Module Management

```
GET    /api/v1/modules              List all modules
POST   /api/v1/modules              Save new module
GET    /api/v1/modules/{id}         Get module details
GET    /api/v1/modules/{id}/eeprom  Get raw EEPROM binary
DELETE /api/v1/modules/{id}         Delete module
```

### ESPHome Proxy (when enabled)

```
GET    /api/v1/esphome/status       Service status
GET    /api/v1/esphome/devices      SSE stream of discovered devices
POST   /api/v1/esphome/connect      Connect and discover UUIDs
WS     /api/v1/esphome/ws           WebSocket for full BLE communication
```

API documentation available at `/api/docs` when running.

---

## Configuration

### Environment Variables

Key variables in `.env`:

```bash
# Deployment Mode
DEPLOYMENT_MODE=standalone          # or "appwrite"

# ESPHome Proxy (optional)
ESPHOME_PROXY_MODE=false            # set to true for iOS/Safari support

# SFP Wizard UUIDs (firmware v1.0.10)
SFP_SERVICE_UUID=8E60F02E-F699-4865-B83F-F40501752184
SFP_WRITE_CHAR_UUID=9280F26C-A56F-43EA-B769-D5D732E1AC67
SFP_NOTIFY_CHAR_UUID=DC272A22-43F2-416B-8FA5-63A071542FAC

# Docker Ports
BACKEND_HOST_PORT=8081
FRONTEND_HOST_PORT=8080

# Logging
LOG_LEVEL=info
```

See [.env.example](.env.example) for full configuration reference.

---

## Development

### Prerequisites

- **Docker** and **Docker Compose** (v2.0+)
- **Node.js** 24.11+ and **npm** 11.6+ (for frontend development)
- **Python** 3.11+ and **Poetry** 1.8+ (for backend development)

### Backend Development

```bash
cd backend
poetry install
poetry run pytest                    # Run tests
poetry run uvicorn app.main:app --reload
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev                          # Start dev server
npm run build                        # Build for production
npm run test                         # Run tests
```

### Docker Development Mode

```bash
# Start with hot-reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Backend: Mounts source + poetry for hot-reload
# Frontend: Mounts source + runs dev server
```

### Viewing Logs

```bash
docker-compose logs -f               # All services
docker-compose logs -f backend       # Backend only
docker-compose logs -f frontend      # Frontend only
```

---

## Documentation

Comprehensive documentation is available in `/docs`:

**Core Documentation:**
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide for all modes
- [ESPHOME.md](docs/ESPHOME.md) - ESPHome proxy setup and usage
- [BLUETOOTH.md](docs/BLUETOOTH.md) - BLE connection guide
- [BLE_API_SPECIFICATION.md](docs/BLE_API_SPECIFICATION.md) - Device protocol reference
- [ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) - Configuration reference
- [APPWRITE.md](docs/APPWRITE.md) - Cloud deployment guide

**Technical Documentation:**
- [NEXTJS_FILE_STRUCTURE.md](docs/NEXTJS_FILE_STRUCTURE.md) - Code organization
- [AUTH_SYSTEM.md](docs/AUTH_SYSTEM.md) - Authentication (Appwrite mode)
- [ISSUE_4_IMPLEMENTATION.md](docs/ISSUE_4_IMPLEMENTATION.md) - BLE write protocol discovery

---

## How It Works

### BLE Protocol

SFPLiberate uses the **Web Bluetooth API** to communicate with the SFP Wizard over BLE.

**Discovered Protocol (firmware v1.0.10):**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/1.0/version` | Get firmware version |
| `GET /stats` | Get device status (battery, SFP presence) |
| `POST /sif/start` | Read SFP EEPROM |
| `POST /sif/write` | Write SFP EEPROM (binary data in chunks) |
| `POST /sif/erase` | Erase SFP EEPROM |
| `POST /sif/stop` | Stop current operation |

**BLE Characteristics:**

- **Service:** `8E60F02E-F699-4865-B83F-F40501752184`
- **Write:** `9280F26C-A56F-43EA-B769-D5D732E1AC67`
- **Notify:** `DC272A22-43F2-416B-8FA5-63A071542FAC`

See [docs/BLE_API_SPECIFICATION.md](docs/BLE_API_SPECIFICATION.md) for complete protocol documentation.

### Data Flow

**Standalone Mode (Web Bluetooth):**
```
Browser ←--BLE--→ SFP Wizard
   ↕ HTTP
Next.js Server
   ↕ Proxy
FastAPI Backend
   ↕
SQLite Database
```

**ESPHome Proxy Mode:**
```
Browser ←--WebSocket--→ FastAPI Backend ←--ESPHome API--→ ESPHome Proxy ←--BLE--→ SFP Wizard
```

---

## Security & Privacy

- **Self-hosted by default** - All data stays on your machine
- **No authentication required** for standalone mode
- **ESPHome trusted network** - No authentication (assumes local LAN)
- **Non-sensitive data** - Generic SFP module information only
- **Optional cloud mode** with Appwrite authentication

For production deployments exposed to the internet:
- Use reverse proxy with TLS (nginx, Caddy, Traefik)
- Add authentication layer
- Enable rate limiting
- Review ENVIRONMENT_VARIABLES.md for security options

---

## Testing

### Backend Tests

```bash
cd backend
poetry run pytest                     # Run all tests
poetry run pytest --cov=app           # With coverage
poetry run pytest -v                  # Verbose output
```

### Frontend Tests

```bash
cd frontend
npm run test                          # Run all tests
npm run test:watch                    # Watch mode
```

---

## Troubleshooting

### "No device found"
- Ensure SFP Wizard is powered on and in range
- Check that Bluetooth is enabled on your device
- Try the "Scan (Open Chooser)" button for manual selection
- For iOS/Safari: Enable ESPHome proxy mode

### "Connection failed"
- Reset the SFP Wizard by power cycling
- Clear browser cache and reload
- Check browser console for error messages
- Verify UUIDs match your firmware version

### "ESPHome proxy not found"
- Check that ESPHome device is on same network
- Verify mDNS is enabled on your network
- Try manual configuration in .env (ESPHOME_PROXY_HOST)
- Check ESPHome logs: `docker-compose logs -f backend | grep esphome`

### Docker build fails
- Ensure Docker has enough resources (4GB+ RAM recommended)
- Clear Docker cache: `docker system prune -a`
- Check Docker logs: `docker-compose logs`

---

## Contributing

Contributions are highly encouraged!

**Priority areas:**
- Testing on different SFP modules
- Additional firmware version support
- UI/UX improvements
- Documentation improvements
- Bug reports and fixes

Please open an issue before submitting large PRs to discuss the approach.

---

## License

This project is licensed under the MIT License - see LICENSE file for details.

---

## Disclaimer

This project is an independent, community-driven effort and is **not affiliated with, endorsed by, or supported by Ubiquiti**. The SFP Wizard's firmware and BLE behavior may change at any time; this tool may stop working without notice if a firmware update alters the observed interfaces. Use at your own risk.

---

## Acknowledgments

- **Ubiquiti** for creating the SFP Wizard hardware
- **ESPHome** team for the excellent Bluetooth proxy implementation
- **shadcn/ui** for the beautiful component library
- **Contributors** who helped reverse-engineer the BLE protocol

---

**Built with ❤️ by the SFPLiberate community**
