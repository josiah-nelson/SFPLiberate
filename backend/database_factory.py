"""
Database Factory for SFPLiberate
Returns the appropriate database manager based on deployment mode.
Supports both SQLite (standalone) and Appwrite (cloud) backends.
"""
import os
from typing import Any

# Determine deployment mode from environment
DEPLOYMENT_MODE = os.environ.get("DEPLOYMENT_MODE", "standalone").lower()

def get_database_manager() -> Any:
    """
    Returns the appropriate database manager based on DEPLOYMENT_MODE.
    
    - "standalone": SQLite database (local Docker deployment)
    - "appwrite": Appwrite cloud database (public hosted version)
    
    Returns:
        Module with interface: setup_database(), add_module(), get_all_modules(),
        get_module_eeprom(), delete_module()
    """
    if DEPLOYMENT_MODE == "appwrite":
        try:
            import appwrite_database_manager as manager
            print(f"✓ Using Appwrite database manager (deployment_mode={DEPLOYMENT_MODE})")
            return manager
        except ImportError as e:
            raise RuntimeError(
                f"Appwrite database manager required for deployment_mode='appwrite' "
                f"but import failed: {e}. Install with: pip install appwrite"
            )
    elif DEPLOYMENT_MODE == "standalone":
        import database_manager as manager
        print(f"✓ Using SQLite database manager (deployment_mode={DEPLOYMENT_MODE})")
        return manager
    else:
        raise ValueError(
            f"Unknown DEPLOYMENT_MODE: '{DEPLOYMENT_MODE}'. "
            f"Valid options: 'standalone' or 'appwrite'"
        )

# Export the selected database manager
db = get_database_manager()

# Re-export all database functions for clean imports
setup_database = db.setup_database
add_module = db.add_module
get_all_modules = db.get_all_modules
get_module_eeprom = db.get_module_eeprom
delete_module = db.delete_module
