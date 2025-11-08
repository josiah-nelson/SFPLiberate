# Appwrite Native Architecture

## Overview

This document describes the architectural shift to use native Appwrite services for the Appwrite deployment mode, while maintaining FastAPI backend for standalone Docker deployment.

## Deployment Modes

### Standalone Mode (Docker)
- **Frontend**: Next.js standalone server
- **Backend**: FastAPI + SQLAlchemy + SQLite
- **API**: REST endpoints (`/api/v1/modules`)
- **BLE**: Web Bluetooth API (browser) + ESPHome proxy (optional)

### Appwrite Mode (Cloud)
- **Frontend**: Next.js static export on Appwrite Sites
- **Backend**: Appwrite Database + Storage (NO FastAPI)
- **API**: Appwrite SDK (direct client calls)
- **BLE**: Web Bluetooth API (browser only)

## Database Schema Mapping

### Current SQLAlchemy Model
```python
class SFPModule(Base):
    id: int (primary key)
    name: str
    vendor: str | None
    model: str | None
    serial: str | None
    eeprom_data: bytes (LargeBinary)
    sha256: str (unique, indexed)
    created_at: datetime
```

### Appwrite Collections

#### Personal Module Library (`user-modules`)
**Purpose**: User's personal SFP module library (one collection per user via permissions)

**Attributes**:
- `name` (string, required) - User-defined module name
- `vendor` (string, optional) - Extracted from EEPROM
- `model` (string, optional) - Extracted from EEPROM
- `serial` (string, optional) - Extracted from EEPROM
- `sha256` (string, required, indexed) - Hash for duplicate detection
- `eeprom_file_id` (string, required) - Reference to Storage bucket
- `size` (integer, required) - EEPROM data size in bytes
- `created_at` (datetime, auto) - Timestamp

**Indexes**:
- `sha256` (unique per user) - Fast duplicate detection
- `created_at` (desc) - Chronological ordering

**Permissions**:
- Read: User only (`read("user:{userId}")`)
- Create: User only (`create("user:{userId}")`)
- Update: User only (`update("user:{userId}")`)
- Delete: User only (`delete("user:{userId}")`)

#### Community Modules (`modules`)
**Purpose**: Shared community module database

**Attributes**: (already exists, see `community.ts`)
- `name`, `vendor`, `model`, `serial`, `sha256`
- `blobId`, `photoId`, `size`
- `comments`, `wavelength`, `maxDistance`, etc.
- `verified`, `downloads`, `submittedBy`

**Permissions**:
- Read: Any authenticated user
- Create: Any authenticated user (pending verification)
- Update: Admins only
- Delete: Admins only

### Appwrite Storage Buckets

#### User EEPROM Data (`user-eeprom`)
**Purpose**: Store binary EEPROM files for personal library

**Configuration**:
- File size limit: 256 KB (SFP EEPROM is typically 256-512 bytes)
- Allowed file types: `application/octet-stream`
- Compression: Disabled (data already compact)
- Antivirus: Enabled
- Encryption: Enabled

**Permissions**:
- Read: File owner only
- Create: Authenticated users
- Update: No updates (immutable)
- Delete: File owner only

#### Community Blobs (`blobs`)
**Purpose**: Store EEPROM files for community modules (already exists)

## Repository Pattern

### Interface Abstraction

```typescript
interface ModuleRepository {
  // List all modules for current user
  listModules(): Promise<Module[]>;

  // Create new module
  createModule(data: CreateModuleData): Promise<Module>;

  // Get module by ID
  getModule(id: string): Promise<Module>;

  // Get EEPROM binary data
  getEEPROMData(id: string): Promise<ArrayBuffer>;

  // Delete module
  deleteModule(id: string): Promise<void>;
}
```

### Implementation Classes

#### StandaloneRepository
Uses FastAPI REST API via fetch:
- `GET /api/v1/modules` → listModules()
- `POST /api/v1/modules` → createModule()
- `GET /api/v1/modules/{id}/eeprom` → getEEPROMData()
- `DELETE /api/v1/modules/{id}` → deleteModule()

#### AppwriteRepository
Uses Appwrite SDK:
- `databases.listDocuments()` → listModules()
- `storage.createFile()` + `databases.createDocument()` → createModule()
- `storage.getFileDownload()` → getEEPROMData()
- `databases.deleteDocument()` + `storage.deleteFile()` → deleteModule()

### Factory Pattern

```typescript
function getModuleRepository(): ModuleRepository {
  if (isAppwrite()) {
    return new AppwriteRepository();
  }
  return new StandaloneRepository();
}
```

## Business Logic Migration

### Client-Side (Frontend)

**EEPROM Parsing** - Move to frontend:
```typescript
// frontend/src/lib/sfp/parser.ts
function parseSFPData(eeprom: ArrayBuffer): {
  vendor: string;
  model: string;
  serial: string;
} {
  // SFF-8472 parsing logic (same as backend)
  // Bytes 20-36: Vendor
  // Bytes 40-56: Model
  // Bytes 68-84: Serial
}
```

**SHA256 Hashing** - Use Web Crypto API:
```typescript
async function calculateSHA256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Duplicate Detection** - Query before create:
```typescript
// Appwrite mode: Query by sha256
const Query = await getQuery();
const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
  Query.equal('sha256', hash)
]);

// Standalone mode: Backend handles this
```

### Server-Side (Appwrite Functions)

**NOT NEEDED** for basic CRUD operations. All logic can run in browser:
- Parsing: Pure TypeScript in browser
- Hashing: Web Crypto API
- Storage: Appwrite SDK direct upload

**OPTIONAL** Appwrite Function for:
- Batch operations
- Admin tasks
- Complex validation (if needed later)

## Frontend Component Changes

### Module List (`/modules/page.tsx`)

**Before** (Standalone only):
```typescript
const res = await fetch(`${base}/v1/modules`);
const modules = await res.json();
```

**After** (Mode-aware):
```typescript
import { getModuleRepository } from '@/lib/repositories';

const repository = getModuleRepository();
const modules = await repository.listModules();
```

### Module Save (BLE Manager)

**Before** (Standalone only):
```typescript
const res = await fetch(`${base}/v1/modules`, {
  method: 'POST',
  body: JSON.stringify({ eeprom_base64: b64, name: 'Module Name' })
});
```

**After** (Mode-aware):
```typescript
import { getModuleRepository } from '@/lib/repositories';
import { parseSFPData, calculateSHA256 } from '@/lib/sfp';

const eepromBuffer = getBleState().rawEepromData;
const metadata = await parseSFPData(eepromBuffer);
const sha256 = await calculateSHA256(eepromBuffer);

const repository = getModuleRepository();
await repository.createModule({
  name: 'My Module',
  eepromData: eepromBuffer,
  vendor: metadata.vendor,
  model: metadata.model,
  serial: metadata.serial,
  sha256
});
```

## Appwrite provisioning

### Canonical resource names

To keep the cloud deployment predictable we standardize on the following IDs:

| Resource | ID |
| --- | --- |
| Database | `lib-core` |
| Personal module collection | `user-modules` |
| Community module collection | `community-modules` |
| Personal EEPROM bucket | `user-eeprom` |
| Community blob bucket | `community-blobs` |
| Community photo bucket | `community-photos` |

Environment variables (for example `APPWRITE_DATABASE_ID`) can override these defaults when needed, but the maintainer deployment relies on the IDs above.

### Automated setup script

The repository provides `scripts/appwrite/provision.mjs` to create or reconcile these resources. The script is idempotent—running it multiple times ensures attributes, indexes, and permissions stay aligned with the architecture document.

```bash
export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
export APPWRITE_PROJECT_ID="<project-id>"
export APPWRITE_API_KEY="<scoped-api-key>"

node scripts/appwrite/provision.mjs
```

The script creates the database, collections, and buckets if they are missing, and patches attribute/index definitions when they drift. This avoids manual console steps and keeps the infrastructure reproducible between environments.

## Migration Path

### Phase 1: Create Repository Abstraction
1. Create `ModuleRepository` interface
2. Implement `StandaloneRepository` (wraps existing fetch calls)
3. Implement `AppwriteRepository` (uses Appwrite SDK)
4. Create factory function with mode detection

### Phase 2: Move Business Logic to Frontend
1. Create `frontend/src/lib/sfp/parser.ts` (port from backend)
2. Create `frontend/src/lib/sfp/hash.ts` (SHA256 via Web Crypto)
3. Update `AppwriteRepository` to use client-side parsing

### Phase 3: Update Components
1. Update `modules/page.tsx` to use repository
2. Update `ble/manager.ts` to use repository
3. Add proper error handling and loading states

### Phase 4: Appwrite Infrastructure
1. Create Appwrite collections via CLI or Console
2. Create storage buckets
3. Configure permissions
4. Test with sample data

### Phase 5: Testing
1. Test standalone mode (should work unchanged)
2. Test Appwrite mode (new implementation)
3. Verify data isolation between users
4. Test error scenarios

## Security Considerations

### Data Isolation
- **Standalone**: Single-user system, no isolation needed
- **Appwrite**: Document-level permissions ensure users only see their own modules

### Authentication
- **Standalone**: No authentication
- **Appwrite**: Appwrite Auth required for all operations

### File Upload Validation
- Validate EEPROM file size (< 256 KB)
- Validate MIME type (application/octet-stream)
- Calculate SHA256 hash client-side
- Check for duplicates before upload

## Performance Considerations

### Caching
- **Standalone**: Browser cache via fetch
- **Appwrite**: Use Appwrite's built-in caching + browser cache

### Pagination
- **Standalone**: Load all modules (typically < 100)
- **Appwrite**: Use Query.limit() and Query.offset() for large collections

### File Downloads
- **Standalone**: Direct binary response
- **Appwrite**: Pre-signed URLs from Storage.getFileDownload()

## Fallback Strategy

If Appwrite services are unavailable:
1. Detect error in repository method
2. Show user-friendly error message
3. Provide offline capability (if IndexedDB cache exists)
4. Retry with exponential backoff

## Benefits of This Architecture

1. **Clean Separation**: Standalone and Appwrite modes completely independent
2. **No Backend Code**: Appwrite mode uses only SDK (no Functions needed)
3. **Type Safety**: TypeScript interfaces ensure consistency
4. **Testable**: Repository pattern enables easy mocking
5. **Scalable**: Appwrite handles auth, permissions, and scaling
6. **Maintainable**: Single source of truth for each deployment mode

## Trade-offs

### Pros
- ✅ Simple Appwrite deployment (no serverless functions)
- ✅ Client-side logic easier to debug
- ✅ No cold-start latency from Functions
- ✅ Direct SDK access = less abstraction

### Cons
- ❌ Parsing logic duplicated (frontend + backend)
- ❌ No server-side validation for Appwrite mode
- ❌ Client-side hashing (requires modern browser)
- ❌ Two codepaths to maintain

**Decision**: Pros outweigh cons for this use case. Most users run modern browsers, and the added complexity of Appwrite Functions isn't justified for simple CRUD operations.

## Next Steps

1. Review and approve this architecture
2. Implement Phase 1 (repository abstraction)
3. Test with existing standalone deployment
4. Proceed with Phases 2-5

---

**Last Updated**: 2025-11-08
**Status**: Proposed Architecture
**Reviewed By**: TBD
