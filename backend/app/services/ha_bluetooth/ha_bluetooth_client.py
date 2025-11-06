"""Home Assistant Bluetooth API client for SFPLiberate add-on."""

import asyncio
import logging
from typing import List, Optional, Dict, Any, Tuple
import aiohttp
import json
import os

from .schemas import HABluetoothDevice, HADeviceConnectionResponse

logger = logging.getLogger(__name__)


class HomeAssistantBluetoothClient:
    """
    Client for interacting with Home Assistant's Bluetooth integration.

    Replaces mDNS-based ESPHome discovery with direct HA API access.
    This client is only used when running as a Home Assistant add-on.
    """

    def __init__(
        self,
        ha_api_url: Optional[str] = None,
        ha_ws_url: Optional[str] = None,
        supervisor_token: Optional[str] = None,
        device_patterns: Optional[List[str]] = None,
    ):
        """
        Initialize HA Bluetooth client.

        Args:
            ha_api_url: Home Assistant REST API URL (defaults to supervisor proxy)
            ha_ws_url: Home Assistant WebSocket URL (defaults to supervisor proxy)
            supervisor_token: Supervisor token for authentication
            device_patterns: List of device name patterns to filter (case-insensitive)
        """
        self.ha_api_url = ha_api_url or os.getenv("HA_API_URL", "http://supervisor/core/api")
        self.ha_ws_url = ha_ws_url or os.getenv("HA_WS_URL", "ws://supervisor/core/websocket")
        self.supervisor_token = supervisor_token or os.getenv("SUPERVISOR_TOKEN", "")

        # Parse device patterns from env if provided as JSON array
        patterns_env = os.getenv("DEVICE_NAME_PATTERNS", '["SFP", "Wizard"]')
        try:
            default_patterns = json.loads(patterns_env)
        except (json.JSONDecodeError, TypeError):
            default_patterns = ["SFP", "Wizard"]

        self.device_patterns = [p.lower() for p in (device_patterns or default_patterns)]

        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._discovered_devices: Dict[str, HABluetoothDevice] = {}
        self._ws_task: Optional[asyncio.Task] = None
        self._connected = False

        logger.info(
            f"Initialized HA Bluetooth client: api_url={self.ha_api_url}, "
            f"patterns={self.device_patterns}"
        )

    async def start(self) -> None:
        """Initialize connection to HA API and start listening for device updates."""
        if self._session:
            logger.warning("HA Bluetooth client already started")
            return

        logger.info("Starting HA Bluetooth client...")

        # Create session with auth header
        headers = {"Authorization": f"Bearer {self.supervisor_token}"}
        self._session = aiohttp.ClientSession(headers=headers)

        # Initial device discovery
        await self._discover_devices()

        # Start WebSocket listener for real-time updates
        self._ws_task = asyncio.create_task(self._websocket_listener())

        self._connected = True
        logger.info("HA Bluetooth client started successfully")

    async def stop(self) -> None:
        """Cleanup connections and resources."""
        logger.info("Stopping HA Bluetooth client...")

        # Cancel WebSocket listener
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass

        # Close WebSocket
        if self._ws:
            await self._ws.close()
            self._ws = None

        # Close session
        if self._session:
            await self._session.close()
            self._session = None

        self._connected = False
        logger.info("HA Bluetooth client stopped")

    async def get_bluetooth_devices(self) -> List[HABluetoothDevice]:
        """
        Get all Bluetooth devices from HA that match configured patterns.

        Returns:
            List of discovered devices matching configured patterns
        """
        # Return cached devices, which are populated at startup and kept up-to-date by the WebSocket listener.
        return list(self._discovered_devices.values())

    async def connect_to_device(self, mac_address: str) -> HADeviceConnectionResponse:
        """
        Connect to device via HA Bluetooth and retrieve GATT UUIDs.

        Note: In the initial implementation, we use a simplified approach
        that relies on the frontend's Web Bluetooth for GATT operations.
        HA's Bluetooth API doesn't expose direct GATT service enumeration yet.

        Args:
            mac_address: BLE MAC address

        Returns:
            DeviceConnectionResponse with service/characteristic UUIDs

        Raises:
            ValueError: If device not found
            RuntimeError: If connection fails
        """
        logger.info(f"Connecting to device {mac_address} via HA Bluetooth...")

        # Normalize MAC
        mac_address = mac_address.upper().replace("-", ":")

        # Check if device is discovered
        device = self._discovered_devices.get(mac_address)
        if not device:
            raise ValueError(
                f"Device {mac_address} not found. "
                "Make sure the device is advertising and matches configured patterns."
            )

        # For now, return cached UUIDs or defaults for SFP Wizard
        # In a future version, this would call HA's bluetooth.connect service
        # and enumerate GATT services via HA's Bluetooth integration

        # Check if we have cached UUIDs from environment
        service_uuid = os.getenv("SFP_SERVICE_UUID", "8E60F02E-F699-4865-B83F-F40501752184")
        write_uuid = os.getenv("SFP_WRITE_CHAR_UUID", "9280F26C-A56F-43EA-B769-D5D732E1AC67")
        notify_uuid = os.getenv("SFP_NOTIFY_CHAR_UUID", "DC272A22-43F2-416B-8FA5-63A071542FAC")

        logger.info(
            f"Using cached UUIDs for {mac_address}: "
            f"service={service_uuid}, notify={notify_uuid}, write={write_uuid}"
        )

        return HADeviceConnectionResponse(
            service_uuid=service_uuid,
            notify_char_uuid=notify_uuid,
            write_char_uuid=write_uuid,
            device_name=device.name,
            source=device.source,
        )

    @property
    def is_connected(self) -> bool:
        """Check if client is connected to HA API."""
        return self._connected

    async def _discover_devices(self) -> None:
        """Query HA states API for Bluetooth devices."""
        if not self._session:
            logger.warning("Cannot discover devices - session not initialized")
            return

        try:
            async with self._session.get(f"{self.ha_api_url}/states") as resp:
                if resp.status != 200:
                    logger.error(f"Failed to fetch states: HTTP {resp.status}")
                    return

                states = await resp.json()

            # Process states to find Bluetooth devices
            discovered = {}
            for state in states:
                entity_id = state.get("entity_id", "")
                attrs = state.get("attributes", {})

                # Look for bluetooth-related entities
                # This includes device_tracker from bluetooth, sensor entities, etc.
                if not self._is_bluetooth_entity(entity_id, attrs):
                    continue

                name = attrs.get("friendly_name", "")

                # Pattern matching (case-insensitive)
                if not any(pattern in name.lower() for pattern in self.device_patterns):
                    continue

                # Extract MAC from various attribute locations
                mac = self._extract_mac(attrs, entity_id)
                if not mac:
                    continue

                # Create device object
                discovered[mac] = HABluetoothDevice(
                    mac=mac,
                    name=name,
                    rssi=attrs.get("rssi", -100),
                    source=attrs.get("source", "hass_bluetooth"),
                    last_seen=state.get("last_changed"),
                )

            # Update cache
            self._discovered_devices = discovered
            logger.debug(f"Discovered {len(discovered)} matching devices")

        except Exception as e:
            logger.error(f"Error discovering devices: {e}", exc_info=True)

    def _is_bluetooth_entity(self, entity_id: str, attrs: Dict[str, Any]) -> bool:
        """Check if entity is Bluetooth-related."""
        # Check entity domain
        if entity_id.startswith(("device_tracker.", "sensor.")):
            # Check for bluetooth source attribute
            source = attrs.get("source", "")
            if "bluetooth" in source.lower() or "ble" in source.lower():
                return True

        # Check for bluetooth in entity ID
        if "bluetooth" in entity_id or "ble" in entity_id:
            return True

        return False

    def _extract_mac(self, attrs: Dict[str, Any], entity_id: str) -> Optional[str]:
        """Extract MAC address from entity attributes."""
        # Try common attribute names
        for key in ["address", "mac", "mac_address", "id"]:
            mac = attrs.get(key)
            if mac and ":" in str(mac):
                return str(mac).upper()

        # Try to extract from entity ID (some integrations use MAC in entity ID)
        # e.g., device_tracker.aa_bb_cc_dd_ee_ff
        parts = entity_id.split(".")
        if len(parts) == 2:
            potential_mac = parts[1].replace("_", ":")
            if potential_mac.count(":") == 5:  # Valid MAC format
                return potential_mac.upper()

        return None

    async def _websocket_listener(self) -> None:
        """Listen for Bluetooth device updates via WebSocket."""
        logger.info("Starting WebSocket listener...")

        try:
            # Connect to WebSocket
            self._ws = await self._session.ws_connect(self.ha_ws_url)

            # Authenticate
            await self._ws.send_json({
                "type": "auth",
                "access_token": self.supervisor_token
            })

            # Wait for auth response
            auth_response = await self._ws.receive_json()
            if auth_response.get("type") != "auth_ok":
                logger.error(f"WebSocket auth failed: {auth_response}")
                return

            logger.info("WebSocket authenticated")

            # Subscribe to state_changed events
            await self._ws.send_json({
                "id": 1,
                "type": "subscribe_events",
                "event_type": "state_changed"
            })

            # Listen for messages
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        await self._handle_ws_message(data)
                    except Exception as e:
                        logger.error(f"Error processing WebSocket message: {e}", exc_info=True)
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    logger.warning(f"WebSocket closed: {msg.type}")
                    break

        except asyncio.CancelledError:
            logger.info("WebSocket listener cancelled")
            raise
        except Exception as e:
            logger.error(f"WebSocket error: {e}", exc_info=True)

    async def _handle_ws_message(self, data: Dict[str, Any]) -> None:
        """Process WebSocket message for Bluetooth device updates."""
        # Check for state_changed event
        if data.get("type") == "event" and data.get("event", {}).get("event_type") == "state_changed":
            event_data = data.get("event", {}).get("data", {})
            entity_id = event_data.get("entity_id", "")
            new_state = event_data.get("new_state", {})
            attrs = new_state.get("attributes", {})

            # Only process bluetooth entities
            if not self._is_bluetooth_entity(entity_id, attrs):
                return

            name = attrs.get("friendly_name", "")

            # Pattern matching
            if not any(pattern in name.lower() for pattern in self.device_patterns):
                return

            # Extract MAC
            mac = self._extract_mac(attrs, entity_id)
            if not mac:
                return

            # Update cache
            self._discovered_devices[mac] = HABluetoothDevice(
                mac=mac,
                name=name,
                rssi=attrs.get("rssi", -100),
                source=attrs.get("source", "hass_bluetooth"),
                last_seen=new_state.get("last_changed"),
            )

            logger.debug(f"Updated device via WebSocket: {name} ({mac})")
