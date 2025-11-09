# Appwrite Critical Fixes - Implementation Plan

**Date:** 2025-11-09  
**Branch:** `fix/appwrite-critical-issues`  
**Status:** 🚧 In Progress

---

## Changes Overview

### 1. Schema Updates ✅ COMPLETE
**Files Modified:**
- `scripts/appwrite/provision.mjs`
- `frontend/src/lib/repositories/types.ts`

**Changes:**
- Added `read_from_device` (boolean) to `user-modules`
- Added `community_module_ref` (string) to `user-modules`  
- Added `parent_user_module_id` (string) to `community-modules`
- Added `device_timestamp` (string) to `community-modules`

### 2. Repository Updates 🚧 IN PROGRESS
**File:** `frontend/src/lib/repositories/AppwriteRepository.ts`

**Changes Needed:**
1. Update `UserModuleDocument` interface with new fields
2. Implement `submitToCommunityDatabase()` private method
3. Update `createModule()` to handle dual-write for device reads
4. Add `favoriteModule()` method for saving community refs
5. Update `getModule()` and `listModules()` to return new fields

### 3. Community Service Updates 🔜 TODO
**File:** `frontend/src/lib/community.ts`

**Changes Needed:**
1. Fix `downloadModuleBlob()` - fetch actual data, not just URL
2. Update `CommunityModule` interface with new fields
3. Fix blob filename generation (timestamp + serial + parent_id)
4. Add permissions to `submitCommunityModule()`
5. Import/use `calculateSHA256()` from parser
6. Add role-based access checks

### 4. BLE Manager Updates 🔜 TODO
**File:** `frontend/src/lib/ble/manager.ts`

**Changes Needed:**
1. Add hash verification before write in `writeSfpFromModuleId()`
2. Import `calculateSHA256` from parser
3. Fetch module metadata to get expected hash
4. Compare hashes before calling `writeSfpFromBuffer()`

### 5. Auth/Role Updates 🔜 TODO
**File:** `frontend/src/lib/auth.ts`

**Changes Needed:**
1. Verify built-in Appwrite role constants
2. Document role usage pattern for `Role.label('alpha')` and `Role.label('admin')`
3. Export role checking utilities

---

## Implementation Steps

### Step 1: Update AppwriteRepository ✅
- [x] Update TypeScript interfaces
- [ ] Add submitToCommunityDatabase() method
- [ ] Modify createModule() for dual-write
- [ ] Add favoriteModule() method
- [ ] Update document mapping functions

### Step 2: Fix Community Service
- [ ] Fix downloadModuleBlob()
- [ ] Update CommunityModule interface
- [ ] Fix filename generation
- [ ] Add role checks
- [ ] Add permissions

### Step 3: Add Hash Verification
- [ ] Update writeSfpFromModuleId()
- [ ] Add hash check before write
- [ ] Add user-friendly error messages

### Step 4: Run Provisioning
- [ ] Run provision script to add new attributes
- [ ] Verify in Appwrite Console
- [ ] Test schema changes

### Step 5: Integration Testing
- [ ] Test device read → dual write
- [ ] Test favorite → reference only
- [ ] Test hash verification on write
- [ ] Test role-based access

---

## Code Snippets

### Permission Helper (for reuse)
```typescript
function getCommunityPermissions() {
  return [
    Permission.read(Role.label('alpha')),  // Alpha users can read
    Permission.read(Role.label('admin')),  // Admins can read
    Permission.update(Role.label('admin')), // Only admins can edit
    Permission.delete(Role.label('admin')), // Only admins can delete
  ];
}
```

### Blob Filename Generator
```typescript
function generateCommunityBlobFilename(
  vendor: string,
  model: string,
  serial: string,
  parentId: string,
  sha256: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitized = {
    vendor: vendor?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
    model: model?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
    serial: serial?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
  };
  return `${sanitized.vendor}_${sanitized.model}_${sanitized.serial}_${timestamp}_${parentId.substring(0, 8)}_${sha256.substring(0, 8)}.bin`;
}
```

### Metadata Log Format (for duplicate submissions)
```typescript
interface DuplicateSubmissionLog {
  sha256: string;
  device_timestamp: string;
  parent_user_module_id: string;
  serial: string;
  submitted_by: string;
}

// Store in community-modules document as JSON string in a 'duplicate_submissions' field
// OR create separate collection 'duplicate-submissions' with foreign key to community-modules
```

---

## Testing Checklist

### Device Read Flow
- [ ] User reads SFP module from device
- [ ] User-module created with `read_from_device: true`
- [ ] Community-module created/updated with timestamped blob
- [ ] Both sha256 values match
- [ ] Permissions set correctly on both

### Favorite Flow
- [ ] User browses community modules
- [ ] User clicks "Save to Library"
- [ ] User-module created with `read_from_device: false` and `community_module_ref`
- [ ] No new blob uploaded
- [ ] `eeprom_file_id` references community blob

### Write Flow
- [ ] User selects module to write
- [ ] System fetches module metadata
- [ ] System fetches EEPROM data
- [ ] System calculates hash of downloaded data
- [ ] System compares with stored hash
- [ ] Write proceeds only if hashes match
- [ ] User sees hash verification message

### Role Access
- [ ] Non-authenticated user cannot access community
- [ ] Authenticated non-alpha user cannot access community
- [ ] Alpha user can read community modules
- [ ] Alpha user can submit to community
- [ ] Admin can edit/delete community modules

---

## Rollback Plan

If issues arise:
1. Revert to `main` branch
2. New attributes are nullable, so existing code won't break
3. Dual-write can be feature-flagged if needed

---

## Next Actions

1. Complete AppwriteRepository updates
2. Update community.ts with fixes
3. Add hash verification to BLE manager
4. Run provisioning script
5. Manual testing with hardware
6. PR review and merge
