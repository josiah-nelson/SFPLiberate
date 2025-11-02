"""Pydantic schemas for API contracts."""

from app.schemas.ble import (
    BLEConnectedMessage,
    BLEConnectMessage,
    BLEDisconnectedMessage,
    BLEDisconnectMessage,
    BLEDiscoveredMessage,
    BLEDiscoverMessage,
    BLEErrorMessage,
    BLEMessageType,
    BLENotificationMessage,
    BLEStatusMessage,
    BLESubscribeMessage,
    BLEUnsubscribeMessage,
    BLEWriteMessage,
    ClientMessage,
    ServerMessage,
)
from app.schemas.module import ModuleCreate, ModuleEEPROM, ModuleInfo, StatusMessage
from app.schemas.submission import SubmissionCreate, SubmissionResponse

__all__ = [
    # Module schemas
    "ModuleCreate",
    "ModuleInfo",
    "ModuleEEPROM",
    "StatusMessage",
    # Submission schemas
    "SubmissionCreate",
    "SubmissionResponse",
    # BLE proxy schemas
    "BLEMessageType",
    "BLEConnectMessage",
    "BLEDisconnectMessage",
    "BLEWriteMessage",
    "BLESubscribeMessage",
    "BLEUnsubscribeMessage",
    "BLEDiscoverMessage",
    "BLEConnectedMessage",
    "BLEDisconnectedMessage",
    "BLENotificationMessage",
    "BLEErrorMessage",
    "BLEDiscoveredMessage",
    "BLEStatusMessage",
    "ClientMessage",
    "ServerMessage",
]
