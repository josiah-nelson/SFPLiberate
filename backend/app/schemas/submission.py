"""Pydantic schemas for community submissions."""

from pydantic import BaseModel


class SubmissionCreate(BaseModel):
    """Schema for creating a community submission."""

    name: str
    vendor: str | None = None
    model: str | None = None
    serial: str | None = None
    eeprom_data_base64: str
    notes: str | None = None


class SubmissionResponse(BaseModel):
    """Schema for submission response."""

    status: str
    message: str
    inbox_id: str
    sha256: str
