"""ESPHome Bluetooth Proxy API endpoints."""

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.services.esphome import ESPHomeProxyService
from app.services.esphome.schemas import (
    DeviceConnectionRequest,
    DeviceConnectionResponse,
    ESPHomeStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/esphome", tags=["ESPHome Proxy"])


@router.get("/status", response_model=ESPHomeStatus)
async def get_status():
    """
    Check if ESPHome proxy mode is enabled and get status.

    Returns status information including number of proxies and devices discovered.
    """
    try:
        service = ESPHomeProxyService()
        devices = service.get_discovered_devices()
        proxies = service.get_discovered_proxies()

        return ESPHomeStatus(
            enabled=True,
            proxies_discovered=len(proxies),
            devices_discovered=len(devices),
        )
    except Exception as e:
        logger.error(f"Error getting ESPHome status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/devices")
async def device_stream():
    """
    Server-Sent Events stream of discovered SFP devices.

    Streams JSON array of discovered devices every second.
    Frontend should connect to this endpoint using EventSource.
    """
    async def event_generator():
        """Generate SSE events with discovered devices."""
        from app.config import get_settings
        settings = get_settings()
        service = ESPHomeProxyService()

        try:
            while True:
                devices = service.get_discovered_devices()

                # Convert to dict for JSON serialization
                data = [device.model_dump() for device in devices]
                json_data = json.dumps(data)

                # SSE format: "data: {json}\n\n"
                yield f"data: {json_data}\n\n"

                await asyncio.sleep(settings.esphome_sse_interval)

        except asyncio.CancelledError:
            logger.info("Device stream cancelled")
        except Exception as e:
            logger.error(f"Error in device stream: {e}", exc_info=True)
            # Send error event
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/connect", response_model=DeviceConnectionResponse)
async def connect_device(request: DeviceConnectionRequest):
    """
    Connect to a BLE device via ESPHome proxy and retrieve UUIDs.

    This endpoint:
    1. Selects the best proxy (highest RSSI) for the device
    2. Connects to the device via the proxy
    3. Enumerates GATT services/characteristics
    4. Returns service UUID, notify UUID, and write UUID
    5. Disconnects from the device

    The returned UUIDs should be cached by the frontend for future connections.
    """
    try:
        service = ESPHomeProxyService()
        result = await service.connect_to_device(request.mac_address)
        return result

    except ValueError as e:
        logger.warning(f"Device connection failed (client error): {e}")
        raise HTTPException(status_code=404, detail=str(e)) from e

    except RuntimeError as e:
        logger.error(f"Device connection failed (proxy error): {e}")
        raise HTTPException(status_code=502, detail=str(e)) from e

    except Exception as e:
        logger.error(f"Unexpected error connecting to device: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Connection failed: {e}") from e
