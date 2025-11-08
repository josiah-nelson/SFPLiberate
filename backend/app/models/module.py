"""SQLAlchemy models for SFP modules."""

from datetime import datetime

from sqlalchemy import Index, LargeBinary, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class SFPModule(Base):
    """SFP module EEPROM data model."""

    __tablename__ = "sfp_modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial: Mapped[str | None] = mapped_column(String(100))
    eeprom_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    __table_args__ = (Index("idx_vendor_model", "vendor", "model"),)

    def __repr__(self) -> str:
        """String representation."""
        return f"<SFPModule(id={self.id}, name={self.name!r}, sha256={self.sha256[:16]}...)>"
