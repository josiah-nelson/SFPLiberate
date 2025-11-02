"""Integration tests for modules API."""

import pytest
import base64


@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


@pytest.mark.asyncio
async def test_get_all_modules_empty(client):
    """Test getting all modules when none exist."""
    response = await client.get("/api/v1/modules")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_create_module(client):
    """Test creating a new module."""
    # Create fake EEPROM data
    fake_eeprom = bytearray(256)
    fake_eeprom[20:36] = b"Test Vendor     "
    fake_eeprom[40:56] = b"Test Model      "
    fake_eeprom[68:84] = b"ABC123          "

    payload = {
        "name": "Test Module",
        "eeprom_data_base64": base64.b64encode(bytes(fake_eeprom)).decode(),
    }

    response = await client.post("/api/v1/modules", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert "id" in data
    assert data["id"] is not None


@pytest.mark.asyncio
async def test_create_module_invalid_base64(client):
    """Test creating a module with invalid Base64 data."""
    payload = {"name": "Bad Module", "eeprom_data_base64": "not-valid-base64!!!"}

    response = await client.post("/api/v1/modules", json=payload)
    assert response.status_code == 400
    assert "Invalid Base64" in response.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_detection(client):
    """Test that duplicate modules are detected by SHA-256."""
    fake_eeprom = bytearray(256)
    fake_eeprom[20:36] = b"Duplicate Test  "

    payload = {
        "name": "Duplicate Module 1",
        "eeprom_data_base64": base64.b64encode(bytes(fake_eeprom)).decode(),
    }

    # First save
    response1 = await client.post("/api/v1/modules", json=payload)
    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["status"] == "success"
    module_id_1 = data1["id"]

    # Second save with same EEPROM data (should be duplicate)
    payload["name"] = "Duplicate Module 2"
    response2 = await client.post("/api/v1/modules", json=payload)
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["status"] == "duplicate"
    assert data2["id"] == module_id_1  # Same ID as first


@pytest.mark.asyncio
async def test_get_all_modules_with_data(client):
    """Test getting all modules after creating some."""
    # Create two modules
    for i in range(2):
        eeprom = bytearray(256)
        eeprom[20:36] = f"Vendor {i}       ".encode()
        eeprom[40:56] = f"Model {i}        ".encode()

        payload = {
            "name": f"Module {i}",
            "eeprom_data_base64": base64.b64encode(bytes(eeprom)).decode(),
        }
        await client.post("/api/v1/modules", json=payload)

    # Get all modules
    response = await client.get("/api/v1/modules")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all("id" in module for module in data)
    assert all("name" in module for module in data)


@pytest.mark.asyncio
async def test_get_module_eeprom(client):
    """Test retrieving EEPROM data for a module."""
    # Create a module
    fake_eeprom = bytearray(256)
    fake_eeprom[0:10] = b"1234567890"

    payload = {
        "name": "EEPROM Test",
        "eeprom_data_base64": base64.b64encode(bytes(fake_eeprom)).decode(),
    }
    create_response = await client.post("/api/v1/modules", json=payload)
    module_id = create_response.json()["id"]

    # Get EEPROM
    response = await client.get(f"/api/v1/modules/{module_id}/eeprom")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"

    # Verify data matches
    retrieved_eeprom = response.content
    assert retrieved_eeprom == bytes(fake_eeprom)


@pytest.mark.asyncio
async def test_get_eeprom_not_found(client):
    """Test retrieving EEPROM for non-existent module."""
    response = await client.get("/api/v1/modules/99999/eeprom")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_module(client):
    """Test deleting a module."""
    # Create a module
    fake_eeprom = bytearray(256)
    payload = {
        "name": "Delete Test",
        "eeprom_data_base64": base64.b64encode(bytes(fake_eeprom)).decode(),
    }
    create_response = await client.post("/api/v1/modules", json=payload)
    module_id = create_response.json()["id"]

    # Delete it
    delete_response = await client.delete(f"/api/v1/modules/{module_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "success"

    # Verify it's gone
    get_response = await client.get(f"/api/v1/modules/{module_id}/eeprom")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_module_not_found(client):
    """Test deleting a non-existent module."""
    response = await client.delete("/api/v1/modules/99999")
    assert response.status_code == 404
