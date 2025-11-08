# GitHub Secrets Setup Guide

This guide shows how to configure GitHub repository secrets for Appwrite deployment.

**⚠️ SECURITY WARNING**: Never commit actual API keys or secrets to the repository!

---

## Prerequisites

1. Install GitHub CLI: `brew install gh` (macOS) or https://cli.github.com/
2. Authenticate: `gh auth login`
3. Have your Appwrite credentials ready from the Console

---

## Required Secrets

Set these secrets using the commands below. Replace `<value>` placeholders with actual values from your Appwrite Console.

### Core Appwrite Credentials

```bash
# Appwrite endpoint
gh secret set APPWRITE_ENDPOINT --body "https://nyc.cloud.appwrite.io/v1"

# Project ID (from Console)
gh secret set APPWRITE_PROJECT_ID --body "<your-project-id>"

# API Key (from Console → Settings → API Keys)
gh secret set APPWRITE_API_KEY --body "<your-api-key>"
```

### Database & Storage IDs

```bash
# Database ID
gh secret set APPWRITE_DATABASE_ID --body "sfpliberate"

# Collection ID
gh secret set APPWRITE_COLLECTION_ID --body "sfp_modules"

# Storage bucket ID
gh secret set APPWRITE_BUCKET_ID --body "sfp_eeprom_data"
```

### Sites & Functions

```bash
# Site ID (from Console → Sites)
gh secret set APPWRITE_SITE_ID --body "sfpliberate"

# Function ID (from Console → Functions - create function first!)
# gh secret set APPWRITE_FUNCTION_ID --body "<function-id-after-creating>"
```

### Custom URLs

```bash
# Public site URL
gh secret set PUBLIC_URL --body "https://app.sfplib.com"

# Backend API URL
gh secret set BACKEND_URL --body "https://api.sfplib.com"
```

### Feature Flags (Optional)

```bash
gh secret set APPWRITE_ENABLE_AUTH --body "true"
gh secret set APPWRITE_ENABLE_WEB_BLUETOOTH --body "true"
gh secret set APPWRITE_ENABLE_BLE_PROXY --body "true"
gh secret set APPWRITE_ENABLE_COMMUNITY_FEATURES --body "true"
```

---

## Cleanup Old Secrets

Remove deprecated/duplicate secrets:

```bash
gh secret remove APPWRITE_ENDPOINT_URL 2>/dev/null || true
gh secret remove APPWRITE_SITE_API_ENDPOINT 2>/dev/null || true
gh secret remove APPWRITE_SITE_PROJECT_ID 2>/dev/null || true
gh secret remove APPWRITE_SITE_NAME 2>/dev/null || true
gh secret remove APPWRITE_SITE_DOMAIN 2>/dev/null || true
```

---

## Verification

List all secrets to verify:

```bash
gh secret list
```

**Expected secrets** (14 total):
- ✅ `APPWRITE_ENDPOINT`
- ✅ `APPWRITE_PROJECT_ID`
- ✅ `APPWRITE_API_KEY`
- ✅ `APPWRITE_DATABASE_ID`
- ✅ `APPWRITE_COLLECTION_ID`
- ✅ `APPWRITE_BUCKET_ID`
- ✅ `APPWRITE_SITE_ID`
- ✅ `APPWRITE_FUNCTION_ID` (after creating function)
- ✅ `PUBLIC_URL`
- ✅ `BACKEND_URL`
- ✅ `APPWRITE_ENABLE_AUTH`
- ✅ `APPWRITE_ENABLE_WEB_BLUETOOTH`
- ✅ `APPWRITE_ENABLE_BLE_PROXY`
- ✅ `APPWRITE_ENABLE_COMMUNITY_FEATURES`

---

## Where to Find Values

### Project ID & API Key

1. Go to [Appwrite Console](https://cloud.appwrite.io)
2. Select your project
3. Go to **Settings → Overview**
   - Project ID is shown at the top
4. Go to **Settings → API Keys**
   - Create a new API key with these scopes:
     - `databases.read`, `databases.write`
     - `storage.read`, `storage.write`
     - `functions.read`, `functions.write`
     - `sites.read`, `sites.write`

### Site ID

1. Go to **Sites** in Appwrite Console
2. Select your site
3. Site ID is in the URL: `site-<SITE_ID>`

### Function ID

1. Go to **Functions** in Appwrite Console
2. Create a new function (if not exists)
3. Function ID is shown after creation

---

## Security Best Practices

1. ✅ **DO** use GitHub secrets for sensitive values
2. ✅ **DO** rotate API keys regularly
3. ✅ **DO** use minimal scopes for API keys
4. ✅ **DO** keep `.env.appwrite` in `.gitignore`
5. ❌ **DON'T** commit API keys to the repository
6. ❌ **DON'T** share API keys in chat/email/docs
7. ❌ **DON'T** reuse API keys across projects

---

## Next Steps

After setting GitHub secrets:

1. Configure Appwrite Sites environment variables (see `APPWRITE_SITES_CONFIG.md`)
2. Create and configure Appwrite Function (see `APPWRITE_FUNCTION_CONFIG.md`)
3. Deploy via GitHub Actions: `git push origin main`

---

## Troubleshooting

### "Secret not found" errors in workflows

**Problem**: Secret name mismatch or not set

**Solution**: Run `gh secret list` and verify names match exactly (case-sensitive)

### "Permission denied" errors

**Problem**: API key lacks required scopes

**Solution**: Recreate API key with all required scopes (see above)

### Old secret names still referenced

**Problem**: Workflows use deprecated secret names

**Solution**: Ensure you've pulled latest code with updated workflow files
