"""API endpoints for SFP modules."""

import base64

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.module import ModuleCreate, ModuleInfo, StatusMessage
from app.services.module_service import ModuleService

router = APIRouter()
logger = structlog.get_logger()


@router.get("/modules", response_model=list[ModuleInfo])
async def get_all_modules(db: AsyncSession = Depends(get_db)) -> list[ModuleInfo]:
    """
    Get all saved SFP modules (without BLOB data).

    Returns a list of all modules with their metadata.
    """
    service = ModuleService(db)
    modules = await service.get_all_modules()
    logger.info("modules_retrieved", count=len(modules))
    return modules


@router.post("/modules", response_model=StatusMessage)
async def create_module(
    module: ModuleCreate, db: AsyncSession = Depends(get_db)
) -> StatusMessage:
    """
    Save a new SFP module.

    The EEPROM data is parsed to extract vendor, model, and serial information.
    Duplicate detection is performed using SHA-256 checksum.
    """
    try:
        eeprom_data = base64.b64decode(module.eeprom_data_base64)
    except Exception as e:
        logger.warning("invalid_base64_data", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid Base64 data") from e

    service = ModuleService(db)
    created_module, is_duplicate = await service.add_module(
        name=module.name, eeprom_data=eeprom_data
    )

    logger.info(
        "module_saved",
        module_id=created_module.id,
        is_duplicate=is_duplicate,
        sha256=created_module.sha256[:16] + "...",
    )

    return StatusMessage(
        status="duplicate" if is_duplicate else "success",
        message=(
            f"Module already exists (SHA256 match). Using existing ID {created_module.id}."
            if is_duplicate
            else f"Module '{module.name}' saved successfully."
        ),
        id=created_module.id,
    )


@router.get("/modules/{module_id}/eeprom")
async def get_module_eeprom(
    module_id: int, db: AsyncSession = Depends(get_db)
) -> Response:
    """
    Get raw EEPROM binary data for a specific module.

    This is used when writing a module to hardware.
    """
    service = ModuleService(db)
    eeprom = await service.get_module_eeprom(module_id)

    if not eeprom:
        logger.warning("module_not_found", module_id=module_id)
        raise HTTPException(status_code=404, detail="Module not found")

    logger.info("eeprom_retrieved", module_id=module_id, size=len(eeprom))
    return Response(content=eeprom, media_type="application/octet-stream")


@router.delete("/modules/{module_id}", response_model=StatusMessage)
async def delete_module(
    module_id: int, db: AsyncSession = Depends(get_db)
) -> StatusMessage:
    """Delete a module from the library."""
    service = ModuleService(db)
    deleted = await service.delete_module(module_id)

    if not deleted:
        logger.warning("module_delete_failed_not_found", module_id=module_id)
        raise HTTPException(status_code=404, detail="Module not found")

    logger.info("module_deleted", module_id=module_id)
    return StatusMessage(status="success", message="Module deleted successfully")
