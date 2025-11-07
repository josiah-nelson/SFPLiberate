"""Database backup service for Home Assistant Add-on."""

import asyncio
import shutil
import structlog
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import get_settings

logger = structlog.get_logger()


class DatabaseBackupService:
    """
    Automated database backup service.

    Periodically backs up the SQLite database to the backups directory,
    maintaining a configurable number of backup files with timestamps.
    """

    def __init__(self, max_backups: int = 7):
        """
        Initialize backup service.

        Args:
            max_backups: Maximum number of backup files to keep (default: 7)
        """
        self.settings = get_settings()
        self.max_backups = max_backups
        self._task: Optional[asyncio.Task] = None
        self._running = False

        # Derive database file path from database_url
        self.db_file = self._get_db_file_path()
        self.backup_dir = Path(self.settings.database_backup_path)

    def _get_db_file_path(self) -> Path:
        """Extract file path from SQLite database URL."""
        db_url = self.settings.database_url

        # Handle sqlite+aiosqlite:////path format
        if db_url.startswith("sqlite+aiosqlite:///"):
            path_str = db_url.replace("sqlite+aiosqlite:///", "")
        elif db_url.startswith("sqlite:///"):
            path_str = db_url.replace("sqlite:///", "")
        else:
            # Fallback for other formats
            path_str = db_url.split("///")[-1]

        return Path(path_str)

    async def start(self) -> None:
        """Start the backup service."""
        if not self.settings.database_backup_enabled:
            logger.info("database_backup_disabled")
            return

        if self._running:
            logger.warning("database_backup_already_running")
            return

        # Create backup directory if it doesn't exist
        try:
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            logger.info(
                "database_backup_started",
                backup_dir=str(self.backup_dir),
                interval_hours=self.settings.database_backup_interval,
                max_backups=self.max_backups,
            )
        except Exception as e:
            logger.error("database_backup_directory_creation_failed", error=str(e))
            return

        self._running = True
        self._task = asyncio.create_task(self._backup_loop())

    async def stop(self) -> None:
        """Stop the backup service."""
        if not self._running:
            return

        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        logger.info("database_backup_stopped")

    async def _backup_loop(self) -> None:
        """Main backup loop - runs periodically."""
        # Perform initial backup after short delay
        await asyncio.sleep(60)  # Wait 1 minute after startup

        while self._running:
            try:
                await self.create_backup()
            except Exception as e:
                logger.error("database_backup_failed", error=str(e), exc_info=True)

            # Wait for configured interval (convert hours to seconds)
            interval_seconds = self.settings.database_backup_interval * 3600
            await asyncio.sleep(interval_seconds)

    async def create_backup(self) -> Optional[Path]:
        """
        Create a database backup.

        Returns:
            Path to the backup file, or None if backup failed
        """
        if not self.db_file.exists():
            logger.warning("database_file_not_found", path=str(self.db_file))
            return None

        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"sfp_library_backup_{timestamp}.db"
        backup_path = self.backup_dir / backup_filename

        try:
            # Copy database file
            await asyncio.to_thread(shutil.copy2, self.db_file, backup_path)

            file_size = backup_path.stat().st_size
            logger.info(
                "database_backup_created",
                backup_file=backup_filename,
                size_bytes=file_size,
            )

            # Clean up old backups
            await self._cleanup_old_backups()

            return backup_path

        except Exception as e:
            logger.error(
                "database_backup_creation_failed",
                backup_file=backup_filename,
                error=str(e),
                exc_info=True,
            )
            return None

    async def _cleanup_old_backups(self) -> None:
        """Remove old backup files, keeping only max_backups most recent."""
        try:
            # Get all backup files sorted by modification time (newest first)
            backup_files = sorted(
                self.backup_dir.glob("sfp_library_backup_*.db"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )

            # Remove excess backups
            files_to_remove = backup_files[self.max_backups:]
            for backup_file in files_to_remove:
                backup_file.unlink()
                logger.info("database_backup_removed", file=backup_file.name)

            if files_to_remove:
                logger.info(
                    "database_backup_cleanup_complete",
                    removed_count=len(files_to_remove),
                    kept_count=len(backup_files) - len(files_to_remove),
                )

        except Exception as e:
            logger.error("database_backup_cleanup_failed", error=str(e))

    async def list_backups(self) -> list[dict]:
        """
        List available backup files.

        Returns:
            List of dicts with backup file info (name, size, timestamp)
        """
        try:
            backup_files = sorted(
                self.backup_dir.glob("sfp_library_backup_*.db"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )

            backups = []
            for backup_file in backup_files:
                stat = backup_file.stat()
                backups.append({
                    "name": backup_file.name,
                    "size_bytes": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })

            return backups

        except Exception as e:
            logger.error("database_backup_list_failed", error=str(e))
            return []

    async def restore_backup(self, backup_filename: str) -> bool:
        """
        Restore database from a backup file.

        Args:
            backup_filename: Name of the backup file to restore

        Returns:
            True if restore succeeded, False otherwise
        """
        backup_path = self.backup_dir / backup_filename

        if not backup_path.exists():
            logger.error("database_backup_not_found", file=backup_filename)
            return False

        try:
            # Create a backup of current database before restoring
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            pre_restore_backup = self.backup_dir / f"sfp_library_pre_restore_{timestamp}.db"
            await asyncio.to_thread(shutil.copy2, self.db_file, pre_restore_backup)

            # Restore from backup
            await asyncio.to_thread(shutil.copy2, backup_path, self.db_file)

            logger.info(
                "database_backup_restored",
                backup_file=backup_filename,
                pre_restore_backup=pre_restore_backup.name,
            )
            return True

        except Exception as e:
            logger.error(
                "database_backup_restore_failed",
                backup_file=backup_filename,
                error=str(e),
                exc_info=True,
            )
            return False
