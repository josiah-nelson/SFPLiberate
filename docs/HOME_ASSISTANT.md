# SFPLiberate Home Assistant Add-On

Complete guide to installing, configuring, and using the SFPLiberate Home Assistant Add-On.

## Overview

The SFPLiberate Home Assistant Add-On provides the easiest way to use SFPLiberate with your Ubiquiti SFP Wizard. It integrates directly with Home Assistant's Bluetooth infrastructure, automatically discovers devices, and requires zero Docker knowledge.

## Installation

### Prerequisites

- **Home Assistant OS** or **Supervised** (not Container/Core)
- **Bluetooth adapter** OR **ESPHome Bluetooth proxy**
- **SFP Wizard** with firmware v1.0.10+

### Quick Install

1. Click the button below:

   [![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjosiah-nelson%2FSFPLiberate)

2. Install the "SFPLiberate" add-on
3. (Optional) Configure settings in the Configuration tab
4. Click **START**
5. Wait for startup to complete (check logs if needed)
6. Click **OPEN WEB UI**

### Manual Installation

If the button doesn't work:

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu → **Repositories**
3. Add: `https://github.com/josiah-nelson/SFPLiberate`
4. Refresh the add-on store
5. Find "SFPLiberate" and click **INSTALL**

## Configuration

The add-on works out of the box with sensible defaults. All options are configurable via the Configuration tab.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `log_level` | enum | `info` | Logging verbosity: debug, info, warning, error |
| `auto_discover` | bool | `true` | Enable automatic BLE device discovery |
| `device_name_patterns` | list | `["SFP", "Wizard"]` | Device name patterns for filtering |
| `connection_timeout` | int | `30` | Bluetooth connection timeout (seconds) |
| `device_expiry_seconds` | int | `300` | How long to keep stale devices in list |

### Example Configuration

```yaml
log_level: info
auto_discover: true
device_name_patterns:
  - "SFP"
  - "Wizard"
  - "My Custom Name"
connection_timeout: 30
device_expiry_seconds: 300
```

### Custom Device Names

If you've renamed your SFP Wizard in Bluetooth settings:

```yaml
device_name_patterns:
  - "My Workshop Wizard"
  - "Office SFP Tool"
  - "SFP"  # Keep default for others
```

## Bluetooth Setup

### Using ESPHome Bluetooth Proxies (Recommended)

If you already have ESPHome devices with Bluetooth proxy enabled, **no configuration needed!** The add-on automatically discovers and uses them.

**Verify your proxies:**
1. Go to **Settings** → **Devices & Services**
2. Find your ESPHome devices
3. Check they have "Bluetooth Proxy" integration active

**ESPHome YAML reference:**
```yaml
esp32_ble_tracker:
  scan_parameters:
    active: true

bluetooth_proxy:
  active: true
```

### Using HA Host Bluetooth

If your Home Assistant host has a built-in Bluetooth adapter:

1. Go to **Settings** → **Devices & Services**
2. Click **+ ADD INTEGRATION**
3. Search for "Bluetooth"
4. Follow setup wizard
5. Start the SFPLiberate add-on

The add-on will automatically use the host adapter.

### Using Shelly Bluetooth Proxies

Shelly Plus devices with Bluetooth also work:

1. Ensure Shelly device is integrated in HA
2. Enable Bluetooth on the Shelly (check Shelly docs)
3. Restart the SFPLiberate add-on
4. Devices will appear automatically

## Usage

### First Connection

1. Power on your SFP Wizard
2. Open the add-on web UI
3. Wait for device to appear (usually <30 seconds)
4. Click **Connect** on your device
5. UUIDs are automatically retrieved and cached

### Reading a Module

1. Insert SFP module into Wizard
2. Connect to Wizard (if not already)
3. Click **Read Module**
4. Review parsed data (vendor, model, serial)
5. Click **Save to Library**

### Writing a Module

1. Select a saved module from your library
2. Insert blank SFP module into Wizard
3. Connect to Wizard
4. Click **Write to Module**
5. Confirm operation
6. Wait for write to complete (~30 seconds)

### Managing Your Library

- **Browse:** View all saved profiles in the Modules tab
- **Search:** Filter by vendor, model, or serial number
- **Delete:** Remove unwanted profiles
- **Details:** View full EEPROM data for each module

## Data & Backups

### Data Storage

All data is stored in `/config/sfpliberate/`:

```
/config/sfpliberate/
├── sfp_library.db          # SQLite database with module profiles
└── submissions/            # User-submitted module profiles
```

### Automatic Backups

Your SFP library is **automatically included** in Home Assistant backups:

1. Go to **Settings** → **System** → **Backups**
2. Click **CREATE BACKUP**
3. Your SFPLiberate data is included

### Manual Backup

Via SSH/Terminal add-on:

```bash
# Backup database
cp /config/sfpliberate/sfp_library.db /backup/sfp_library_$(date +%Y%m%d).db

# List backups
ls -lh /backup/sfp_library_*.db

# Restore from backup
cp /backup/sfp_library_20250101.db /config/sfpliberate/sfp_library.db
```

### Migration from Standalone Docker

Coming soon: Export/import feature will allow seamless migration from standalone deployment.

## Troubleshooting

### No devices appear

**Symptom:** The discovered devices list remains empty after 60 seconds

**Solutions:**
1. **Check Bluetooth integration:**
   - Settings → Devices & Services → Bluetooth
   - Ensure integration is loaded and working
2. **Verify SFP Wizard is on:**
   - Power on the Wizard
   - Wait for LED to indicate ready state
3. **Check ESPHome proxies (if using):**
   - Settings → Devices & Services → ESPHome
   - Verify proxies are online and have Bluetooth enabled
4. **Increase expiry time:**
   - Configuration → `device_expiry_seconds: 600`
   - Restart add-on
5. **Enable debug logging:**
   - Configuration → `log_level: debug`
   - Check logs: Settings → Add-ons → SFPLiberate → Logs

### Connection timeout

**Symptom:** "Connection timeout" or "Failed to connect" error

**Solutions:**
1. **Move closer to Bluetooth adapter:**
   - Wizard should be within 10m of adapter/proxy
   - Reduce obstacles (walls, metal objects)
2. **Increase connection timeout:**
   - Configuration → `connection_timeout: 60`
   - Restart add-on
3. **Check for interference:**
   - Disable other Bluetooth devices temporarily
   - Avoid 2.4GHz Wi-Fi interference
4. **Verify only one connection:**
   - Ensure no other app is connected to Wizard
   - Restart Wizard if unsure
5. **Restart Bluetooth integration:**
   - Settings → Devices & Services → Bluetooth
   - Reload integration
   - Restart add-on

### Web UI not loading

**Symptom:** "Unable to connect" or blank page when clicking OPEN WEB UI

**Solutions:**
1. **Check add-on is running:**
   - Settings → Add-ons → SFPLiberate
   - Status should show "Started"
2. **Review add-on logs:**
   - Click **Log** tab
   - Look for errors during startup
3. **Restart the add-on:**
   - Click **RESTART**
   - Wait 30 seconds, try again
4. **Check frontend/backend logs:**
   - Enable debug logging
   - Look for port conflicts or crashes
5. **Restart Home Assistant:**
   - Settings → System → Restart
   - Wait for full startup

### Database errors

**Symptom:** Errors mentioning "database" or "SQLite"

**Solutions:**
1. **Check disk space:**
   - System → Hardware → Storage
   - Ensure >1GB free
2. **Check permissions:**
   - `/config/sfpliberate/` should be writable
   - Restart add-on to reset permissions
3. **Backup and reset:**
   - Backup: `cp /config/sfpliberate/sfp_library.db /backup/`
   - Stop add-on
   - Delete: `rm /config/sfpliberate/sfp_library.db`
   - Start add-on (creates new DB)
   - Restore if needed

### Custom device names not matching

**Symptom:** Device appears in HA but not in SFPLiberate

**Solution:**
1. Find device in HA:
   - Settings → Devices & Services → Bluetooth
   - Note exact device name
2. Add to patterns:
   - Configuration → `device_name_patterns`
   - Add exact name: `["Exact Name Here", "SFP", "Wizard"]`
3. Restart add-on

## Performance Tuning

### For slower systems (e.g., Raspberry Pi 3)

```yaml
log_level: warning  # Reduce log overhead
connection_timeout: 60  # Allow more time
device_expiry_seconds: 600  # Keep devices longer
```

### For faster systems or busy environments

```yaml
log_level: info
connection_timeout: 20  # Faster failure
device_expiry_seconds: 180  # Clean up faster
```

## Advanced Configuration

### Multiple Wizards

The add-on supports multiple SFP Wizards simultaneously:

```yaml
device_name_patterns:
  - "Workshop Wizard"
  - "Lab Wizard"
  - "Portable Wizard"
```

All discovered devices will appear in the UI.

### Debug Mode

Enable verbose logging to troubleshoot issues:

```yaml
log_level: debug
```

**Log locations:**
- Add-on logs: Settings → Add-ons → SFPLiberate → Logs
- System logs: Settings → System → Logs

**What to look for:**
- `ha_bluetooth_client_started`: Client initialized
- `Discovered X matching devices`: Discovery working
- `Successfully connected to AA:BB:CC:DD:EE:FF`: Connection successful
- `Error` or `Failed`: Issues to investigate

### Network Configuration

The add-on uses Home Assistant's networking stack. No port configuration needed.

**Ingress URL structure:**
```
http://homeassistant.local:8123/api/hassio_ingress/<token>/
```

Users access via the **OPEN WEB UI** button - no manual URL entry required.

## Security & Privacy

### Data Storage

- All module data stored locally in `/config/sfpliberate/`
- No cloud services or external APIs (except for updates)
- Module profiles contain only EEPROM data (vendor, model, serial, wavelength, etc.)

### Network Access

The add-on communicates with:
- **Home Assistant API** (local only)
- **ESPHome proxies** (local network)
- **No internet access** required for operation

### Authentication

- Web UI access controlled by Home Assistant authentication
- No separate login required
- Users with HA access can use the add-on

### Bluetooth Security

- Bluetooth LE used for local communication only
- No pairing/bonding required (SFP Wizard has no auth)
- Communication range limited by BLE (~10m typical)

## Limitations

### Home Assistant Requirements

- **Must use Home Assistant OS or Supervised**
- Container or Core installations **not supported** (use standalone Docker instead)
- Requires supervisor API access

### SFP Wizard Limitations

- Can only connect to one Wizard at a time
- Firmware v1.0.10 required (UUIDs may differ on other versions)
- Battery lasts ~2 hours per charge
- Write operations take ~30 seconds

### Add-On Limitations

- Bluetooth adapter or ESPHome proxy required
- Single-user (no multi-user authentication beyond HA)
- Web Bluetooth features not available (uses HA's Bluetooth API instead)

## FAQ

### Q: Can I use this without ESPHome?

**A:** Yes! The add-on works with your Home Assistant host's Bluetooth adapter. ESPHome proxies are optional (but recommended for better range).

### Q: Will this work on Home Assistant Container?

**A:** No, add-ons require Home Assistant OS or Supervised. Use the [standalone Docker deployment](../README.md#2-standalone-docker) instead.

### Q: Can I access this from outside my network?

**A:** Yes, if you have Home Assistant remote access configured (Nabu Casa or manual reverse proxy). The add-on respects HA's authentication.

### Q: What happens if the Wizard firmware updates?

**A:** The add-on uses cached UUIDs by default. If UUIDs change in a firmware update, they can be updated via environment variables.

### Q: Can I share modules with others?

**A:** Local sharing only for now. Community repository is planned for a future release.

### Q: How do I migrate from standalone Docker?

**A:** Export/import feature coming soon. For now, you can manually copy the SQLite database file.

## Support & Contributing

- **Documentation:** [GitHub Docs](https://github.com/josiah-nelson/SFPLiberate/tree/main/docs)
- **Issues:** [GitHub Issues](https://github.com/josiah-nelson/SFPLiberate/issues)
- **Discussions:** [GitHub Discussions](https://github.com/josiah-nelson/SFPLiberate/discussions)
- **Add-on Plan:** [Implementation Plan](HOME_ASSISTANT_ADDON_PLAN.md)

## Version History

See [CHANGELOG](../sfpliberate/CHANGELOG.md) for version history and release notes.

## License

MIT License - see [LICENSE](../LICENSE) for full text.

## Disclaimer

This project is an independent, community-driven effort and is **not affiliated with, endorsed by, or supported by Ubiquiti**. Use at your own risk.
