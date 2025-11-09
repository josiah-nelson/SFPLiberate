# Appwrite Permissions Model

**Date:** 2025-11-09  
**Status:** ✅ Implemented in Provisioning Script

---

## Overview

SFPLiberate uses a **hybrid permission model** combining:
1. **Collection-level permissions** for community resources (alpha/admin roles)
2. **Document-level permissions** for user resources (per-user access)
3. **Bucket-level permissions** for community files (alpha/admin can read)
4. **File-level permissions** for user files (per-user access)

---

## Collections

### user-modules Collection

**Purpose:** User's personal SFP module library

**Document Security:** ✅ **ON** (per-document permissions)

**Collection-Level Permissions:** None (empty array)
- No collection-level read/write - all access controlled per-document

**Document-Level Permissions (set at creation time):**
```javascript
[
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
]
```

**Why:** Each user can only see their own modules. Documents are isolated by user ID.

---

### community-modules Collection

**Purpose:** Community-shared SFP modules database

**Document Security:** ✅ **ON** (allows document-level permissions)

**Collection-Level Permissions:**
```javascript
[
  Permission.read(Role.label('alpha')),    // Alpha users can read
  Permission.read(Role.label('admin')),    // Admins can read
  Permission.create(Role.label('alpha')),  // Alpha users can submit
  Permission.create(Role.label('admin')),  // Admins can submit
  Permission.update(Role.label('admin')),  // Only admins can edit
  Permission.delete(Role.label('admin')),  // Only admins can delete
]
```

**Document-Level Permissions (set at creation time):**
```javascript
[
  Permission.read(Role.label('alpha')),
  Permission.read(Role.label('admin')),
  Permission.update(Role.label('admin')),
  Permission.delete(Role.label('admin')),
]
```

**Why:** 
- Alpha-only access during testing phase
- Community is read-only for most users
- Only admins can moderate (edit/delete)
- Alpha users can contribute (create)

**Future:** When going public, add `Permission.read(Role.any())` to allow unauthenticated reads.

---

## Storage Buckets

### user-eeprom Bucket

**Purpose:** User's personal EEPROM binary files

**File Security:** ✅ **ON** (per-file permissions)

**Bucket-Level Permissions:** None (empty array)
- No bucket-level read/write - all access controlled per-file

**File-Level Permissions (set at upload time):**
```javascript
[
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
]
```

**Settings:**
- Max Size: 262,144 bytes (256 KB)
- Allowed Extensions: `bin`
- Encryption: ✅ Enabled
- Compression: None (data already compact)
- Antivirus: ✅ Enabled

**Why:** Each user's EEPROM data is private and encrypted.

---

### community-blobs Bucket

**Purpose:** Community EEPROM binary files

**File Security:** ❌ **OFF** (bucket-level permissions only)

**Bucket-Level Permissions:**
```javascript
[
  Permission.read(Role.label('alpha')),
  Permission.read(Role.label('admin')),
]
```

**File-Level Permissions:** N/A (file security disabled)

**Settings:**
- Max Size: 262,144 bytes (256 KB)
- Allowed Extensions: `bin`
- Encryption: ✅ Enabled (data integrity)
- Compression: None
- Antivirus: ✅ Enabled

**Why:** 
- All community blobs have same permissions (no per-file control needed)
- Alpha-only read access during testing
- File security OFF for simpler access (bucket handles it)

**Future:** Add `Permission.read(Role.any())` for public access.

---

### community-photos Bucket

**Purpose:** Community module photos (optional)

**File Security:** ❌ **OFF** (bucket-level permissions only)

**Bucket-Level Permissions:**
```javascript
[
  Permission.read(Role.label('alpha')),
  Permission.read(Role.label('admin')),
]
```

**File-Level Permissions:** N/A (file security disabled)

**Settings:**
- Max Size: 5,242,880 bytes (5 MB)
- Allowed Extensions: `jpg`, `jpeg`, `png`, `webp`
- Encryption: ❌ Disabled (better performance for images)
- Compression: GZIP (reduce bandwidth)
- Antivirus: ✅ Enabled

**Why:** 
- Photos don't need encryption (not sensitive data)
- GZIP compression reduces transfer size
- Same alpha-only access as other community resources

**Future:** Add `Permission.read(Role.any())` for public access.

---

## Role-Based Access Control (RBAC)

### Roles

1. **`Role.user(userId)`** - Specific authenticated user
   - Used for: User modules, user EEPROM files
   - Scope: Individual user's own resources only

2. **`Role.label('alpha')`** - Alpha testers
   - Used for: Community read access, community submissions
   - Scope: Early access to community features
   - Assignment: Manual via Appwrite Console → Teams

3. **`Role.label('admin')`** - Administrators
   - Used for: All permissions including edit/delete
   - Scope: Full access to all resources
   - Assignment: Manual via Appwrite Console → Teams

4. **`Role.any()`** - Anyone (including unauthenticated)
   - Used for: Future public read access to community
   - Scope: Public community database access
   - Status: Not yet implemented (post-alpha)

### Team Configuration

**In Appwrite Console:**
1. Go to Auth → Teams
2. Create team: `alpha` (optional - labels work without explicit team)
3. Create team: `admin` (optional)
4. Add users to teams to grant roles

**Using Labels:**
- Labels can be assigned directly to users without creating teams
- Go to Auth → Users → Select User → Labels
- Add labels: `alpha` or `admin`

---

## Permission Precedence

**Order of evaluation:**
1. Bucket/Collection-level permissions (if any)
2. Document/File-level permissions (if Document/File Security is ON)
3. User must satisfy EITHER bucket-level OR document-level to gain access

**Example - User Module Access:**
- Collection has no permissions (empty array)
- Document has `Permission.read(Role.user('user123'))`
- Only user123 can read this document

**Example - Community Module Access:**
- Collection has `Permission.read(Role.label('alpha'))`
- Document has `Permission.read(Role.label('alpha'))`
- Any alpha user can read (both levels grant access)

---

## Provisioning Script Behavior

### New Deployments
When provisioning a fresh Appwrite project:
- ✅ All permissions are set correctly
- ✅ Collections and buckets created with proper access control
- ✅ Ready for alpha testing immediately

### Existing Deployments
If collections/buckets already exist:
- ⚠️ Provisioning script **does not update permissions**
- ⚠️ Must update manually in Appwrite Console
- ⚠️ Or delete and re-provision resources

**To update existing resources:**

1. **Via Console (Recommended):**
   - Go to Databases → lib-core → community-modules → Settings → Permissions
   - Add permissions as documented above
   - Go to Storage → community-blobs → Settings → Permissions
   - Add permissions as documented above
   - Go to Storage → community-photos → Settings → Permissions
   - Add permissions as documented above

2. **Via Re-provision (Nuclear Option):**
   ```bash
   # Delete collections and buckets in Console
   # Then run provisioning
   node scripts/appwrite/provision.mjs
   ```

---

## Security Considerations

### ✅ What's Protected

1. **User Data Isolation**
   - Users cannot see each other's modules
   - Users cannot access each other's EEPROM files
   - SHA-256 hashes prevent duplicate uploads

2. **Community Integrity**
   - Only admins can edit/delete community modules
   - Alpha users can contribute (controlled group)
   - Non-alpha users cannot access during testing

3. **Data Encryption**
   - User EEPROM: Encrypted at rest
   - Community EEPROM: Encrypted at rest
   - Photos: Not encrypted (not sensitive)

4. **File Validation**
   - Max file sizes enforced
   - File type restrictions (extensions)
   - Antivirus scanning enabled

### ⚠️ Potential Issues

1. **Role Assignment**
   - Must manually add users to alpha/admin roles
   - No automatic role assignment system yet
   - Could forget to grant access to new testers

2. **Public Launch**
   - Must remember to add `Role.any()` permissions
   - Currently alpha-only (could confuse users)
   - No migration plan documented

3. **Orphaned Files**
   - If document creation fails, file may remain
   - Code has cleanup logic but could still happen
   - No automated garbage collection

---

## Migration to Public Access

When ready to make community database public:

1. **Update Collection Permissions:**
   ```javascript
   // Add to community-modules
   Permission.read(Role.any())
   ```

2. **Update Bucket Permissions:**
   ```javascript
   // Add to community-blobs
   Permission.read(Role.any())
   
   // Add to community-photos
   Permission.read(Role.any())
   ```

3. **Keep Write Restrictions:**
   - Do NOT add `Permission.create(Role.any())` (spam risk)
   - Keep create limited to authenticated users
   - Keep update/delete admin-only

4. **Update Code:**
   - Remove/comment alpha checks in client code
   - Update UI to indicate public access
   - Add rate limiting for submissions

---

## Testing Checklist

### ✅ User Module Access
- [ ] User A creates module → User A can read
- [ ] User A creates module → User B cannot read
- [ ] User A deletes module → module and file deleted
- [ ] User A uploads duplicate SHA-256 → returns existing module

### ✅ Community Module Access
- [ ] Non-authenticated user → cannot read (alpha-only)
- [ ] Non-alpha user → cannot read
- [ ] Alpha user → can read community modules
- [ ] Alpha user → can submit new module
- [ ] Alpha user → cannot edit existing module
- [ ] Admin user → can edit/delete modules

### ✅ File Access
- [ ] User A uploads EEPROM → User B cannot download
- [ ] Alpha user → can download community blob
- [ ] Alpha user → can view community photo
- [ ] Non-alpha user → cannot access community files

---

## References

- **Appwrite Permissions Docs:** https://appwrite.io/docs/advanced/platform/permissions
- **Provisioning Script:** `/scripts/appwrite/provision.mjs`
- **Role Constants:** Defined in code using `Permission` and `Role` from SDK
- **Architecture:** `/docs/APPWRITE_NATIVE_ARCHITECTURE.md`
