"""
BLE Tracer for Home Assistant Add-on

Provides comprehensive BLE traffic logging for debugging and protocol analysis.
Uses standard Python logging system with structured messages.
"""

import json
import logging
from datetime import datetime
from typing import Any


class BLETracer:
    """
    Comprehensive BLE traffic tracer for debugging device communication.

    Features:
    - Device discovery logging
    - GATT service enumeration logging
    - Read/Write/Notify operation logging
    - Advertisement data capture
    - Connection lifecycle tracking

    All logs go through standard Python logging system.
    """

    def __init__(self, enabled: bool = False):
        """
        Initialize BLE tracer.

        Args:
            enabled: Whether tracing is enabled (uses DEBUG level logging)
        """
        self.enabled = enabled
        self._logger = logging.getLogger("ble_tracer")
        self._session_start = datetime.now()
        self._connection_counter = 0
        self._operation_counter = 0

        if self.enabled:
            # Write session header
            self._logger.info("=" * 80)
            self._logger.info(f"BLE TRACE SESSION STARTED: {self._session_start.isoformat()}")
            self._logger.info("=" * 80)

    def log_session_info(self, info: dict[str, Any]) -> None:
        """Log session configuration and environment info."""
        if not self.enabled:
            return

        self._logger.info("Session Configuration:")
        for key, value in info.items():
            self._logger.info(f"  {key}: {value}")

    def log_device_scan_start(self, patterns: list[str], filters: dict[str, Any]) -> None:
        """Log start of device scanning."""
        if not self.enabled:
            return

        self._logger.info("-" * 80)
        self._logger.info("DEVICE SCAN STARTED")
        self._logger.info(f"  Name Patterns: {patterns}")
        self._logger.info(f"  Filters: {json.dumps(filters, indent=2)}")

    def log_device_discovered(
        self,
        mac: str,
        name: str,
        rssi: int,
        advertisement_data: dict[str, Any] | None = None,
    ) -> None:
        """Log device discovery with advertisement data."""
        if not self.enabled:
            return

        self._logger.info(f"DEVICE DISCOVERED: {name}")
        self._logger.info(f"  MAC Address: {mac}")
        self._logger.info(f"  RSSI: {rssi} dBm")

        if advertisement_data:
            self._logger.info("  Advertisement Data:")
            for key, value in advertisement_data.items():
                if isinstance(value, (dict, list)):
                    self._logger.info(f"    {key}: {json.dumps(value, indent=6)}")
                else:
                    self._logger.info(f"    {key}: {value}")

    def log_connection_attempt(self, mac: str, name: str, timeout: int) -> int:
        """
        Log connection attempt.

        Returns:
            Connection ID for tracking this connection session
        """
        if not self.enabled:
            return 0

        self._connection_counter += 1
        conn_id = self._connection_counter

        self._logger.info("-" * 80)
        self._logger.info(f"CONNECTION ATTEMPT #{conn_id}")
        self._logger.info(f"  Device: {name} ({mac})")
        self._logger.info(f"  Timeout: {timeout}s")

        return conn_id

    def log_connection_success(self, conn_id: int, duration_ms: float) -> None:
        """Log successful connection."""
        if not self.enabled:
            return

        self._logger.info(f"CONNECTION #{conn_id} ESTABLISHED")
        self._logger.info(f"  Duration: {duration_ms:.2f}ms")

    def log_connection_failed(self, conn_id: int, error: str, duration_ms: float) -> None:
        """Log failed connection attempt."""
        if not self.enabled:
            return

        self._logger.error(f"CONNECTION #{conn_id} FAILED")
        self._logger.error(f"  Error: {error}")
        self._logger.error(f"  Duration: {duration_ms:.2f}ms")

    def log_gatt_enumeration_start(self, conn_id: int) -> None:
        """Log start of GATT service enumeration."""
        if not self.enabled:
            return

        self._logger.info(f"GATT ENUMERATION STARTED (Connection #{conn_id})")

    def log_service_discovered(
        self,
        conn_id: int,
        service_uuid: str,
        is_primary: bool = True,
    ) -> None:
        """Log GATT service discovery."""
        if not self.enabled:
            return

        service_type = "PRIMARY" if is_primary else "SECONDARY"
        self._logger.info(f"  Service Discovered ({service_type}): {service_uuid}")

    def log_characteristic_discovered(
        self,
        conn_id: int,
        service_uuid: str,
        char_uuid: str,
        properties: list[str],
    ) -> None:
        """Log GATT characteristic discovery."""
        if not self.enabled:
            return

        props = ", ".join(properties)
        self._logger.info(f"    Characteristic: {char_uuid}")
        self._logger.info(f"      Service: {service_uuid}")
        self._logger.info(f"      Properties: [{props}]")

    def log_descriptor_discovered(
        self,
        conn_id: int,
        char_uuid: str,
        descriptor_uuid: str,
    ) -> None:
        """Log GATT descriptor discovery."""
        if not self.enabled:
            return

        self._logger.info(f"      Descriptor: {descriptor_uuid}")
        self._logger.info(f"        Characteristic: {char_uuid}")

    def log_gatt_enumeration_complete(
        self,
        conn_id: int,
        service_count: int,
        char_count: int,
        duration_ms: float,
    ) -> None:
        """Log completion of GATT enumeration."""
        if not self.enabled:
            return

        self._logger.info(f"GATT ENUMERATION COMPLETE (Connection #{conn_id})")
        self._logger.info(f"  Services: {service_count}")
        self._logger.info(f"  Characteristics: {char_count}")
        self._logger.info(f"  Duration: {duration_ms:.2f}ms")

    def log_read_operation(
        self,
        conn_id: int,
        char_uuid: str,
        value: bytes,
        success: bool = True,
        error: str | None = None,
    ) -> None:
        """Log characteristic read operation."""
        if not self.enabled:
            return

        self._operation_counter += 1
        op_id = self._operation_counter

        if success:
            self._logger.debug(f"READ #{op_id} (Connection #{conn_id})")
            self._logger.debug(f"  Characteristic: {char_uuid}")
            self._logger.debug(f"  Length: {len(value)} bytes")
            self._logger.debug(f"  Hex: {value.hex()}")
            if value:
                try:
                    decoded = value.decode('utf-8', errors='replace')
                    self._logger.debug(f"  ASCII: {repr(decoded)}")
                except Exception:
                    self._logger.debug("  Value is not valid UTF-8, skipping ASCII representation.")
        else:
            self._logger.error(f"READ #{op_id} FAILED (Connection #{conn_id})")
            self._logger.error(f"  Characteristic: {char_uuid}")
            self._logger.error(f"  Error: {error}")

    def log_write_operation(
        self,
        conn_id: int,
        char_uuid: str,
        value: bytes,
        with_response: bool = True,
        success: bool = True,
        error: str | None = None,
    ) -> None:
        """Log characteristic write operation."""
        if not self.enabled:
            return

        self._operation_counter += 1
        op_id = self._operation_counter

        write_type = "WRITE" if with_response else "WRITE_NO_RESPONSE"

        if success:
            self._logger.debug(f"{write_type} #{op_id} (Connection #{conn_id})")
            self._logger.debug(f"  Characteristic: {char_uuid}")
            self._logger.debug(f"  Length: {len(value)} bytes")
            self._logger.debug(f"  Hex: {value.hex()}")
            if value:
                try:
                    decoded = value.decode('utf-8', errors='replace')
                    self._logger.debug(f"  ASCII: {repr(decoded)}")
                except Exception:
                    self._logger.debug("  Value is not valid UTF-8, skipping ASCII representation.")
        else:
            self._logger.error(f"{write_type} #{op_id} FAILED (Connection #{conn_id})")
            self._logger.error(f"  Characteristic: {char_uuid}")
            self._logger.error(f"  Error: {error}")

    def log_notification_received(
        self,
        conn_id: int,
        char_uuid: str,
        value: bytes,
    ) -> None:
        """Log notification received from device."""
        if not self.enabled:
            return

        self._logger.debug(f"NOTIFICATION RECEIVED (Connection #{conn_id})")
        self._logger.debug(f"  Characteristic: {char_uuid}")
        self._logger.debug(f"  Length: {len(value)} bytes")
        self._logger.debug(f"  Hex: {value.hex()}")
        if value:
            try:
                decoded = value.decode('utf-8', errors='replace')
                self._logger.debug(f"  ASCII: {repr(decoded)}")
            except Exception:
                self._logger.debug("  Value is not valid UTF-8, skipping ASCII representation.")

    def log_notification_subscribed(
        self,
        conn_id: int,
        char_uuid: str,
        success: bool = True,
        error: str | None = None,
    ) -> None:
        """Log notification subscription."""
        if not self.enabled:
            return

        if success:
            self._logger.info(f"NOTIFICATION SUBSCRIBED (Connection #{conn_id})")
            self._logger.info(f"  Characteristic: {char_uuid}")
        else:
            self._logger.error(f"NOTIFICATION SUBSCRIPTION FAILED (Connection #{conn_id})")
            self._logger.error(f"  Characteristic: {char_uuid}")
            self._logger.error(f"  Error: {error}")

    def log_disconnection(self, conn_id: int, reason: str | None = None) -> None:
        """Log device disconnection."""
        if not self.enabled:
            return

        self._logger.info(f"DISCONNECTED (Connection #{conn_id})")
        if reason:
            self._logger.info(f"  Reason: {reason}")

    def log_error(self, context: str, error: str, details: dict[str, Any] | None = None) -> None:
        """Log general error with context."""
        if not self.enabled:
            return

        self._logger.error(f"ERROR: {context}")
        self._logger.error(f"  {error}")
        if details:
            self._logger.error(f"  Details: {json.dumps(details, indent=4)}")

    def close(self) -> None:
        """Log session end summary."""
        if self.enabled:
            end_time = datetime.now()
            self._logger.info("=" * 80)
            self._logger.info(f"BLE TRACE SESSION ENDED: {end_time.isoformat()}")
            self._logger.info(f"Duration: {(end_time - self._session_start).total_seconds():.2f}s")
            self._logger.info(f"Total Connections: {self._connection_counter}")
            self._logger.info(f"Total Operations: {self._operation_counter}")
            self._logger.info("=" * 80)


# Global tracer instance
_tracer: BLETracer | None = None


def init_tracer(enabled: bool = False) -> BLETracer:
    """
    Initialize global BLE tracer.

    Args:
        enabled: Whether tracing is enabled (uses DEBUG logging)

    Returns:
        BLETracer instance
    """
    global _tracer

    if _tracer:
        _tracer.close()

    _tracer = BLETracer(enabled=enabled)
    return _tracer


def get_tracer() -> BLETracer:
    """
    Get global BLE tracer instance.

    Returns:
        BLETracer instance (creates disabled tracer if not initialized)
    """
    global _tracer

    if not _tracer:
        _tracer = BLETracer(enabled=False)

    return _tracer
