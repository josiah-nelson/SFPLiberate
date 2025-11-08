"""Pydantic schemas for SFP modules."""

from datetime import datetime

from pydantic import BaseModel, Field


class ModuleCreate(BaseModel):
    """Schema for creating a new module."""

    name: str = Field(..., description="A friendly name for the module")
    eeprom_data_base64: str = Field(..., description="Base64-encoded EEPROM data")


class ModuleInfo(BaseModel):
    """Schema for module information (without BLOB data)."""

    id: int
    name: str
    vendor: str | None
    model: str | None
    serial: str | None
    created_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class ModuleEEPROM(BaseModel):
    """Schema for EEPROM data."""

    id: int
    eeprom_data: bytes


class StatusMessage(BaseModel):
    """Generic status message response."""

    status: str
    message: str
    id: int | None = None
