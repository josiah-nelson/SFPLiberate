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

# Always include ESPHome status endpoint (reports enabled/disabled)
api_router.include_router(esphome_status.router, tags=["esphome"])

# Include ESPHome proxy routes conditionally
if settings.esphome_proxy_mode:
    api_router.include_router(esphome.router, tags=["esphome-proxy"])
    api_router.include_router(esphome_websocket.router, prefix="/esphome", tags=["esphome-websocket"])
