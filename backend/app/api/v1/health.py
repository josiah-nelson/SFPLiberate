"""Health check endpoints."""

from fastapi import APIRouter
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "version": settings.version}


@router.get("/")
async def root() -> dict[str, str]:
    """Root endpoint with API information."""
    return {
        "name": settings.project_name,
        "version": settings.version,
        "docs_url": f"{settings.api_v1_prefix}/docs",
    }


@router.get("/config")
async def app_config() -> dict[str, object]:
    """Expose minimal runtime configuration for the frontend."""
    default_profile: dict[str, str] | None = None
    if (
        settings.sfp_service_uuid
        and settings.sfp_write_char_uuid
        and settings.sfp_notify_char_uuid
    ):
        default_profile = {
            "serviceUuid": settings.sfp_service_uuid,
            "writeCharUuid": settings.sfp_write_char_uuid,
            "notifyCharUuid": settings.sfp_notify_char_uuid,
        }

    return {
        "version": settings.version,
        "ble_proxy_enabled": settings.ble_proxy_enabled,
        "ble_proxy_default_timeout": settings.ble_proxy_default_timeout,
        # WS path is fixed by router when enabled; still exposed for convenience
        "ble_proxy_ws_path": f"{settings.api_v1_prefix}/ble/ws",
        "public_mode": settings.public_mode,
        "default_profile": default_profile,
    }
