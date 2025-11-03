from fastapi import FastAPI, HTTPException, Response, Request
from pydantic import BaseModel, Field
from typing import List, Optional
import base64
import datetime
import os
import json
import uuid
import hashlib
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Import our custom modules
import database_factory as database_manager  # Adapter pattern: auto-selects SQLite or Appwrite
import sfp_parser

# Constants
MAX_EEPROM_SIZE = 1024 * 1024  # 1MB max
MIN_EEPROM_SIZE = 128  # Minimum 128 bytes for valid SFP EEPROM

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)

def decode_and_validate_eeprom(base64_data: str) -> bytes:
    """
    Safely decode and validate EEPROM data.
    Prevents memory exhaustion and validates size constraints.
    """
    try:
        # Check encoded size first (rough estimate: base64 expands by ~33%)
        if len(base64_data) > (MAX_EEPROM_SIZE * 4 / 3):
            raise ValueError("EEPROM data too large")
        
        # Decode with validation
        eeprom_data = base64.b64decode(base64_data, validate=True)
        
        # Validate decoded size
        if len(eeprom_data) > MAX_EEPROM_SIZE:
            raise ValueError(f"EEPROM data exceeds maximum size of {MAX_EEPROM_SIZE} bytes")
        
        # Validate minimum size (SFP EEPROM is typically 256 bytes minimum)
        if len(eeprom_data) < MIN_EEPROM_SIZE:
            raise ValueError(f"EEPROM data too small (minimum {MIN_EEPROM_SIZE} bytes)")
        
        return eeprom_data
        
    except (base64.binascii.Error, ValueError) as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid EEPROM data: {str(e)}"
        )

def safe_submission_path(inbox_root: str, inbox_id: str) -> Path:
    """
    Safely construct submission directory path.
    Prevents directory traversal attacks.
    """
    # Normalize and validate inbox root
    root = Path(inbox_root).resolve()
    
    # Validate inbox_id is a valid UUID (no path characters)
    try:
        uuid.UUID(inbox_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid submission ID"
        )
    
    # Construct target path
    target = (root / inbox_id).resolve()
    
    # Ensure target is within root (prevent directory traversal)
    try:
        target.relative_to(root)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid submission path"
        )
    
    return target

app = FastAPI(
    title="SFP Wizard Backend API",
    description="A backend to store and serve SFP module EEPROM data.",
    version="1.0.0"
)

# Configure rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

try:
    # Enable permissive CORS by default for easier local development.
    # When deployed behind the frontend reverse proxy, same-origin will apply.
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    # CORS is optional; don't fail if middleware is unavailable.
    pass

# --- Pydantic Models (Define API Data Shapes) ---

class SfpModuleIn(BaseModel):
    """The shape of data we expect when a user saves a new module."""
    name: str = Field(..., description="A friendly name for the module, e.g., 'Cisco 10G Copper'")
    
    # We'll receive the binary data as a Base64-encoded string
    # This is the standard way to send binary data in a JSON payload.
    eeprom_data_base64: str = Field(..., description="The raw SFP EEPROM data, Base64 encoded.")

class SfpModuleInfo(BaseModel):
    """The shape of data we send for the 'get all modules' list."""
    id: int
    name: str
    vendor: str
    model: str
    serial: str
    created_at: datetime.datetime

class StatusMessage(BaseModel):
    """A simple status message response."""
    status: str
    message: str
    id: Optional[int] = None


# --- API Endpoints ---

@app.on_event("startup")
async def startup_event():
    """This runs once when the API server starts."""
    database_manager.setup_database()

@app.get("/api/modules", response_model=List[SfpModuleInfo])
async def get_all_saved_modules():
    """
    Get a list of all SFP modules saved in the database.
    This does NOT include the large EEPROM data blob.
    """
    modules_from_db = database_manager.get_all_modules()
    # Convert list of Row objects to a list of dicts for Pydantic
    return [dict(module) for module in modules_from_db]

@app.post("/api/modules", response_model=StatusMessage)
async def save_new_module(module: SfpModuleIn):
    """
    Save a newly read SFP module. The frontend sends the
    raw EEPROM data, and this endpoint parses it before saving.
    """
    # Decode and validate the EEPROM data
    eeprom_data = decode_and_validate_eeprom(module.eeprom_data_base64)

    # Use our parser to extract info
    parsed_info = sfp_parser.parse_sfp_data(eeprom_data)
    
    # Save to the database
    new_id, is_duplicate = database_manager.add_module(
        name=module.name,
        vendor=parsed_info["vendor"],
        model=parsed_info["model"],
        serial=parsed_info["serial"],
        eeprom_data=eeprom_data
    )
    status = "duplicate" if is_duplicate else "success"
    message = (f"Module already exists (SHA256 match). Using existing ID {new_id}."
               if is_duplicate else f"Module '{module.name}' saved.")
    return {"status": status, "message": message, "id": new_id}

# TODO: Add endpoint to import a module from the community index
# Example: POST /api/modules/import { name, vendor, model, serial, blob_url }
# The server would fetch the binary from blob_url, validate size/hash, and persist.

class CommunitySubmissionIn(BaseModel):
    name: str
    vendor: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    eeprom_data_base64: str
    notes: Optional[str] = None

class CommunitySubmissionOut(BaseModel):
    status: str
    message: str
    inbox_id: str
    sha256: str

@app.post("/api/submissions", response_model=CommunitySubmissionOut)
@limiter.limit("5/hour")  # 5 submissions per hour per IP
async def submit_to_community(request: Request, payload: CommunitySubmissionIn):
    """
    Accepts a user submission without requiring GitHub sign-in.
    Stores the submission in an inbox on disk for maintainers to triage and publish.
    """
    # Decode and validate the EEPROM data
    eeprom = decode_and_validate_eeprom(payload.eeprom_data_base64)

    sha = hashlib.sha256(eeprom).hexdigest()
    inbox_root = os.environ.get("SUBMISSIONS_DIR", "/app/data/submissions")
    os.makedirs(inbox_root, exist_ok=True)
    
    # Generate safe submission path
    inbox_id = str(uuid.uuid4())
    target_dir = safe_submission_path(inbox_root, inbox_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Write files
    with open(target_dir / "eeprom.bin", "wb") as f:
        f.write(eeprom)
    meta = {
        "name": payload.name,
        "vendor": payload.vendor,
        "model": payload.model,
        "serial": payload.serial,
        "sha256": sha,
        "notes": payload.notes,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
    }
    with open(target_dir / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    return {
        "status": "queued",
        "message": "Submission stored for review.",
        "inbox_id": inbox_id,
        "sha256": sha,
    }

@app.get("/api/modules/{module_id}/eeprom")
async def get_module_eeprom_data(module_id: int):
    """
    Get the raw binary EEPROM data for a specific module.
    This is what the frontend will fetch when the user clicks "Write".
    """
    eeprom_data = database_manager.get_module_eeprom(module_id)
    if not eeprom_data:
        raise HTTPException(status_code=404, detail="Module not found.")
    
    # Return the raw binary data
    return Response(content=eeprom_data, media_type="application/octet-stream")

@app.delete("/api/modules/{module_id}", response_model=StatusMessage)
async def delete_saved_module(module_id: int):
    """Delete a module from the database."""
    if database_manager.delete_module(module_id):
        return {"status": "success", "message": "Module deleted."}
    else:
        raise HTTPException(status_code=404, detail="Module not found.")
