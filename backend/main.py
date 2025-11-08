"""
Appwrite Function entrypoint wrapper.

Appwrite Functions require a specific entrypoint structure. This wrapper:
1. Adds the correct paths to sys.path for module imports
2. Delegates to the actual FastAPI application
"""

import sys
import os
from pathlib import Path

# Add the backend directory to Python path so 'app' module can be imported
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Now import the actual application
from app.main import app
