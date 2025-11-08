#!/usr/bin/with-contenv bashio

# Get configuration from options.json
export LOG_LEVEL=$(bashio::config 'log_level')
export AUTO_DISCOVER=$(bashio::config 'auto_discover')
export DEVICE_NAME_PATTERNS=$(bashio::config 'device_name_patterns' | jq -c '.')
export CONNECTION_TIMEOUT=$(bashio::config 'connection_timeout')
export DEVICE_EXPIRY_SECONDS=$(bashio::config 'device_expiry_seconds')
export BLE_TRACE_LOGGING=$(bashio::config 'ble_trace_logging')
export ENABLE_DEBUG_BLE=$(bashio::config 'enable_debug_ble')

# Home Assistant API access
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN}"
export HASSIO_TOKEN="${SUPERVISOR_TOKEN}"
export HA_API_URL="http://supervisor/core/api"
export HA_WS_URL="ws://supervisor/core/websocket"

# Add-on specific paths
export DATABASE_FILE="/config/sfpliberate/sfp_library.db"
export SUBMISSIONS_DIR="/config/sfpliberate/submissions"
export DATA_DIR="/config/sfpliberate"
export BACKUP_DIR="/config/sfpliberate/backups"

# Create directories
bashio::log.info "Creating data directories..."
mkdir -p /config/sfpliberate/submissions
mkdir -p /config/sfpliberate/backups

# Set deployment mode to HA addon
export DEPLOYMENT_MODE="homeassistant"
export ESPHOME_PROXY_MODE="false"  # We use HA Bluetooth API instead
export HA_ADDON_MODE="true"

# Configure ingress path for Next.js
INGRESS_ENTRY=$(bashio::addon.ingress_entry)
if [[ -n "${INGRESS_ENTRY}" && "${INGRESS_ENTRY}" != "/" ]]; then
    export INGRESS_PATH="${INGRESS_ENTRY}"
else
    export INGRESS_PATH=""
fi

bashio::log.info "Starting SFPLiberate Home Assistant Add-On..."
bashio::log.info "Log Level: ${LOG_LEVEL}"
bashio::log.info "Auto Discovery: ${AUTO_DISCOVER}"
bashio::log.info "Device Patterns: ${DEVICE_NAME_PATTERNS}"
bashio::log.info "Database: ${DATABASE_FILE}"
if [[ -n "${INGRESS_PATH}" ]]; then
    bashio::log.info "Ingress base path: ${INGRESS_PATH}"
else
    bashio::log.info "Ingress base path: /"
fi

# Log BLE tracing status
if bashio::config.true 'ble_trace_logging'; then
    bashio::log.info "BLE Trace Logging: ENABLED"
else
    bashio::log.info "BLE Trace Logging: DISABLED"
fi

# Note: Actual service startup is handled by s6-overlay services in /etc/services.d/
