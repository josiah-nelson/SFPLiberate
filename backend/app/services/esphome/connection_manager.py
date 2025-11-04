"""Manages persistent BLE device connections via ESPHome proxies."""

import asyncio
import logging
from typing import Optional, Callable, Dict
from dataclasses import dataclass

try:
    from aioesphomeapi import APIClient
    ESPHOME_AVAILABLE = True
except ImportError:
    ESPHOME_AVAILABLE = False
    APIClient = None  # type: ignore

logger = logging.getLogger(__name__)


@dataclass
class ActiveConnection:
    """Represents an active BLE device connection."""

    mac_address: str
    device_name: Optional[str]
    proxy_name: str
    client: "APIClient"
    service_uuid: str
    notify_char_uuid: str
    write_char_uuid: str
    notify_handle: int  # ESPHome uses handles, not UUIDs
    write_handle: int
    notification_callback: Optional[Callable] = None


class ConnectionManager:
    """
    Manages persistent BLE device connections via ESPHome proxies (Singleton).

    Unlike the discovery-only proxy_service, this maintains long-lived
    connections to devices for ongoing communication (read/write/notify).

    This is a singleton - only one instance exists across all WebSocket connections.
    """

    _instance: Optional["ConnectionManager"] = None

    def __new__(cls):
        """Singleton pattern - return existing instance if available."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize connection manager (only once due to singleton)."""
        # Skip initialization if already done
        if hasattr(self, "_initialized"):
            return

        if not ESPHOME_AVAILABLE:
            raise ImportError(
                "aioesphomeapi not installed. Install with: pip install aioesphomeapi"
            )

        self.connections: Dict[str, ActiveConnection] = {}  # Key: client_id (unique per WebSocket)
        self._initialized = True

    async def connect_device(
        self,
        client_id: str,
        mac_address: str,
        proxy_name: str,
        client: "APIClient",
        service_uuid: str,
        notify_char_uuid: str,
        write_char_uuid: str,
        device_name: Optional[str] = None,
        notification_callback: Optional[Callable] = None,
    ) -> None:
        """
        Establish persistent connection to a BLE device.

        Args:
            client_id: Unique identifier for this WebSocket client
            mac_address: Device MAC address
            proxy_name: ESPHome proxy to use
            client: Connected APIClient instance
            service_uuid: GATT service UUID
            notify_char_uuid: Notification characteristic UUID
            write_char_uuid: Write characteristic UUID
            device_name: Optional device name
            notification_callback: Function to call on notifications

        Raises:
            RuntimeError: If connection fails
        """
        from app.config import get_settings
        settings = get_settings()

        # Disconnect existing connection for this client
        if client_id in self.connections:
            await self.disconnect_device(client_id)

        logger.info(f"Connecting to device {mac_address} via proxy {proxy_name} for client {client_id}")

        try:
            # Connect to device
            await asyncio.wait_for(
                client.bluetooth_device_connect(mac_address),
                timeout=settings.esphome_connection_timeout,
            )

            logger.info(f"Connected to device {mac_address}")

            # Discover services to get characteristic handles
            services = await asyncio.wait_for(
                client.bluetooth_gatt_get_services(mac_address),
                timeout=settings.esphome_connection_timeout,
            )

            # Find handles for our characteristics
            notify_handle, write_handle = self._find_characteristic_handles(
                services, notify_char_uuid, write_char_uuid
            )

            logger.info(
                f"Discovered handles: notify={notify_handle}, write={write_handle}"
            )

            # Subscribe to notifications if callback provided
            if notification_callback:
                await self._subscribe_notifications(
                    client, mac_address, notify_handle, notify_char_uuid, notification_callback
                )

            # Store connection
            self.connections[client_id] = ActiveConnection(
                mac_address=mac_address,
                device_name=device_name,
                proxy_name=proxy_name,
                client=client,
                service_uuid=service_uuid,
                notify_char_uuid=notify_char_uuid,
                write_char_uuid=write_char_uuid,
                notify_handle=notify_handle,
                write_handle=write_handle,
                notification_callback=notification_callback,
            )

            logger.info(f"Device connection established for client {client_id}")

        except asyncio.TimeoutError:
            logger.error(f"Timeout connecting to device {mac_address}")
            raise RuntimeError("Connection timeout - device may be out of range or busy")
        except Exception as e:
            logger.error(f"Failed to connect to device {mac_address}: {e}", exc_info=True)
            raise RuntimeError(f"Connection failed: {e}")

    def _find_characteristic_handles(
        self, services, notify_uuid: str, write_uuid: str
    ) -> tuple[int, int]:
        """
        Find characteristic handles from service discovery.

        Args:
            services: GATT services from bluetooth_gatt_get_services
            notify_uuid: Notify characteristic UUID to find
            write_uuid: Write characteristic UUID to find

        Returns:
            Tuple of (notify_handle, write_handle)

        Raises:
            ValueError: If characteristics not found
        """
        notify_handle = None
        write_handle = None

        # Normalize UUIDs for comparison
        notify_uuid_normalized = notify_uuid.upper().replace("-", "")
        write_uuid_normalized = write_uuid.upper().replace("-", "")

        for service in services:
            for char in service.characteristics:
                char_uuid_normalized = str(char.uuid).upper().replace("-", "")

                if char_uuid_normalized == notify_uuid_normalized:
                    notify_handle = char.handle
                    logger.debug(f"Found notify characteristic: {char.uuid} -> handle {char.handle}")

                if char_uuid_normalized == write_uuid_normalized:
                    write_handle = char.handle
                    logger.debug(f"Found write characteristic: {char.uuid} -> handle {char.handle}")

        if notify_handle is None:
            raise ValueError(f"Notify characteristic {notify_uuid} not found in services")

        if write_handle is None:
            raise ValueError(f"Write characteristic {write_uuid} not found in services")

        return notify_handle, write_handle

    async def disconnect_device(self, client_id: str) -> None:
        """
        Disconnect from a BLE device.

        Args:
            client_id: Client identifier
        """
        if client_id not in self.connections:
            logger.warning(f"No active connection for client {client_id}")
            return

        connection = self.connections[client_id]
        logger.info(f"Disconnecting device {connection.mac_address} for client {client_id}")

        try:
            # Unsubscribe from notifications using handle
            if connection.notification_callback:
                try:
                    await connection.client.bluetooth_gatt_notify(
                        address=connection.mac_address,
                        handle=connection.notify_handle,
                        enable=False,
                    )
                    logger.debug(f"Unsubscribed from notifications (handle={connection.notify_handle})")
                except Exception as e:
                    logger.warning(f"Error unsubscribing from notifications: {e}")

            # Disconnect from device
            await connection.client.bluetooth_device_disconnect(connection.mac_address)
            logger.info(f"Disconnected from device {connection.mac_address}")

        except Exception as e:
            logger.warning(f"Error disconnecting device: {e}")

        finally:
            del self.connections[client_id]

    async def write_characteristic(
        self,
        client_id: str,
        characteristic_uuid: str,
        data: bytes,
        with_response: bool = True,
    ) -> None:
        """
        Write data to a characteristic.

        Args:
            client_id: Client identifier
            characteristic_uuid: Target characteristic UUID
            data: Data to write (bytes)
            with_response: Wait for write confirmation

        Raises:
            ValueError: If no active connection
            RuntimeError: If write fails
        """
        if client_id not in self.connections:
            raise ValueError("No active connection - connect first")

        connection = self.connections[client_id]

        # Verify this is the write characteristic
        if characteristic_uuid.upper() != connection.write_char_uuid.upper():
            logger.warning(
                f"Write to non-standard characteristic {characteristic_uuid} "
                f"(expected {connection.write_char_uuid})"
            )

        logger.debug(
            f"Writing {len(data)} bytes to characteristic {characteristic_uuid} "
            f"on device {connection.mac_address}"
        )

        try:
            # ESPHome API: bluetooth_gatt_write (uses handle, not UUID)
            await connection.client.bluetooth_gatt_write(
                address=connection.mac_address,
                handle=connection.write_handle,
                data=list(data),  # ESPHome expects list[int]
                response=with_response,
            )

            logger.debug(f"Write completed to {characteristic_uuid} (handle={connection.write_handle})")

        except Exception as e:
            logger.error(f"Write failed: {e}", exc_info=True)
            raise RuntimeError(f"Write failed: {e}")

    async def _subscribe_notifications(
        self,
        client: "APIClient",
        mac_address: str,
        notify_handle: int,
        notify_char_uuid: str,
        callback: Callable,
    ) -> None:
        """
        Subscribe to characteristic notifications.

        Args:
            client: ESPHome API client
            mac_address: Device MAC address
            notify_handle: Characteristic handle (not UUID)
            notify_char_uuid: Characteristic UUID to send to the frontend
            callback: Function to call on notifications
        """
        logger.info(f"Subscribing to notifications from handle {notify_handle} on {mac_address}")

        try:
            # ESPHome notification callback
            def on_notification(address: str, handle: int, data: bytes):
                """Handle incoming notification."""
                if address.upper() == mac_address.upper() and handle == notify_handle:
                    logger.debug(f"Notification received: {len(data)} bytes from handle {handle}")
                    try:
                        # Convert list[int] to bytes if needed
                        if isinstance(data, list):
                            data = bytes(data)
                        # Pass characteristic UUID to frontend, not handle
                        callback(notify_char_uuid, data)
                    except Exception as e:
                        logger.error(f"Error in notification callback: {e}", exc_info=True)

            # Register the callback to receive notifications from the device
            await client.subscribe_bluetooth_gatt_notifications(on_notification)

            # Enable notifications on the characteristic
            await client.bluetooth_gatt_notify(
                address=mac_address,
                handle=notify_handle,
                enable=True,
            )

            logger.info(f"Subscribed to notifications from handle {notify_handle}")

        except Exception as e:
            logger.error(f"Failed to subscribe to notifications: {e}", exc_info=True)
            raise RuntimeError(f"Subscription failed: {e}")

    def get_connection(self, client_id: str) -> Optional[ActiveConnection]:
        """Get active connection for a client."""
        return self.connections.get(client_id)

    def is_connected(self, client_id: str) -> bool:
        """Check if client has an active connection."""
        return client_id in self.connections

    async def disconnect_all(self) -> None:
        """Disconnect all active connections."""
        logger.info(f"Disconnecting {len(self.connections)} active connections...")

        for client_id in list(self.connections.keys()):
            await self.disconnect_device(client_id)

        logger.info("All connections disconnected")
