"""Business logic for SFP module operations."""

import hashlib

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import SFPModule
from app.repositories.module_repository import ModuleRepository
from app.services.sfp_parser import parse_sfp_data


class ModuleService:
    """Service for SFP module business logic."""

    def __init__(self, session: AsyncSession):
        """Initialize service with database session."""
        self.repository = ModuleRepository(session)

    async def add_module(self, name: str, eeprom_data: bytes) -> tuple[SFPModule, bool]:
        """
        Add a module with duplicate detection.

        Args:
            name: Friendly name for the module
            eeprom_data: Raw EEPROM data

        Returns:
            Tuple of (module, is_duplicate)
        """
        # Compute SHA-256 checksum
        sha256 = hashlib.sha256(eeprom_data).hexdigest()

        # Check for existing module with same checksum
        existing = await self.repository.get_by_sha256(sha256)
        if existing:
            return existing, True

        # Parse EEPROM data
        parsed = parse_sfp_data(eeprom_data)

        # Create new module
        module = SFPModule(
            name=name,
            vendor=parsed["vendor"],
            model=parsed["model"],
            serial=parsed["serial"],
            eeprom_data=eeprom_data,
            sha256=sha256,
        )

        created = await self.repository.create(module)
        return created, False

    async def get_all_modules(self) -> list[SFPModule]:
        """Get all modules."""
        return list(await self.repository.get_all())

    async def get_module_by_id(self, module_id: int) -> SFPModule | None:
        """Get module by ID."""
        return await self.repository.get_by_id(module_id)

    async def get_module_eeprom(self, module_id: int) -> bytes | None:
        """Get raw EEPROM data for a module."""
        module = await self.repository.get_by_id(module_id)
        return module.eeprom_data if module else None

    async def delete_module(self, module_id: int) -> bool:
        """Delete a module. Returns True if deleted, False if not found."""
        return await self.repository.delete(module_id)
