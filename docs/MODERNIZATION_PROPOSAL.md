# SFPLiberate Modernization Proposal

**Date:** 2025-11-02
**Status:** Proposal
**Goal:** Transform SFPLiberate into a modern, extensible, and maintainable codebase aligned with current best practices

## Executive Summary

This proposal outlines a comprehensive modernization strategy for SFPLiberate to address technical debt, improve developer experience, and establish a solid foundation for future enhancements. The current architecture works but lacks modern tooling, type safety, testing infrastructure, and scalability patterns needed for long-term maintainability.

**Key Objectives:**
- Improve code quality and type safety
- Establish comprehensive testing infrastructure
- Modernize frontend with build tooling and framework
- Enhance backend with proper architecture patterns
- Improve developer experience and CI/CD pipeline
- Enable easier community contributions

## Current State Analysis

### Strengths ✅
- **Docker-first approach** - Good containerization and deployment story
- **FastAPI backend** - Modern, fast, and well-documented
- **Single-origin design** - Clean reverse proxy architecture
- **Clear separation** - Frontend/backend boundaries well-defined
- **SHA-256 deduplication** - Smart data integrity approach
- **Web Bluetooth API** - Modern browser API, future-proof

### Pain Points 🔴

#### Frontend
- ❌ No build tooling or module system
- ❌ Global mutable state (maintenance nightmare)
- ❌ No TypeScript (no type safety)
- ❌ Manual DOM manipulation (error-prone)
- ❌ No component architecture
- ❌ Hardcoded configuration (Issue #1)
- ❌ No testing framework
- ❌ No linting/formatting

#### Backend
- ❌ No ORM (manual SQL strings)
- ❌ No proper migration system (manual schema checks)
- ❌ No dependency injection
- ❌ No structured logging
- ❌ No comprehensive error handling
- ❌ Deprecated FastAPI patterns (`on_event`)
- ❌ No API versioning
- ❌ No testing infrastructure

#### Infrastructure
- ❌ Minimal CI (only Python compile check)
- ❌ No health checks
- ❌ No monitoring/observability
- ❌ No environment-based configuration
- ❌ No pre-commit hooks
- ❌ No automated testing in CI

#### Developer Experience
- ❌ No hot reload for frontend
- ❌ No type checking in CI
- ❌ No code coverage metrics
- ❌ No automated formatting enforcement
- ❌ Limited contribution guidelines for new tech

## Proposed Modernization Strategy

### Phase 1: Foundation & Tooling (Weeks 1-2)

#### 1.1 Frontend Build System

**Recommendation: Vite + TypeScript + SWC**

```bash
# New frontend structure
frontend/
├── src/
│   ├── main.ts              # Entry point
│   ├── config.ts            # Dynamic configuration (addresses #1)
│   ├── types/               # TypeScript definitions
│   │   ├── ble.ts
│   │   ├── api.ts
│   │   └── sfp.ts
│   ├── services/            # Business logic layer
│   │   ├── BLEService.ts
│   │   ├── APIService.ts
│   │   └── SFPParser.ts
│   ├── stores/              # State management
│   │   ├── bleStore.ts
│   │   ├── moduleStore.ts
│   │   └── configStore.ts
│   ├── components/          # UI components (see framework choice)
│   └── utils/
│       ├── logger.ts
│       └── crypto.ts        # SHA-256 client-side (Issue #7)
├── public/
├── tests/
│   ├── unit/
│   └── integration/
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .eslintrc.json
```

**Why Vite?**
- ⚡ Lightning-fast HMR (instant feedback during development)
- 📦 Optimized production builds with tree-shaking
- 🔧 Zero-config TypeScript support
- 🎯 First-class Web Worker support (useful for crypto operations)
- 🔌 Rich plugin ecosystem

**Alternative:** Webpack 5 (more mature, but slower dev experience)

#### 1.2 Frontend Framework Choice

**Recommendation: Svelte 5 or Preact**

| Framework | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Svelte 5** ⭐ | - No virtual DOM (faster)<br>- Smaller bundle size<br>- Reactive by default<br>- Excellent TypeScript support<br>- Built-in stores | - Smaller ecosystem<br>- Less familiar to contributors | Lightweight apps, great performance |
| **Preact** | - 3KB gzipped<br>- React-compatible<br>- Familiar API<br>- Signal support | - Smaller than React ecosystem<br>- Some React libs need compat layer | React familiarity + size constraints |
| **Vanilla TS** | - No framework lock-in<br>- Full control<br>- Smallest bundle | - More boilerplate<br>- Manual reactivity<br>- Harder maintenance | Simple apps (current approach) |
| **React** | - Huge ecosystem<br>- Most contributors know it<br>- Best tooling | - Larger bundle (~45KB)<br>- More complex setup | Large teams, complex UIs |

**Recommendation: Svelte 5**

**Rationale:**
- Perfect for this use case (small app, real-time BLE data)
- Reactive stores align perfectly with BLE notification patterns
- Tiny bundle size critical for Web Bluetooth contexts
- TypeScript support is excellent
- Learning curve offset by superior DX

**Example Svelte Component:**
```typescript
// src/components/BLEConnection.svelte
<script lang="ts">
  import { bleStore } from '../stores/bleStore';
  import { connectToDevice } from '../services/BLEService';

  let connecting = false;

  async function handleConnect() {
    connecting = true;
    try {
      await connectToDevice();
    } finally {
      connecting = false;
    }
  }
</script>

<section class="card">
  <h2>Connection</h2>
  <button on:click={handleConnect} disabled={connecting || $bleStore.connected}>
    {connecting ? 'Connecting...' : 'Connect to SFP Wizard'}
  </button>
  <div class="status-grid">
    <span>BLE Status:</span>
    <span class="status-light" data-status={$bleStore.connected ? 'connected' : 'disconnected'}>
      {$bleStore.connected ? 'Connected' : 'Disconnected'}
    </span>
  </div>
</section>

<style>
  /* Scoped styles */
  .status-grid {
    /* ... */
  }
</style>
```

#### 1.3 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["vite/client", "web-bluetooth"]
  }
}
```

#### 1.4 Configuration Management (Addresses Issue #1)

**Problem:** Hardcoded BLE UUIDs, API endpoints, community URLs

**Solution:** Environment-based configuration with runtime overrides

```typescript
// src/config.ts
interface AppConfig {
  ble: {
    serviceUUID: string;
    writeCharUUID: string;
    notifyCharUUID: string;
  };
  api: {
    baseURL: string;
  };
  community: {
    indexURL: string;
  };
  features: {
    enableDeviceDiscovery: boolean;
    enableCommunityModules: boolean;
  };
}

// Load from env vars (build-time) with runtime override support
const DEFAULT_CONFIG: AppConfig = {
  ble: {
    serviceUUID: import.meta.env.VITE_BLE_SERVICE_UUID || 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
    writeCharUUID: import.meta.env.VITE_BLE_WRITE_UUID || 'YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY',
    notifyCharUUID: import.meta.env.VITE_BLE_NOTIFY_UUID || 'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ',
  },
  api: {
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  },
  community: {
    indexURL: import.meta.env.VITE_COMMUNITY_INDEX_URL || '',
  },
  features: {
    enableDeviceDiscovery: import.meta.env.VITE_ENABLE_DISCOVERY === 'true',
    enableCommunityModules: import.meta.env.VITE_ENABLE_COMMUNITY === 'true',
  },
};

// Allow runtime override via localStorage (dev/testing)
export function getConfig(): AppConfig {
  const stored = localStorage.getItem('sfp_config_override');
  if (stored) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    } catch {
      console.warn('Invalid config override, using defaults');
    }
  }
  return DEFAULT_CONFIG;
}

// UI for configuration (dev mode)
export function updateConfig(partial: Partial<AppConfig>): void {
  const current = getConfig();
  const updated = { ...current, ...partial };
  localStorage.setItem('sfp_config_override', JSON.stringify(updated));
  window.location.reload(); // Force reload to apply
}
```

**.env.example:**
```bash
# BLE Configuration - Replace with your device UUIDs
VITE_BLE_SERVICE_UUID=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
VITE_BLE_WRITE_UUID=YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY
VITE_BLE_NOTIFY_UUID=ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ

# API Configuration
VITE_API_BASE_URL=/api

# Community Features
VITE_COMMUNITY_INDEX_URL=https://josiah-nelson.github.io/SFPLiberate-modules/index.json
VITE_ENABLE_DISCOVERY=false
VITE_ENABLE_COMMUNITY=false
```

#### 1.5 State Management

**Recommendation: Nanostores or Svelte Stores**

```typescript
// src/stores/bleStore.ts
import { writable, derived } from 'svelte/store';
import type { BLEConnectionState, SFPModule } from '../types';

interface BLEState {
  connected: boolean;
  device: BluetoothDevice | null;
  server: BluetoothRemoteGATTServer | null;
  writeCharacteristic: BluetoothRemoteGATTCharacteristic | null;
  notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null;
  sfpPresent: boolean;
  lastRead: SFPModule | null;
}

function createBLEStore() {
  const { subscribe, set, update } = writable<BLEState>({
    connected: false,
    device: null,
    server: null,
    writeCharacteristic: null,
    notifyCharacteristic: null,
    sfpPresent: false,
    lastRead: null,
  });

  return {
    subscribe,
    connect: async (device: BluetoothDevice) => {
      update(state => ({ ...state, device, connected: false }));
      // Connection logic here
      update(state => ({ ...state, connected: true }));
    },
    disconnect: () => {
      update(state => {
        state.server?.disconnect();
        return {
          ...state,
          connected: false,
          device: null,
          server: null,
          writeCharacteristic: null,
          notifyCharacteristic: null,
        };
      });
    },
    updateSFPPresence: (present: boolean) => {
      update(state => ({ ...state, sfpPresent: present }));
    },
    setLastRead: (module: SFPModule) => {
      update(state => ({ ...state, lastRead: module }));
    },
    reset: () => set({
      connected: false,
      device: null,
      server: null,
      writeCharacteristic: null,
      notifyCharacteristic: null,
      sfpPresent: false,
      lastRead: null,
    }),
  };
}

export const bleStore = createBLEStore();

// Derived store for UI convenience
export const isReadyToRead = derived(
  bleStore,
  $ble => $ble.connected && $ble.sfpPresent
);
```

### Phase 2: Backend Modernization (Weeks 2-3)

#### 2.1 Project Structure

```bash
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings management (Pydantic Settings)
│   ├── dependencies.py      # DI container
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py
│   │   │   ├── modules.py
│   │   │   ├── submissions.py
│   │   │   └── health.py
│   │   └── deps.py          # Route dependencies
│   ├── core/
│   │   ├── __init__.py
│   │   ├── database.py      # Database session management
│   │   ├── logging.py       # Structured logging setup
│   │   └── security.py      # Security utilities (future: API keys)
│   ├── models/              # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── module.py
│   │   └── submission.py
│   ├── schemas/             # Pydantic schemas (API contracts)
│   │   ├── __init__.py
│   │   ├── module.py
│   │   └── submission.py
│   ├── services/            # Business logic layer
│   │   ├── __init__.py
│   │   ├── module_service.py
│   │   ├── submission_service.py
│   │   └── sfp_parser.py
│   └── repositories/        # Data access layer
│       ├── __init__.py
│       ├── base.py
│       └── module_repository.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Pytest fixtures
│   ├── unit/
│   │   ├── test_sfp_parser.py
│   │   └── test_module_service.py
│   └── integration/
│       └── test_api.py
├── alembic/                 # Database migrations
│   ├── versions/
│   └── env.py
├── alembic.ini
├── pyproject.toml           # Modern Python packaging
├── Dockerfile
└── requirements.txt
```

#### 2.2 Dependency Management - Poetry

**Replace `requirements.txt` with `pyproject.toml`:**

```toml
[tool.poetry]
name = "sfpliberate-backend"
version = "1.0.0"
description = "Backend API for SFPLiberate"
authors = ["SFPLiberate Contributors"]

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
pydantic = "^2.5.0"
pydantic-settings = "^2.1.0"
sqlalchemy = "^2.0.25"
alembic = "^1.13.0"
structlog = "^24.1.0"
httpx = "^0.26.0"  # For fetching community modules

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
ruff = "^0.1.0"
mypy = "^1.8.0"
black = "^24.0.0"
httpx = "^0.26.0"  # For TestClient

[tool.ruff]
line-length = 100
target-version = "py311"
select = ["E", "F", "I", "N", "W", "UP", "B", "A", "C4", "PT"]

[tool.ruff.isort]
known-first-party = ["app"]

[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "--cov=app --cov-report=html --cov-report=term-missing"

[tool.coverage.run]
source = ["app"]
omit = ["*/tests/*", "*/migrations/*"]

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

#### 2.3 Configuration Management

```python
# app/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application configuration with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "sqlite:///./data/sfp_library.db"
    database_echo: bool = False

    # API
    api_v1_prefix: str = "/api/v1"
    project_name: str = "SFPLiberate API"
    version: str = "1.0.0"

    # CORS
    cors_origins: list[str] = ["*"]

    # Submissions
    submissions_dir: str = "/app/data/submissions"

    # Logging
    log_level: str = "INFO"
    log_json: bool = True

    # Features
    enable_community_import: bool = False
    community_index_url: str = ""

@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
```

#### 2.4 Database Layer - SQLAlchemy 2.0

```python
# app/models/module.py
from datetime import datetime
from sqlalchemy import String, LargeBinary, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class SFPModule(Base):
    __tablename__ = "sfp_modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial: Mapped[str | None] = mapped_column(String(100))
    eeprom_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    __table_args__ = (
        Index('idx_vendor_model', 'vendor', 'model'),
    )

    def __repr__(self) -> str:
        return f"<SFPModule(id={self.id}, name={self.name!r})>"
```

```python
# app/core/database.py
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import get_settings
from app.models.module import Base

settings = get_settings()

# Convert sqlite:/// to sqlite+aiosqlite:///
DATABASE_URL = settings.database_url.replace("sqlite://", "sqlite+aiosqlite://")

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.database_echo,
    future=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database sessions."""
    async with async_session_maker() as session:
        yield session

async def init_db() -> None:
    """Initialize database (create tables)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

#### 2.5 Repository Pattern

```python
# app/repositories/module_repository.py
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.module import SFPModule

class ModuleRepository:
    """Repository for SFP module data access."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> Sequence[SFPModule]:
        """Get all modules (excluding BLOB data for performance)."""
        result = await self.session.execute(
            select(SFPModule).order_by(SFPModule.name)
        )
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
        """Delete module by ID."""
        module = await self.get_by_id(module_id)
        if module:
            await self.session.delete(module)
            return True
        return False
```

#### 2.6 Service Layer

```python
# app/services/module_service.py
import hashlib
from typing import Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.module import SFPModule
from app.repositories.module_repository import ModuleRepository
from app.services.sfp_parser import parse_sfp_data

class ModuleService:
    """Business logic for SFP module operations."""

    def __init__(self, session: AsyncSession):
        self.repository = ModuleRepository(session)

    async def add_module(
        self,
        name: str,
        eeprom_data: bytes
    ) -> Tuple[SFPModule, bool]:
        """
        Add a module with duplicate detection.

        Returns:
            Tuple of (module, is_duplicate)
        """
        # Compute checksum
        sha256 = hashlib.sha256(eeprom_data).hexdigest()

        # Check for duplicate
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

    async def get_module_eeprom(self, module_id: int) -> bytes | None:
        """Get raw EEPROM data for a module."""
        module = await self.repository.get_by_id(module_id)
        return module.eeprom_data if module else None

    async def delete_module(self, module_id: int) -> bool:
        """Delete a module."""
        return await self.repository.delete(module_id)
```

#### 2.7 Modern FastAPI Patterns

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.config import get_settings
from app.core.database import init_db
from app.core.logging import setup_logging
from app.api.v1.router import api_router

settings = get_settings()
logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager (replaces deprecated on_event)."""
    # Startup
    setup_logging(settings.log_level, settings.log_json)
    logger.info("application_startup", version=settings.version)
    await init_db()
    yield
    # Shutdown
    logger.info("application_shutdown")

app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    lifespan=lifespan,
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url=f"{settings.api_v1_prefix}/docs",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Router
app.include_router(api_router, prefix=settings.api_v1_prefix)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.version}
```

```python
# app/api/v1/modules.py
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.database import get_db
from app.schemas.module import ModuleCreate, ModuleInfo, StatusMessage
from app.services.module_service import ModuleService
import base64

router = APIRouter()
logger = structlog.get_logger()

@router.get("/modules", response_model=list[ModuleInfo])
async def get_all_modules(
    db: AsyncSession = Depends(get_db)
):
    """Get all saved SFP modules."""
    service = ModuleService(db)
    modules = await service.get_all_modules()
    return modules

@router.post("/modules", response_model=StatusMessage)
async def create_module(
    module: ModuleCreate,
    db: AsyncSession = Depends(get_db)
):
    """Save a new SFP module."""
    try:
        eeprom_data = base64.b64decode(module.eeprom_data_base64)
    except Exception as e:
        logger.warning("invalid_base64", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid Base64 data")

    service = ModuleService(db)
    created_module, is_duplicate = await service.add_module(
        name=module.name,
        eeprom_data=eeprom_data
    )

    logger.info(
        "module_saved",
        module_id=created_module.id,
        is_duplicate=is_duplicate,
        sha256=created_module.sha256[:16]
    )

    return StatusMessage(
        status="duplicate" if is_duplicate else "success",
        message=(
            f"Module already exists (SHA256 match). Using existing ID {created_module.id}."
            if is_duplicate
            else f"Module '{module.name}' saved successfully."
        ),
        id=created_module.id
    )

@router.get("/modules/{module_id}/eeprom")
async def get_module_eeprom(
    module_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get raw EEPROM data for a module."""
    service = ModuleService(db)
    eeprom = await service.get_module_eeprom(module_id)

    if not eeprom:
        raise HTTPException(status_code=404, detail="Module not found")

    return Response(content=eeprom, media_type="application/octet-stream")

@router.delete("/modules/{module_id}", response_model=StatusMessage)
async def delete_module(
    module_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a module."""
    service = ModuleService(db)
    deleted = await service.delete_module(module_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Module not found")

    logger.info("module_deleted", module_id=module_id)
    return StatusMessage(status="success", message="Module deleted")
```

#### 2.8 Structured Logging

```python
# app/core/logging.py
import logging
import sys
import structlog

def setup_logging(log_level: str = "INFO", json_logs: bool = True):
    """Configure structured logging."""

    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # Configure structlog
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if json_logs:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

#### 2.9 Database Migrations - Alembic

```bash
# Initialize Alembic
poetry run alembic init alembic

# Generate migration
poetry run alembic revision --autogenerate -m "Initial schema"

# Run migrations
poetry run alembic upgrade head
```

```python
# alembic/env.py
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.models.module import Base
from app.config import get_settings

config = context.config
settings = get_settings()

# Override sqlalchemy.url with our settings
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata

# ... rest of Alembic config
```

### Phase 3: Testing Infrastructure (Week 3)

#### 3.1 Backend Testing

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.core.database import get_db
from app.models.module import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def async_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def async_session(async_engine):
    async_session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session_maker() as session:
        yield session

@pytest_asyncio.fixture
async def client(async_session):
    async def override_get_db():
        yield async_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

```python
# tests/integration/test_modules_api.py
import pytest
import base64

@pytest.mark.asyncio
async def test_create_module(client):
    """Test creating a new module."""
    fake_eeprom = b"X" * 256  # Fake EEPROM data
    payload = {
        "name": "Test Module",
        "eeprom_data_base64": base64.b64encode(fake_eeprom).decode()
    }

    response = await client.post("/api/v1/modules", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "id" in data

@pytest.mark.asyncio
async def test_duplicate_detection(client):
    """Test that duplicate modules are detected."""
    fake_eeprom = b"Y" * 256
    payload = {
        "name": "Duplicate Test",
        "eeprom_data_base64": base64.b64encode(fake_eeprom).decode()
    }

    # First save
    response1 = await client.post("/api/v1/modules", json=payload)
    id1 = response1.json()["id"]

    # Second save (duplicate)
    response2 = await client.post("/api/v1/modules", json=payload)
    data2 = response2.json()
    assert data2["status"] == "duplicate"
    assert data2["id"] == id1

@pytest.mark.asyncio
async def test_get_all_modules(client):
    """Test retrieving all modules."""
    response = await client.get("/api/v1/modules")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

#### 3.2 Frontend Testing (Vitest)

```typescript
// tests/unit/services/BLEService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BLEService } from '../../../src/services/BLEService';

describe('BLEService', () => {
  it('should detect Web Bluetooth availability', () => {
    const isAvailable = BLEService.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
  });

  it('should handle connection errors gracefully', async () => {
    const mockNavigator = {
      bluetooth: {
        requestDevice: vi.fn().mockRejectedValue(new Error('User cancelled'))
      }
    };

    // Test error handling
    // ...
  });
});
```

### Phase 4: CI/CD & DevOps (Week 4)

#### 4.1 Enhanced GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Poetry
        uses: snok/install-poetry@v1

      - name: Install dependencies
        working-directory: ./backend
        run: poetry install

      - name: Run linters
        working-directory: ./backend
        run: |
          poetry run ruff check .
          poetry run mypy app

      - name: Run tests
        working-directory: ./backend
        run: poetry run pytest --cov --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./backend/coverage.xml

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: ./frontend
        run: npm ci

      - name: Lint
        working-directory: ./frontend
        run: npm run lint

      - name: Type check
        working-directory: ./frontend
        run: npm run type-check

      - name: Run tests
        working-directory: ./frontend
        run: npm run test:coverage

      - name: Build
        working-directory: ./frontend
        run: npm run build

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker images
        run: docker-compose build

      - name: Test Docker stack
        run: |
          docker-compose up -d
          sleep 10
          curl -f http://localhost:8080/health || exit 1
          docker-compose down
```

#### 4.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ['--maxkb=500']

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [types-all]

  - repo: local
    hooks:
      - id: frontend-lint
        name: Frontend Lint
        entry: bash -c 'cd frontend && npm run lint'
        language: system
        pass_filenames: false
```

#### 4.3 Docker Improvements

```dockerfile
# backend/Dockerfile (multi-stage build)
FROM python:3.11-slim as builder

WORKDIR /build

# Install Poetry
RUN pip install poetry

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Export requirements (for faster subsequent builds)
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Copy requirements from builder
COPY --from=builder /build/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:80/health')"

# Run migrations and start server
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port 80
```

```dockerfile
# frontend/Dockerfile (multi-stage)
FROM node:20-alpine as builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

EXPOSE 80
```

```yaml
# docker-compose.yml (enhanced)
version: "3.8"

services:
  backend:
    build:
      context: ./backend
      target: ${BUILD_TARGET:-production}
    container_name: sfpliberate-backend
    environment:
      - DATABASE_URL=sqlite:///./data/sfp_library.db
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - LOG_JSON=true
    volumes:
      - backend_data:/app/data
    expose:
      - "80"
    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:80/health')"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
    container_name: sfpliberate-frontend
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "${PORT:-8080}:80"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped

volumes:
  backend_data:
    driver: local

networks:
  default:
    name: sfpliberate-network
```

### Phase 5: Developer Experience (Week 4)

#### 5.1 Development Mode

```yaml
# docker-compose.dev.yml
version: "3.8"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend/app:/app/app:ro  # Live reload
    environment:
      - DATABASE_ECHO=true
      - LOG_JSON=false
    command: uvicorn app.main:app --host 0.0.0.0 --port 80 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend/src:/app/src:ro  # Live reload
    environment:
      - VITE_BLE_SERVICE_UUID=${VITE_BLE_SERVICE_UUID}
    command: npm run dev -- --host 0.0.0.0
```

#### 5.2 VS Code Configuration

```json
// .vscode/settings.json
{
  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true,
  "python.formatting.provider": "black",
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["tests"],
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "typescript.tsdk": "frontend/node_modules/typescript/lib",
  "eslint.workingDirectories": ["frontend"]
}
```

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload"],
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "DATABASE_URL": "sqlite:///./data/sfp_library.db"
      }
    },
    {
      "name": "Frontend: Vite",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/frontend",
      "console": "integratedTerminal"
    }
  ]
}
```

## Implementation Roadmap

### Week 1: Frontend Foundation
- [x] Set up Vite + TypeScript + Svelte
- [x] Configure environment-based config system (Issue #1)
- [x] Implement BLE service layer
- [x] Create state management with stores
- [x] Migrate core components

### Week 2: Backend Modernization
- [x] Set up Poetry + pyproject.toml
- [x] Implement SQLAlchemy models
- [x] Add Alembic migrations
- [x] Refactor to service/repository pattern
- [x] Add structured logging
- [x] Update to modern FastAPI patterns

### Week 3: Testing & Quality
- [x] Backend: pytest + coverage
- [x] Frontend: Vitest + testing-library
- [x] Set up pre-commit hooks
- [x] Add type checking to CI
- [x] Achieve 70%+ code coverage

### Week 4: CI/CD & Polish
- [x] Enhanced GitHub Actions
- [x] Multi-stage Docker builds
- [x] Health checks
- [x] Development docker-compose
- [x] Documentation updates

## Migration Strategy

### Option A: Big Bang (Not Recommended)
- Create `v2` branch
- Rewrite everything
- Risk: High, long feedback loop

### Option B: Incremental Migration (Recommended) ⭐
1. **Phase 1**: Backend first (Weeks 1-2)
   - Old frontend continues to work
   - New backend is backward compatible
   - Switch over when stable

2. **Phase 2**: Frontend rebuild (Weeks 2-3)
   - New frontend consumes updated API
   - Can run old and new in parallel (feature flag)

3. **Phase 3**: Polish & Testing (Week 3-4)
   - Add comprehensive tests
   - Improve CI/CD
   - Documentation

### Backward Compatibility Plan
- Keep `/api/modules` endpoints unchanged
- Add `/api/v1/modules` for new features
- Frontend auto-detects API version
- Deprecation warnings for old endpoints

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes during migration | High | Feature flags, parallel deployment |
| Learning curve (Svelte, SQLAlchemy) | Medium | Comprehensive docs, pair programming |
| Extended development time | Medium | Incremental rollout, clear milestones |
| Community resistance to change | Low | Communicate benefits, maintain contrib docs |
| BLE functionality regression | High | Extensive testing, keep old code as reference |

## Success Metrics

- ✅ Type safety: 100% TypeScript/type-hinted Python
- ✅ Test coverage: >70% backend, >60% frontend
- ✅ Build time: <30s for full rebuild
- ✅ Bundle size: <200KB (frontend)
- ✅ CI time: <5 minutes
- ✅ Zero hardcoded config values
- ✅ All 7 open issues addressable with new architecture

## Next Steps

1. **Approve this proposal** - Review with maintainers
2. **Create tracking issue** - GitHub project board
3. **Set up development branch** - `feature/modernization`
4. **Start with backend** - Lowest risk, highest value
5. **Iterate quickly** - Weekly demos and feedback

## Questions & Discussion

- **Q: Why Svelte over React?**
  - A: Smaller bundle, better performance for real-time BLE data, simpler reactivity

- **Q: Why not keep vanilla JS?**
  - A: Type safety prevents bugs, better IDE support, easier refactoring, scales better

- **Q: Do we need async SQLAlchemy?**
  - A: Future-proofs for scaling, better concurrency, modern Python patterns

- **Q: What about existing contributors?**
  - A: Comprehensive migration guide, maintain old docs during transition, mentorship

## Conclusion

This modernization will transform SFPLiberate from a working prototype into a production-ready, maintainable application. The incremental approach minimizes risk while delivering value continuously. The proposed stack (Svelte + TypeScript + FastAPI + SQLAlchemy) represents current best practices and will serve the project well for years to come.

**Recommendation: Proceed with incremental migration starting with backend modernization.**
