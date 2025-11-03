"""
Main FastAPI application for standalone BLE proxy service.

Provides WebSocket endpoint for BLE communication with SFP Wizard devices.
Minimal dependencies - no database, no authentication required.
"""

import asyncio
import base64
import json
import logging
import socket
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import uvicorn

from schemas import (
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
)
from ble_manager import BLENotAvailableError, get_ble_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Version
__version__ = "1.0.0"


def get_local_ip() -> str:
    """Get the local IP address of this machine."""
    try:
        # Connect to external host to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "localhost"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    local_ip = get_local_ip()
    logger.info("=" * 60)
    logger.info("🚀 SFPLiberate BLE Proxy Service v%s", __version__)
    logger.info("=" * 60)
    logger.info("")
    logger.info("📡 WebSocket Endpoint:")
    logger.info("   ws://%s:8081/ble/ws", local_ip)
    logger.info("")
    logger.info("🌐 Configure this URL in your Appwrite UI settings:")
    logger.info("   Settings → BLE Proxy → ws://%s:8081/ble/ws", local_ip)
    logger.info("")
    logger.info("💡 Make sure your iOS device is on the same network!")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("Shutting down BLE proxy service...")


# Create FastAPI app
app = FastAPI(
    title="SFPLiberate BLE Proxy",
    description="Standalone BLE proxy for iOS/Safari users",
    version=__version__,
    lifespan=lifespan
)

# CORS - allow all origins (local network trust model)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local network use
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BLEProxyHandler:
    """Handles WebSocket connection and BLE operations for a single client."""

    def __init__(self, websocket: WebSocket):
        """Initialize handler."""
        self.websocket = websocket
        self.ble_manager = None
        self.notification_task = None

    async def handle_connection(self):
        """Main handler for WebSocket connection."""
        await self.websocket.accept()
        logger.info("Client connected from %s", self.websocket.client)

        try:
            # Initialize BLE manager
            try:
                self.ble_manager = get_ble_manager()
                logger.info("BLE manager initialized")
            except BLENotAvailableError as e:
                await self._send_error(f"BLE not available: {e}")
                return

            # Start notification task
            self.notification_task = asyncio.create_task(
                self._notification_handler()
            )

            # Handle incoming messages
            while True:
                data = await self.websocket.receive_text()
                await self._handle_message(data)

        except WebSocketDisconnect:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error("Error in WebSocket handler: %s", e, exc_info=True)
            await self._send_error(f"Internal error: {e}")
        finally:
            await self._cleanup()

    async def _handle_message(self, data: str):
        """Handle incoming WebSocket message."""
        try:
            message = json.loads(data)
            msg_type = message.get("type")

            logger.debug("Received message: %s", msg_type)

            if msg_type == BLEMessageType.CONNECT:
                await self._handle_connect(BLEConnectMessage(**message))
            elif msg_type == BLEMessageType.DISCONNECT:
                await self._handle_disconnect(BLEDisconnectMessage(**message))
            elif msg_type == BLEMessageType.WRITE:
                await self._handle_write(BLEWriteMessage(**message))
            elif msg_type == BLEMessageType.SUBSCRIBE:
                await self._handle_subscribe(BLESubscribeMessage(**message))
            elif msg_type == BLEMessageType.UNSUBSCRIBE:
                await self._handle_unsubscribe(BLEUnsubscribeMessage(**message))
            elif msg_type == BLEMessageType.DISCOVER:
                await self._handle_discover(BLEDiscoverMessage(**message))
            else:
                await self._send_error(f"Unknown message type: {msg_type}")

        except ValidationError as e:
            await self._send_error(f"Invalid message format: {e}")
        except json.JSONDecodeError as e:
            await self._send_error(f"Invalid JSON: {e}")
        except Exception as e:
            logger.error("Error handling message: %s", e, exc_info=True)
            await self._send_error(f"Error: {e}")

    async def _handle_connect(self, msg: BLEConnectMessage):
        """Handle BLE connect request."""
        try:
            logger.info("Connecting to device...")
            await self.ble_manager.connect(
                service_uuid=msg.service_uuid,
                device_address=msg.device_address,
                adapter=msg.adapter
            )

            # Get device info
            device_info = self.ble_manager.get_device_info()
            
            response = BLEConnectedMessage(
                device_name=device_info.get("name", "Unknown"),
                device_address=device_info.get("address", "Unknown"),
                services=device_info.get("services", [])
            )
            await self._send_message(response.model_dump())
            logger.info("Connected to device: %s", device_info.get("name"))

        except Exception as e:
            logger.error("Connection failed: %s", e)
            await self._send_error(f"Connection failed: {e}")

    async def _handle_disconnect(self, msg: BLEDisconnectMessage):
        """Handle BLE disconnect request."""
        try:
            if self.ble_manager and self.ble_manager.is_connected():
                await self.ble_manager.disconnect()
                response = BLEDisconnectedMessage(reason="User requested")
                await self._send_message(response.model_dump())
                logger.info("Disconnected from device")

        except Exception as e:
            logger.error("Disconnect failed: %s", e)
            await self._send_error(f"Disconnect failed: {e}")

    async def _handle_write(self, msg: BLEWriteMessage):
        """Handle BLE write request."""
        try:
            # Decode base64 data
            data = base64.b64decode(msg.data)
            
            await self.ble_manager.write_characteristic(
                characteristic_uuid=msg.characteristic_uuid,
                data=data,
                with_response=msg.with_response
            )
            
            # Send status update
            status = BLEStatusMessage(
                status="write_complete",
                message=f"Wrote {len(data)} bytes"
            )
            await self._send_message(status.model_dump())
            logger.debug("Write complete: %d bytes", len(data))

        except Exception as e:
            logger.error("Write failed: %s", e)
            await self._send_error(f"Write failed: {e}")

    async def _handle_subscribe(self, msg: BLESubscribeMessage):
        """Handle subscribe to notifications request."""
        try:
            await self.ble_manager.start_notify(msg.characteristic_uuid)
            
            status = BLEStatusMessage(
                status="subscribed",
                message=f"Subscribed to {msg.characteristic_uuid}"
            )
            await self._send_message(status.model_dump())
            logger.info("Subscribed to notifications")

        except Exception as e:
            logger.error("Subscribe failed: %s", e)
            await self._send_error(f"Subscribe failed: {e}")

    async def _handle_unsubscribe(self, msg: BLEUnsubscribeMessage):
        """Handle unsubscribe request."""
        try:
            await self.ble_manager.stop_notify(msg.characteristic_uuid)
            
            status = BLEStatusMessage(
                status="unsubscribed",
                message=f"Unsubscribed from {msg.characteristic_uuid}"
            )
            await self._send_message(status.model_dump())
            logger.info("Unsubscribed from notifications")

        except Exception as e:
            logger.error("Unsubscribe failed: %s", e)
            await self._send_error(f"Unsubscribe failed: {e}")

    async def _handle_discover(self, msg: BLEDiscoverMessage):
        """Handle device discovery request."""
        try:
            logger.info("Starting device discovery...")
            devices = await self.ble_manager.discover_devices(
                service_uuid=msg.service_uuid,
                timeout=msg.timeout,
                adapter=msg.adapter
            )
            
            response = BLEDiscoveredMessage(devices=devices)
            await self._send_message(response.model_dump())
            logger.info("Discovered %d devices", len(devices))

        except Exception as e:
            logger.error("Discovery failed: %s", e)
            await self._send_error(f"Discovery failed: {e}")

    async def _notification_handler(self):
        """Background task to forward BLE notifications to WebSocket."""
        try:
            while True:
                if self.ble_manager and self.ble_manager.is_connected():
                    # Get pending notifications
                    notifications = await self.ble_manager.get_notifications()
                    
                    for notif in notifications:
                        # Encode binary data as base64
                        data_b64 = base64.b64encode(notif["data"]).decode("ascii")
                        
                        msg = BLENotificationMessage(
                            characteristic_uuid=notif["uuid"],
                            data=data_b64
                        )
                        await self._send_message(msg.model_dump())
                
                # Small delay to avoid busy waiting
                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Notification handler error: %s", e)

    async def _send_message(self, message: dict[str, Any]):
        """Send message to WebSocket client."""
        try:
            await self.websocket.send_json(message)
        except Exception as e:
            logger.error("Failed to send message: %s", e)

    async def _send_error(self, error_message: str):
        """Send error message to client."""
        msg = BLEErrorMessage(error=error_message)
        await self._send_message(msg.model_dump())

    async def _cleanup(self):
        """Clean up resources."""
        # Cancel notification task
        if self.notification_task:
            self.notification_task.cancel()
            try:
                await self.notification_task
            except asyncio.CancelledError:
                pass

        # Disconnect BLE
        if self.ble_manager and self.ble_manager.is_connected():
            try:
                await self.ble_manager.disconnect()
            except Exception as e:
                logger.error("Error disconnecting: %s", e)

        logger.info("Cleanup complete")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        ble_manager = get_ble_manager()
        ble_available = True
    except BLENotAvailableError:
        ble_available = False

    return {
        "status": "healthy",
        "version": __version__,
        "ble_available": ble_available,
        "websocket_endpoint": "/ble/ws"
    }


@app.websocket("/ble/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for BLE proxy."""
    handler = BLEProxyHandler(websocket)
    await handler.handle_connection()


if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8081,
        log_level="info",
        access_log=True
    )
