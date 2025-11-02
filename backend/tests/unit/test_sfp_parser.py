"""Unit tests for SFP parser."""

import pytest
from app.services.sfp_parser import parse_sfp_data


def test_parse_valid_eeprom():
    """Test parsing valid EEPROM data."""
    # Create a minimal 96-byte EEPROM with vendor, model, serial
    eeprom = bytearray(256)
    eeprom[20:36] = b"Test Vendor     "
    eeprom[40:56] = b"Test Model      "
    eeprom[68:84] = b"12345678        "

    result = parse_sfp_data(bytes(eeprom))

    assert result["vendor"] == "Test Vendor"
    assert result["model"] == "Test Model"
    assert result["serial"] == "12345678"


def test_parse_short_eeprom():
    """Test parsing EEPROM data that's too short."""
    short_eeprom = b"Too short"

    result = parse_sfp_data(short_eeprom)

    assert result["vendor"] == "Unknown"
    assert result["model"] == "Unknown"
    assert result["serial"] == "Unknown"


def test_parse_empty_fields():
    """Test parsing EEPROM with empty fields."""
    eeprom = bytearray(256)
    # Leave vendor/model/serial as zeros/spaces

    result = parse_sfp_data(bytes(eeprom))

    # Empty fields should return "N/A"
    assert result["vendor"] == "N/A"
    assert result["model"] == "N/A"
    assert result["serial"] == "N/A"


def test_parse_non_ascii_data():
    """Test parsing EEPROM with non-ASCII characters."""
    eeprom = bytearray(256)
    eeprom[20:36] = bytes([0xFF] * 16)  # Non-ASCII bytes

    result = parse_sfp_data(bytes(eeprom))

    # Should handle gracefully without crashing
    assert "vendor" in result
    assert "model" in result
    assert "serial" in result
