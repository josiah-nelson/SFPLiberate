# Appwrite Console Setup Guide

This guide covers manual configuration needed in the Appwrite Console for Sites and Functions deployment.

**Note**: These configurations are not yet available via API, so they must be done through the Console UI.

---

## Part 1: Appwrite Sites Configuration

### 1.1 Access Sites Settings

**URL Pattern**: `https://cloud.appwrite.io/console/project-<PROJECT_ID>/sites/site-<SITE_ID>/settings`

Or navigate: Console → Sites → sfpliberate → Settings

### 1.2 Configure Build Settings

| Setting | Value | Description |
|---------|-------|-------------|
| **Deployment Type** | `Server-Side Rendering (SSR)` | ⚠️ NOT static export! |
| **Root Directory** | `frontend` | Monorepo structure |
| **Install Command** | `npm ci --legacy-peer-deps` | Uses lockfile |
| **Build Command** | `npm run build` | Triggers Next.js build |
| **Output Directory** | `.next/standalone` | SSR output location |

### 1.3 Add Environment Variables

Go to: **Settings → Environment Variables → Add Variable**

Add these 11 variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `DEPLOYMENT_MODE` | `appwrite` | Triggers Appwrite mode |
| `APPWRITE_ENDPOINT` | `https://nyc.cloud.appwrite.io/v1` | Appwrite API endpoint (fallback) |
| `APPWRITE_PROJECT_ID` | `<your-project-id>` | Appwrite Project ID (fallback) |
| `BACKEND_URL` | `https://api.sfplib.com` | Backend Function URL |
| `PUBLIC_URL` | `https://app.sfplib.com` | Public site URL |
| `APPWRITE_ENABLE_AUTH` | `true` | Enable authentication |
| `APPWRITE_ENABLE_WEB_BLUETOOTH` | `true` | Enable Web Bluetooth |
| `APPWRITE_ENABLE_BLE_PROXY` | `true` | Enable BLE proxy |
| `APPWRITE_ENABLE_COMMUNITY_FEATURES` | `true` | Enable community features |
| `NEXT_TELEMETRY_DISABLED` | `1` | Disable Next.js telemetry |
| `NODE_ENV` | `production` | Production mode |

**Note**: Appwrite Sites auto-injects `APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` at runtime - don't add these manually!

### 1.4 Verify Custom Domain

Go to: **Settings → Domains**

Ensure `app.sfplib.com` is configured and SSL certificate is active.

### 1.5 Enable Git Integration (Optional but Recommended)

Go to: **Settings → Git Repository**

1. Click **"Connect Git"**
2. Authorize GitHub
3. Select repository: `josiah-nelson/SFPLiberate`
4. Production branch: `main`
5. Enable **Auto Deploy**: ✅

This enables automatic deployments when you push to main.

---

## Part 2: Appwrite Function Configuration

### 2.1 Create Function

**URL**: `https://cloud.appwrite.io/console/project-<PROJECT_ID>/functions`

1. Click **"Create Function"**
2. Fill in details:
   - **Name**: `backend-api`
   - **Runtime**: `Python 3.12`
   - **ID**: Auto-generated or custom
3. Click **"Create"**
4. **IMPORTANT**: Copy the Function ID shown after creation

### 2.2 Add Function ID to GitHub Secrets

After copying the Function ID:

```bash
gh secret set APPWRITE_FUNCTION_ID --body "<paste-function-id-here>"
```

### 2.3 Configure Function Settings

Go to: **Functions → backend-api → Settings**

| Setting | Value |
|---------|-------|
| **Execute** | `Any` |
| **Timeout** | `30` seconds |
| **Enabled** | ✅ Yes |
| **Logging** | ✅ Yes |

### 2.4 Configure Function Scopes

Go to: **Settings → Scopes**

Enable these scopes:
- ✅ `databases.read`
- ✅ `databases.write`
- ✅ `storage.read`
- ✅ `storage.write`

### 2.5 Add Function Environment Variables

Go to: **Settings → Variables → Add Variable**

Add these 9 variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `DEPLOYMENT_MODE` | `appwrite` | Triggers Appwrite mode in backend |
| `APPWRITE_ENDPOINT` | `https://nyc.cloud.appwrite.io/v1` | Appwrite API endpoint |
| `APPWRITE_PROJECT_ID` | `<your-project-id>` | From Console |
| `APPWRITE_DATABASE_ID` | `sfpliberate` | Database ID |
| `APPWRITE_COLLECTION_ID` | `sfp_modules` | Collection ID |
| `APPWRITE_BUCKET_ID` | `sfp_eeprom_data` | Storage bucket ID |
| `LOG_LEVEL` | `INFO` | Logging level |
| `LOG_JSON` | `true` | JSON formatted logs |
| `ESPHOME_PROXY_MODE` | `false` | Disabled for Appwrite |

### 2.6 Configure Custom Domain

Go to: **Settings → Domains → Add Domain**

1. Domain: `api.sfplib.com`
2. Click **"Add Domain"**
3. Verify DNS configuration:
   ```
   CNAME: api.sfplib.com → <appwrite-function-url>
   ```
4. Wait for SSL certificate to provision

---

## Part 3: Verification

### 3.1 Sites Configuration Checklist

- [ ] Deployment type set to SSR
- [ ] Build commands configured
- [ ] All 9 environment variables added
- [ ] Custom domain `app.sfplib.com` active
- [ ] Git integration enabled (optional)

### 3.2 Function Configuration Checklist

- [ ] Function created with Python 3.12 runtime
- [ ] Function ID copied to GitHub secrets
- [ ] Execute permission set to "Any"
- [ ] All 4 scopes enabled
- [ ] All 9 environment variables added
- [ ] Custom domain `api.sfplib.com` configured

### 3.3 Test Configuration

After deployment completes:

```bash
# Test backend function
curl https://api.sfplib.com/api/v1/modules

# Should return JSON (empty array or module list)

# Test frontend site
curl -I https://app.sfplib.com

# Should return 200 OK

# Test in browser
open https://app.sfplib.com
```

---

## Troubleshooting

### Sites: "Build failed" error

**Symptoms**: Deployment fails during build

**Common Causes**:
1. Missing environment variables
2. Wrong deployment type (static vs SSR)
3. Incorrect build commands

**Solution**: Verify all 9 environment variables are added and deployment type is SSR

### Sites: "Auto-injected variables not found"

**Symptoms**: Frontend errors about missing `APPWRITE_FUNCTION_*` variables

**Cause**: Variables are only injected at runtime, not build time

**Solution**: This is expected - fallback to `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` should work

### Function: "Permission denied"

**Symptoms**: Backend can't access database/storage

**Cause**: Missing scopes

**Solution**: Add all 4 required scopes (databases.read/write, storage.read/write)

### Function: "Custom domain not working"

**Symptoms**: `api.sfplib.com` returns 404 or timeout

**Cause**: DNS not configured or SSL not ready

**Solution**:
1. Verify CNAME record points to Appwrite
2. Wait 5-10 minutes for SSL provisioning
3. Try fallback URL from Console

---

## Next Steps

After completing console configuration:

1. Deploy backend function: `gh workflow run deploy-appwrite-function.yml`
2. Deploy frontend site: `gh workflow run deploy-appwrite.yml`
3. Verify both deployments succeed
4. Test live URLs

---

## Reference Links

- [Appwrite Sites Documentation](https://appwrite.io/docs/products/sites)
- [Appwrite Functions Documentation](https://appwrite.io/docs/products/functions)
- [Appwrite Environment Variables](https://appwrite.io/docs/products/sites/environment-variables)
- [Custom Domains Guide](https://appwrite.io/docs/products/sites/custom-domains)
