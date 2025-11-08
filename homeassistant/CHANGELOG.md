# Changelog

All notable changes to the SFPLiberate Home Assistant Add-On will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial Home Assistant Add-On implementation
- Automatic Bluetooth device discovery via HA API
- Single-click connection flow
- Auto-discovery of ESPHome Bluetooth proxies
- Support for HA host Bluetooth adapter
- Pattern-based device filtering
- Ingress support for web UI
- Automatic backup integration
- Multi-architecture support (aarch64, amd64, armhf, armv7)

### Changed
- Backend now uses HomeAssistantBluetoothClient instead of ESPHome mDNS discovery
- Frontend simplified with auto-discovery UI
- Database location moved to `/config/sfpliberate/` for backup integration

### Fixed
- N/A (initial release)

## [1.0.0] - TBD

### Added
- First stable release of Home Assistant Add-On
- All features from standalone Docker deployment
- Simplified setup and configuration
- Comprehensive documentation

---

## Version History

**Pre-release versions:**
- Development versions not tracked in this changelog
- See git commit history for detailed development changes

**Standalone Docker:**
- See main repository CHANGELOG for standalone deployment versions
- Add-on versions are independent of standalone versions
