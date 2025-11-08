#!/usr/bin/env bash

# =============================================================================
# Version Bump Script for SFPLiberate Add-on
# =============================================================================
#
# Updates the version in homeassistant/config.yaml
#
# Usage:
#   ./scripts/bump-version.sh <version>
#   ./scripts/bump-version.sh 0.2.0
#   ./scripts/bump-version.sh 1.0.0
#
# This script:
# 1. Validates semantic versioning format
# 2. Updates homeassistant/config.yaml
# 3. Shows git diff for review
# 4. Prompts to commit changes
#
# For automated releases, use the GitHub Actions workflow instead:
#   Actions → Create Release → Run workflow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check if version argument provided
if [ $# -eq 0 ]; then
    print_error "No version specified"
    echo ""
    echo "Usage: $0 <version>"
    echo ""
    echo "Examples:"
    echo "  $0 0.2.0"
    echo "  $0 1.0.0"
    echo "  $0 1.2.3"
    echo ""
    exit 1
fi

VERSION="$1"

# Remove leading 'v' if present
VERSION="${VERSION#v}"

# Validate semantic versioning format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    print_error "Invalid version format: $VERSION"
    echo ""
    echo "Expected format: X.Y.Z (e.g., 0.2.0, 1.0.0, 1.2.3)"
    echo "Do not include 'v' prefix"
    echo ""
    exit 1
fi

print_success "Version format valid: $VERSION"

# Get repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONFIG_FILE="$REPO_ROOT/homeassistant/config.yaml"

# Check if config.yaml exists
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "config.yaml not found at: $CONFIG_FILE"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(grep '^version:' "$CONFIG_FILE" | awk '{print $2}' | tr -d '"')

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
    print_warning "Version is already $VERSION"
    echo ""
    echo "No changes needed. Current version in config.yaml: $CURRENT_VERSION"
    exit 0
fi

print_info "Current version: $CURRENT_VERSION → New version: $VERSION"

# Update version in config.yaml
sed -i.bak "s/^version: .*/version: \"$VERSION\"/" "$CONFIG_FILE" && rm -f "${CONFIG_FILE}.bak"

# Verify the change
NEW_VERSION=$(grep '^version:' "$CONFIG_FILE" | awk '{print $2}' | tr -d '"')

if [ "$NEW_VERSION" != "$VERSION" ]; then
    print_error "Failed to update version in config.yaml"
    exit 1
fi

print_success "Updated config.yaml to version $VERSION"

# Show the diff
echo ""
print_info "Changes:"
echo ""
cd "$REPO_ROOT"
git diff homeassistant/config.yaml

# Ask if user wants to commit
echo ""
read -p "Commit this change? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add homeassistant/config.yaml
    git commit -m "chore: bump version to $VERSION"
    print_success "Changes committed"

    echo ""
    print_info "Next steps:"
    echo "  1. Push to remote: git push origin main"
    echo "  2. Create release via GitHub Actions:"
    echo "     Actions → Create Release → Run workflow → Version: $VERSION"
    echo "  3. Or create tag manually:"
    echo "     git tag v$VERSION && git push origin v$VERSION"
else
    print_info "Changes not committed. Review with:"
    echo "  git diff homeassistant/config.yaml"
    echo ""
    print_info "To commit manually:"
    echo "  git add homeassistant/config.yaml"
    echo "  git commit -m 'chore: bump version to $VERSION'"
fi

echo ""
print_success "Done!"
