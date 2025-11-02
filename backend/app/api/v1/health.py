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
