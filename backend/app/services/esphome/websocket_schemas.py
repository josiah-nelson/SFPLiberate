"""WebSocket message schemas for ESPHome BLE proxy communication."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class BLEMessageType(str, Enum):
    """WebSocket message types for BLE proxy communication."""

    # Client → Server
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    WRITE = "write"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"

    # Server → Client
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    NOTIFICATION = "notification"
    STATUS = "status"
    ERROR = "error"


# Client → Server Messages


class BLEConnectMessage(BaseModel):
    """Request to connect to a BLE device."""

    type: Literal["connect"] = Field(default="connect")
    mac_address: str = Field(..., description="Device MAC address")
    service_uuid: str | None = Field(None, description="Optional service UUID filter")
    notify_char_uuid: str | None = Field(None, description="Notify characteristic UUID")
    write_char_uuid: str | None = Field(None, description="Write characteristic UUID")


class BLEDisconnectMessage(BaseModel):
    """Request to disconnect from current device."""

    type: Literal["disconnect"] = Field(default="disconnect")


class BLEWriteMessage(BaseModel):
    """Request to write data to a characteristic."""

    type: Literal["write"] = Field(default="write")
    characteristic_uuid: str = Field(..., description="Target characteristic UUID")
    data: str = Field(..., description="Base64-encoded data to write")
    with_response: bool = Field(default=True, description="Wait for write confirmation")


class BLESubscribeMessage(BaseModel):
    """Request to subscribe to notifications from a characteristic."""

    type: Literal["subscribe"] = Field(default="subscribe")
    characteristic_uuid: str = Field(..., description="Characteristic UUID to subscribe to")


class BLEUnsubscribeMessage(BaseModel):
    """Request to unsubscribe from a characteristic."""

    type: Literal["unsubscribe"] = Field(default="unsubscribe")
    characteristic_uuid: str = Field(..., description="Characteristic UUID to unsubscribe from")


# Server → Client Messages


class BLEConnectedMessage(BaseModel):
    """Notification that connection succeeded."""

    type: Literal["connected"] = Field(default="connected")
    device_name: str | None = Field(None, description="Device name")
    device_address: str = Field(..., description="Device MAC address")
    service_uuid: str = Field(..., description="Primary service UUID")
    notify_char_uuid: str = Field(..., description="Notify characteristic UUID")
    write_char_uuid: str = Field(..., description="Write characteristic UUID")
    proxy_used: str = Field(..., description="ESPHome proxy name used")


class BLEDisconnectedMessage(BaseModel):
    """Notification that device disconnected."""

    type: Literal["disconnected"] = Field(default="disconnected")
    reason: str = Field(..., description="Disconnect reason")


class BLENotificationMessage(BaseModel):
    """BLE characteristic notification received."""

    type: Literal["notification"] = Field(default="notification")
    characteristic_uuid: str = Field(..., description="Source characteristic UUID")
    data: str = Field(..., description="Base64-encoded notification data")


class BLEStatusMessage(BaseModel):
    """General status message."""

    type: Literal["status"] = Field(default="status")
    connected: bool = Field(..., description="Connection status")
    device_name: str | None = Field(None, description="Connected device name")
    message: str = Field(..., description="Status message")


class BLEErrorMessage(BaseModel):
    """Error message."""

    type: Literal["error"] = Field(default="error")
    error: str = Field(..., description="Error description")
    details: dict | None = Field(None, description="Additional error details")
