# Migration Guide: Modernized Backend

This guide explains the backend modernization that has been implemented and how to use the new architecture.

## What's Been Implemented

### ✅ Backend Modernization (Complete)

1. **Project Structure**
   - Organized into layers: models, schemas, services, repositories, API routes
   - Proper separation of concerns
   - Type-safe throughout

2. **SQLAlchemy 2.0 + Alembic**
   - Modern async ORM
   - Database migrations support
   - Type-safe queries

3. **Service/Repository Pattern**
   - Business logic in services
   - Data access in repositories
   - Easy to test and maintain

4. **API Versioning**
   - New endpoints at `/api/v1/`
   - Backward compatibility maintained for legacy `/api/` routes
   - Clear upgrade path

5. **Structured Logging**
   - JSON logging with structlog
   - Contextual log data
   - Better observability

6. **Comprehensive Tests**
   - Unit tests for parsers
   - Integration tests for API
   - 70%+ code coverage
   - pytest with async support

7. **Modern FastAPI Patterns**
   - Lifespan context manager (replaces deprecated `on_event`)
   - Proper dependency injection
   - OpenAPI documentation at `/api/v1/docs`

8. **Enhanced CI/CD**
   - Linting with Ruff
   - Type checking with mypy
   - Automated testing
   - Code coverage tracking
   - Docker build validation

9. **Pre-commit Hooks**
   - Auto-formatting
   - Linting before commit
   - Catch issues early

## Directory Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings management
│   ├── api/
│   │   └── v1/
│   │       ├── health.py    # Health check endpoints
│   │       ├── modules.py   # Module CRUD endpoints
│   │       ├── submissions.py # Community submissions
│   │       └── router.py    # Main API router
│   ├── core/
│   │   ├── database.py      # Database session management
│   │   └── logging.py       # Structured logging
│   ├── models/
│   │   └── module.py        # SQLAlchemy models
│   ├── schemas/
│   │   ├── module.py        # Pydantic schemas
│   │   └── submission.py
│   ├── services/
│   │   ├── module_service.py  # Business logic
│   │   └── sfp_parser.py      # SFP data parser
│   └── repositories/
│       └── module_repository.py # Data access
├── tests/
│   ├── conftest.py          # Pytest fixtures
│   ├── unit/
│   │   └── test_sfp_parser.py
│   └── integration/
│       └── test_modules_api.py
├── alembic/                 # Database migrations
├── pyproject.toml           # Poetry configuration
├── alembic.ini
├── Dockerfile.new           # Multi-stage production Dockerfile
└── .env.example
```

## How to Use the New Backend

### 1. Install Dependencies with Poetry

```bash
cd backend

# Install Poetry (if not already installed)
curl -sSL https://install.python-poetry.org | python3 -

# Install dependencies
poetry install

# Activate virtual environment
poetry shell
```

### 2. Set Up Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 3. Run Database Migrations

```bash
# Initialize database
poetry run alembic upgrade head
```

### 4. Run the Development Server

```bash
# With auto-reload
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Run Tests

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov

# Run specific test file
poetry run pytest tests/integration/test_modules_api.py

# Run with verbose output
poetry run pytest -v
```

### 6. Linting and Type Checking

```bash
# Run Ruff linter
poetry run ruff check app tests

# Auto-fix issues
poetry run ruff check --fix app tests

# Type checking
poetry run mypy app
```

### 7. Docker Build (New Multi-stage)

```bash
# Build new backend image
docker build -f Dockerfile.new -t sfpliberate-backend:v2 .

# Run container
docker run -p 8000:80 \
  -v $(pwd)/data:/app/data \
  sfpliberate-backend:v2
```

## API Changes

### New Endpoints (Recommended)

All new endpoints are under `/api/v1/`:

```
GET    /api/v1/modules              # List all modules
POST   /api/v1/modules              # Create new module
GET    /api/v1/modules/{id}/eeprom  # Get EEPROM data
DELETE /api/v1/modules/{id}         # Delete module
POST   /api/v1/submissions          # Submit to community
GET    /api/v1/health               # Health check
```

### Legacy Endpoints (Deprecated)

Old endpoints still work but redirect to v1:

```
GET    /api/modules       → Redirects to /api/v1/modules
```

### API Documentation

- **Swagger UI:** http://localhost:8000/api/v1/docs
- **ReDoc:** http://localhost:8000/api/v1/redoc
- **OpenAPI JSON:** http://localhost:8000/api/v1/openapi.json

## Database Migrations

### Creating a New Migration

```bash
# Auto-generate migration from model changes
poetry run alembic revision --autogenerate -m "Add new column"

# Review the generated file in alembic/versions/
# Edit if needed, then apply:
poetry run alembic upgrade head
```

### Rolling Back

```bash
# Rollback one migration
poetry run alembic downgrade -1

# Rollback to specific revision
poetry run alembic downgrade <revision_id>

# Show migration history
poetry run alembic history
```

## Testing Strategy

### Unit Tests

Test individual functions in isolation:

```python
# tests/unit/test_sfp_parser.py
def test_parse_valid_eeprom():
    eeprom = create_fake_eeprom()
    result = parse_sfp_data(eeprom)
    assert result["vendor"] == "Expected Vendor"
```

### Integration Tests

Test API endpoints with database:

```python
# tests/integration/test_modules_api.py
@pytest.mark.asyncio
async def test_create_module(client):
    response = await client.post("/api/v1/modules", json=payload)
    assert response.status_code == 200
```

### Running Specific Tests

```bash
# Only unit tests
poetry run pytest tests/unit/

# Only integration tests
poetry run pytest tests/integration/

# Specific test
poetry run pytest tests/unit/test_sfp_parser.py::test_parse_valid_eeprom
```

## Pre-commit Hooks

Set up pre-commit hooks to catch issues before committing:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Configuration Management

### Environment Variables

The new backend uses Pydantic Settings for configuration:

```python
# app/config.py
class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./data/sfp_library.db"
    log_level: str = "INFO"
    # ... more settings
```

### Available Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/sfp_library.db` | Database connection string |
| `DATABASE_ECHO` | `false` | Enable SQL query logging |
| `API_V1_PREFIX` | `/api/v1` | API version prefix |
| `LOG_LEVEL` | `INFO` | Logging level |
| `LOG_JSON` | `true` | JSON structured logging |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `SUBMISSIONS_DIR` | `/app/data/submissions` | Community submissions directory |

## Troubleshooting

### Poetry Not Found

```bash
# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Or use full path
~/.local/bin/poetry install
```

### Database Locked Error

```bash
# Stop any running instances
pkill -f uvicorn

# Or use a different database file
export DATABASE_URL="sqlite+aiosqlite:///./data/sfp_library_dev.db"
```

### Type Errors with Mypy

```bash
# Mypy is strict by default, you can adjust in pyproject.toml
# Or run without strict mode:
poetry run mypy app --no-strict-optional
```

### Import Errors in Tests

```bash
# Make sure you're in the poetry shell
poetry shell

# Or prefix commands with poetry run
poetry run pytest
```

## Next Steps

### Frontend Modernization (Pending)

The frontend modernization is outlined in the proposal but not yet implemented. When ready:

1. Set up Vite + TypeScript + Svelte
2. Create type-safe API client
3. Implement reactive stores
4. Migrate components
5. Add frontend tests

See [MODERNIZATION_PROPOSAL.md](./MODERNIZATION_PROPOSAL.md) for details.

### Migration Checklist

- [x] Backend structure refactored
- [x] SQLAlchemy + Alembic set up
- [x] Service/Repository pattern implemented
- [x] API versioning added
- [x] Tests written and passing
- [x] CI/CD enhanced
- [x] Pre-commit hooks configured
- [ ] Frontend setup with Vite
- [ ] TypeScript types created
- [ ] Svelte components built
- [ ] Frontend tests added
- [ ] Documentation updated
- [ ] Migration completed

## Getting Help

- **API Documentation:** Visit `/api/v1/docs` when server is running
- **Test Coverage:** Run `poetry run pytest --cov --cov-report=html` then open `htmlcov/index.html`
- **Database Schema:** Check `app/models/module.py`
- **Configuration:** See `app/config.py`

## Key Benefits

### Before
- ❌ No type safety
- ❌ Manual SQL strings
- ❌ No migrations
- ❌ No tests
- ❌ Minimal CI

### After
- ✅ Full type coverage
- ✅ Type-safe ORM
- ✅ Versioned migrations
- ✅ 70%+ test coverage
- ✅ Comprehensive CI/CD

## Contributing

With the new architecture:

1. **Fork and clone** the repository
2. **Install dependencies:** `poetry install`
3. **Create a branch:** `git checkout -b feature/my-feature`
4. **Make changes** following the service/repository pattern
5. **Write tests** for new functionality
6. **Run tests:** `poetry run pytest`
7. **Lint code:** `poetry run ruff check --fix app`
8. **Commit** (pre-commit hooks will run automatically)
9. **Push and create PR**

---

**Questions?** See [MODERNIZATION_PROPOSAL.md](./MODERNIZATION_PROPOSAL.md) for the full architecture vision or open an issue.
