# Release Process

This document describes how to create releases for the SFPLiberate Home Assistant add-on.

## Overview

Releases are fully automated via GitHub Actions. The workflow:
1. Updates version in `homeassistant/config.yaml`
2. Commits the version change
3. Creates and pushes a git tag
4. Creates a GitHub Release
5. Builds and pushes Docker images for all architectures
6. Makes the add-on installable in Home Assistant

## Creating a Release

### Via GitHub Actions (Recommended)

1. **Go to GitHub Actions**
   - Navigate to: `Actions` → `Create Release`
   - Click `Run workflow`

2. **Enter Release Version**
   ```
   Version: 0.2.0
   Pre-release: ☐ (uncheck for stable release)
   ```

   **Version Format**: Semantic versioning (X.Y.Z)
   - `0.x.y` - Pre-1.0 development releases
   - `1.0.0` - First stable release
   - `1.x.y` - Feature releases
   - `x.y.Z` - Patch releases

3. **Wait for Completion**
   - Workflow updates config.yaml
   - Creates tag and GitHub Release
   - Triggers Docker image builds (~15-20 minutes)

4. **Verify Installation**
   - Go to Home Assistant
   - Settings → Add-ons → Add-on Store
   - Refresh repository
   - Verify new version appears

### Via Local Script (Alternative)

For local version bumps without creating a release:

```bash
# Bump version in config.yaml
./scripts/bump-version.sh 0.2.0

# Script will prompt to commit
# Push to main (does NOT create release)
git push origin main
```

**Note**: This only updates the version locally. To create an actual release with Docker images, use the GitHub Actions workflow.

## Version Numbering Strategy

Following [Semantic Versioning](https://semver.org/):

### Pre-1.0 Development (Current)
- **0.1.x** - Initial alpha releases
- **0.2.x** - Beta releases with core features
- **0.3.x** - Release candidates
- **0.9.x** - Pre-1.0 stabilization

### Post-1.0 Stable
- **1.0.0** - First stable release
- **1.x.0** - New features (minor version bump)
- **1.0.x** - Bug fixes and patches

### Examples
```
0.1.0 - Initial alpha
0.2.0 - First beta (current)
0.2.1 - Bug fix for 0.2.0
0.3.0 - Feature release
1.0.0 - Stable release
1.1.0 - New feature (post-stable)
1.1.1 - Bug fix
```

## Release Checklist

Before creating a release, ensure:

- [ ] All tests pass (`ci.yml` workflow)
- [ ] Documentation is up-to-date
- [ ] CHANGELOG.md is updated
- [ ] README.md reflects current features
- [ ] Breaking changes are documented
- [ ] Migration guide exists (if needed)

## What Happens During Release

### 1. Validation Phase
- Validates semantic versioning format
- Checks if tag already exists
- Verifies config.yaml can be updated

### 2. Version Update Phase
- Updates `version:` in `homeassistant/config.yaml`
- Commits change to `main` branch
- Includes `[skip ci]` to avoid circular builds

### 3. Release Creation Phase
- Creates git tag (e.g., `v0.2.0`)
- Pushes tag to GitHub
- Creates GitHub Release with notes

### 4. Docker Build Phase (Automatic)
- Triggered by release creation
- Builds 4 architectures in parallel:
  - `aarch64` (Raspberry Pi 3/4/5)
  - `amd64` (x86-64 systems)
  - `armhf` (32-bit ARM)
  - `armv7` (ARMv7 devices)
- Pushes images to GHCR:
  ```
  ghcr.io/josiah-nelson/sfpliberate-addon-aarch64:0.2.0
  ghcr.io/josiah-nelson/sfpliberate-addon-amd64:0.2.0
  ghcr.io/josiah-nelson/sfpliberate-addon-armhf:0.2.0
  ghcr.io/josiah-nelson/sfpliberate-addon-armv7:0.2.0
  ```

### 5. Availability
- Add-on appears in Home Assistant add-on store
- Users can install/update to new version
- Automatic updates available (if enabled)

## Troubleshooting

### "Tag already exists"
The version you're trying to release already has a tag.

**Solution**: Use a different version number or delete the existing tag/release.

### "Version format invalid"
The version doesn't match semantic versioning (X.Y.Z).

**Solution**: Use format like `0.2.0`, `1.0.0`, `1.2.3` (no 'v' prefix).

### "Docker build failed"
Image build failed for one or more architectures.

**Solution**:
1. Check build logs in Actions tab
2. Fix Dockerfile or build issues
3. Create a new patch release (e.g., 0.2.1)

### "Add-on not appearing in HA"
Add-on doesn't show up after release.

**Solution**:
1. Verify release workflow completed successfully
2. Wait for all Docker builds to finish (~20 mins)
3. Refresh add-on store in Home Assistant
4. Check GHCR for image availability

### "Permission denied"
Workflow can't push tags or create releases.

**Solution**:
1. Go to Settings → Actions → General
2. Set "Workflow permissions" to "Read and write"
3. Re-run the workflow

## Manual Release (Advanced)

If GitHub Actions is unavailable, you can create releases manually:

```bash
# 1. Update version
./scripts/bump-version.sh 0.2.0

# 2. Commit and push
git push origin main

# 3. Create and push tag
git tag -a v0.2.0 -m "Release 0.2.0"
git push origin v0.2.0

# 4. Create release via GitHub UI or CLI
gh release create v0.2.0 \
  --title "Release 0.2.0" \
  --generate-notes

# 5. Wait for ha-addon-build workflow to run
```

## Rollback Process

If a release has critical issues:

### Option 1: Patch Release (Recommended)
```bash
# Fix the issue in code
# Create new patch release
# Use GitHub Actions → Create Release → 0.2.1
```

### Option 2: Revert Release (Extreme)
```bash
# Delete tag
git push --delete origin v0.2.0
git tag -d v0.2.0

# Delete GitHub Release (via UI or CLI)
gh release delete v0.2.0

# Revert config.yaml
./scripts/bump-version.sh 0.1.9
git push origin main
```

**Note**: Deleting releases can confuse users who already installed. Always prefer patch releases.

## Related Documentation

- [GitHub Actions Workflow](../.github/workflows/release.yml) - Release automation
- [Build Workflow](../.github/workflows/ha-addon-build.yml) - Docker image builds
- [Changelog](../homeassistant/CHANGELOG.md) - Version history
- [Add-on Documentation](../homeassistant/DOCS.md) - User-facing docs

## Support

For questions about the release process:
- Open an issue on GitHub
- Tag with `release` label
- Check existing release-related issues
