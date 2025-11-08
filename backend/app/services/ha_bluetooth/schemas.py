"""Pydantic schemas for Home Assistant Bluetooth integration."""

from pydantic import BaseModel, Field


class HABluetoothDevice(BaseModel):
    """Discovered Bluetooth device from Home Assistant."""

    mac: str = Field(..., description="Device MAC address")
    name: str = Field(..., description="Device friendly name")
    rssi: int = Field(-100, description="Signal strength (RSSI)")
    source: str = Field(
        "hass_bluetooth",
        description="Source of discovery (esphome_proxy, hass_bluetooth, etc.)"
    )
    last_seen: str | None = Field(None, description="Last seen timestamp from HA")

    class Config:
        json_schema_extra = {
            "example": {
                "mac": "AA:BB:CC:DD:EE:FF",
                "name": "SFP Wizard",
                "rssi": -65,
                "source": "esphome_proxy_1",
                "last_seen": "2025-11-06T10:30:00Z"
            }
        }


class HADeviceConnectionRequest(BaseModel):
    """Request to connect to a device via HA Bluetooth."""

    mac_address: str = Field(..., description="Device MAC address to connect to")

    class Config:
        json_schema_extra = {
            "example": {
                "mac_address": "AA:BB:CC:DD:EE:FF"
            }
        }


class HADeviceConnectionResponse(BaseModel):
    """Response after connecting to device and retrieving UUIDs."""

    service_uuid: str = Field(..., description="Primary GATT service UUID")
    notify_char_uuid: str = Field(..., description="Notify characteristic UUID")
    write_char_uuid: str = Field(..., description="Write characteristic UUID")
    device_name: str | None = Field(None, description="Device friendly name")
    source: str | None = Field(None, description="Source that was used for connection")

    class Config:
        json_schema_extra = {
            "example": {
                "service_uuid": "8E60F02E-F699-4865-B83F-F40501752184",
                "notify_char_uuid": "DC272A22-43F2-416B-8FA5-63A071542FAC",
                "write_char_uuid": "9280F26C-A56F-43EA-B769-D5D732E1AC67",
                "device_name": "SFP Wizard",
                "source": "esphome_proxy_1"
            }
        }


class HABluetoothStatus(BaseModel):
    """Status of HA Bluetooth integration."""

    enabled: bool = Field(..., description="Whether HA addon mode is enabled")
    devices_discovered: int = Field(0, description="Number of devices currently discovered")
    ha_api_url: str = Field(..., description="Home Assistant API URL")
    connected: bool = Field(False, description="Whether connected to HA API")

    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "devices_discovered": 3,
                "ha_api_url": "http://supervisor/core/api",
                "connected": True
            }
        }
