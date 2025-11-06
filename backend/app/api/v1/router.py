"""Main API v1 router."""

from fastapi import APIRouter

from app.api.v1 import esphome, esphome_websocket, health, modules, submissions, esphome_status
from app.config import get_settings

api_router = APIRouter()
settings = get_settings()

# Include module routes
api_router.include_router(modules.router, tags=["modules"])

# Include submission routes
api_router.include_router(submissions.router, tags=["submissions"])

# Include health routes
api_router.include_router(health.router, tags=["health"])

# Include Bluetooth integration based on deployment mode
if settings.ha_addon_mode:
    # Home Assistant Add-On mode: Use HA Bluetooth API
    from app.api.v1 import ha_bluetooth
    api_router.include_router(ha_bluetooth.router, tags=["ha-bluetooth"])
elif settings.esphome_proxy_mode:
    # Standalone mode with ESPHome proxy
    # Always include ESPHome status endpoint (reports enabled/disabled)
    api_router.include_router(esphome_status.router, tags=["esphome"])
    api_router.include_router(esphome.router, tags=["esphome-proxy"])
    api_router.include_router(esphome_websocket.router, prefix="/esphome", tags=["esphome-websocket"])
else:
    # Standalone mode without proxy - still include status endpoint
    api_router.include_router(esphome_status.router, tags=["esphome"])
