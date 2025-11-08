# Environment Variable Consolidation Guide

**Date**: November 6, 2025
**Purpose**: Consolidate duplicate environment variables and implement unified API architecture

---

## Summary of Changes

### Architecture Update: Unified SSR + API Rewrites

**Before**:
- Standalone: Next.js SSR → `/api/*` rewrites → Backend (FastAPI)
- Appwrite: Next.js Static → Direct Appwrite SDK calls (NO backend)
- Code divergence between modes

**After**:
- Standalone: Next.js SSR → `/api/*` rewrites → Backend (FastAPI + SQLite)
- Home Assistant: Next.js SSR → `/api/*` rewrites → Backend (FastAPI + SQLite)
- Appwrite: Next.js SSR → `/api/*` rewrites → Backend (Appwrite Function + Appwrite DB)
- **Zero code divergence** - same API client, same patterns

---

## GitHub Secrets Consolidation

### Action Required: Rename Secrets

You need to rename (or add new) GitHub repository secrets to use consolidated names:

| Old Secret Name | New Secret Name | Value | Action |
|-----------------|-----------------|-------|--------|
| `APPWRITE_ENDPOINT_URL` | `APPWRITE_ENDPOINT` | `https://nyc.cloud.appwrite.io/v1` | ⚠️ **Rename** |
| `APPWRITE_SITE_API_ENDPOINT` | *(remove)* | - | ❌ **Delete** (duplicate) |
| `APPWRITE_SITE_PROJECT_ID` | *(remove)* | - | ❌ **Delete** (duplicate) |
| `APPWRITE_SITE_NAME` | *(remove)* | - | ❌ **Delete** (duplicate) |
| `APPWRITE_SITE_DOMAIN` | *(remove)* | - | ❌ **Delete** (use PUBLIC_URL) |

### New Secrets to Add

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `PUBLIC_URL` | `https://app.sfplib.com` | Public-facing site URL |
| `BACKEND_URL` | `https://api.sfplib.com` | Backend Function URL |
| `APPWRITE_COLLECTION_ID` | `sfp_modules` | Collection for SFP modules |
| `APPWRITE_BUCKET_ID` | `sfp_eeprom_data` | Storage bucket for EEPROM data |
| `APPWRITE_FUNCTION_ID` | *(from Appwrite Console)* | Function ID for backend API |

### Secrets to Keep (No Changes)

| Secret Name | Value | Notes |
|-------------|-------|-------|
| `APPWRITE_API_KEY` | `standard_91089f96...` | ✅ No change |
| `APPWRITE_PROJECT_ID` | `69078b02001266c5d333` | ✅ No change |
| `APPWRITE_DATABASE_ID` | `sfpliberate` | ✅ No change |
| `APPWRITE_SITE_ID` | `sfpliberate` | ✅ No change |

---

## Complete GitHub Secrets List (After Consolidation)

```bash
# Core Appwrite
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=69078b02001266c5d333
APPWRITE_API_KEY=standard_91089f96...

# Database & Storage
APPWRITE_DATABASE_ID=sfpliberate
APPWRITE_COLLECTION_ID=sfp_modules
APPWRITE_BUCKET_ID=sfp_eeprom_data

# Sites & Functions
APPWRITE_SITE_ID=sfpliberate
APPWRITE_FUNCTION_ID=<function-id-from-console>

# URLs
PUBLIC_URL=https://app.sfplib.com
BACKEND_URL=https://api.sfplib.com

# Feature Flags (optional - defaults to true)
APPWRITE_SITE_ENABLE_AUTH=true
APPWRITE_SITE_ENABLE_WEB_BLUETOOTH=true
APPWRITE_SITE_ENABLE_BLE_PROXY=true
APPWRITE_SITE_ENABLE_COMMUNITY_FEATURES=true
```

---

## Appwrite Console Configuration

### 1. Sites Configuration (app.sfplib.com)

**Path**: Console → Sites → sfpliberate → Settings

| Setting | Value |
|---------|-------|
| **Site Type** | SSR (Server-Side Rendering) |
| **Root Directory** | `frontend` |
| **Install Command** | `npm ci --legacy-peer-deps` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next/standalone` |

**Environment Variables** (add in Sites → Settings → Environment Variables):

DEPLOYMENT_MODE=appwrite
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=69078b02001266c5d333
BACKEND_URL=https://api.sfplib.com
PUBLIC_URL=https://app.sfplib.com
NEXT_PUBLIC_DEPLOYMENT_MODE=appwrite
NEXT_TELEMETRY_DISABLED=1
NODE_ENV=production

**Custom Domain**:
- Primary: `app.sfplib.com` (configured in Sites settings)
- Fallback: `sfp.appwrite.network` (generic domain)

### 2. Functions Configuration (api.sfplib.com)

**Path**: Console → Functions → Create Function (or select existing)

| Setting | Value |
|---------|-------|
| **Function Name** | `backend-api` |
| **Function ID** | *(copy to APPWRITE_FUNCTION_ID secret)* |
| **Runtime** | Python 3.12 |
| **Entrypoint** | `app/main.py` |
| **Execute** | Any |
| **Timeout** | 30 seconds |
| **Logging** | Enabled |

**Environment Variables** (add in Functions → backend-api → Settings → Variables):

```bash
DEPLOYMENT_MODE=appwrite
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=69078b02001266c5d333
APPWRITE_DATABASE_ID=sfpliberate
APPWRITE_COLLECTION_ID=sfp_modules
APPWRITE_BUCKET_ID=sfp_eeprom_data
LOG_LEVEL=INFO
LOG_JSON=true
ESPHOME_PROXY_MODE=false
```

**Custom Domain**:
- Set custom domain: `api.sfplib.com`
- Verify DNS CNAME record points to Appwrite

### 3. Database Configuration

**Database**: `sfpliberate` (already created ✅)

**Collections**:
- `sfp_modules` (already created ✅)
  - Attributes: name, vendor, model, serial, sha256, eeprom_file_id
  - Indexes: sha256_unique, vendor_model_idx
  - Permissions: read("any"), document-level security enabled

**Storage Buckets**:
- `sfp_eeprom_data` (already exists ✅)

---

## Steps to Rename GitHub Secrets

### Option 1: Via GitHub Web UI

1. Go to your repository: https://github.com/josiah-nelson/SFPLiberate
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. For each secret that needs renaming:
   - Click **Add secret** with the new name
   - Copy the value from the old secret
   - Click **Add secret**
   - Delete the old secret
4. For secrets marked "Delete":
   - Click the three-dot menu → **Remove**

### Option 2: Via GitHub CLI

```bash
# Install GitHub CLI if needed
brew install gh  # macOS
# or: https://cli.github.com/manual/installation

# Authenticate
gh auth login

# Rename APPWRITE_ENDPOINT_URL → APPWRITE_ENDPOINT
OLD_VALUE=$(gh secret list | grep APPWRITE_ENDPOINT_URL | awk '{print $2}')
gh secret set APPWRITE_ENDPOINT --body "$OLD_VALUE"
gh secret remove APPWRITE_ENDPOINT_URL

# Add new secrets
gh secret set PUBLIC_URL --body "https://app.sfplib.com"
gh secret set BACKEND_URL --body "https://api.sfplib.com"
gh secret set APPWRITE_COLLECTION_ID --body "sfp_modules"
gh secret set APPWRITE_BUCKET_ID --body "sfp_eeprom_data"

# Remove duplicates
gh secret remove APPWRITE_SITE_API_ENDPOINT
gh secret remove APPWRITE_SITE_PROJECT_ID
gh secret remove APPWRITE_SITE_NAME
gh secret remove APPWRITE_SITE_DOMAIN

# Get Function ID from Appwrite Console, then:
gh secret set APPWRITE_FUNCTION_ID --body "<your-function-id>"
```

---

## Deployment Workflow

### 1. Deploy Backend Function (First)

```bash
# Trigger backend deployment
git push origin main  # If backend/ files changed

# Or manually:
gh workflow run deploy-appwrite-function.yml
```

**Verify**:
- Function deploys successfully in Appwrite Console
- Custom domain `api.sfplib.com` is configured
- Test endpoint: `curl https://api.sfplib.com/api/v1/modules`

### 2. Deploy Frontend Site (Second)

```bash
# Trigger site deployment
git push origin main  # If frontend/ files changed

# Or manually:
gh workflow run deploy-appwrite.yml
```

**Verify**:
- Site builds as SSR (standalone mode)
- Deploys to `app.sfplib.com`
- Frontend can reach backend via `/api/*` rewrites
- Test: Visit https://app.sfplib.com

---

## Variable Fallback Chain

The codebase now uses fallback chains for backwards compatibility:

```javascript
// Frontend (features.ts)
APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
  process.env.APPWRITE_ENDPOINT ||
  process.env.APPWRITE_SITE_API_ENDPOINT;  // Old name (fallback)

APPWRITE_PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_SITE_PROJECT_ID;  // Old name (fallback)

// Workflows (.github/workflows/*)
APPWRITE_ENDPOINT: ${{ secrets.APPWRITE_ENDPOINT || secrets.APPWRITE_ENDPOINT_URL }}
```

**This means**:
- ✅ Old secret names still work (during transition)
- ✅ New secret names preferred
- ⚠️ Delete old secrets after verifying new ones work

---

## Testing Checklist

### After Renaming Secrets

- [ ] Verify all secrets exist: `gh secret list`
- [ ] Check no duplicates remain
- [ ] Trigger test deployment: `gh workflow run deploy-appwrite.yml`
- [ ] Verify build succeeds in Actions tab

### After Deploying Function

- [ ] Function appears in Console → Functions
- [ ] Custom domain `api.sfplib.com` configured
- [ ] Test API: `curl https://api.sfplib.com/api/v1/modules`
- [ ] Check logs in Console for errors

### After Deploying Site

- [ ] Site appears in Console → Sites
- [ ] Custom domain `app.sfplib.com` configured
- [ ] Visit site: https://app.sfplib.com
- [ ] Open DevTools → Network → Check `/api/v1/modules` requests
- [ ] Verify requests go to `api.sfplib.com` (via rewrite)
- [ ] Test authentication flow (if enabled)
- [ ] Test BLE connection (if supported browser)

---

## Troubleshooting

### "APPWRITE_ENDPOINT is missing" Error

**Cause**: Secrets not renamed yet
**Solution**: Fallback will use `APPWRITE_ENDPOINT_URL` - rename secrets

### "Function not found" Error

**Cause**: `APPWRITE_FUNCTION_ID` secret not set
**Solution**:
1. Create function in Appwrite Console
2. Copy Function ID
3. Add as GitHub secret: `gh secret set APPWRITE_FUNCTION_ID --body "<id>"`

### Site Builds but API Fails

**Cause**: Backend URL not configured or Function not deployed
**Solution**:
1. Deploy Function first: `gh workflow run deploy-appwrite-function.yml`
2. Verify `api.sfplib.com` resolves
3. Check `BACKEND_URL` secret is `https://api.sfplib.com`

### 404 on /api/* Requests

**Cause**: Next.js rewrites not working
**Solution**:
1. Verify `output: 'standalone'` in `next.config.ts`
2. Check Appwrite Sites is configured for SSR (not static export)
3. Rebuild frontend with correct `BACKEND_URL`

---

## Rollback Plan

If issues occur after consolidation:

1. **Re-add old secrets** (temporarily):
   ```bash
   gh secret set APPWRITE_ENDPOINT_URL --body "https://nyc.cloud.appwrite.io/v1"
   gh secret set APPWRITE_SITE_PROJECT_ID --body "69078b02001266c5d333"
   ```

2. **Revert next.config.ts** to static export for Appwrite:
   ```typescript
   output: isAppwrite ? 'export' : 'standalone'
   ```

3. **Revert features.ts** to use `APPWRITE_SITE_API_URL`:
   ```typescript
   return process.env.APPWRITE_SITE_API_URL || '/api'
   ```

4. **Redeploy** with old configuration

---

## Benefits of Consolidation

✅ **Reduced Complexity**: 9 variables → 6 core variables
✅ **Zero Code Divergence**: Same API client for all modes
✅ **Easier Testing**: Same behavior locally and in production
✅ **Better Maintainability**: Single source of truth for URLs
✅ **Clearer Documentation**: Canonical names, no confusion
✅ **Unified Architecture**: SSR everywhere, consistent patterns

---

## References

- Updated `.env.appwrite` file with consolidated variables
- `next.config.ts` - SSR configuration for all modes
- `frontend/src/lib/features.ts` - Unified API pattern
- `.github/workflows/deploy-appwrite.yml` - Sites deployment
- `.github/workflows/deploy-appwrite-function.yml` - Function deployment
- `appwrite.json` - Function configuration

---

**Questions?** Check the troubleshooting section or review the workflows in `.github/workflows/`
