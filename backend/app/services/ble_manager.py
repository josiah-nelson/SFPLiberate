"""
BLE Manager Service for SFP Wizard communication.

Handles Bluetooth Low Energy connections using the bleak library.
Provides async methods for device discovery, connection, and GATT operations.

NOTE: This module requires bleak to be installed:
    poetry install -E ble-proxy
"""

import asyncio
import base64
import logging
from typing import Callable, Optional

try:
    from bleak import BleakClient, BleakScanner
    from bleak.backends.characteristic import BleakGATTCharacteristic
    from bleak.exc import BleakError

    BLEAK_AVAILABLE = True
except ImportError:
    BLEAK_AVAILABLE = False
    BleakClient = None  # type: ignore
    BleakScanner = None  # type: ignore
    BleakGATTCharacteristic = None  # type: ignore
    BleakError = Exception  # type: ignore

logger = logging.getLogger(__name__)


class BLENotAvailableError(Exception):
    """Raised when bleak library is not installed."""

    pass


class BLEManager:
    """
    Manages BLE connections to SFP Wizard devices.

    Attributes:
        client: Bleak BLE client instance
        device_address: Currently connected device address
        notification_callback: Callback for handling notifications
    """

    def __init__(self) -> None:
        """Initialize BLE manager."""
        if not BLEAK_AVAILABLE:
            raise BLENotAvailableError(
                "bleak library not installed. Install with: poetry install -E ble-proxy"
            )

        self.client: Optional[BleakClient] = None
        self.device_address: Optional[str] = None
        self.notification_callback: Optional[Callable[[str, bytes], None]] = None
        self._subscribed_characteristics: set[str] = set()

    @property
    def is_connected(self) -> bool:
        """Check if currently connected to a device."""
        return self.client is not None and self.client.is_connected

    async def discover_devices(
        self, service_uuid: Optional[str] = None, timeout: int = 5, adapter: Optional[str] = None
    ) -> list[dict[str, str]]:
        """
        Discover nearby BLE devices.

        Args:
            service_uuid: Optional service UUID filter
            timeout: Discovery timeout in seconds

        Returns:
            List of discovered devices with name, address, and rssi
        """
        if not BLEAK_AVAILABLE:
            raise BLENotAvailableError("bleak library not installed")

        logger.info(f"Starting BLE discovery (timeout={timeout}s, service={service_uuid})")

        try:
            if service_uuid:
                try:
                    devices = await BleakScanner.discover(
                        timeout=timeout, service_uuids=[service_uuid], adapter=adapter
                    )
                except TypeError:
                    # Older bleak without adapter kw
                    devices = await BleakScanner.discover(
                        timeout=timeout, service_uuids=[service_uuid]
                    )
            else:
                try:
                    devices = await BleakScanner.discover(timeout=timeout, adapter=adapter)
                except TypeError:
                    devices = await BleakScanner.discover(timeout=timeout)

            discovered = []
            for device in devices:
                discovered.append({
                    "name": device.name or "Unknown",
                    "address": device.address,
                    "rssi": device.rssi if hasattr(device, "rssi") else -100,
                })

            logger.info(f"Discovered {len(discovered)} devices")
            return discovered

        except Exception as e:
            logger.error(f"Discovery failed: {e}")
            raise

    async def connect(
        self, service_uuid: Optional[str] = None, device_address: Optional[str] = None, adapter: Optional[str] = None
    ) -> dict[str, any]:
        """
        Connect to a BLE device.

        Args:
            service_uuid: Optional service UUID to connect to (used for discovery when address not given)
            device_address: Optional specific device address (connect directly when provided)

        Returns:
            Dictionary with device info (name, address, services)

        Raises:
            BleakError: If connection fails
            ValueError: If no devices found
        """
        if not BLEAK_AVAILABLE:
            raise BLENotAvailableError("bleak library not installed")

        if self.is_connected:
            await self.disconnect()

        if not device_address:
            if not service_uuid:
                raise ValueError("Either device_address or service_uuid is required to connect")
            logger.info(f"Auto-discovering device with service {service_uuid}")
            devices = await self.discover_devices(service_uuid=service_uuid, timeout=10, adapter=adapter)
            if not devices:
                raise ValueError(f"No devices found with service {service_uuid}")
            device_address = devices[0]["address"]
            logger.info(f"Found device: {devices[0]['name']} ({device_address})")

        # Connect to device
        logger.info(f"Connecting to {device_address}...")
        try:
            self.client = BleakClient(
                device_address, disconnected_callback=self._on_disconnect, adapter=adapter
            )
        except TypeError:
            # Older bleak without adapter kw
            self.client = BleakClient(device_address, disconnected_callback=self._on_disconnect)

        try:
            await self.client.connect()
            self.device_address = device_address

            # Get services
            services = []
            if self.client.services:
                services = [str(service.uuid) for service in self.client.services]

            device_name = (
                self.client._device_info.get("name", "Unknown")
                if hasattr(self.client, "_device_info")
                else "Unknown"
            )

            logger.info(f"Connected to {device_name} ({device_address})")
            logger.info(f"Available services: {len(services)}")

            return {
                "name": device_name,
                "address": device_address,
                "services": services,
            }

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self.client = None
            self.device_address = None
            raise

    async def disconnect(self) -> None:
        """Disconnect from current device."""
        if self.client and self.client.is_connected:
            logger.info(f"Disconnecting from {self.device_address}")

            # Unsubscribe from all characteristics
            for char_uuid in list(self._subscribed_characteristics):
                try:
                    await self.client.stop_notify(char_uuid)
                except Exception as e:
                    logger.warning(f"Error unsubscribing from {char_uuid}: {e}")

            self._subscribed_characteristics.clear()

            try:
                await self.client.disconnect()
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")

        self.client = None
        self.device_address = None

    async def write(
        self, characteristic_uuid: str, data: bytes, with_response: bool = False
    ) -> None:
        """
        Write data to a characteristic.

        Args:
            characteristic_uuid: UUID of characteristic to write to
            data: Raw bytes to write
            with_response: Whether to wait for write response

        Raises:
            RuntimeError: If not connected
            BleakError: If write fails
        """
        if not self.is_connected:
            raise RuntimeError("Not connected to any device")

        logger.debug(
            f"Writing {len(data)} bytes to {characteristic_uuid} "
            f"(with_response={with_response})"
        )

        try:
            await self.client.write_gatt_char(
                characteristic_uuid, data, response=with_response
            )
        except Exception as e:
            logger.error(f"Write failed: {e}")
            raise

    async def subscribe(
        self, characteristic_uuid: str, callback: Callable[[str, bytes], None]
    ) -> None:
        """
        Subscribe to notifications from a characteristic.

        Args:
            characteristic_uuid: UUID of characteristic to subscribe to
            callback: Function to call when notification received (char_uuid, data)

        Raises:
            RuntimeError: If not connected
            BleakError: If subscribe fails
        """
        if not self.is_connected:
            raise RuntimeError("Not connected to any device")

        logger.info(f"Subscribing to notifications from {characteristic_uuid}")

        def notification_handler(sender: BleakGATTCharacteristic, data: bytearray) -> None:
            """Internal notification handler."""
            char_uuid = str(sender.uuid)
            callback(char_uuid, bytes(data))

        try:
            await self.client.start_notify(characteristic_uuid, notification_handler)
            self._subscribed_characteristics.add(characteristic_uuid)
        except Exception as e:
            logger.error(f"Subscribe failed: {e}")
            raise

    async def unsubscribe(self, characteristic_uuid: str) -> None:
        """
        Unsubscribe from notifications.

        Args:
            characteristic_uuid: UUID of characteristic to unsubscribe from

        Raises:
            RuntimeError: If not connected
        """
        if not self.is_connected:
            raise RuntimeError("Not connected to any device")

        if characteristic_uuid not in self._subscribed_characteristics:
            logger.warning(f"Not subscribed to {characteristic_uuid}")
            return

        logger.info(f"Unsubscribing from {characteristic_uuid}")

        try:
            await self.client.stop_notify(characteristic_uuid)
            self._subscribed_characteristics.discard(characteristic_uuid)
        except Exception as e:
            logger.error(f"Unsubscribe failed: {e}")
            raise

    def _on_disconnect(self, client: BleakClient) -> None:
        """Called when device disconnects."""
        logger.warning(f"Device {self.device_address} disconnected")
        self._subscribed_characteristics.clear()
        self.client = None
        self.device_address = None

    async def cleanup(self) -> None:
        """Clean up resources."""
        if self.is_connected:
            await self.disconnect()


# Singleton instance
_ble_manager_instance: Optional[BLEManager] = None


def get_ble_manager() -> BLEManager:
    """
    Get or create singleton BLE manager instance.

    Returns:
        BLEManager instance

    Raises:
        BLENotAvailableError: If bleak is not installed
    """
    global _ble_manager_instance

    if _ble_manager_instance is None:
        _ble_manager_instance = BLEManager()

    return _ble_manager_instance
