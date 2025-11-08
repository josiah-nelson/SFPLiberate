# SFPLiberate Home Assistant Add-On

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fjosiah-nelson%2FSFPLiberate)

Bluetooth companion for the Ubiquiti SFP Wizard (UACC-SFP-Wizard). Capture, clone, and manage unlimited SFP/SFP+ module EEPROM profiles directly from your Home Assistant instance.

## About

The Ubiquiti SFP Wizard can only store ONE module profile at a time. SFPLiberate solves this by providing unlimited storage for your SFP module profiles, with automatic Bluetooth discovery and a simple click-to-connect interface.

## Features

- ✅ **One-click installation** - No Docker knowledge required
- ✅ **Automatic Bluetooth discovery** - Leverages HA's Bluetooth integration
- ✅ **ESPHome integration** - Uses your existing BLE proxies
- ✅ **Built-in backup** - Included in HA backups automatically
- ✅ **Web UI via Ingress** - No port conflicts or reverse proxy needed
- ✅ **Unlimited module storage** - SQLite database in your Home Assistant config
- ✅ **Clone modules** - Write saved profiles to blank SFP modules

## Installation

1. Click the "Add to Home Assistant" button above
2. Install the "SFPLiberate" add-on
3. Start the add-on
4. Click "OPEN WEB UI"

## Requirements

- **Home Assistant OS** or **Supervised** installation
- **Bluetooth adapter** OR **ESPHome Bluetooth proxy**
- **SFP Wizard** firmware v1.0.10+

## Configuration

The add-on works out of the box with sensible defaults. You can customize these options via the Configuration tab:

| Option | Default | Description |
|--------|---------|-------------|
| `log_level` | `info` | Logging verbosity (debug, info, warning, error) |
| `auto_discover` | `true` | Enable automatic BLE device discovery |
| `device_name_patterns` | `["SFP", "Wizard"]` | Device name patterns for filtering |
| `connection_timeout` | `30` | Bluetooth connection timeout (seconds) |
| `device_expiry_seconds` | `300` | How long to keep stale devices in list |

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

## Bluetooth Setup

### Using ESPHome Bluetooth Proxies (Recommended)

If you already have ESPHome Bluetooth proxies configured in Home Assistant, the add-on will automatically use them for extended range. No additional configuration needed!

### Using HA Host Bluetooth

The add-on can also use your Home Assistant host's built-in Bluetooth adapter:

1. Ensure Bluetooth integration is enabled: Settings → Devices & Services → Bluetooth
2. Start the add-on
3. Devices will appear automatically

## Usage

1. Power on your SFP Wizard
2. Open the add-on web UI
3. Wait for auto-discovery (devices appear within 30 seconds)
4. Click "Connect" on your device
5. Read, save, or write module profiles

## Troubleshooting

### No devices discovered

1. Verify Bluetooth integration is enabled: Settings → Devices & Services → Bluetooth
2. Check ESPHome proxies are online (if using)
3. Ensure SFP Wizard is powered and advertising
4. Increase `device_expiry_seconds` if devices disappear quickly

### Connection failures

1. Move SFP Wizard closer to Bluetooth adapter/proxy
2. Increase `connection_timeout` setting
3. Check add-on logs: Settings → Add-ons → SFPLiberate → Logs
4. Restart the add-on

### Logs show errors

Check the add-on logs for detailed error messages:
- Settings → Add-ons → SFPLiberate → Logs
- Set `log_level: debug` for more verbose output

## Data & Backups

### Data Storage

All data is stored in `/config/sfpliberate/`:
- `sfp_library.db` - SQLite database with module profiles
- `submissions/` - User-submitted module profiles

### Backups

Your SFP module library is automatically included in Home Assistant backups. To create a manual backup:

1. Settings → System → Backups
2. Create Backup
3. Your SFPLiberate data is included

## Migration from Standalone Docker

If you're migrating from the standalone Docker deployment:

1. Export your data from standalone (upcoming feature)
2. Install this add-on
3. Import your data via Settings tab
4. Verify all modules imported correctly

## Support

- **Documentation:** [GitHub Documentation](https://github.com/josiah-nelson/SFPLiberate/tree/main/docs)
- **Issues:** [GitHub Issues](https://github.com/josiah-nelson/SFPLiberate/issues)
- **Discussions:** [GitHub Discussions](https://github.com/josiah-nelson/SFPLiberate/discussions)

## License

MIT License - see [LICENSE](https://github.com/josiah-nelson/SFPLiberate/blob/main/LICENSE)

## Disclaimer

This project is an independent, community-driven effort and is **not affiliated with, endorsed by, or supported by Ubiquiti**. Use at your own risk.
