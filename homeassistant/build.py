#!/usr/bin/env python3
"""
Custom Docker build script for SFPLiberate Home Assistant Add-on.

Inspired by ESPHome's build system, this provides better control over
multi-architecture builds, caching, and tagging.
"""

import argparse
import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


class BuildConfig:
    """Build configuration for different architectures."""

    ARCHITECTURES = {
        "aarch64": {"platform": "linux/arm64"},
        "amd64": {"platform": "linux/amd64"},
        "armhf": {"platform": "linux/arm/v6"},
        "armv7": {"platform": "linux/arm/v7"},
    }

    def __init__(self, arch: str, tag: str, registry: str, image: str):
        self.arch = arch
        self.tag = tag
        self.registry = registry
        self.image = image
        self.platform = self.ARCHITECTURES[arch]["platform"]

    @property
    def full_image_name(self) -> str:
        """Get full image name with registry."""
        return f"{self.registry}/{self.image.replace('{arch}', self.arch)}"

    @property
    def full_image_tag(self) -> str:
        """Get full image name with tag."""
        return f"{self.full_image_name}:{self.tag}"

    @property
    def cache_ref(self) -> str:
        """Get cache reference for registry caching."""
        return f"{self.full_image_name}:cache"


def run_command(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command and handle output."""
    logger.debug(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            check=check,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.stdout:
            logger.debug(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {' '.join(cmd)}")
        if e.stdout:
            logger.error(f"stdout: {e.stdout}")
        if e.stderr:
            logger.error(f"stderr: {e.stderr}")
        raise


def get_build_args(version: str) -> List[str]:
    """Get build arguments for Docker build."""
    return [
        "--build-arg",
        f"BUILD_VERSION={version}",
    ]


def build_image(config: BuildConfig, push: bool = False, test: bool = False) -> None:
    """Build Docker image for specified configuration."""
    logger.info(f"Building {config.arch} image: {config.full_image_tag}")

    # Base docker buildx command
    cmd = [
        "docker",
        "buildx",
        "build",
        "--platform",
        config.platform,
        "--file",
        "homeassistant/Dockerfile",
        "--tag",
        config.full_image_tag,
    ]

    # Add build arguments
    cmd.extend(get_build_args(config.tag))

    # Add cache configuration (from and to registry)
    if push:
        cmd.extend(
            [
                "--cache-from",
                f"type=registry,ref={config.cache_ref}",
                "--cache-to",
                f"type=registry,ref={config.cache_ref},mode=max",
            ]
        )

    # Add push or load flag
    if push and not test:
        cmd.append("--push")
        logger.info(f"Will push to registry: {config.full_image_tag}")
    else:
        cmd.append("--load")
        logger.info("Will load to local Docker (test mode)")

    # Build context is repo root
    cmd.append(".")

    # Run the build
    try:
        run_command(cmd)
        logger.info(f"✓ Successfully built {config.arch} image")
    except subprocess.CalledProcessError:
        logger.error(f"✗ Failed to build {config.arch} image")
        sys.exit(1)


def get_addon_version() -> str:
    """Get version from config.yaml using regex (no yaml dependency)."""
    import re

    config_path = Path("homeassistant/config.yaml")
    if not config_path.exists():
        logger.error("config.yaml not found!")
        sys.exit(1)

    with open(config_path) as f:
        content = f.read()

    # Match version line: version: "1.0.0" or version: 1.0.0
    match = re.search(r'^version:\s*["\']?([^"\']+)["\']?$', content, re.MULTILINE)
    if not match:
        logger.error("Version not found in config.yaml!")
        sys.exit(1)

    return match.group(1)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Build SFPLiberate Home Assistant Add-on Docker images"
    )
    parser.add_argument(
        "--arch",
        choices=["aarch64", "amd64", "armhf", "armv7", "all"],
        default="amd64",
        help="Architecture to build (default: amd64)",
    )
    parser.add_argument(
        "--tag",
        help="Docker image tag (defaults to version from config.yaml)",
    )
    parser.add_argument(
        "--registry",
        default="ghcr.io/josiah-nelson",
        help="Docker registry (default: ghcr.io/josiah-nelson)",
    )
    parser.add_argument(
        "--image",
        default="sfpliberate-addon-{arch}",
        help="Image name with {arch} placeholder (default: sfpliberate-addon-{arch})",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Push to registry after building",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode (build but don't push)",
    )
    parser.add_argument(
        "--use-config-version",
        action="store_true",
        help="Use version from config.yaml instead of --tag",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)

    # Get version
    if args.use_config_version:
        tag = get_addon_version()
    else:
        tag = args.tag or get_addon_version()

    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", tag):
        logger.error(
            "Invalid tag '%s'. Expected semantic version (X.Y.Z or pre-release like 1.2.3-beta)",
            tag,
        )
        sys.exit(1)

    # Determine architectures to build
    architectures = (
        list(BuildConfig.ARCHITECTURES.keys()) if args.arch == "all" else [args.arch]
    )

    logger.info(f"Building SFPLiberate Add-on")
    logger.info(f"  Tag: {tag}")
    logger.info(f"  Architectures: {', '.join(architectures)}")
    logger.info(f"  Registry: {args.registry}")
    logger.info(f"  Push: {args.push}")
    logger.info(f"  Test mode: {args.test}")

    if args.dry_run:
        logger.info("DRY RUN MODE - Commands will be printed but not executed")

    # Build each architecture
    for arch in architectures:
        config = BuildConfig(arch, tag, args.registry, args.image)

        if args.dry_run:
            logger.info(f"Would build: {config.full_image_tag}")
            continue

        build_image(config, push=args.push, test=args.test)

    logger.info("✓ All builds completed successfully!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.error("Build interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)
