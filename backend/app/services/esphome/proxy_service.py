"""Main ESPHome Bluetooth Proxy service coordinator."""

import asyncio
import logging
import time
from typing import Optional

from .device_manager import DeviceManager
from .proxy_manager import ProxyManager
from .schemas import DeviceConnectionResponse, DiscoveredDevice, ESPHomeProxy

logger = logging.getLogger(__name__)


class ESPHomeProxyService:
    """
    Singleton service for ESPHome Bluetooth proxy integration.

    Coordinates mDNS discovery, proxy connections, and device tracking.
    """

    _instance: Optional["ESPHomeProxyService"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the service (only once due to singleton pattern)."""
        if hasattr(self, "_initialized"):
            return

        from app.config import get_settings
        settings = get_settings()

        self._initialized = True
        self.proxy_manager = ProxyManager()
        self.device_manager = DeviceManager(device_expiry_seconds=settings.esphome_device_expiry)
        self._discovery_task: asyncio.Task | None = None
        self._cleanup_task: asyncio.Task | None = None
        self._advertisement_cache: dict[tuple[str, int], float] = {}
        self._cache_window = settings.esphome_cache_window

        logger.info("ESPHomeProxyService initialized")

    async def start(self) -> None:
        """Start the service (discovery and monitoring)."""
        if self._discovery_task and not self._discovery_task.done():
            logger.warning("Service already running")
            return

        logger.info("Starting ESPHome Proxy Service...")

        # Register manual proxy if configured (for Docker where mDNS doesn't work)
        from app.config import get_settings
        settings = get_settings()
        if settings.esphome_proxy_host and settings.esphome_proxy_name:
            manual_proxy = ESPHomeProxy(
                name=settings.esphome_proxy_name,
                address=settings.esphome_proxy_host,
                port=settings.esphome_proxy_port,
                connected=False,
            )
            self.proxy_manager.proxies[settings.esphome_proxy_name] = manual_proxy
            logger.info(
                "manual_proxy_registered",
                name=settings.esphome_proxy_name,
                host=settings.esphome_proxy_host,
                port=settings.esphome_proxy_port,
            )

        # Start mDNS discovery
        await self.proxy_manager.discover_proxies()

        # Start discovery loop
        self._discovery_task = asyncio.create_task(self._run_discovery_loop())

        # Start cleanup task
        self._cleanup_task = asyncio.create_task(self._run_cleanup_loop())

        logger.info("ESPHome Proxy Service started")

    async def stop(self) -> None:
        """Stop the service and cleanup resources."""
        logger.info("Stopping ESPHome Proxy Service...")

        # Cancel tasks
        if self._discovery_task:
            self._discovery_task.cancel()
            try:
                await self._discovery_task
            except asyncio.CancelledError:
                pass

        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Disconnect all proxies
        await self.proxy_manager.disconnect_all()

        logger.info("ESPHome Proxy Service stopped")

    async def _run_discovery_loop(self) -> None:
        """Main discovery loop - connects to proxies and subscribes to advertisements."""
        from app.config import get_settings
        settings = get_settings()

        while True:
            try:
                # Connect to all discovered proxies
                await self.proxy_manager.connect_all(
                    advertisement_callback=self._handle_advertisement
                )

                # Wait before next check
                await asyncio.sleep(settings.esphome_discovery_loop_interval)

            except asyncio.CancelledError:
                logger.info("Discovery loop cancelled")
                raise
            except Exception as e:
                logger.error(f"Error in discovery loop: {e}", exc_info=True)
                await asyncio.sleep(settings.esphome_discovery_loop_interval)

    async def _run_cleanup_loop(self) -> None:
        """Periodic cleanup of stale devices and cache entries."""
        from app.config import get_settings
        settings = get_settings()

        while True:
            try:
                await asyncio.sleep(settings.esphome_cleanup_loop_interval)

                # Cleanup stale devices
                self.device_manager.cleanup_stale_devices()

                # Cleanup old cache entries
                now = time.time()
                stale_keys = [
                    key
                    for key, timestamp in self._advertisement_cache.items()
                    if now - timestamp > self._cache_window * 10
                ]
                for key in stale_keys:
                    del self._advertisement_cache[key]

            except asyncio.CancelledError:
                logger.info("Cleanup loop cancelled")
                raise
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}", exc_info=True)

    def _handle_advertisement(self, advertisement, proxy_name: str) -> None:
        """
        Process a BLE advertisement from a proxy.

        Filters for SFP devices and updates device manager.

        Args:
            advertisement: BLE advertisement object from aioesphomeapi
            proxy_name: Name of proxy that received the advertisement
        """
        try:
            # Extract advertisement data
            mac = getattr(advertisement, "address", None)
            name = getattr(advertisement, "name", "") or ""
            rssi = getattr(advertisement, "rssi", -100)

            if not mac:
                return

            # Deduplicate advertisements
            cache_key = (mac, rssi)
            now = time.time()

            if cache_key in self._advertisement_cache:
                if now - self._advertisement_cache[cache_key] < self._cache_window:
                    return  # Duplicate, ignore

            self._advertisement_cache[cache_key] = now

            # Filter for SFP devices (case-insensitive)
            if "sfp" not in name.lower():
                logger.debug("non_sfp_device", name=name, mac=mac)
                return

            logger.debug(
                "sfp_advertisement",
                name=name,
                mac=mac,
                rssi=rssi,
                proxy=proxy_name,
            )

            # Update device manager
            self.device_manager.update_device(
                mac=mac,
                name=name,
                rssi=rssi,
                proxy_name=proxy_name,
                ad_data={
                    "address": mac,
                    "name": name,
                    "rssi": rssi,
                },
            )

        except Exception as e:
            logger.error(f"Error handling advertisement: {e}", exc_info=True)

    def get_discovered_devices(self) -> list[DiscoveredDevice]:
        """
        Get current list of discovered SFP devices.

        Returns:
            List of discovered devices (excludes stale devices)
        """
        return self.device_manager.get_devices(include_stale=False)

    def get_discovered_proxies(self) -> list[ESPHomeProxy]:
        """
        Get list of discovered ESPHome proxies.

        Returns:
            List of all proxies (both connected and disconnected)
        """
        return list(self.proxy_manager.proxies.values())

    async def connect_to_device(self, mac_address: str) -> DeviceConnectionResponse:
        """
        Connect to a BLE device via the best proxy and retrieve UUIDs.

        Args:
            mac_address: BLE MAC address

        Returns:
            DeviceConnectionResponse with service/characteristic UUIDs

        Raises:
            ValueError: If device not found or no suitable service
            RuntimeError: If proxy connection fails
        """
        logger.info("proxy_connect_start", mac=mac_address)

        # Normalize MAC
        mac_address = mac_address.upper().replace("-", ":")

        # Select best proxy
        proxy_name = self.device_manager.select_best_proxy(mac_address)
        if not proxy_name:
            raise ValueError(
                f"No proxy has seen device {mac_address}. "
                "Make sure the device is advertising and in range of an ESPHome proxy."
            )

        # Get proxy client
        client = self.proxy_manager.get_client(proxy_name)
        if not client:
            raise RuntimeError(f"Proxy {proxy_name} is not connected")

        logger.info("proxy_connect_selected", proxy=proxy_name, mac=mac_address)

        from app.config import get_settings
        settings = get_settings()

        try:
            # Connect to device with timeout
            await asyncio.wait_for(
                client.bluetooth_device_connect(mac_address),
                timeout=settings.esphome_connection_timeout
            )

            logger.info("proxy_connect_success", mac=mac_address)

            # Get GATT services
            services = await asyncio.wait_for(
                client.bluetooth_gatt_get_services(mac_address),
                timeout=settings.esphome_connection_timeout
            )

            logger.debug(f"Retrieved {len(services)} services from device")

            # Parse services to find notify + write characteristics
            service_uuid, notify_uuid, write_uuid = self._parse_gatt_services(services)

            # Get device name
            device = self.device_manager.get_device(mac_address)
            device_name = device.name if device else None

            logger.info(
                "proxy_uuid_success",
                mac=mac_address,
                service=service_uuid,
                notify=notify_uuid,
                write=write_uuid,
            )

            return DeviceConnectionResponse(
                service_uuid=service_uuid,
                notify_char_uuid=notify_uuid,
                write_char_uuid=write_uuid,
                device_name=device_name,
                proxy_used=proxy_name,
            )

        except TimeoutError as exc:
            logger.error(f"Timeout connecting to device {mac_address}")
            raise RuntimeError(
                "Connection timeout - device may be out of range or busy"
            ) from exc

        finally:
            # Always disconnect
            try:
                await client.bluetooth_device_disconnect(mac_address)
                logger.debug("proxy_disconnect", mac=mac_address)
            except Exception as e:
                logger.warning(f"Error disconnecting from device: {e}")

    def _parse_gatt_services(self, services) -> tuple[str, str, str]:
        """
        Parse GATT services to find notify/write characteristics.

        Looks for a service with BOTH a notify and write characteristic.

        Args:
            services: List of GATT services from aioesphomeapi

        Returns:
            Tuple of (service_uuid, notify_char_uuid, write_char_uuid)

        Raises:
            ValueError: If no suitable service found
        """
        for service in services:
            notify_char = None
            write_char = None

            # Check each characteristic in the service
            for char in service.characteristics:
                # Check properties (aioesphomeapi exposes these as attributes)
                if hasattr(char, "properties"):
                    props = char.properties
                    if hasattr(props, "notify") and props.notify:
                        notify_char = str(char.uuid)
                    if (hasattr(props, "write") and props.write) or \
                       (hasattr(props, "write_without_response") and props.write_without_response):
                        write_char = str(char.uuid)

            # If we found both, return this service
            if notify_char and write_char:
                logger.debug(
                    f"Found suitable service: {service.uuid} "
                    f"(notify={notify_char}, write={write_char})"
                )
                return (str(service.uuid), notify_char, write_char)

        raise ValueError(
            "No suitable GATT service found. "
            "Expected a service with both notify and write characteristics."
        )
