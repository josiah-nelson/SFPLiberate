# SFPLiberate Backend

FastAPI backend for SFPLiberate that manages the SFP module library. Supports two deployment modes with automatic database adapter selection.

---

## Deployment Modes

### Standalone Mode (SQLite)
- **Use Case**: Self-hosted Docker deployment, local development
- **Database**: SQLite file at `/app/data/sfp_library.db`
- **Storage**: EEPROM data stored as BLOBs in database
- **Auth**: Optional (typically disabled)
- **Scaling**: Single instance only

### Appwrite Mode (Cloud Database)
- **Use Case**: Public hosted version with Appwrite Cloud
- **Database**: Appwrite NoSQL database with collections
- **Storage**: Appwrite Storage service for EEPROM binaries
- **Auth**: Required (Appwrite authentication)
- **Scaling**: Horizontal auto-scaling

---

## Database Factory Pattern

The backend uses a **database factory** (`database_factory.py`) that automatically selects the correct database manager based on the `DEPLOYMENT_MODE` environment variable.

### Architecture

```
main.py
  ↓ import database_factory as database_manager
  ↓
database_factory.py
  ↓ (checks DEPLOYMENT_MODE)
  ├─→ standalone → database_manager.py (SQLite)
  └─→ appwrite → appwrite_database_manager.py (Appwrite)
```

### Unified Interface

Both database managers implement the same interface:

```python
def setup_database() -> None:
    """Initialize database connection and schema"""

def add_module(name: str, vendor: str, model: str, serial: str, eeprom_data: bytes) -> Tuple[int, bool]:
    """Add module with automatic deduplication. Returns (id, is_duplicate)"""

def get_all_modules() -> List[Dict[str, Any]]:
    """List all modules (metadata only, no EEPROM data)"""

def get_module_eeprom(module_id: int) -> Optional[bytes]:
    """Get raw EEPROM binary data for a specific module"""

def delete_module(module_id: int) -> bool:
    """Delete module. Returns True if deleted, False if not found"""
```

### Usage in API Endpoints

```python
from database_factory import (
    setup_database,
    add_module,
    get_all_modules,
    get_module_eeprom,
    delete_module
)

@app.get("/api/modules")
async def list_modules():
    return get_all_modules()
```

The API code **doesn't need to know** which database is being used. The factory handles the abstraction.

---

## Configuration

### Environment Variables

#### Deployment Mode Selection

```bash
# Choose deployment mode
DEPLOYMENT_MODE=standalone  # or "appwrite"
```

#### Standalone Mode (SQLite)

```bash
DATABASE_FILE=/app/data/sfp_library.db
SUBMISSIONS_DIR=/app/data/submissions
```

#### Appwrite Mode (Cloud Database)

```bash
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_API_KEY=your-api-key
APPWRITE_DATABASE_ID=sfp_library
APPWRITE_COLLECTION_ID=sfp_modules
APPWRITE_BUCKET_ID=sfp_eeprom_data
```

See `.env.example` for full configuration options.

---

## Switching Between Modes

### Development: SQLite → Appwrite

1. Set up Appwrite database (see [docs/APPWRITE_DATABASE.md](../docs/APPWRITE_DATABASE.md))
2. Update `.env`:
   ```bash
   DEPLOYMENT_MODE=appwrite
   APPWRITE_PROJECT_ID=your-project-id
   APPWRITE_API_KEY=your-api-key
   ```
3. Restart backend:
   ```bash
   docker-compose down
   docker-compose up --build
   ```

### Production: Appwrite → SQLite (Rollback)

1. Export data from Appwrite (see migration section in APPWRITE_DATABASE.md)
2. Update `.env`:
   ```bash
   DEPLOYMENT_MODE=standalone
   ```
3. Restart backend

---

## API Endpoints

### Module Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/modules` | List all modules (metadata only) |
| `POST` | `/api/modules` | Add new module with EEPROM data |
| `GET` | `/api/modules/{id}/eeprom` | Download raw EEPROM binary |
| `DELETE` | `/api/modules/{id}` | Delete module |

### Community Submissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/submissions` | Submit module for community review |

### Example: Add Module

```bash
curl -X POST http://localhost:8080/api/modules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cisco 10G SFP+",
    "eeprom_data_base64": "BASE64_ENCODED_EEPROM_DATA_HERE"
  }'
```

Response:
```json
{
  "status": "success",
  "message": "Module 'Cisco 10G SFP+' saved.",
  "id": 123456
}
```

Or if duplicate:
```json
{
  "status": "duplicate",
  "message": "Module already exists (SHA256 match). Using existing ID 123456.",
  "id": 123456
}
```

---

## Development

### Local Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run development server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 80
   ```

### Dependency Management

- Poetry (`pyproject.toml` / `poetry.lock`) is the source of truth for backend dependencies.
- Appwrite’s runtime expects a `requirements.txt`, so we keep the exported file (`backend/requirements.txt`) in git.
- After adding or updating packages with Poetry, regenerate the export before committing (requires the [`poetry-plugin-export`](https://python-poetry.org/docs/plugins/#official-plugins)):
  ```bash
  poetry lock --no-update
  poetry export -f requirements.txt --output requirements.txt --without-hashes
  ```
- The Appwrite function workflow also runs the export step to guarantee the file stays in sync during CI deployments.

### Docker Build

```bash
# Development build
docker build -t sfpliberate-backend:dev -f Dockerfile.new .

# Production build with BuildKit cache
docker build \
  --build-arg PYTHON_VERSION=3.11 \
  --build-arg POETRY_VERSION=1.8.5 \
  --cache-from type=registry,ref=ghcr.io/josiah-nelson/sfpliberate-backend:cache \
  -t sfpliberate-backend:latest \
  -f Dockerfile.new .
```

### Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Test specific file
pytest tests/test_database_factory.py
```

---

## Database Schema

### SQLite (Standalone Mode)

```sql
CREATE TABLE sfp_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    vendor TEXT,
    model TEXT,
    serial TEXT,
    eeprom_data BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sha256 TEXT UNIQUE
);
```

### Appwrite (Cloud Mode)

See [docs/APPWRITE_DATABASE.md](../docs/APPWRITE_DATABASE.md) for complete schema including:
- Collection attributes and types
- Indexes for search optimization
- Storage bucket configuration
- Permissions model

---

## Troubleshooting

### Error: "Unknown DEPLOYMENT_MODE"

**Cause**: `DEPLOYMENT_MODE` environment variable is missing or invalid.

**Solution**: Set to either `standalone` or `appwrite`:
```bash
export DEPLOYMENT_MODE=standalone
```

### Error: "Appwrite configuration missing"

**Cause**: Running in `appwrite` mode without required environment variables.

**Solution**: Set all Appwrite variables:
```bash
export APPWRITE_PROJECT_ID=your-project-id
export APPWRITE_API_KEY=your-api-key
```

### Error: "Appwrite SDK not installed"

**Cause**: `appwrite` package not in Python environment.

**Solution**: Install dependencies:
```bash
pip install -r requirements.txt
```

### Database Connection Logs

Check startup logs for confirmation of database mode:

```
✓ Using SQLite database manager (deployment_mode=standalone)
```

Or:

```
✓ Using Appwrite database manager (deployment_mode=appwrite)
✓ Appwrite database connected: sfp_library/sfp_modules
✓ Appwrite storage connected: sfp_eeprom_data
```

---

## Related Documentation

- [docs/APPWRITE_DATABASE.md](../docs/APPWRITE_DATABASE.md) - Complete Appwrite setup guide
- [docs/PUBLIC_DEPLOYMENT.md](../docs/PUBLIC_DEPLOYMENT.md) - Public hosting deployment
- [docs/AUTH_SYSTEM.md](../docs/AUTH_SYSTEM.md) - Authentication and RBAC
- [README.md](../README.md) - Project overview and features

---

## Support

For backend issues:
1. Check logs: `docker-compose logs backend`
2. Verify environment variables: `docker-compose config`
3. Review [troubleshooting section](#troubleshooting)
4. Open issue on [GitHub](https://github.com/josiah-nelson/SFPLiberate/issues)
