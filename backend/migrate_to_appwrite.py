#!/usr/bin/env python3
"""
SQLite to Appwrite Migration Script for SFPLiberate

Migrates all module data from a standalone SQLite database to Appwrite Cloud.

Usage:
    1. Set up Appwrite database first (see docs/APPWRITE_DATABASE.md)
    2. Configure environment variables:
       export SQLITE_DATABASE_FILE=/path/to/sfp_library.db
       export APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
       export APPWRITE_PROJECT_ID=your-project-id
       export APPWRITE_API_KEY=your-api-key
       export APPWRITE_DATABASE_ID=sfp_library
       export APPWRITE_COLLECTION_ID=sfp_modules
       export APPWRITE_BUCKET_ID=sfp_eeprom_data
    3. Run: python migrate_to_appwrite.py
"""
import os
import sqlite3
import sys
from typing import List, Tuple

# Import managers
import database_manager as sqlite_manager
import appwrite_database_manager as appwrite_manager

SQLITE_DB = os.environ.get("SQLITE_DATABASE_FILE", "sfp_library.db")

def migrate_all_modules() -> Tuple[int, int, int]:
    """
    Migrate all modules from SQLite to Appwrite.
    
    Returns:
        Tuple of (total, migrated, duplicates)
    """
    print(f"📂 Reading from SQLite database: {SQLITE_DB}")
    
    # Verify SQLite database exists
    if not os.path.exists(SQLITE_DB):
        print(f"❌ Error: SQLite database not found at {SQLITE_DB}")
        sys.exit(1)
    
    # Connect to SQLite
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Verify Appwrite connection
    print("🔗 Testing Appwrite connection...")
    try:
        appwrite_manager.setup_database()
    except Exception as e:
        print(f"❌ Error: Appwrite connection failed: {e}")
        sys.exit(1)
    
    # Get all modules from SQLite
    cursor.execute("SELECT * FROM sfp_modules ORDER BY created_at")
    modules = cursor.fetchall()
    
    total = len(modules)
    migrated = 0
    duplicates = 0
    
    print(f"\n📊 Found {total} modules to migrate\n")
    print("=" * 80)
    
    for i, row in enumerate(modules, 1):
        name = row['name']
        vendor = row['vendor'] or ""
        model = row['model'] or ""
        serial = row['serial'] or ""
        eeprom_data = bytes(row['eeprom_data'])
        
        print(f"\n[{i}/{total}] Migrating: {name}")
        print(f"  Vendor: {vendor}")
        print(f"  Model: {model}")
        print(f"  Serial: {serial}")
        print(f"  EEPROM Size: {len(eeprom_data)} bytes")
        
        try:
            module_id, is_duplicate = appwrite_manager.add_module(
                name=name,
                vendor=vendor,
                model=model,
                serial=serial,
                eeprom_data=eeprom_data
            )
            
            if is_duplicate:
                print(f"  ⚠️  Already exists in Appwrite (ID: {module_id})")
                duplicates += 1
            else:
                print(f"  ✅ Migrated successfully (ID: {module_id})")
                migrated += 1
        except Exception as e:
            print(f"  ❌ Migration failed: {e}")
    
    conn.close()
    
    print("\n" + "=" * 80)
    print("\n📈 Migration Summary:")
    print(f"  Total modules in SQLite: {total}")
    print(f"  Successfully migrated: {migrated}")
    print(f"  Duplicates (skipped): {duplicates}")
    print(f"  Failed: {total - migrated - duplicates}")
    
    return total, migrated, duplicates

def verify_migration():
    """
    Verify migration by comparing counts.
    """
    print("\n🔍 Verifying migration...")
    
    # Count SQLite modules
    conn = sqlite3.connect(SQLITE_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM sfp_modules")
    sqlite_count = cursor.fetchone()[0]
    conn.close()
    
    # Count Appwrite modules
    appwrite_modules = appwrite_manager.get_all_modules()
    appwrite_count = len(appwrite_modules)
    
    print(f"  SQLite modules: {sqlite_count}")
    print(f"  Appwrite modules: {appwrite_count}")
    
    if appwrite_count >= sqlite_count:
        print("  ✅ Verification passed (Appwrite has all modules)")
    else:
        print(f"  ⚠️  Warning: Appwrite has fewer modules ({appwrite_count} < {sqlite_count})")

def main():
    """Main migration entry point."""
    print("=" * 80)
    print("  SFPLiberate: SQLite → Appwrite Migration Tool")
    print("=" * 80)
    
    # Verify required environment variables
    required_vars = [
        "APPWRITE_ENDPOINT",
        "APPWRITE_PROJECT_ID",
        "APPWRITE_API_KEY",
        "APPWRITE_DATABASE_ID",
        "APPWRITE_COLLECTION_ID",
        "APPWRITE_BUCKET_ID"
    ]
    
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        print("\n❌ Error: Missing required environment variables:")
        for var in missing_vars:
            print(f"  - {var}")
        print("\nPlease set all required variables and try again.")
        sys.exit(1)
    
    # Run migration
    try:
        total, migrated, duplicates = migrate_all_modules()
        
        # Verify
        verify_migration()
        
        # Success
        if migrated > 0:
            print("\n✨ Migration completed successfully!")
            print("\nNext steps:")
            print("  1. Test Appwrite backend: docker-compose up -d (with DEPLOYMENT_MODE=appwrite)")
            print("  2. Verify module library loads in UI")
            print("  3. Back up SQLite database (if not already done)")
            print("  4. Update deployment config to use Appwrite permanently")
        else:
            print("\n⚠️  No new modules migrated (all duplicates or errors)")
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Migration interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Migration failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
