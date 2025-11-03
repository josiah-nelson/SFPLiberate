"""
BLE Proxy WebSocket message schemas.

Defines the message format for bidirectional communication between
the frontend and the standalone BLE proxy service.
"""

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class BLEMessageType(str, Enum):
    """WebSocket message types for BLE proxy."""

    # Client → Server
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    WRITE = "write"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    DISCOVER = "discover"

    # Server → Client
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    NOTIFICATION = "notification"
    ERROR = "error"
    DISCOVERED = "discovered"
    STATUS = "status"


class BLEConnectMessage(BaseModel):
    """Request to connect to a BLE device."""

    type: BLEMessageType = Field(default=BLEMessageType.CONNECT)
    service_uuid: str = Field(..., description="Service UUID to connect to")
    device_address: Optional[str] = Field(
        None, description="Optional device address (auto-discover if not provided)"
    )
    adapter: Optional[str] = Field(
        None, description="Optional adapter (e.g., 'hci0'). Uses default when omitted."
    )


class BLEDisconnectMessage(BaseModel):
    """Request to disconnect from BLE device."""

    type: BLEMessageType = Field(default=BLEMessageType.DISCONNECT)


class BLEWriteMessage(BaseModel):
    """Request to write data to a BLE characteristic."""

    type: BLEMessageType = Field(default=BLEMessageType.WRITE)
    characteristic_uuid: str = Field(..., description="Characteristic UUID to write to")
    data: str = Field(..., description="Base64-encoded data to write")
    with_response: bool = Field(
        default=False, description="Whether to wait for write response"
    )


class BLESubscribeMessage(BaseModel):
    """Request to subscribe to notifications from a characteristic."""

    type: BLEMessageType = Field(default=BLEMessageType.SUBSCRIBE)
    characteristic_uuid: str = Field(..., description="Characteristic UUID to subscribe to")


class BLEUnsubscribeMessage(BaseModel):
    """Request to unsubscribe from notifications."""

    type: BLEMessageType = Field(default=BLEMessageType.UNSUBSCRIBE)
    characteristic_uuid: str = Field(..., description="Characteristic UUID to unsubscribe from")


class BLEDiscoverMessage(BaseModel):
    """Request to discover nearby BLE devices."""

    type: BLEMessageType = Field(default=BLEMessageType.DISCOVER)
    service_uuid: Optional[str] = Field(
        None, description="Optional service UUID filter"
    )
    timeout: int = Field(default=5, description="Discovery timeout in seconds", ge=1, le=30)
    adapter: Optional[str] = Field(
        None, description="Optional adapter (e.g., 'hci0'). Uses default when omitted."
    )


class BLEConnectedMessage(BaseModel):
    """Server response: Successfully connected to device."""

    type: BLEMessageType = Field(default=BLEMessageType.CONNECTED)
    device_name: str = Field(..., description="Connected device name")
    device_address: str = Field(..., description="Connected device address")
    services: list[str] = Field(default_factory=list, description="Available service UUIDs")


class BLEDisconnectedMessage(BaseModel):
    """Server response: Device disconnected."""

    type: BLEMessageType = Field(default=BLEMessageType.DISCONNECTED)
    reason: Optional[str] = Field(None, description="Disconnect reason if available")


class BLENotificationMessage(BaseModel):
    """Server response: Notification data from device."""

    type: BLEMessageType = Field(default=BLEMessageType.NOTIFICATION)
    characteristic_uuid: str = Field(..., description="Characteristic that sent notification")
    data: str = Field(..., description="Base64-encoded notification data")


class BLEErrorMessage(BaseModel):
    """Server response: Error occurred."""

    type: BLEMessageType = Field(default=BLEMessageType.ERROR)
    error: str = Field(..., description="Error message")
    details: Optional[dict[str, Any]] = Field(None, description="Additional error details")


class BLEDiscoveredMessage(BaseModel):
    """Server response: Discovered devices."""

    type: BLEMessageType = Field(default=BLEMessageType.DISCOVERED)
    devices: list[dict[str, Any]] = Field(
        ..., description="List of discovered devices with name, address, rssi"
    )


class BLEStatusMessage(BaseModel):
    """Server response: Status update."""

    type: BLEMessageType = Field(default=BLEMessageType.STATUS)
    connected: bool = Field(..., description="Whether device is connected")
    device_name: Optional[str] = Field(None, description="Connected device name")
    message: str = Field(..., description="Status message")


# Union type for all client messages
ClientMessage = (
    BLEConnectMessage
    | BLEDisconnectMessage
    | BLEWriteMessage
    | BLESubscribeMessage
    | BLEUnsubscribeMessage
    | BLEDiscoverMessage
)

# Union type for all server messages
ServerMessage = (
    BLEConnectedMessage
    | BLEDisconnectedMessage
    | BLENotificationMessage
    | BLEErrorMessage
    | BLEDiscoveredMessage
    | BLEStatusMessage
)
