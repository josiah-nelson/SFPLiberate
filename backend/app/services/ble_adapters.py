"""
BLE adapter enumeration via BlueZ (DBus).

Returns a list of local Bluetooth adapters (e.g., hci0) with basic metadata.

Requires optional dependency dbus-next when running inside Linux hosts with BlueZ.
Falls back to an empty list if not available or on error.
"""

from __future__ import annotations

from typing import Any


async def list_adapters() -> list[dict[str, Any]]:
    try:
        from dbus_next.aio import MessageBus
        from dbus_next import BusType, Message
        from dbus_next.constants import MessageType
    except Exception:
        # Optional dependency not installed
        return []

    try:
        bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
        try:
            # org.freedesktop.DBus.ObjectManager.GetManagedObjects
            msg = Message(
                destination="org.bluez",
                path="/",
                interface="org.freedesktop.DBus.ObjectManager",
                member="GetManagedObjects",
            )
            reply = await bus.call(msg)
            if reply.message_type != MessageType.METHOD_RETURN:
                return []

            managed = reply.body[0]  # a{oa{sa{sv}}}
            adapters: list[dict[str, Any]] = []

            for obj_path, ifaces in managed.items():
                adapter_if = ifaces.get("org.bluez.Adapter1")
                if not adapter_if:
                    continue

                # Derive adapter name from object path, e.g., "/org/bluez/hci0" -> "hci0"
                name = str(obj_path).rstrip("/").split("/")[-1]
                # Properties are Variants; access .value when present
                def _get(prop: str, default=None):
                    v = adapter_if.get(prop)
                    try:
                        return v.value if hasattr(v, "value") else v
                    except Exception:
                        return default

                adapters.append(
                    {
                        "name": name,
                        "address": _get("Address", None),
                        "powered": bool(_get("Powered", False)),
                    }
                )

            return adapters
        finally:
            try:
                await bus.disconnect()
            except Exception:
                pass
    except Exception:
        return []

