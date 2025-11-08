"""ESPHome proxy discovery and connection management via mDNS."""

import asyncio
import logging
from typing import Dict, Optional, Callable

# Optional zeroconf dependency (only needed for ESPHome proxy mode)
try:
    from zeroconf import ServiceBrowser, ServiceStateChange, Zeroconf
    from zeroconf.asyncio import AsyncZeroconf
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
    ServiceBrowser = None  # type: ignore
    ServiceStateChange = None  # type: ignore
    Zeroconf = None  # type: ignore
    AsyncZeroconf = None  # type: ignore

# Optional aioesphomeapi dependency (only needed for ESPHome proxy mode)
try:
    from aioesphomeapi import APIClient, APIConnectionError
    ESPHOME_AVAILABLE = True
except ImportError:
    ESPHOME_AVAILABLE = False
    APIClient = None  # type: ignore
    APIConnectionError = Exception  # type: ignore

from .schemas import ESPHomeProxy

logger = logging.getLogger(__name__)


class ProxyManager:
    """Manages ESPHome proxy discovery and connections via mDNS."""

    def __init__(self):
        """Initialize proxy manager."""
        if not ESPHOME_AVAILABLE:
            raise ImportError(
                "aioesphomeapi not installed. Install with: pip install aioesphomeapi"
            )
        if not ZEROCONF_AVAILABLE:
            raise ImportError(
                "zeroconf not installed. Install with: pip install zeroconf"
            )

        self.proxies: Dict[str, ESPHomeProxy] = {}
        self.clients: Dict[str, APIClient] = {}
        self.zeroconf: Optional[AsyncZeroconf] = None
        self._browser: Optional[ServiceBrowser] = None
        self._advertisement_callback: Optional[Callable] = None

    def _on_service_state_change(
        self, zeroconf: Zeroconf, service_type: str, name: str, state_change: ServiceStateChange
    ) -> None:
        """Handle mDNS service discovery events."""
        if state_change is ServiceStateChange.Added:
            info = zeroconf.get_service_info(service_type, name)
            if info and info.addresses:
                # Convert IP address from bytes to string
                address = ".".join(str(b) for b in info.addresses[0])
                proxy_name = name.replace(f".{service_type}", "")

                proxy = ESPHomeProxy(
                    name=proxy_name,
                    address=address,
                    port=info.port,
                    connected=False,
                )
                self.proxies[proxy_name] = proxy
                logger.info(f"Discovered ESPHome proxy: {proxy_name} @ {address}:{info.port}")

        elif state_change is ServiceStateChange.Removed:
            proxy_name = name.replace(f".{service_type}", "")
            if proxy_name in self.proxies:
                # Actively disconnect the client to release resources
                if proxy_name in self.clients:
                    asyncio.create_task(self.disconnect_proxy(proxy_name))
                del self.proxies[proxy_name]
                logger.info(f"ESPHome proxy removed: {proxy_name}")

    async def discover_proxies(self) -> None:
        """Start mDNS discovery for ESPHome devices."""
        if self.zeroconf:
            logger.debug("mDNS discovery already running")
            return  # Already discovering

        logger.info("Starting mDNS discovery for ESPHome proxies (_esphomelib._tcp.local.)")
        self.zeroconf = AsyncZeroconf()
        self._browser = ServiceBrowser(
            self.zeroconf.zeroconf,
            "_esphomelib._tcp.local.",
            handlers=[self._on_service_state_change],
        )

    async def connect_all(self, advertisement_callback: Callable) -> None:
        """
        Connect to all discovered proxies and subscribe to BLE advertisements.

        Args:
            advertisement_callback: Function to call when BLE advertisement received.
                                   Signature: callback(advertisement, proxy_name: str)
        """
        self._advertisement_callback = advertisement_callback

        for name, proxy in list(self.proxies.items()):
            if name not in self.clients:
                try:
                    await self.connect_proxy(name, proxy)
                except Exception as e:
                    logger.error(f"Failed to connect to proxy {name}: {e}", exc_info=True)

    async def connect_proxy(self, name: str, proxy: ESPHomeProxy) -> None:
        """
        Connect to a specific ESPHome proxy and subscribe to BLE advertisements.

        Args:
            name: Proxy name (identifier)
            proxy: Proxy metadata
        """
        from app.config import get_settings
        settings = get_settings()

        try:
            logger.info(f"Connecting to ESPHome proxy: {name} @ {proxy.address}:{proxy.port}")

            # Create API client
            client = APIClient(
                address=proxy.address,
                port=proxy.port,
                password=settings.esphome_proxy_password,
            )

            # Connect with timeout
            await asyncio.wait_for(
                client.connect(login=True),
                timeout=settings.esphome_connection_timeout
            )

            logger.info(f"Connected to proxy: {name}")

            # Subscribe to BLE advertisements
            def on_bluetooth_le_advertisement(advertisement):
                """Forward advertisement to callback with proxy name."""
                if self._advertisement_callback:
                    try:
                        self._advertisement_callback(advertisement, proxy_name=name)
                    except Exception as e:
                        logger.error(f"Error in advertisement callback: {e}", exc_info=True)

            await client.subscribe_bluetooth_le_advertisements(
                on_bluetooth_le_advertisement
            )

            logger.info(f"Subscribed to BLE advertisements from proxy: {name}")

            # Store client and update status
            self.clients[name] = client
            proxy.connected = True

        except asyncio.TimeoutError:
            logger.error(f"Timeout connecting to proxy {name}")
            proxy.connected = False
        except APIConnectionError as e:
            logger.error(f"Connection error for proxy {name}: {e}")
            proxy.connected = False
        except Exception as e:
            logger.error(f"Unexpected error connecting to proxy {name}: {e}", exc_info=True)
            proxy.connected = False

    async def disconnect_proxy(self, name: str) -> None:
        """Disconnect from a specific proxy."""
        if name in self.clients:
            try:
                client = self.clients[name]
                await client.disconnect()
                logger.info(f"Disconnected from proxy: {name}")
            except Exception as e:
                logger.warning(f"Error disconnecting from proxy {name}: {e}")
            finally:
                del self.clients[name]

            if name in self.proxies:
                self.proxies[name].connected = False

    async def disconnect_all(self) -> None:
        """Disconnect from all proxies and stop mDNS discovery."""
        logger.info("Disconnecting from all ESPHome proxies...")

        # Disconnect all clients
        for name in list(self.clients.keys()):
            await self.disconnect_proxy(name)

        # Stop mDNS discovery
        if self._browser:
            self._browser.cancel()
            self._browser = None

        if self.zeroconf:
            await self.zeroconf.async_close()
            self.zeroconf = None

        logger.info("All proxies disconnected")

    def get_client(self, proxy_name: str) -> Optional[APIClient]:
        """
        Get API client for a specific proxy.

        Args:
            proxy_name: Name of the proxy

        Returns:
            APIClient instance or None if not connected
        """
        return self.clients.get(proxy_name)

    def get_connected_proxies(self) -> Dict[str, ESPHomeProxy]:
        """Get dictionary of all currently connected proxies."""
        return {
            name: proxy
            for name, proxy in self.proxies.items()
            if proxy.connected
        }
