"""ESPHome status endpoint (always available)."""

from fastapi import APIRouter
from pydantic import BaseModel
from app.config import get_settings

router = APIRouter(prefix="/esphome")


class ESPHomeStatusResponse(BaseModel):
    """ESPHome proxy status response."""

    enabled: bool


@router.get("/status", response_model=ESPHomeStatusResponse)
async def get_esphome_status():
    """
    Get ESPHome proxy status.

    This endpoint is always available, regardless of whether ESPHome proxy mode is enabled.
    Returns {"enabled": true/false} based on the ESPHOME_PROXY_MODE configuration.
    """
    settings = get_settings()
    return ESPHomeStatusResponse(enabled=settings.esphome_proxy_mode)
