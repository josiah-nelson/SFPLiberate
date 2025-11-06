# **SFPLiberate Home Assistant Add-On - Implementation Plan**

## **Executive Summary**

This plan outlines the implementation of SFPLiberate as a Home Assistant Add-On, providing a simplified deployment method that leverages HA's native Bluetooth infrastructure. The add-on will maintain the core functionality of the standalone Docker deployment while greatly simplifying setup, Bluetooth discovery, and ESPHome integration.

---

## **1. Project Structure & New Files**

### **1.1 New Directory Structure**

Create a new `/homeassistant` directory at the root of the repository:

```
/homeassistant/
├── config.yaml              # Add-on metadata & configuration schema
├── Dockerfile               # Multi-stage build (backend + frontend)
├── run.sh                   # Startup script
├── icon.png                 # Add-on icon (256x256)
├── logo.png                 # Repository logo (512x512)
├── README.md                # Add-on specific documentation
├── CHANGELOG.md             # Version history
├── DOCS.md                  # User-facing documentation
└── rootfs/                  # Root filesystem overlay
    └── etc/
        └── services.d/
            ├── backend/
            │   └── run         # Backend service script
            └── frontend/
                └── run         # Frontend service script
```

### **1.2 Core Add-On Files**

#### **config.yaml** (Add-on Configuration)
```yaml
name: "SFPLiberate"
version: "1.0.0"
slug: "sfpliberate"
description: "Bluetooth companion for Ubiquiti SFP Wizard - capture, clone, and manage SFP module EEPROM profiles"
url: "https://github.com/josiah-nelson/SFPLiberate"
arch:
  - aarch64
  - amd64
  - armhf
  - armv7

init: false
startup: services
boot: auto
ingress: true
ingress_port: 3000
panel_icon: mdi:ethernet
panel_title: SFPLiberate

# Bluetooth access required
host_dbus: true
hassio_role: default
hassio_api: true
homeassistant_api: true

# Persistence
map:
  - config:rw
  - share:rw

options:
  log_level: "info"
  auto_discover: true
  device_name_patterns:
    - "SFP"
    - "Wizard"
  connection_timeout: 30
  device_expiry_seconds: 300

schema:
  log_level: list(debug|info|warning|error)?
  auto_discover: bool
  device_name_patterns: [str]
  connection_timeout: int(10,120)?
  device_expiry_seconds: int(60,600)?

# Image configuration
image: "ghcr.io/josiah-nelson/sfpliberate-addon-{arch}"
```

#### **run.sh** (Startup Script)
```bash
#!/usr/bin/with-contenv bashio

# Get configuration from options.json
export LOG_LEVEL=$(bashio::config 'log_level')
export AUTO_DISCOVER=$(bashio::config 'auto_discover')
export DEVICE_NAME_PATTERNS=$(bashio::config 'device_name_patterns')
export CONNECTION_TIMEOUT=$(bashio::config 'connection_timeout')
export DEVICE_EXPIRY_SECONDS=$(bashio::config 'device_expiry_seconds')

# Home Assistant API access
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN}"
export HASSIO_TOKEN="${SUPERVISOR_TOKEN}"
export HA_API_URL="http://supervisor/core/api"
export HA_WS_URL="ws://supervisor/core/websocket"

# Add-on specific paths
export DATABASE_FILE="/config/sfpliberate/sfp_library.db"
export SUBMISSIONS_DIR="/config/sfpliberate/submissions"
export DATA_DIR="/config/sfpliberate"

# Create directories
mkdir -p /config/sfpliberate/submissions

# Set deployment mode to HA addon
export DEPLOYMENT_MODE="homeassistant"
export ESPHOME_PROXY_MODE="false"  # We use HA Bluetooth API instead
export HA_ADDON_MODE="true"

# Start services via s6-overlay
bashio::log.info "Starting SFPLiberate Home Assistant Add-On..."
```

---

## **2. Architecture Changes**

### **2.1 Bluetooth Integration Strategy**

**Current:** Standalone uses Web Bluetooth (direct) or ESPHome mDNS discovery (proxy mode)

**New HA Add-On Approach:**
1. **Backend communicates with HA's Bluetooth API** via REST/WebSocket
2. **No mDNS discovery needed** - HA manages all Bluetooth devices/proxies
3. **Backend polls HA's `/api/states` for `device_tracker.*` and `bluetooth.*` entities**
4. **Pattern matching for device names** (configurable: "SFP", "Wizard")
5. **Auto-population of discovered devices** in frontend UI
6. **Click-to-connect flow** - backend uses HA's Bluetooth service calls

### **2.2 New Backend Module: `ha_bluetooth_client.py`**

Create `/backend/app/services/ha_bluetooth/ha_bluetooth_client.py`:

```python
"""Home Assistant Bluetooth API client for SFPLiberate add-on."""

import asyncio
import logging
from typing import List, Optional, Dict, Any
import aiohttp
import json

logger = logging.getLogger(__name__)

class HomeAssistantBluetoothClient:
    """
    Client for interacting with Home Assistant's Bluetooth integration.

    Replaces mDNS-based ESPHome discovery with direct HA API access.
    """

    def __init__(self,
                 ha_api_url: str,
                 ha_ws_url: str,
                 supervisor_token: str,
                 device_patterns: List[str]):
        self.ha_api_url = ha_api_url
        self.ha_ws_url = ha_ws_url
        self.supervisor_token = supervisor_token
        self.device_patterns = [p.lower() for p in device_patterns]
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._discovered_devices: Dict[str, Dict[str, Any]] = {}

    async def start(self):
        """Initialize connection to HA API."""
        self._session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.supervisor_token}"}
        )
        await self._subscribe_to_bluetooth_events()

    async def stop(self):
        """Cleanup connections."""
        if self._ws:
            await self._ws.close()
        if self._session:
            await self._session.close()

    async def get_bluetooth_devices(self) -> List[Dict[str, Any]]:
        """
        Get all Bluetooth devices from HA that match configured patterns.

        Returns list of devices with structure:
        {
            "mac": "AA:BB:CC:DD:EE:FF",
            "name": "SFP Wizard",
            "rssi": -65,
            "source": "esphome_proxy_1" or "hass_bluetooth"
        }
        """
        # Query HA states API for bluetooth devices
        async with self._session.get(f"{self.ha_api_url}/states") as resp:
            states = await resp.json()

        devices = []
        for state in states:
            entity_id = state.get("entity_id", "")

            # Check for bluetooth device_tracker or sensor entities
            if not (entity_id.startswith("device_tracker.") or
                    entity_id.startswith("sensor.") or
                    "bluetooth" in entity_id):
                continue

            attrs = state.get("attributes", {})
            name = attrs.get("friendly_name", "")

            # Pattern matching
            if not any(pattern in name.lower() for pattern in self.device_patterns):
                continue

            # Extract MAC from attributes
            mac = attrs.get("address") or attrs.get("mac") or attrs.get("id")
            if not mac:
                continue

            devices.append({
                "mac": mac,
                "name": name,
                "rssi": attrs.get("rssi", -100),
                "source": attrs.get("source", "hass_bluetooth"),
                "last_seen": state.get("last_changed")
            })

        return devices

    async def connect_to_device(self, mac_address: str) -> Dict[str, str]:
        """
        Connect to device via HA Bluetooth and retrieve GATT UUIDs.

        Uses HA's bluetooth.connect service call.
        """
        # Call HA service: bluetooth.connect
        service_data = {
            "domain": "bluetooth",
            "service": "connect",
            "service_data": {
                "address": mac_address
            }
        }

        async with self._session.post(
            f"{self.ha_api_url}/services/bluetooth/connect",
            json=service_data
        ) as resp:
            result = await resp.json()

        # Enumerate GATT services
        return await self._enumerate_gatt_services(mac_address)

    async def _subscribe_to_bluetooth_events(self):
        """Subscribe to HA WebSocket for real-time Bluetooth updates."""
        self._ws = await self._session.ws_connect(self.ha_ws_url)

        # Auth message
        await self._ws.send_json({
            "type": "auth",
            "access_token": self.supervisor_token
        })

        # Subscribe to state changes
        await self._ws.send_json({
            "id": 1,
            "type": "subscribe_events",
            "event_type": "state_changed"
        })

        # Start listener task
        asyncio.create_task(self._ws_listener())

    async def _ws_listener(self):
        """Listen for Bluetooth device updates via WebSocket."""
        async for msg in self._ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                # Process state_changed events for bluetooth entities
                # Update self._discovered_devices cache
```

### **2.3 Backend API Changes**

#### **New Endpoint: `/api/v1/ha-bluetooth/devices`**
```python
@router.get("/ha-bluetooth/devices")
async def get_ha_bluetooth_devices():
    """
    Get auto-discovered Bluetooth devices from Home Assistant.

    Replaces ESPHome mDNS device discovery.
    Returns devices matching configured patterns ("SFP", "Wizard").
    """
    from app.services.ha_bluetooth import ha_bluetooth_client

    devices = await ha_bluetooth_client.get_bluetooth_devices()
    return {"devices": devices}
```

#### **Modified Endpoint: `/api/v1/connect`**
```python
@router.post("/connect")
async def connect_to_device(request: DeviceConnectionRequest):
    """
    Connect to device using HA Bluetooth API.

    Simplified flow:
    1. Call HA's bluetooth.connect service
    2. Enumerate GATT services via HA
    3. Return UUIDs for frontend caching
    """
    from app.services.ha_bluetooth import ha_bluetooth_client

    result = await ha_bluetooth_client.connect_to_device(request.mac_address)
    return result
```

### **2.4 Frontend Changes**

#### **New Component: `HABluetoothDiscovery.tsx`**
```typescript
/**
 * Home Assistant Bluetooth device discovery component.
 *
 * Polls /api/v1/ha-bluetooth/devices and displays auto-discovered
 * SFP Wizard devices with click-to-connect UI.
 */

export function HABluetoothDiscovery() {
  const [devices, setDevices] = useState<HABluetoothDevice[]>([]);

  useEffect(() => {
    // Poll HA Bluetooth API every 5 seconds
    const interval = setInterval(async () => {
      const response = await fetch('/api/v1/ha-bluetooth/devices');
      const data = await response.json();
      setDevices(data.devices);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (device: HABluetoothDevice) => {
    // Single-click connection - no UUID entry needed
    const response = await fetch('/api/v1/connect', {
      method: 'POST',
      body: JSON.stringify({ mac_address: device.mac })
    });

    const uuids = await response.json();
    // Cache UUIDs in localStorage
    // Proceed to device operations
  };

  return (
    <Card>
      <CardHeader>
        <h2>Discovered SFP Devices</h2>
        <p>Devices auto-discovered via Home Assistant</p>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <p>No SFP devices found. Make sure your Wizard is powered on.</p>
        ) : (
          <div className="grid gap-4">
            {devices.map(device => (
              <DeviceCard
                key={device.mac}
                device={device}
                onConnect={handleConnect}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### **Simplified Home Page** (`/frontend/src/app/page.tsx`)

Replace complex UUID entry and manual connection flow with:
- **Auto-discovery section** showing all SFP devices in range
- **Single-click connect button** per device
- **Visual indicators** for signal strength (RSSI bars)
- **Source badge** showing which proxy/adapter detected the device

---

## **3. Dockerfile Multi-Stage Build**

The add-on uses a **single container** with both backend and frontend:

```dockerfile
# Stage 1: Backend build
FROM python:3.14-slim AS backend-build
WORKDIR /backend

# Install Poetry
RUN pip install poetry==1.8.5

# Copy backend files
COPY backend/pyproject.toml backend/poetry.lock ./
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY backend/app /backend/app


# Stage 2: Frontend build
FROM node:20-alpine AS frontend-build
WORKDIR /frontend

# Copy package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build Next.js in standalone mode
ENV DEPLOYMENT_MODE=homeassistant
ENV BACKEND_URL=http://localhost:80
RUN npm run build


# Stage 3: Final runtime image
FROM ghcr.io/hassio-addons/base:15.0.0

# Install Python and Node.js runtimes
RUN apk add --no-cache \
    python3 \
    py3-pip \
    nodejs \
    npm \
    dbus \
    bluez \
    bluez-deprecated

# Copy backend from build stage
COPY --from=backend-build /backend /app/backend
COPY --from=backend-build /usr/local/lib/python3.14/site-packages /usr/local/lib/python3.14/site-packages

# Copy frontend from build stage
COPY --from=frontend-build /frontend/.next/standalone /app/frontend
COPY --from=frontend-build /frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-build /frontend/public /app/frontend/public

# Copy add-on files
COPY homeassistant/run.sh /
COPY homeassistant/rootfs /

RUN chmod +x /run.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3000/ || exit 1

# Start script
CMD ["/run.sh"]
```

---

## **4. Service Management with s6-overlay**

The Home Assistant base image uses `s6-overlay` for process supervision. Create service scripts:

### **`rootfs/etc/services.d/backend/run`**
```bash
#!/usr/bin/with-contenv bashio

bashio::log.info "Starting FastAPI backend..."

cd /app/backend
exec python3 -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 80 \
  --log-level $(bashio::config 'log_level')
```

### **`rootfs/etc/services.d/frontend/run`**
```bash
#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Next.js frontend..."

cd /app/frontend
exec node server.js
```

---

## **5. Home Assistant Ingress Integration**

### **5.1 Configuration**

The `config.yaml` already includes:
```yaml
ingress: true
ingress_port: 3000
```

This exposes the frontend at:
- **Internal:** `http://homeassistant.local:8123/api/hassio_ingress/<token>/`
- **User-facing:** Settings → Add-ons → SFPLiberate → OPEN WEB UI

### **5.2 Frontend Routing Adjustments**

Update `next.config.ts` to handle ingress path:

```typescript
const nextConfig = {
  // ... existing config

  // Add base path detection for HA ingress
  basePath: process.env.INGRESS_PATH || '',

  // Asset prefix for ingress
  asPath: process.env.INGRESS_PATH || '',

  // Rewrites for backend API
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:80/api/:path*'
      }
    ];
  }
};
```

---

## **6. "Add to Home Assistant" Button**

### **6.1 Repository Setup**

Create a **repository.json** file (for HA add-on repository):

```json
{
  "name": "SFPLiberate Add-on Repository",
  "url": "https://github.com/josiah-nelson/SFPLiberate",
  "maintainer": "Josiah Nelson <josiah@example.com>"
}
```

### **6.2 README Badge**

Add to the main `README.md`:

```markdown
## Installation

### Docker Standalone
```bash
docker-compose up --build
```

### Home Assistant Add-On
[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjosiah-nelson%2FSFPLiberate)

1. Click the button above (or add repository manually: `https://github.com/josiah-nelson/SFPLiberate`)
2. Install the "SFPLiberate" add-on
3. Start the add-on
4. Click "OPEN WEB UI"
```

### **6.3 GitHub Actions Workflow**

Create `.github/workflows/ha-addon-build.yml`:

```yaml
name: Build HA Add-On

on:
  push:
    branches: [main]
    paths:
      - 'homeassistant/**'
      - 'backend/**'
      - 'frontend/**'
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        arch: [aarch64, amd64, armhf, armv7]
    steps:
      - uses: actions/checkout@v4

      - name: Build add-on
        uses: home-assistant/builder@master
        with:
          args: |
            --${{ matrix.arch }} \
            --target homeassistant \
            --docker-hub ghcr.io/josiah-nelson
```

---

## **7. Configuration Options**

Users can configure the add-on via HA UI:

### **7.1 Available Options**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `log_level` | enum | `info` | Logging verbosity (debug, info, warning, error) |
| `auto_discover` | bool | `true` | Enable automatic BLE device discovery |
| `device_name_patterns` | list | `["SFP", "Wizard"]` | Device name patterns for auto-discovery |
| `connection_timeout` | int | `30` | Bluetooth connection timeout (seconds) |
| `device_expiry_seconds` | int | `300` | How long to keep stale devices in list |

### **7.2 UI Configuration Panel**

Users can access this via:
1. Settings → Add-ons → SFPLiberate → Configuration tab
2. Edit YAML or use the form-based UI

---

## **8. Data Persistence**

### **8.1 Storage Locations**

The add-on uses HA's standard paths:

```bash
/config/sfpliberate/               # Main data directory
├── sfp_library.db                 # SQLite database
└── submissions/                   # User-submitted modules
```

### **8.2 Backup Integration**

Home Assistant automatically includes `/config/*` in backups.

Users can:
- **Manual backup:** Settings → System → Backups → Create Backup
- **Automatic:** Configure via Settings → System → Backups → Enable auto-backup

---

## **9. Migration Path from Standalone**

For users migrating from standalone Docker:

### **9.1 Export from Standalone**

Add backend endpoint `/api/v1/export`:
```python
@router.get("/export")
async def export_database():
    """Export all modules as JSON for migration."""
    modules = await module_repo.get_all()
    return {"modules": [m.dict() for m in modules]}
```

### **9.2 Import to Add-On**

Add backend endpoint `/api/v1/import`:
```python
@router.post("/import")
async def import_database(data: Dict[str, Any]):
    """Import modules from standalone deployment."""
    for module_data in data["modules"]:
        await module_repo.create(module_data)
    return {"imported": len(data["modules"])}
```

### **9.3 Frontend Migration UI**

Add a "Migration" tab in Settings:
- **Step 1:** Export from standalone (download JSON file)
- **Step 2:** Upload JSON file to add-on
- **Step 3:** Verify imported modules

---

## **10. Testing Strategy**

### **10.1 Local Development Testing**

Create `docker-compose.ha-dev.yml`:
```yaml
version: "3"
services:
  addon:
    build:
      context: .
      dockerfile: homeassistant/Dockerfile
    environment:
      - HA_API_URL=http://host.docker.internal:8123/api
      - SUPERVISOR_TOKEN=${HA_TOKEN}
      - LOG_LEVEL=debug
    ports:
      - "3000:3000"
      - "80:80"
    volumes:
      - ./config:/config
```

Run with: `docker-compose -f docker-compose.ha-dev.yml up`

### **10.2 Integration Testing**

Create `backend/tests/test_ha_bluetooth.py`:
```python
import pytest
from app.services.ha_bluetooth import HomeAssistantBluetoothClient

@pytest.mark.asyncio
async def test_device_discovery(mock_ha_api):
    """Test auto-discovery of SFP devices via HA API."""
    client = HomeAssistantBluetoothClient(
        ha_api_url="http://mock",
        ha_ws_url="ws://mock",
        supervisor_token="test",
        device_patterns=["SFP", "Wizard"]
    )

    devices = await client.get_bluetooth_devices()
    assert len(devices) > 0
    assert "SFP" in devices[0]["name"]
```

### **10.3 End-to-End Testing**

Use a test Home Assistant instance:
1. Install HA in dev mode (devcontainer)
2. Add SFPLiberate repository
3. Install add-on
4. Test BLE device discovery with real SFP Wizard

---

## **11. Documentation Updates**

### **11.1 New Documentation Files**

Create `/docs/HOME_ASSISTANT.md`:
```markdown
# SFPLiberate Home Assistant Add-On

## Installation

1. Click the "Add to Home Assistant" button in README
2. Install the add-on
3. Configure options (optional)
4. Start the add-on
5. Click "OPEN WEB UI"

## Configuration

### Device Discovery

The add-on automatically discovers SFP Wizard devices using Home Assistant's
Bluetooth integration. Supported sources:

- **ESPHome Bluetooth Proxies** (recommended for range)
- **HA Host Bluetooth Adapter** (built-in support)
- **Shelly Bluetooth Proxies** (Shelly Plus devices)

### Pattern Matching

Configure which devices to auto-discover:

```yaml
device_name_patterns:
  - "SFP"
  - "Wizard"
  - "Custom Name"
```

## Troubleshooting

### No devices discovered

1. Verify Bluetooth integration is enabled: Settings → Devices & Services → Bluetooth
2. Check ESPHome proxies are online
3. Ensure SFP Wizard is powered and advertising
4. Increase `device_expiry_seconds` if devices disappear quickly

### Connection failures

1. Move SFP Wizard closer to Bluetooth adapter/proxy
2. Increase `connection_timeout` setting
3. Check HA logs: Settings → System → Logs
4. Restart add-on
```

### **11.2 Update Main README**

Add section after "Deployment Modes":

```markdown
### 3. Home Assistant Add-On (NEW!)

**Easiest setup for Home Assistant users!**

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjosiah-nelson%2FSFPLiberate)

**Features:**
- ✅ **One-click installation** - No Docker knowledge required
- ✅ **Automatic Bluetooth discovery** - Leverages HA's Bluetooth integration
- ✅ **ESPHome integration** - Uses your existing BLE proxies
- ✅ **Built-in backup** - Included in HA backups automatically
- ✅ **Web UI via Ingress** - No port conflicts or reverse proxy needed

**Requirements:**
- Home Assistant OS or Supervised
- Bluetooth adapter OR ESPHome Bluetooth proxy
- SFP Wizard firmware v1.0.10+
```

### **11.3 Update CLAUDE.md**

Add section under "Deployment Modes":

```markdown
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

**Development:**
```bash
# Build add-on locally
docker build -f homeassistant/Dockerfile -t sfpliberate-addon .

# Test in dev mode
docker-compose -f docker-compose.ha-dev.yml up
```

**Key Files:**
- `homeassistant/config.yaml` - Add-on metadata
- `homeassistant/Dockerfile` - Multi-stage build
- `homeassistant/run.sh` - Startup script
- `backend/app/services/ha_bluetooth/` - HA Bluetooth client
- `frontend/src/components/ha/` - HA-specific UI components
```

---

## **12. Implementation Phases**

### **Phase 1: Core Infrastructure (Week 1)**
- [ ] Create `/homeassistant` directory structure
- [ ] Write `config.yaml`, `Dockerfile`, `run.sh`
- [ ] Set up multi-stage Docker build
- [ ] Implement s6-overlay service scripts
- [ ] Test local build

### **Phase 2: Backend Integration (Week 2)**
- [ ] Create `HomeAssistantBluetoothClient` class
- [ ] Implement HA API REST client
- [ ] Implement HA WebSocket subscriber
- [ ] Add `/api/v1/ha-bluetooth/devices` endpoint
- [ ] Modify connection flow to use HA API
- [ ] Write unit tests

### **Phase 3: Frontend Updates (Week 3)**
- [ ] Create `HABluetoothDiscovery` component
- [ ] Simplify home page UI
- [ ] Add auto-refresh for device list
- [ ] Implement single-click connection
- [ ] Add signal strength indicators
- [ ] Update routing for ingress

### **Phase 4: Testing & Documentation (Week 4)**
- [ ] End-to-end testing with real HA instance
- [ ] Test with ESPHome proxies
- [ ] Test with HA host Bluetooth
- [ ] Write `/docs/HOME_ASSISTANT.md`
- [ ] Update main README
- [ ] Update CLAUDE.md
- [ ] Create CHANGELOG

### **Phase 5: CI/CD & Release (Week 5)**
- [ ] Set up GitHub Actions workflow
- [ ] Build multi-arch images (aarch64, amd64, armhf, armv7)
- [ ] Push to GHCR
- [ ] Create repository.json
- [ ] Test "Add to Home Assistant" button
- [ ] Beta release announcement

---

## **13. Key Decisions & Tradeoffs**

### **13.1 Single Container vs. Multi-Container**

**Decision:** Single container with both backend and frontend

**Rationale:**
- Simpler for users (one service to manage)
- Matches HA add-on best practices
- Reduces resource usage
- Easier ingress configuration

**Tradeoff:** Slightly larger image size (~300MB vs ~200MB + ~150MB)

### **13.2 HA Bluetooth API vs. Direct BLE**

**Decision:** Use HA's Bluetooth API exclusively (no direct BLE access)

**Rationale:**
- Avoids permission/hardware conflicts with HA
- Leverages existing ESPHome proxies
- Simplified discovery (no mDNS needed)
- Better compatibility across different HA installations

**Tradeoff:** Adds dependency on HA's Bluetooth integration being configured

### **13.3 SQLite Location**

**Decision:** Store database in `/config/sfpliberate/` (not Docker volume)

**Rationale:**
- Included in HA backups automatically
- User-accessible via File Editor add-on
- Survives add-on reinstalls
- Easier migration between systems

**Tradeoff:** Slightly slower I/O than dedicated volume (negligible for this use case)

---

## **14. Future Enhancements**

### **14.1 HA Entities (Optional)**

In a future version, expose read-only entities:

```python
# Sensor: Number of stored modules
sensor.sfpliberate_module_count

# Binary sensor: SFP Wizard connection status
binary_sensor.sfpliberate_connected

# Device tracker: Last used SFP Wizard
device_tracker.sfp_wizard_last_seen
```

**Note:** Current plan deliberately avoids this to keep scope focused.

### **14.2 HA Automation Integration**

Allow users to trigger module writes via HA automations:

```yaml
automation:
  - alias: "Write Module on Trigger"
    trigger:
      - platform: state
        entity_id: input_boolean.clone_module
        to: 'on'
    action:
      - service: sfpliberate.write_module
        data:
          module_id: 42
```

### **14.3 Bluetooth Mesh Support**

If HA adds Bluetooth Mesh support, leverage it for extended range.

---

## **15. Success Criteria**

The HA add-on will be considered successful when:

- [ ] **Installation:** One-click install via "Add to Home Assistant" button
- [ ] **Discovery:** SFP Wizard devices auto-appear within 30 seconds of power-on
- [ ] **Connection:** Single click connects and retrieves UUIDs (no manual entry)
- [ ] **Performance:** UI loads in <2 seconds, discovery poll every 5 seconds
- [ ] **Reliability:** 95%+ success rate for connections
- [ ] **Documentation:** Users can complete full workflow without external help
- [ ] **Compatibility:** Works on all HA architectures (aarch64, amd64, armhf, armv7)
- [ ] **Resource usage:** <512MB RAM, <1 CPU core under load

---

## **16. Risk Mitigation**

### **16.1 HA API Changes**

**Risk:** Home Assistant changes Bluetooth API

**Mitigation:**
- Pin to stable HA API version in docs
- Monitor HA release notes
- Maintain backward compatibility layer
- Community testing before major HA releases

### **16.2 ESPHome Proxy Discovery**

**Risk:** HA doesn't expose ESPHome proxy info via API

**Mitigation:**
- Fall back to "source" attribute in device_tracker entities
- Allow manual proxy selection in UI
- Document requirement for HA Bluetooth integration

### **16.3 Firmware Updates**

**Risk:** SFP Wizard firmware changes break BLE protocol

**Mitigation:**
- Same as standalone - version detection
- Community-driven UUID discovery
- Fallback to manual UUID entry

---

## **17. Conclusion**

This implementation plan provides a complete roadmap for porting SFPLiberate to a Home Assistant Add-On. The architecture leverages HA's native Bluetooth infrastructure to eliminate complex setup (mDNS, manual proxy configuration) while maintaining full functionality.

**Key Advantages:**
- **Simplified deployment** - One-click install for HA users
- **Better Bluetooth integration** - Leverages existing ESPHome proxies
- **Auto-discovery** - No manual device pairing needed
- **Unified management** - Backups, updates, logs all in HA UI

**Maintains Compatibility:**
- Standalone Docker deployment unchanged
- Appwrite cloud mode unchanged
- All existing features preserved

The add-on will coexist as an **additional deployment option**, not a replacement, giving users flexibility based on their infrastructure.

---

**Implementation Status:** See Phase 1-5 tasks above for progress tracking.
