# Appwrite Function Removal Guide

## Summary
The Appwrite backend Function (`backend-api` at api.sfplib.com) has been **deprecated and removed** following the refactor to use the native Appwrite SDK.

## Architecture Changes

### Before (Deprecated)
- **Appwrite mode**: Frontend → API rewrites → Appwrite Function (api.sfplib.com) → Appwrite Database/Storage
- Required deploying FastAPI backend as an Appwrite Function
- Required custom domain setup (api.sfplib.com)
- Added latency and complexity

### After (Current)
- **Appwrite mode**: Frontend → Native Appwrite SDK → Appwrite Database/Storage (direct)
  - Sites SSR uses `node-appwrite` for server actions
  - After login, client creates a short‑lived JWT and sets an HTTP‑only cookie; SSR accepts session cookie or JWT
  - Modules library uses Appwrite Realtime updates (no manual refresh)
- No backend API needed for Appwrite deployments
- Simpler architecture, lower latency
- Standalone/HA modes still use FastAPI backend as before

## Code Changes in This PR

### Removed
1. `.github/workflows/deploy-appwrite-function.yml` - Function deployment workflow
2. References to `APPWRITE_FUNCTION_*` environment variables
3. API rewrites for Appwrite mode in `next.config.ts`
4. Backend URL fallback (`api.sfplib.com`) for Appwrite mode

### Updated
1. **`frontend/src/lib/features.ts`**
   - Removed `APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` checks
   - Only checks `APPWRITE_SITE_*` (Sites) and custom `APPWRITE_*` variables
   - Updated error messages

2. **`frontend/next.config.ts`**
   - Appwrite mode now returns empty array from `rewrites()` (no API needed)
   - Updated comments to reflect native SDK usage
   - Removed `BACKEND_URL` fallback for Appwrite

3. **Documentation** (this file)
   - Added migration guide for cleanup

## Manual Cleanup Required

### GitHub Secrets (via Repository Settings)
Remove the following secrets (no longer needed):
- `APPWRITE_FUNCTION_ID`
- `BACKEND_URL` (if configured for Appwrite)

### Appwrite Console Cleanup
1. **Delete Function**
   - Go to Appwrite Console → Functions
   - Find `backend-api` function
   - Delete it (Settings → Delete Function)

2. **Remove Custom Domain** (Optional)
   - If you set up `api.sfplib.com` custom domain
   - Remove DNS CNAME record for `api.sfplib.com`
   - No need to keep the domain if only used for this function

### Documentation Updates (Future PRs)
The following docs still reference the old architecture and should be updated:
- `docs/APPWRITE_CONSOLE_SETUP.md` - Remove function setup instructions
- `docs/GITHUB_SECRETS_SETUP.md` - Remove `BACKEND_URL` and `APPWRITE_FUNCTION_ID`
- `docs/FRONTEND_ARCHITECTURE_REVIEW.md` - Update to reflect native SDK usage
- `.github/workflows/deploy-appwrite.yml` - Update comments

## Testing
After merge:
1. ✅ Appwrite Sites deployment should work normally (uses native SDK)
2. ✅ Standalone/HA deployments unaffected (still use FastAPI backend)
3. ✅ No functionality lost (AppwriteRepository handles all operations)

## Rollback Plan
If issues arise:
1. Revert this PR
2. Redeploy the Appwrite Function using the old workflow
3. Reconfigure custom domain

However, **rollback should not be necessary** as the native SDK approach has been tested and is working in production.

## Benefits
- ✅ Simpler deployment (no Function to manage)
- ✅ Lower latency (direct SDK calls vs HTTP round-trip)
- ✅ Reduced infrastructure (no custom domain needed)
- ✅ Lower costs (no Function execution charges)
- ✅ Cleaner codebase (removed deprecated references)
