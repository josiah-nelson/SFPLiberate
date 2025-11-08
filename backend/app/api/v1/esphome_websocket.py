"""WebSocket endpoint for ESPHome BLE proxy communication."""

import asyncio
import base64
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.services.esphome import ESPHomeProxyService
from app.services.esphome.connection_manager import ConnectionManager
from app.services.esphome.websocket_schemas import (
    BLEConnectedMessage,
    BLEConnectMessage,
    BLEDisconnectedMessage,
    BLEDisconnectMessage,
    BLEErrorMessage,
    BLEMessageType,
    BLENotificationMessage,
    BLEStatusMessage,
    BLESubscribeMessage,
    BLEUnsubscribeMessage,
    BLEWriteMessage,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class ESPHomeWebSocketHandler:
    """Handles WebSocket connection and BLE operations for a single client."""

    def __init__(self, websocket: WebSocket):
        """
        Initialize handler.

        Args:
            websocket: FastAPI WebSocket connection
        """
        self.websocket = websocket
        self.client_id = str(uuid.uuid4())
        self.connection_manager = ConnectionManager()
        self.proxy_service = ESPHomeProxyService()
        self.running = False

    async def handle(self) -> None:
        """Main handler loop for WebSocket connection."""
        await self.websocket.accept()
        self.running = True

        logger.info(f"WebSocket client connected: {self.client_id}")

        try:
            # Send initial status
            await self.send_status(connected=False, message="ESPHome BLE Proxy ready")

            # Main message loop
            while self.running:
                try:
                    data = await self.websocket.receive_text()
                    await self.handle_message(data)
                except WebSocketDisconnect:
                    logger.info(f"Client disconnected: {self.client_id}")
                    break
                except Exception as e:
                    logger.error(f"Error handling message: {e}", exc_info=True)
                    await self.send_error(f"Error handling message: {e}")

        finally:
            # Cleanup
            if self.connection_manager.is_connected(self.client_id):
                try:
                    await self.connection_manager.disconnect_device(self.client_id)
                except Exception as e:
                    logger.error(f"Error during cleanup: {e}")
            self.running = False

    async def handle_message(self, data: str) -> None:
        """
        Handle incoming WebSocket message.

        Args:
            data: JSON string message from client
        """
        try:
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == BLEMessageType.CONNECT:
                await self.handle_connect(BLEConnectMessage(**message))
            elif msg_type == BLEMessageType.DISCONNECT:
                await self.handle_disconnect(BLEDisconnectMessage(**message))
            elif msg_type == BLEMessageType.WRITE:
                await self.handle_write(BLEWriteMessage(**message))
            elif msg_type == BLEMessageType.SUBSCRIBE:
                await self.handle_subscribe(BLESubscribeMessage(**message))
            elif msg_type == BLEMessageType.UNSUBSCRIBE:
                await self.handle_unsubscribe(BLEUnsubscribeMessage(**message))
            else:
                await self.send_error(f"Unknown message type: {msg_type}")

        except ValidationError as e:
            await self.send_error(f"Invalid message format: {e}")
        except json.JSONDecodeError as e:
            await self.send_error(f"Invalid JSON: {e}")

    async def handle_connect(self, message: BLEConnectMessage) -> None:
        """Handle connect request."""
        try:
            mac_address = message.mac_address.upper().replace("-", ":")
            logger.info(f"Connect request for device {mac_address}")

            # If UUIDs not provided, discover them first
            if not all([message.service_uuid, message.notify_char_uuid, message.write_char_uuid]):
                logger.info("UUIDs not provided, discovering via ESPHome...")
                uuid_response = await self.proxy_service.connect_to_device(mac_address)
                service_uuid = uuid_response.service_uuid
                notify_char_uuid = uuid_response.notify_char_uuid
                write_char_uuid = uuid_response.write_char_uuid
                proxy_name = uuid_response.proxy_used
                device_name = uuid_response.device_name
            else:
                service_uuid = message.service_uuid
                notify_char_uuid = message.notify_char_uuid
                write_char_uuid = message.write_char_uuid

                # Select best proxy
                proxy_name = self.proxy_service.device_manager.select_best_proxy(mac_address)
                if not proxy_name:
                    raise ValueError(
                        f"No proxy has seen device {mac_address}. "
                        "Make sure the device is advertising and in range."
                    )

                device = self.proxy_service.device_manager.get_device(mac_address)
                device_name = device.name if device else None

            # Get proxy client
            client = self.proxy_service.proxy_manager.get_client(proxy_name)
            if not client:
                raise RuntimeError(f"Proxy {proxy_name} is not connected")

            # Notification callback
            def on_notification(char_uuid: str, data: bytes):
                """Forward notifications to WebSocket client."""
                response = BLENotificationMessage(
                    characteristic_uuid=char_uuid,
                    data=base64.b64encode(data).decode("utf-8"),
                )
                asyncio.create_task(self.send_message(response.model_dump()))

            # Establish persistent connection
            await self.connection_manager.connect_device(
                client_id=self.client_id,
                mac_address=mac_address,
                proxy_name=proxy_name,
                client=client,
                service_uuid=service_uuid,
                notify_char_uuid=notify_char_uuid,
                write_char_uuid=write_char_uuid,
                device_name=device_name,
                notification_callback=on_notification,
            )

            # Send success response
            response = BLEConnectedMessage(
                device_name=device_name,
                device_address=mac_address,
                service_uuid=service_uuid,
                notify_char_uuid=notify_char_uuid,
                write_char_uuid=write_char_uuid,
                proxy_used=proxy_name,
            )
            await self.send_message(response.model_dump())

        except ValueError as e:
            logger.warning(f"Connect failed (client error): {e}")
            await self.send_error(str(e))
        except RuntimeError as e:
            logger.error(f"Connect failed (proxy error): {e}")
            await self.send_error(str(e))
        except Exception as e:
            logger.error(f"Unexpected connect error: {e}", exc_info=True)
            await self.send_error(f"Connection failed: {e}")

    async def handle_disconnect(self, message: BLEDisconnectMessage) -> None:
        """Handle disconnect request."""
        try:
            await self.connection_manager.disconnect_device(self.client_id)
            response = BLEDisconnectedMessage(reason="User requested disconnect")
            await self.send_message(response.model_dump())

        except Exception as e:
            logger.error(f"Disconnect failed: {e}")
            await self.send_error(f"Disconnect failed: {e}")

    async def handle_write(self, message: BLEWriteMessage) -> None:
        """Handle write request."""
        try:
            # Decode base64 data
            data = base64.b64decode(message.data)

            # Write to characteristic
            await self.connection_manager.write_characteristic(
                client_id=self.client_id,
                characteristic_uuid=message.characteristic_uuid,
                data=data,
                with_response=message.with_response,
            )

            # Send status confirmation
            await self.send_status(
                connected=True,
                message=f"Wrote {len(data)} bytes to {message.characteristic_uuid}",
            )

        except ValueError as e:
            await self.send_error(str(e))
        except RuntimeError as e:
            logger.error(f"Write failed: {e}")
            await self.send_error(f"Write failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected write error: {e}", exc_info=True)
            await self.send_error(f"Write error: {e}")

    async def handle_subscribe(self, message: BLESubscribeMessage) -> None:
        """Handle subscribe request."""
        # Note: Subscription is handled automatically on connect
        # This is a no-op for ESPHome proxy (subscriptions set up in connect_device)
        await self.send_status(
            connected=True,
            message=f"Subscribed to {message.characteristic_uuid} (active on connect)",
        )

    async def handle_unsubscribe(self, message: BLEUnsubscribeMessage) -> None:
        """Handle unsubscribe request."""
        # ESPHome doesn't support selective unsubscribe - would need to disconnect
        await self.send_status(
            connected=True,
            message=(
                f"Unsubscribe from {message.characteristic_uuid} "
                "(disconnect to stop notifications)"
            ),
        )

    async def send_message(self, message: dict[str, Any]) -> None:
        """Send a message to the WebSocket client."""
        try:
            await self.websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            self.running = False

    async def send_error(self, error: str, details: dict[str, Any] | None = None) -> None:
        """Send an error message to the client."""
        response = BLEErrorMessage(error=error, details=details)
        await self.send_message(response.model_dump())

    async def send_status(self, connected: bool, message: str) -> None:
        """Send a status message to the client."""
        device_name = None
        if self.connection_manager.is_connected(self.client_id):
            conn = self.connection_manager.get_connection(self.client_id)
            device_name = conn.device_name if conn else None

        response = BLEStatusMessage(
            connected=connected,
            device_name=device_name,
            message=message,
        )
        await self.send_message(response.model_dump())


@router.websocket("/ws")
async def esphome_websocket(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for ESPHome BLE proxy communication.

    Provides full BLE functionality for Safari/iOS users who don't have
    Web Bluetooth API support.

    Path: /api/v1/esphome/ws

    Message types:
    - connect: Connect to BLE device
    - disconnect: Disconnect from device
    - write: Write data to characteristic
    - subscribe: Subscribe to notifications (automatic on connect)
    - unsubscribe: Unsubscribe from notifications

    Responses:
    - connected: Connection successful
    - disconnected: Device disconnected
    - notification: BLE notification received
    - status: General status message
    - error: Error occurred
    """
    handler = ESPHomeWebSocketHandler(websocket)
    await handler.handle()
