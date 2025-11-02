"""SFP EEPROM data parser based on SFF-8472 standard."""


def parse_sfp_data(eeprom_data: bytes) -> dict[str, str]:
    """
    Parse SFP EEPROM data to extract vendor, model, and serial.

    Based on SFF-8472 specification (Address A0h):
    - Bytes 20-36: Vendor name
    - Bytes 40-56: Part number (model)
    - Bytes 68-84: Serial number

    Args:
        eeprom_data: Raw EEPROM data (minimum 96 bytes)

    Returns:
        Dictionary with vendor, model, and serial keys
    """
    if len(eeprom_data) < 96:
        return {
            "vendor": "Unknown",
            "model": "Unknown",
            "serial": "Unknown",
        }

    try:
        vendor = eeprom_data[20:36].decode("ascii", errors="ignore").strip()
        model = eeprom_data[40:56].decode("ascii", errors="ignore").strip()
        serial = eeprom_data[68:84].decode("ascii", errors="ignore").strip()

        return {
            "vendor": vendor or "N/A",
            "model": model or "N/A",
            "serial": serial or "N/A",
        }
    except Exception:
        return {
            "vendor": "Parse Error",
            "model": "Parse Error",
            "serial": "Parse Error",
        }
