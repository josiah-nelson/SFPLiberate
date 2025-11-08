"""Pydantic models for ESPHome Bluetooth Proxy integration."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field


def _validate_mac_address(v: str) -> str:
    """Validate and normalize MAC address format."""
    v = v.upper().replace("-", ":")
    if not re.match(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$", v):
        raise ValueError(
            "Invalid MAC address format. Expected format: AA:BB:CC:DD:EE:FF"
        )
    return v


# Reusable MAC address type with validation
MACAddress = Annotated[str, AfterValidator(_validate_mac_address)]


class ESPHomeProxy(BaseModel):
    """Represents a discovered ESPHome proxy device."""

    name: str = Field(..., description="Proxy hostname (e.g., 'living-room-proxy')")
    address: str = Field(..., description="IP address")
    port: int = Field(default=6053, description="ESPHome API port")
    mac_address: str | None = Field(None, description="Proxy MAC address")
    connected: bool = Field(default=False, description="Connection status")
    last_seen: datetime = Field(default_factory=datetime.utcnow)


class DiscoveredDevice(BaseModel):
    """Represents a discovered BLE device (SFP Wizard)."""

    mac_address: MACAddress = Field(..., description="BLE MAC address")
    name: str = Field(..., description="Device name from advertisement")
    rssi: int = Field(..., description="Signal strength (dBm)")
    best_proxy: str = Field(..., description="Proxy name with best RSSI")
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    advertisement_data: dict | None = Field(
        None, description="Raw advertisement data"
    )


class DeviceConnectionRequest(BaseModel):
    """Request to connect to a BLE device and retrieve UUIDs."""

    mac_address: MACAddress = Field(
        ..., description="BLE MAC address (format: AA:BB:CC:DD:EE:FF)"
    )


class DeviceConnectionResponse(BaseModel):
    """Response containing discovered GATT UUIDs."""

    service_uuid: str = Field(..., description="Primary service UUID")
    notify_char_uuid: str = Field(..., description="Notification characteristic UUID")
    write_char_uuid: str = Field(..., description="Write characteristic UUID")
    device_name: str | None = Field(None, description="Device name")
    proxy_used: str = Field(..., description="ESPHome proxy that performed connection")


class ESPHomeStatus(BaseModel):
    """Status of ESPHome proxy feature."""

    enabled: bool = Field(..., description="Whether ESPHome proxy mode is enabled")
    proxies_discovered: int = Field(
        default=0, description="Number of ESPHome proxies found"
    )
    devices_discovered: int = Field(
        default=0, description="Number of SFP devices found"
    )
    mode: str = Field(default="esphome", description="Connection mode")


class BLEDeviceProfile(BaseModel):
    """BLE device profile for UUID persistence."""

    mac_address: MACAddress = Field(..., description="Device MAC address (primary key)")
    service_uuid: str = Field(..., description="GATT service UUID")
    notify_char_uuid: str = Field(..., description="Notify characteristic UUID")
    write_char_uuid: str = Field(..., description="Write characteristic UUID")
    device_name: str | None = Field(None, description="Friendly device name")
    created_at: datetime | None = Field(
        default_factory=datetime.utcnow, description="Profile creation time"
    )
    updated_at: datetime | None = Field(
        default_factory=datetime.utcnow, description="Profile last update time"
    )


class BLEDeviceProfileCreate(BaseModel):
    """Request to create/update a device profile."""

    mac_address: MACAddress
    service_uuid: str
    notify_char_uuid: str
    write_char_uuid: str
    device_name: str | None = None
