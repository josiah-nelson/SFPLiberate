# SFPLiberate BLE Proxy Service

Standalone Bluetooth Low Energy proxy service for SFPLiberate. Enables iOS/Safari users to access SFP Wizard devices without Web Bluetooth API support.

## Quick Start

### Prerequisites

- Docker installed on your system
- Bluetooth adapter (built-in or USB)
- SFP Wizard device powered on

### Run the Proxy

**One-line Docker command:**

```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Alternative with port mapping (Windows/older Docker):**

```bash
docker run -d \
  --name sfp-ble-proxy \
  -p 8081:8081 \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Verify it's running:**

```bash
# Check container status
docker ps | grep sfp-ble-proxy

# Health check
curl http://localhost:8081/health

# View logs
docker logs -f sfp-ble-proxy
```

## Finding Your Local IP Address

To connect from your phone/tablet or another device on your network, you need your computer's local IP address.

### macOS

```bash
ipconfig getifaddr en0  # Wi-Fi
# or
ipconfig getifaddr en1  # Ethernet
```

Or open System Settings → Network → Your Connection → Details → IP Address

### Linux

```bash
ip addr show | grep 'inet ' | grep -v '127.0.0.1'
```

Or:

```bash
hostname -I | awk '{print $1}'
```

### Windows

```powershell
ipconfig | findstr IPv4
```

Or open Settings → Network & Internet → Properties → IPv4 Address

**Example IP addresses:**
- `192.168.1.100` (typical home network)
- `10.0.0.50` (some routers)
- `172.16.0.10` (corporate networks)

## Configure SFPLiberate UI

1. Open SFPLiberate in your browser (iOS Safari, desktop Chrome, etc.)
2. Navigate to **Settings** → **BLE Proxy**
3. Enter your WebSocket URL:
   - **Same device**: `ws://localhost:8081/ble/ws`
   - **Other device on network**: `ws://192.168.1.100:8081/ble/ws` (replace with your IP)
4. Click **Test Connection**
   - ✅ "Connected" = Ready to use
   - ❌ "Failed" = Check troubleshooting section
5. Save settings

## Platform-Specific Setup

### macOS

**Standard setup** (recommended):

```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Notes:**
- Built-in Bluetooth works out of the box
- USB Bluetooth adapters also supported
- Docker Desktop required (macOS 11+)

### Linux

**Standard setup** (with USB access):

```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --device=/dev/bus/usb \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**BlueZ requirements:**
- BlueZ installed on host: `sudo apt-get install bluez`
- Bluetooth service running: `sudo systemctl start bluetooth`
- User in `bluetooth` group: `sudo usermod -aG bluetooth $USER`

**Check Bluetooth:**

```bash
hciconfig  # Should show hci0 or similar
bluetoothctl show  # Should show adapter info
```

### Windows (WSL2)

**Standard setup:**

```bash
docker run -d \
  --name sfp-ble-proxy \
  -p 8081:8081 \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Notes:**
- Requires WSL2 with Docker Desktop
- Bluetooth passthrough has limitations (use Linux/macOS if possible)
- USB Bluetooth adapters recommended over built-in

**WSL2 Bluetooth setup** (if needed):

1. Install USBIPD-WIN on Windows
2. Attach Bluetooth adapter to WSL:
   ```powershell
   usbipd wsl attach --busid <your-bluetooth-busid>
   ```
3. Verify in WSL: `lsusb`

### Raspberry Pi / ARM64

**Same commands work** - image supports multi-arch:

```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --device=/dev/bus/usb \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

Tested on:
- Raspberry Pi 4 (ARM64)
- Raspberry Pi Zero 2 W (ARM64)
- ARM-based Linux servers

## Troubleshooting

### Connection Issues

**Problem: "Failed to connect to BLE proxy"**

1. **Check container is running:**
   ```bash
   docker ps | grep sfp-ble-proxy
   ```
   If not running: `docker start sfp-ble-proxy`

2. **Check health endpoint:**
   ```bash
   curl http://localhost:8081/health
   ```
   Expected: `{"status": "healthy", "ble_available": true}`

3. **Check WebSocket accessibility:**
   ```bash
   # Install websocat (or use browser DevTools)
   websocat ws://localhost:8081/ble/ws
   ```
   Should connect without errors

4. **Check firewall:**
   ```bash
   # macOS
   sudo lsof -i :8081
   
   # Linux
   sudo netstat -tulpn | grep 8081
   ```

**Problem: "Connection refused" from mobile device**

1. Verify local IP is correct (see "Finding Your Local IP" section)
2. Ensure devices on same Wi-Fi network
3. Check router firewall settings (some routers block inter-device communication)
4. Try binding to specific IP:
   ```bash
   docker run -p 192.168.1.100:8081:8081 ...
   ```

### Bluetooth Issues

**Problem: "BLE not available" or "No adapter found"**

**macOS:**
- Check System Settings → Bluetooth is enabled
- Verify: `system_profiler SPBluetoothDataType`
- Restart Bluetooth: Turn off/on in System Settings

**Linux:**
- Check BlueZ installed: `dpkg -l | grep bluez`
- Check service running: `sudo systemctl status bluetooth`
- Check adapter: `hciconfig` or `bluetoothctl show`
- Enable adapter: `sudo hciconfig hci0 up`

**Windows:**
- Ensure Bluetooth adapter visible in WSL: `lsusb`
- May need to pass through with USBIPD

**Problem: "Device not found" during discovery**

1. **Verify SFP Wizard is powered on:**
   - LED should be lit
   - Module inserted

2. **Increase discovery timeout:**
   - In UI settings: change from 5s to 10s or 15s

3. **Check Bluetooth range:**
   - Move closer to SFP Wizard (within 10 meters)
   - Remove obstacles (walls, metal objects)

4. **Check for interference:**
   - Move away from Wi-Fi routers
   - Turn off other Bluetooth devices

5. **Restart both devices:**
   ```bash
   docker restart sfp-ble-proxy
   ```
   Power cycle SFP Wizard

### Permission Issues

**Problem: "Permission denied" accessing Bluetooth**

**Linux:**
```bash
# Add user to bluetooth group
sudo usermod -aG bluetooth $USER

# Reboot or log out/in
sudo reboot

# Check permissions
ls -la /var/run/dbus/system_bus_socket
```

**Problem: Container won't start on Linux**

Try with elevated permissions (use sparingly):

```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --privileged \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

### Port Conflicts

**Problem: "Port 8081 already in use"**

**Find what's using the port:**
```bash
# macOS/Linux
sudo lsof -i :8081

# Windows
netstat -ano | findstr :8081
```

**Solutions:**
1. Stop the conflicting service
2. Use a different port:
   ```bash
   docker run -p 8082:8081 ...
   ```
   Update UI settings to: `ws://localhost:8082/ble/ws`

## Advanced Configuration

### Environment Variables

```bash
docker run -d \
  --name sfp-ble-proxy \
  -e LOG_LEVEL=DEBUG \
  -e PORT=8081 \
  -e HOST=0.0.0.0 \
  --network host \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Available variables:**
- `LOG_LEVEL`: `DEBUG`, `INFO`, `WARNING`, `ERROR` (default: `INFO`)
- `PORT`: WebSocket port (default: `8081`)
- `HOST`: Bind address (default: `0.0.0.0`)

### Custom Adapter (Linux)

If you have multiple Bluetooth adapters:

```bash
# List adapters
hciconfig

# Run with specific adapter
docker run -d \
  --name sfp-ble-proxy \
  -e BLE_ADAPTER=hci1 \
  --network host \
  ghcr.io/sfpliberate/ble-proxy:latest
```

### Security: Localhost-Only Binding

For maximum security, bind only to localhost:

```bash
docker run -d \
  --name sfp-ble-proxy \
  -p 127.0.0.1:8081:8081 \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Pros:**
- Not accessible from network
- No firewall configuration needed

**Cons:**
- Can't connect from mobile devices
- Must use on same computer as proxy

## Updating

### Update to Latest Version

```bash
# Stop and remove old container
docker stop sfp-ble-proxy
docker rm sfp-ble-proxy

# Pull latest image
docker pull ghcr.io/sfpliberate/ble-proxy:latest

# Start new container (use your original run command)
docker run -d --name sfp-ble-proxy ...
```

### Automatic Updates (Optional)

Use Watchtower to auto-update:

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  sfp-ble-proxy
```

**Warning:** Auto-updates may cause brief downtime

## Uninstalling

```bash
# Stop and remove container
docker stop sfp-ble-proxy
docker rm sfp-ble-proxy

# Remove image (optional)
docker rmi ghcr.io/sfpliberate/ble-proxy:latest
```

## Architecture

```
┌────────────────┐
│ SFPLiberate UI │  (Browser: Safari, Chrome, etc.)
│   (Frontend)   │
└───────┬────────┘
        │ WebSocket: ws://localhost:8081/ble/ws
        │
┌───────▼────────┐
│  BLE Proxy     │  (This container)
│   Service      │  - FastAPI + WebSocket
│                │  - Bleak (Python BLE library)
└───────┬────────┘
        │ Bluetooth Low Energy (BLE)
        │
┌───────▼────────┐
│  SFP Wizard    │  (UACC-SFP-Wizard hardware)
│    Device      │
└────────────────┘
```

**Message Flow:**
1. UI sends WebSocket message: `{"type": "connect", "service_uuid": "..."}`
2. Proxy uses Bleak to connect to SFP Wizard
3. Proxy sends response: `{"type": "connected", "device_name": "..."}`
4. UI subscribes to notifications: `{"type": "subscribe", "characteristic_uuid": "..."}`
5. Proxy forwards BLE notifications to UI: `{"type": "notification", "data": "..."}`

## Technical Details

**Image Size:** ~345MB

**Base Image:** `python:3.11-slim`

**Dependencies:**
- FastAPI 0.115.0
- Uvicorn 0.32.0
- Bleak 0.22.3
- Pydantic 2.9.2
- WebSockets 13.1

**Supported Architectures:**
- linux/amd64 (x86_64)
- linux/arm64 (ARM64v8, Raspberry Pi 4+)

**Security:**
- Runs as non-root user (`bleproxy`, UID 1000)
- No privileged mode required (except some Linux setups)
- Minimal attack surface (no database, no auth)
- Local network only (no internet exposure)

## Getting Help

**Community:**
- GitHub Issues: [https://github.com/YourOrg/SFPLiberate/issues](https://github.com/YourOrg/SFPLiberate/issues)
- Discord: [https://discord.gg/sfpliberate](https://discord.gg/sfpliberate)

**Documentation:**
- Main README: [../README.md](../README.md)
- Public Deployment Guide: [../docs/PUBLIC_DEPLOYMENT.md](../docs/PUBLIC_DEPLOYMENT.md)
- Contributing: [../CONTRIBUTING.md](../CONTRIBUTING.md)

**Logs for Bug Reports:**

```bash
# Get logs
docker logs sfp-ble-proxy > ble-proxy-logs.txt

# Get container info
docker inspect sfp-ble-proxy > ble-proxy-info.txt
```

Include these files when reporting issues.

## License

MIT License - See [../LICENSE](../LICENSE) for details

---

**Note:** This is a standalone service that complements the main SFPLiberate application. For full self-hosting (including backend), see [../README.md](../README.md).
