"""BLE device discovery and RSSI tracking."""

import logging
from datetime import datetime, timedelta

from .schemas import DiscoveredDevice

logger = logging.getLogger(__name__)


class DeviceManager:
    """Manages discovered BLE devices and tracks RSSI per proxy."""

    def __init__(self, device_expiry_seconds: int = 30):
        """
        Initialize device manager.

        Args:
            device_expiry_seconds: Time after which a device is considered stale
        """
        self.devices: dict[str, DiscoveredDevice] = {}
        self.rssi_by_proxy: dict[str, dict[str, int]] = {}  # {mac: {proxy_name: rssi}}
        self.device_expiry_seconds = device_expiry_seconds

    def update_device(
        self, mac: str, name: str, rssi: int, proxy_name: str, ad_data: dict | None = None
    ) -> None:
        """
        Update or add a discovered device.

        Args:
            mac: Device MAC address
            name: Device name from advertisement
            rssi: Signal strength (dBm)
            proxy_name: Name of proxy that received advertisement
            ad_data: Optional raw advertisement data
        """
        # Normalize MAC address
        mac = mac.upper().replace("-", ":")

        # Update RSSI tracking
        if mac not in self.rssi_by_proxy:
            self.rssi_by_proxy[mac] = {}
        self.rssi_by_proxy[mac][proxy_name] = rssi

        # Find best proxy (highest RSSI)
        best_proxy_name, best_rssi = max(
            self.rssi_by_proxy[mac].items(), key=lambda x: x[1]
        )

        # Create or update device
        if mac in self.devices:
            # Update existing device
            device = self.devices[mac]
            device.rssi = best_rssi
            device.best_proxy = best_proxy_name
            device.last_seen = datetime.utcnow()
            logger.debug(
                f"Updated device {name} ({mac}): RSSI={best_rssi} via {best_proxy_name}"
            )
        else:
            # Add new device
            device = DiscoveredDevice(
                mac_address=mac,
                name=name,
                rssi=best_rssi,
                best_proxy=best_proxy_name,
                last_seen=datetime.utcnow(),
                advertisement_data=ad_data,
            )
            self.devices[mac] = device
            logger.info(
                f"Discovered new device: {name} ({mac}) RSSI={best_rssi} via {best_proxy_name}"
            )

    def get_devices(self, include_stale: bool = False) -> list[DiscoveredDevice]:
        """
        Get all discovered devices.

        Args:
            include_stale: Whether to include devices not seen recently

        Returns:
            List of discovered devices
        """
        if include_stale:
            return list(self.devices.values())

        # Filter out stale devices
        cutoff = datetime.utcnow() - timedelta(seconds=self.device_expiry_seconds)
        return [
            device
            for device in self.devices.values()
            if device.last_seen > cutoff
        ]

    def get_device(self, mac: str) -> DiscoveredDevice | None:
        """
        Get a specific device by MAC address.

        Args:
            mac: Device MAC address

        Returns:
            Device info or None if not found
        """
        mac = mac.upper().replace("-", ":")
        return self.devices.get(mac)

    def select_best_proxy(self, mac: str) -> str | None:
        """
        Select the proxy with the best RSSI for a device.

        Args:
            mac: Device MAC address

        Returns:
            Proxy name with best signal, or None if device not found
        """
        mac = mac.upper().replace("-", ":")

        if mac not in self.rssi_by_proxy:
            logger.warning(f"No proxy has seen device {mac}")
            return None

        # Find proxy with highest RSSI
        best_proxy = max(self.rssi_by_proxy[mac].items(), key=lambda x: x[1])
        logger.debug(
            f"Selected proxy '{best_proxy[0]}' for device {mac} (RSSI: {best_proxy[1]})"
        )
        return best_proxy[0]

    def get_proxy_rssi(self, mac: str, proxy_name: str) -> int | None:
        """
        Get the RSSI value for a device from a specific proxy.

        Args:
            mac: Device MAC address
            proxy_name: Proxy name

        Returns:
            RSSI value or None
        """
        mac = mac.upper().replace("-", ":")
        return self.rssi_by_proxy.get(mac, {}).get(proxy_name)

    def cleanup_stale_devices(self) -> int:
        """
        Remove devices that haven't been seen recently.

        Returns:
            Number of devices removed
        """
        cutoff = datetime.utcnow() - timedelta(seconds=self.device_expiry_seconds)
        stale_macs = [
            mac
            for mac, device in self.devices.items()
            if device.last_seen < cutoff
        ]

        for mac in stale_macs:
            logger.debug(f"Removing stale device: {mac}")
            del self.devices[mac]
            if mac in self.rssi_by_proxy:
                del self.rssi_by_proxy[mac]

        if stale_macs:
            logger.info(f"Cleaned up {len(stale_macs)} stale devices")

        return len(stale_macs)

    def clear_all(self) -> None:
        """Clear all tracked devices and RSSI data."""
        self.devices.clear()
        self.rssi_by_proxy.clear()
        logger.info("Cleared all device tracking data")
