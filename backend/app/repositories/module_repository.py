"""Repository for SFP module data access."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import SFPModule


class ModuleRepository:
    """Repository for SFP module database operations."""

    def __init__(self, session: AsyncSession):
        """Initialize repository with database session."""
        self.session = session

    async def get_all(self) -> Sequence[SFPModule]:
        """Get all modules ordered by name."""
        result = await self.session.execute(select(SFPModule).order_by(SFPModule.name))
        return result.scalars().all()

    async def get_by_id(self, module_id: int) -> SFPModule | None:
        """Get module by ID."""
        return await self.session.get(SFPModule, module_id)

    async def get_by_sha256(self, sha256: str) -> SFPModule | None:
        """Get module by SHA-256 checksum."""
        result = await self.session.execute(
            select(SFPModule).where(SFPModule.sha256 == sha256)
        )
        return result.scalar_one_or_none()

    async def create(self, module: SFPModule) -> SFPModule:
        """Create a new module."""
        self.session.add(module)
        await self.session.flush()
        await self.session.refresh(module)
        return module

    async def delete(self, module_id: int) -> bool:
        """Delete module by ID. Returns True if deleted, False if not found."""
        module = await self.get_by_id(module_id)
        if module:
            await self.session.delete(module)
            await self.session.flush()
            return True
        return False
