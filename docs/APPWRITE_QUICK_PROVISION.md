# Appwrite Quick Provisioning Guide

This guide will help you create the necessary Appwrite resources (database, collections, buckets) for SFPLiberate.

## Prerequisites

- Appwrite Cloud project created (Project ID: `69078b02001266c5d333`)
- Access to Appwrite Console
- Node.js installed locally

## Option 1: Automated Provisioning (Recommended)

### Step 1: Create API Key in Appwrite Console

1. Go to: https://cloud.appwrite.io/console/project-69078b02001266c5d333/overview/keys
2. Click **"Create API Key"**
3. Settings:
   - **Name**: `Provisioning Script`
   - **Expiration**: Never (or set far future date)
   - **Scopes**: Enable the following:
     - ✅ `databases.read`
     - ✅ `databases.write`
     - ✅ `collections.read`
     - ✅ `collections.write`
     - ✅ `attributes.read`
     - ✅ `attributes.write`
     - ✅ `indexes.read`
     - ✅ `indexes.write`
     - ✅ `buckets.read`
     - ✅ `buckets.write`
4. Click **"Create"**
5. **IMPORTANT**: Copy the API key immediately (it won't be shown again)

### Step 2: Set Environment Variables

```bash
export APPWRITE_ENDPOINT="https://nyc.cloud.appwrite.io/v1"
export APPWRITE_PROJECT_ID="69078b02001266c5d333"
export APPWRITE_API_KEY="<paste-your-api-key-here>"
```

### Step 3: Run Provisioning Script

```bash
cd /opt/SFPLiberate
node scripts/appwrite/provision.mjs
```

**Expected Output:**
```
✓ Database 'lib-core' exists
✓ Collection 'user-modules' exists
➕ Added string attribute 'name'
➕ Added string attribute 'vendor'
... (more attributes)
➕ Created index 'idx_sha256' on sha256
✓ Collection 'community-modules' exists
... (similar output)
✓ Bucket 'user-eeprom' exists
✓ Bucket 'community-blobs' exists
✓ Bucket 'community-photos' exists
✅ Appwrite resources are provisioned.
```

### Step 4: Verify in Console

1. Go to **Databases** → **lib-core**
2. Verify collections exist:
   - ✅ `user-modules` (7 attributes, 2 indexes)
   - ✅ `community-modules` (10 attributes, 2 indexes)
   - ✅ `invite_codes` (if using invite system)

3. Go to **Storage**
4. Verify buckets exist:
   - ✅ `user-eeprom` (max 256 KB, .bin files)
   - ✅ `community-blobs` (max 256 KB, .bin files)
   - ✅ `community-photos` (max 5 MB, images)

### Step 5: Secure API Key

After provisioning is complete, you can:

1. **Delete the API key** from Appwrite Console (recommended)
   - Go to: Settings → API Keys
   - Delete "Provisioning Script" key

2. **Or reduce its scopes** to read-only:
   - Keep only `*.read` scopes
   - Remove all `*.write` scopes

---

## Option 2: Manual Creation (Alternative)

If the automated script fails, you can create resources manually:

### Create Database

1. Go to **Databases** → **Create Database**
2. Database ID: `lib-core`
3. Name: `SFPLiberate Core`

### Create Collections

#### Collection 1: `user-modules`

1. Click **Create Collection**
2. Collection ID: `user-modules`
3. Name: `User Modules`
4. **Settings** → **Document Security**: ✅ **Enabled**

**Attributes:**
| Key | Type | Size | Required |
|-----|------|------|----------|
| `name` | String | 255 | ✅ Yes |
| `vendor` | String | 100 | No |
| `model` | String | 100 | No |
| `serial` | String | 100 | No |
| `sha256` | String | 64 | ✅ Yes |
| `eeprom_file_id` | String | 64 | ✅ Yes |
| `size` | Integer | - | ✅ Yes |

**Indexes:**
| Key | Type | Attributes | Order |
|-----|------|------------|-------|
| `idx_sha256` | Unique | `sha256` | ASC |
| `idx_created` | Key | `$createdAt` | DESC |

#### Collection 2: `community-modules`

1. Click **Create Collection**
2. Collection ID: `community-modules`
3. Name: `Community Modules`
4. **Settings** → **Document Security**: ✅ **Enabled**
5. **Settings** → **Permissions**: Add `read("any")`

**Attributes:**
| Key | Type | Size | Required |
|-----|------|------|----------|
| `name` | String | 255 | ✅ Yes |
| `vendor` | String | 100 | No |
| `model` | String | 100 | No |
| `serial` | String | 100 | No |
| `sha256` | String | 64 | ✅ Yes |
| `blobId` | String | 64 | ✅ Yes |
| `photoId` | String | 64 | No |
| `submittedBy` | String | 64 | No |
| `linkType` | String | 32 | No |
| `size` | Integer | - | ✅ Yes |
| `downloads` | Integer | - | No (default 0) |
| `verified` | Boolean | - | No (default false) |

**Indexes:**
| Key | Type | Attributes | Order |
|-----|------|------------|-------|
| `idx_sha256` | Unique | `sha256` | ASC |
| `idx_created` | Key | `$createdAt` | DESC |

#### Collection 3: `invite_codes` (Optional - for invite system)

1. Click **Create Collection**
2. Collection ID: `invite_codes`
3. Name: `Invite Codes`
4. **Settings** → **Document Security**: ✅ **Enabled**

**Attributes:**
| Key | Type | Size | Required |
|-----|------|------|----------|
| `code` | String | 64 | ✅ Yes |
| `used` | Boolean | - | ✅ Yes (default false) |
| `usedBy` | String | 36 | No |
| `usedAt` | DateTime | - | No |
| `createdBy` | String | 36 | ✅ Yes |
| `maxUses` | Integer | - | ✅ Yes (default 1, min 1, max 1000) |
| `expiresAt` | DateTime | - | No |

**Indexes:**
| Key | Type | Attributes |
|-----|------|------------|
| `idx_code` | Unique | `code` |
| `idx_used` | Key | `used` |

### Create Storage Buckets

#### Bucket 1: `user-eeprom`

1. Go to **Storage** → **Create Bucket**
2. Bucket ID: `user-eeprom`
3. Name: `User EEPROM Data`
4. Settings:
   - **File Security**: ✅ **Enabled**
   - **Max File Size**: `262144` (256 KB)
   - **Allowed Extensions**: `bin`
   - **Compression**: None
   - **Encryption**: ✅ **Enabled**
   - **Antivirus**: ✅ **Enabled**

#### Bucket 2: `community-blobs`

1. Go to **Storage** → **Create Bucket**
2. Bucket ID: `community-blobs`
3. Name: `Community EEPROM Blobs`
4. Settings:
   - **File Security**: ❌ **Disabled** (public reads via `read("any")`)
   - **Max File Size**: `262144` (256 KB)
   - **Allowed Extensions**: `bin`
   - **Compression**: None
   - **Encryption**: ✅ **Enabled**
   - **Antivirus**: ✅ **Enabled**
   - **Permissions**: Add `read("any")`

#### Bucket 3: `community-photos`

1. Go to **Storage** → **Create Bucket**
2. Bucket ID: `community-photos`
3. Name: `Community Module Photos`
4. Settings:
   - **File Security**: ❌ **Disabled** (public reads)
   - **Max File Size**: `5242880` (5 MB)
   - **Allowed Extensions**: `jpg`, `jpeg`, `png`, `webp`
   - **Compression**: GZIP
   - **Encryption**: ❌ **Disabled** (for performance)
   - **Antivirus**: ✅ **Enabled**
   - **Permissions**: Add `read("any")`

---

## Verification Checklist

After provisioning (automated or manual), verify:

- [ ] Database `lib-core` exists
- [ ] Collection `user-modules` has 7 attributes and 2 indexes
- [ ] Collection `user-modules` has **Document Security = ON**
- [ ] Collection `community-modules` has 10+ attributes and 2 indexes
- [ ] Collection `community-modules` has `read("any")` permission
- [ ] Bucket `user-eeprom` has **File Security = ON**
- [ ] Bucket `user-eeprom` allows `.bin` files (max 256 KB)
- [ ] Bucket `community-blobs` has `read("any")` permission
- [ ] Bucket `community-photos` allows image files (max 5 MB)

---

## Troubleshooting

### Error: "API Key not found"
**Solution**: Verify the API key is correctly copied and not expired

### Error: "Insufficient permissions"
**Solution**: API key needs all database and storage scopes

### Error: "Collection already exists"
**Solution**: This is normal if running multiple times - the script is idempotent

### Error: "Attribute already exists"
**Solution**: This is normal - the script skips existing attributes

---

## Next Steps

After provisioning is complete:

1. ✅ Resources created
2. ➡️ Configure Appwrite Sites deployment (see `APPWRITE_CONSOLE_SETUP.md`)
3. ➡️ Deploy frontend to Appwrite Sites
4. ➡️ Test user module creation

---

## Reference

- **Schema Definition**: `/appwrite.json` (root of repository)
- **Provisioning Script**: `/scripts/appwrite/provision.mjs`
- **Architecture Docs**: `/docs/APPWRITE_NATIVE_ARCHITECTURE.md`
- **Console Setup**: `/docs/APPWRITE_CONSOLE_SETUP.md`
