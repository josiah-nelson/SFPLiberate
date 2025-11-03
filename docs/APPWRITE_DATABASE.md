# Appwrite Database Setup for SFPLiberate

This document describes the Appwrite database schema and setup instructions for the public hosted version of SFPLiberate. The standalone Docker version continues to use SQLite.

---

## Architecture Overview

The public Appwrite deployment uses:
- **Appwrite Databases**: NoSQL document storage for module metadata
- **Appwrite Storage**: Binary file storage for EEPROM data
- **Automatic Deduplication**: Uses SHA-256 hash as document ID to prevent duplicates
- **Role-Based Permissions**: Read for authenticated users, write/delete for admins only

### Why Appwrite Database vs SQLite?

| Feature | SQLite (Standalone) | Appwrite (Public Cloud) |
|---------|---------------------|-------------------------|
| **Deployment** | Local Docker container | Managed cloud service |
| **Scaling** | Single instance only | Horizontal auto-scaling |
| **Backups** | Manual volume backups | Automatic daily backups |
| **Real-time** | Not supported | WebSocket subscriptions |
| **File Storage** | BLOBs in database | Dedicated storage service |
| **Authentication** | Not required | Integrated with Appwrite Auth |
| **Permissions** | App-level only | Row-level granular control |
| **Cost** | Free (self-hosted) | Free tier available |

---

## Database Schema

### Database
- **Database ID**: `sfp_library`
- **Name**: SFP Module Library

### Collection: `sfp_modules`

| Attribute | Type | Size | Required | Default | Indexed | Description |
|-----------|------|------|----------|---------|---------|-------------|
| `name` | String | 255 | Yes | - | No | User-friendly module name (e.g., "Cisco 10G SFP+") |
| `vendor` | String | 255 | No | "" | Yes | Parsed from EEPROM bytes 20-36 (SFF-8472 spec) |
| `model` | String | 255 | No | "" | Yes | Parsed from EEPROM bytes 40-56 |
| `serial` | String | 255 | No | "" | No | Parsed from EEPROM bytes 68-84 |
| `sha256` | String | 64 | Yes | - | Unique | SHA-256 hash of EEPROM data (for deduplication) |
| `eeprom_file_id` | String | 64 | Yes | - | No | Reference to file in storage bucket |
| `created_at` | DateTime | - | Yes | Auto | No | ISO 8601 timestamp |

**Document ID Strategy**: Uses `sha256` as the document ID for natural deduplication. If a duplicate EEPROM is uploaded, Appwrite will reject the document creation due to ID conflict.

### Storage Bucket: `sfp_eeprom_data`

| Setting | Value | Description |
|---------|-------|-------------|
| **Bucket ID** | `sfp_eeprom_data` | Identifier for storage bucket |
| **Name** | SFP EEPROM Data | Human-readable name |
| **Max File Size** | 1 MB | SFP EEPROM is typically 256-512 bytes |
| **Allowed Extensions** | `.bin` | Binary files only |
| **Encryption** | Enabled | AES-256 encryption at rest |
| **Antivirus** | Enabled | Scan uploaded files for malware |

**File ID Strategy**: Uses SHA-256 hash as file ID (same as document ID) for consistent deduplication.

---

## Appwrite Console Setup

### 1. Create Database

1. Navigate to **Databases** in Appwrite Console
2. Click **Create Database**
3. Set **Database ID**: `sfp_library`
4. Set **Name**: SFP Module Library
5. Click **Create**

### 2. Create Collection

1. Inside the `sfp_library` database, click **Create Collection**
2. Set **Collection ID**: `sfp_modules`
3. Set **Name**: SFP Modules
4. Click **Create**

### 3. Add Attributes

Add the following attributes to the `sfp_modules` collection:

```bash
# String attributes
name        - String (255) - Required
vendor      - String (255) - Not Required - Default: ""
model       - String (255) - Not Required - Default: ""
serial      - String (255) - Not Required - Default: ""
sha256      - String (64)  - Required
eeprom_file_id - String (64) - Required

# DateTime attribute
created_at  - DateTime - Required - Default: Now
```

### 4. Create Indexes

1. Click **Indexes** tab in the collection
2. Create index for vendor search:
   - **Key**: `idx_vendor`
   - **Type**: Key
   - **Attributes**: `vendor` (ASC)
3. Create index for model search:
   - **Key**: `idx_model`
   - **Type**: Key
   - **Attributes**: `model` (ASC)
4. Create unique index for SHA256:
   - **Key**: `idx_sha256_unique`
   - **Type**: Unique
   - **Attributes**: `sha256` (ASC)

### 5. Configure Permissions

Set collection-level permissions:

#### Read Permissions (View modules)
- [x] **Any** - Allow anonymous users to browse module library

#### Create Permissions (Add modules)
- [ ] Any
- [x] **Users** - Authenticated users can save modules
- [x] **Team: admin** - Admins can add modules

#### Update Permissions (Edit modules)
- [ ] Any
- [ ] Users
- [x] **Team: admin** - Only admins can edit

#### Delete Permissions (Remove modules)
- [ ] Any
- [ ] Users
- [x] **Team: admin** - Only admins can delete

> **Note**: For stricter control, remove "Any" read permission and require authentication to view modules.

### 6. Create Storage Bucket

1. Navigate to **Storage** in Appwrite Console
2. Click **Create Bucket**
3. Set **Bucket ID**: `sfp_eeprom_data`
4. Set **Name**: SFP EEPROM Data
5. Configure settings:
   - **Max File Size**: 1048576 bytes (1 MB)
   - **Allowed Extensions**: `.bin`
   - **Encryption**: Enabled
   - **Antivirus**: Enabled (recommended for public uploads)
6. Click **Create**

### 7. Configure Bucket Permissions

Set bucket-level permissions:

#### Read Permissions (Download EEPROM files)
- [x] **Any** - Allow public download of EEPROM files

#### Create Permissions (Upload EEPROM files)
- [ ] Any
- [x] **Users** - Authenticated users can upload
- [x] **Team: admin** - Admins can upload

#### Update Permissions (Replace files)
- [ ] Any
- [ ] Users
- [x] **Team: admin** - Only admins can replace

#### Delete Permissions (Remove files)
- [ ] Any
- [ ] Users
- [x] **Team: admin** - Only admins can delete

---

## Backend Environment Variables

Add these variables to your backend environment (Appwrite Functions or container):

```bash
# Deployment mode (triggers database selection)
DEPLOYMENT_MODE=appwrite

# Appwrite connection
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id_here
APPWRITE_API_KEY=your_api_key_here

# Database configuration
APPWRITE_DATABASE_ID=sfp_library
APPWRITE_COLLECTION_ID=sfp_modules
APPWRITE_BUCKET_ID=sfp_eeprom_data

# Rate limiting for submissions (optional)
SUBMISSIONS_DIR=/tmp/submissions  # Inbox for community submissions
```

### Generating an API Key

1. Navigate to **API Keys** in Appwrite Console
2. Click **Create API Key**
3. Set **Name**: SFPLiberate Backend
4. Set **Expiration**: Never (or set appropriate expiry)
5. Configure **Scopes**:
   - [x] `databases.read`
   - [x] `databases.write`
   - [x] `collections.read`
   - [x] `collections.write`
   - [x] `documents.read`
   - [x] `documents.write`
   - [x] `files.read`
   - [x] `files.write`
   - [x] `buckets.read`
6. Click **Create**
7. Copy the API key and save it securely (cannot be viewed again)

---

## Database Operations

### Add Module (with automatic deduplication)

```python
from backend.database_factory import add_module

# Parse EEPROM data
eeprom_data = base64.b64decode(payload.eeprom_data_base64)
parsed = sfp_parser.parse_sfp_data(eeprom_data)

# Add to database (returns (id, is_duplicate))
module_id, is_duplicate = add_module(
    name="Cisco 10G SFP+",
    vendor=parsed["vendor"],
    model=parsed["model"],
    serial=parsed["serial"],
    eeprom_data=eeprom_data
)

if is_duplicate:
    print(f"Duplicate detected. Existing ID: {module_id}")
else:
    print(f"New module created with ID: {module_id}")
```

**How Deduplication Works:**
1. Backend calculates SHA-256 hash of EEPROM data
2. Attempts to create document with SHA-256 as document ID
3. If document ID exists → Appwrite returns existing document (duplicate)
4. If document ID is new → Creates new document and uploads file

### Get All Modules

```python
from backend.database_factory import get_all_modules

modules = get_all_modules()
# Returns: [
#   {"id": 123456, "name": "...", "vendor": "...", "model": "...", "serial": "...", "created_at": "..."},
#   ...
# ]
```

### Get EEPROM Binary

```python
from backend.database_factory import get_module_eeprom

eeprom_bytes = get_module_eeprom(module_id=123456)
if eeprom_bytes:
    # Write to SFP module via BLE
    pass
```

### Delete Module

```python
from backend.database_factory import delete_module

success = delete_module(module_id=123456)
# Deletes both document and storage file
```

---

## Migration from SQLite

To migrate existing SQLite data to Appwrite:

### Option 1: Manual Export/Import (Recommended for small datasets)

```bash
# 1. Export from SQLite (run on standalone deployment)
curl http://localhost:8080/api/modules > modules.json

# 2. For each module, download EEPROM data
for module_id in $(jq -r '.[].id' modules.json); do
  curl http://localhost:8080/api/modules/$module_id/eeprom -o "eeprom_$module_id.bin"
done

# 3. Import to Appwrite (run on public deployment)
# Use frontend UI to upload each module
```

### Option 2: Automated Migration Script

Create `backend/migrate_to_appwrite.py`:

```python
import sqlite3
import base64
import requests
import os

SQLITE_DB = os.environ.get("DATABASE_FILE", "sfp_library.db")
API_URL = "https://api.sfpliberate.com"  # Your public API

conn = sqlite3.connect(SQLITE_DB)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT * FROM sfp_modules")
for row in cursor.fetchall():
    payload = {
        "name": row['name'],
        "eeprom_data_base64": base64.b64encode(row['eeprom_data']).decode()
    }
    response = requests.post(f"{API_URL}/api/modules", json=payload)
    print(f"Migrated: {row['name']} - {response.json()}")

conn.close()
```

Run migration:
```bash
cd backend
export DATABASE_FILE=/app/data/sfp_library.db
python migrate_to_appwrite.py
```

---

## Troubleshooting

### Error: "Appwrite setup failed: Database not found"

**Cause**: Database or collection doesn't exist in Appwrite Console.

**Solution**: Follow steps in [Appwrite Console Setup](#appwrite-console-setup) to create database and collection.

### Error: "Failed to upload EEPROM data: Bucket not found"

**Cause**: Storage bucket `sfp_eeprom_data` doesn't exist.

**Solution**: Create storage bucket as described in step 6 of setup.

### Error: "Invalid API key"

**Cause**: `APPWRITE_API_KEY` is missing or incorrect.

**Solution**: Generate new API key with required scopes (see [Generating an API Key](#generating-an-api-key)).

### Error: "Permission denied"

**Cause**: API key lacks required scopes or collection permissions are too restrictive.

**Solution**:
1. Verify API key has all required scopes (databases, documents, files, buckets)
2. Check collection permissions allow "Users" or "Team: admin" for write operations
3. Verify bucket permissions match collection permissions

### Duplicate Detection Not Working

**Cause**: `sha256` attribute index might not be unique.

**Solution**:
1. Check index `idx_sha256_unique` exists with type "Unique"
2. Verify `sha256` attribute is required
3. Test by uploading same EEPROM twice - should get duplicate status

### Storage Files Growing Unbounded

**Cause**: Files not deleted when documents are deleted.

**Solution**: The `delete_module()` function includes file cleanup. Verify:
```python
# In appwrite_database_manager.py
storage.delete_file(APPWRITE_BUCKET_ID, file_id)  # Should be called
```

For cleanup of orphaned files, create maintenance script:
```python
# Clean orphaned files (files without corresponding documents)
from appwrite.query import Query

storage = get_storage_service()
db = get_databases_service()

files = storage.list_files(APPWRITE_BUCKET_ID)
docs = db.list_documents(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID)

doc_file_ids = {doc['eeprom_file_id'] for doc in docs['documents']}
for file in files['files']:
    if file['$id'] not in doc_file_ids:
        storage.delete_file(APPWRITE_BUCKET_ID, file['$id'])
        print(f"Deleted orphaned file: {file['$id']}")
```

---

## Performance Considerations

### Query Limits

Appwrite's `list_documents()` is limited to 100 documents per call by default. For pagination:

```python
from appwrite.query import Query

def get_all_modules_paginated(limit=100, offset=0):
    result = db.list_documents(
        database_id=APPWRITE_DATABASE_ID,
        collection_id=APPWRITE_COLLECTION_ID,
        queries=[
            Query.order_asc("name"),
            Query.limit(limit),
            Query.offset(offset)
        ]
    )
    return result['documents'], result['total']
```

### Storage Bandwidth

Appwrite free tier includes:
- **Bandwidth**: 10 GB/month
- **Storage**: 2 GB total

For production with many modules:
- Consider Pro plan for higher limits
- Implement CDN for EEPROM file downloads
- Cache frequently accessed files on backend

### Database Reads

Optimize with:
- **Indexed queries**: Always use indexed attributes (vendor, model)
- **Select specific fields**: Reduce payload size by not fetching all attributes
- **Caching**: Cache module list in backend memory with TTL

---

## Security Best Practices

1. **API Key Rotation**: Rotate API keys every 90 days
2. **Least Privilege**: Only grant required scopes to API keys
3. **Rate Limiting**: Enable rate limiting on Appwrite Functions
4. **Input Validation**: Validate EEPROM data size and format before upload
5. **Antivirus Scanning**: Keep enabled on storage bucket
6. **Access Logs**: Enable Appwrite audit logs for compliance
7. **Backups**: Enable Appwrite automatic backups (Pro plan)
8. **Encryption**: Verify encryption at rest is enabled for storage

---

## Related Documentation

- [PUBLIC_DEPLOYMENT.md](./PUBLIC_DEPLOYMENT.md) - Full public hosting setup guide
- [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) - Authentication and role-based access control
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contributing to the module library

---

## Support

For issues with Appwrite setup:
1. Check [Appwrite Documentation](https://appwrite.io/docs)
2. Review Appwrite Console logs under **Logs** section
3. Open issue on [SFPLiberate GitHub](https://github.com/josiah-nelson/SFPLiberate/issues)
