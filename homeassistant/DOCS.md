# SFPLiberate Home Assistant Add-On Documentation

## Overview

SFPLiberate is a Home Assistant add-on that provides a web-based interface for managing SFP module EEPROM profiles using the Ubiquiti SFP Wizard (UACC-SFP-Wizard).

## Installation

1. Add the SFPLiberate repository to Home Assistant:
   - Click the "Add to Home Assistant" button in the README
   - OR manually add: `https://github.com/josiah-nelson/SFPLiberate`

2. Install the add-on:
   - Settings → Add-ons → Add-on Store
   - Find "SFPLiberate"
   - Click Install

3. Start the add-on:
   - Click Start
   - Wait for startup (check logs if needed)

4. Open the web UI:
   - Click "OPEN WEB UI"

## Configuration Options

### log_level
**Type:** `enum` (debug, info, warning, error)
**Default:** `info`

Controls the verbosity of add-on logs. Use `debug` for troubleshooting.

### auto_discover
**Type:** `boolean`
**Default:** `true`

Enable automatic discovery of SFP Wizard devices via Home Assistant's Bluetooth integration.

### device_name_patterns
**Type:** `list of strings`
**Default:** `["SFP", "Wizard"]`

List of patterns to match against Bluetooth device names for auto-discovery. Matching is case-insensitive.

**Example:**
```yaml
device_name_patterns:
  - "SFP"
  - "Wizard"
  - "Custom Name"
```

### connection_timeout
**Type:** `integer` (10-120)
**Default:** `30`

Timeout in seconds for Bluetooth connection attempts. Increase if you experience connection failures.

### device_expiry_seconds
**Type:** `integer` (60-600)
**Default:** `300`

How long (in seconds) to keep devices in the discovered list after their last advertisement. Devices that haven't been seen within this window are removed from the UI.

## Bluetooth Configuration

### Prerequisites

The add-on requires one of the following:

1. **ESPHome Bluetooth Proxy** (recommended for best range)
2. **Home Assistant host Bluetooth adapter**
3. **Shelly Bluetooth Proxy** (Shelly Plus devices)

### Using ESPHome Bluetooth Proxies

If you have ESPHome devices with Bluetooth proxy enabled, the add-on will automatically detect and use them. No configuration needed!

**ESPHome configuration example:**
```yaml
# In your ESPHome device YAML
esp32_ble_tracker:
  scan_parameters:
    active: true

bluetooth_proxy:
  active: true
```

### Using Host Bluetooth

1. Ensure your Home Assistant host has a Bluetooth adapter
2. Enable Bluetooth integration:
   - Settings → Devices & Services
   - Add Integration → Bluetooth
3. Start the add-on

## How It Works

### Device Discovery

1. The add-on polls Home Assistant's Bluetooth API every 5 seconds
2. Discovered devices are filtered by `device_name_patterns`
3. Matching devices appear in the web UI automatically
4. RSSI (signal strength) is displayed for each device

### Connection Flow

1. Click "Connect" on a discovered device
2. Backend uses HA's Bluetooth API to connect
3. GATT services are enumerated to find UUIDs
4. UUIDs are cached for future operations
5. You can now read/write EEPROM data

### Data Storage

All data is stored in `/config/sfpliberate/`:

```
/config/sfpliberate/
├── sfp_library.db          # SQLite database
└── submissions/            # User submissions
```

This location ensures:
- Automatic inclusion in Home Assistant backups
- Persistence across add-on updates
- User access via File Editor add-on

## Common Tasks

### Reading a Module

1. Power on SFP Wizard with module inserted
2. Wait for device to appear (usually <30 seconds)
3. Click "Connect"
4. Click "Read Module"
5. Review parsed data (vendor, model, serial)
6. Click "Save to Library"

### Writing a Module

1. Select a saved module from your library
2. Insert blank SFP module into Wizard
3. Connect to Wizard
4. Click "Write to Module"
5. Confirm operation
6. Wait for write to complete

### Managing Library

- **View modules:** Browse all saved profiles
- **Search:** Filter by vendor, model, or serial
- **Delete:** Remove unwanted profiles
- **Export:** Download module data (upcoming)

## Troubleshooting

### No devices appear

**Symptom:** The discovered devices list remains empty

**Solutions:**
1. Check Bluetooth integration is enabled:
   - Settings → Devices & Services → Bluetooth
2. Verify SFP Wizard is powered on
3. Check ESPHome proxies are online (Devices & Services)
4. Increase `device_expiry_seconds` to 600
5. Set `log_level: debug` and check logs

### Connection timeout

**Symptom:** "Connection timeout" error when clicking Connect

**Solutions:**
1. Move SFP Wizard closer to Bluetooth adapter/proxy
2. Increase `connection_timeout` to 60
3. Ensure no other device is connected to the Wizard
4. Restart the add-on
5. Check HA logs for Bluetooth errors

### Web UI not loading

**Symptom:** "Unable to connect" or blank page

**Solutions:**
1. Check add-on is running: Settings → Add-ons → SFPLiberate
2. Review add-on logs for errors
3. Restart the add-on
4. Restart Home Assistant if add-on won't start

### Database errors

**Symptom:** Errors mentioning database or SQLite

**Solutions:**
1. Check `/config/sfpliberate/` has write permissions
2. Ensure sufficient disk space
3. Stop add-on, backup database, restart add-on
4. If corrupted, delete database (will lose data!)

## Advanced Configuration

### Custom Device Names

If your SFP Wizard has been renamed:

```yaml
device_name_patterns:
  - "My Custom Wizard Name"
  - "SFP"  # Keep default for others
```

### Performance Tuning

For slower systems (e.g., Raspberry Pi 3):

```yaml
connection_timeout: 60
device_expiry_seconds: 600
log_level: warning  # Reduce log overhead
```

### Debug Mode

To troubleshoot issues:

```yaml
log_level: debug
```

Then check logs: Settings → Add-ons → SFPLiberate → Logs

## Backups & Restore

### Automatic Backups

Your module library is included in standard Home Assistant backups:

1. Settings → System → Backups
2. Create Backup (includes `/config/*`)

### Manual Backup

Via SSH/Terminal add-on:
```bash
# Backup database
cp /config/sfpliberate/sfp_library.db /backup/sfp_library_$(date +%Y%m%d).db

# Restore
cp /backup/sfp_library_20250101.db /config/sfpliberate/sfp_library.db
```

### Restore from Standalone Docker

Coming soon - export/import feature will allow migration from standalone deployment.

## Security & Privacy

### Data Storage

- All data stored locally in `/config/sfpliberate/`
- No cloud services or external APIs (except for updates)
- Module profiles contain only EEPROM data (vendor, model, serial)

### Network Access

- Add-on communicates with:
  - Home Assistant API (local)
  - ESPHome proxies (local)
  - No internet access required for operation

### Bluetooth Security

- Bluetooth LE used for local communication only
- No pairing/bonding required
- SFP Wizard has no authentication (by design)

## Limitations

### SFP Wizard Limitations

- Can only connect to one device at a time
- Firmware v1.0.10 required (UUIDs may differ on other versions)
- Battery lasts ~2 hours per charge

### Add-On Limitations

- Requires Home Assistant OS or Supervised (not Container/Core)
- Bluetooth adapter or ESPHome proxy required
- Single-user (no multi-user authentication)

## FAQ

### Q: Can I use this without ESPHome?

**A:** Yes! The add-on works with your Home Assistant host's Bluetooth adapter. ESPHome proxies are optional (but recommended for better range).

### Q: Will this work on Home Assistant Container?

**A:** No, add-ons require Home Assistant OS or Supervised. Use the standalone Docker deployment instead.

### Q: Can I access this from outside my network?

**A:** Yes, if you have Home Assistant remote access configured (Nabu Casa or manual). The add-on respects HA's authentication.

### Q: What happens if the Wizard firmware updates?

**A:** The add-on includes UUID discovery logic. If UUIDs change, it will auto-detect them on first connection.

### Q: Can I share modules with others?

**A:** Local sharing only for now. Community repository is planned for a future release.

## Support & Contributing

- **Documentation:** https://github.com/josiah-nelson/SFPLiberate/docs
- **Issues:** https://github.com/josiah-nelson/SFPLiberate/issues
- **Discussions:** https://github.com/josiah-nelson/SFPLiberate/discussions

## Version History

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

## License

MIT License - see repository for full text.
