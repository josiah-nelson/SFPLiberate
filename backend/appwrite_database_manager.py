"""
Appwrite Database Manager for SFPLiberate
Provides database operations using Appwrite's cloud database service.
Uses Storage service for EEPROM binary data (more efficient than BLOBs).

Permissions Model:
- Backend uses API key with full access (bypasses document-level permissions)
- Collection-level permissions configured in Appwrite Console:
  * Read: Any (public read access to module library)
  * Create: Users (authenticated users can add modules)
  * Update/Delete: Team:admin (only admins can edit/delete)
- See docs/APPWRITE_DATABASE.md for setup instructions
"""
import os
import hashlib
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.query import Query
from appwrite.exception import AppwriteException
from appwrite.input_file import InputFile

# Appwrite configuration from environment
APPWRITE_ENDPOINT = os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID = os.environ.get("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY = os.environ.get("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID = os.environ.get("APPWRITE_DATABASE_ID", "sfp_library")
APPWRITE_COLLECTION_ID = os.environ.get("APPWRITE_COLLECTION_ID", "sfp_modules")
APPWRITE_BUCKET_ID = os.environ.get("APPWRITE_BUCKET_ID", "sfp_eeprom_data")

# Initialize Appwrite client (singleton)
_client = None
_databases = None
_storage = None

def get_appwrite_client() -> Client:
    """Get or create the Appwrite client singleton."""
    global _client
    if _client is None:
        if not APPWRITE_PROJECT_ID or not APPWRITE_API_KEY:
            raise ValueError(
                "Appwrite configuration missing. Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY."
            )
        _client = Client()
        _client.set_endpoint(APPWRITE_ENDPOINT)
        _client.set_project(APPWRITE_PROJECT_ID)
        _client.set_key(APPWRITE_API_KEY)
    return _client

def get_databases_service() -> Databases:
    """Get the Databases service."""
    global _databases
    if _databases is None:
        _databases = Databases(get_appwrite_client())
    return _databases

def get_storage_service() -> Storage:
    """Get the Storage service."""
    global _storage
    if _storage is None:
        _storage = Storage(get_appwrite_client())
    return _storage

def setup_database():
    """
    Verify Appwrite connection and required services.
    Note: Collection and bucket must be created manually in Appwrite Console.
    See docs/APPWRITE_DATABASE.md for setup instructions.
    """
    try:
        db = get_databases_service()
        # Verify database and collection exist
        db.get_collection(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID)
        
        storage = get_storage_service()
        # Verify bucket exists
        storage.get_bucket(APPWRITE_BUCKET_ID)
        
        print(f"✓ Appwrite database connected: {APPWRITE_DATABASE_ID}/{APPWRITE_COLLECTION_ID}")
        print(f"✓ Appwrite storage connected: {APPWRITE_BUCKET_ID}")
    except AppwriteException as e:
        raise RuntimeError(
            f"Appwrite setup failed: {e.message}. "
            f"Ensure database '{APPWRITE_DATABASE_ID}', collection '{APPWRITE_COLLECTION_ID}', "
            f"and bucket '{APPWRITE_BUCKET_ID}' exist in Appwrite Console."
        )

async def add_module(name: str, vendor: str, model: str, serial: str, eeprom_data: bytes) -> Tuple[int, bool]:
    """
    Adds a new SFP module to Appwrite database with EEPROM data in Storage.
    
    Returns:
        Tuple of (document_id_as_int, is_duplicate)
        Note: We use SHA256 as the document ID for deduplication.
    """
    sha256_hash = hashlib.sha256(eeprom_data).hexdigest()
    
    db = get_databases_service()
    storage = get_storage_service()
    
    # Check for duplicate by trying to get document with SHA256 as ID
    try:
        existing = db.get_document(
            APPWRITE_DATABASE_ID,
            APPWRITE_COLLECTION_ID,
            sha256_hash
        )
        # Document exists - it's a duplicate
        # Return the hash as a pseudo-ID (convert first 8 hex chars to int for compatibility)
        return int(sha256_hash[:8], 16), True
    except AppwriteException as e:
        if e.code != 404:  # Not a "not found" error - something else went wrong
            raise
    
    # Not a duplicate - upload EEPROM to storage first
    try:
        # Upload with SHA256 as file ID for easy lookup
        file_result = storage.create_file(
            bucket_id=APPWRITE_BUCKET_ID,
            file_id=sha256_hash,
            file=InputFile.from_bytes(eeprom_data, filename=f"{name}.bin")
        )
        file_id = file_result['$id']
    except AppwriteException as e:
        if e.code == 409:  # File already exists
            file_id = sha256_hash
        else:
            raise RuntimeError(f"Failed to upload EEPROM data: {e.message}")
    
    # Create document with SHA256 as ID
    try:
        doc = db.create_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=APPWRITE_COLLECTION_ID,
            document_id=sha256_hash,  # Use SHA256 as document ID for natural deduplication
            data={
                "name": name,
                "vendor": vendor or "",
                "model": model or "",
                "serial": serial or "",
                "sha256": sha256_hash,
                "eeprom_file_id": file_id,
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
        )
        # Return hash as pseudo-ID
        return int(sha256_hash[:8], 16), False
    except AppwriteException as e:
        # If document creation fails, clean up the uploaded file
        try:
            storage.delete_file(APPWRITE_BUCKET_ID, file_id)
        except:
            pass  # Best effort cleanup
        raise RuntimeError(f"Failed to create module document: {e.message}")

def get_all_modules() -> List[Dict[str, Any]]:
    """
    Fetches the list of all saved modules (metadata only, no EEPROM data).
    Returns list of dicts with keys: id, name, vendor, model, serial, created_at
    """
    db = get_databases_service()
    
    try:
        result = db.list_documents(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=APPWRITE_COLLECTION_ID,
            queries=[
                Query.order_asc("name"),
                Query.limit(100)  # Pagination - adjust as needed
            ]
        )
        
        modules = []
        for doc in result['documents']:
            # Convert Appwrite document to SQLite-compatible format
            modules.append({
                "id": int(doc['sha256'][:8], 16),  # Use first 8 chars of SHA as integer ID
                "name": doc.get('name', ''),
                "vendor": doc.get('vendor', ''),
                "model": doc.get('model', ''),
                "serial": doc.get('serial', ''),
                "created_at": doc.get('created_at', doc.get('$createdAt', ''))
            })
        
        return modules
    except AppwriteException as e:
        raise RuntimeError(f"Failed to fetch modules: {e.message}")

def get_module_eeprom(module_id: int) -> Optional[bytes]:
    """
    Fetches the raw EEPROM binary data for a specific module.
    
    Note: module_id is actually the first 8 hex chars of SHA256 as int.
    We need to find the full SHA256 to look up the file.
    """
    db = get_databases_service()
    storage = get_storage_service()
    
    # Convert int ID back to partial SHA256 hex
    partial_sha = format(module_id, '08x')
    
    try:
        # Search for document with SHA256 starting with this prefix
        result = db.list_documents(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=APPWRITE_COLLECTION_ID,
            queries=[
                Query.starts_with("sha256", partial_sha),
                Query.limit(1)
            ]
        )
        
        if not result['documents']:
            return None
        
        doc = result['documents'][0]
        file_id = doc.get('eeprom_file_id') or doc.get('sha256')
        
        # Download file from storage
        file_content = storage.get_file_download(
            bucket_id=APPWRITE_BUCKET_ID,
            file_id=file_id
        )
        
        return file_content
    except AppwriteException as e:
        if e.code == 404:
            return None
        raise RuntimeError(f"Failed to fetch EEPROM data: {e.message}")

def delete_module(module_id: int) -> bool:
    """
    Deletes a module from the database and its EEPROM file from storage.
    
    Returns:
        True if deleted, False if not found.
    """
    db = get_databases_service()
    storage = get_storage_service()
    
    # Convert int ID back to partial SHA256 hex
    partial_sha = format(module_id, '08x')
    
    try:
        # Find the document
        result = db.list_documents(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=APPWRITE_COLLECTION_ID,
            queries=[
                Query.starts_with("sha256", partial_sha),
                Query.limit(1)
            ]
        )
        
        if not result['documents']:
            return False
        
        doc = result['documents'][0]
        doc_id = doc['$id']
        file_id = doc.get('eeprom_file_id') or doc.get('sha256')
        
        # Delete document
        db.delete_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=APPWRITE_COLLECTION_ID,
            document_id=doc_id
        )
        
        # Delete file from storage (best effort)
        try:
            storage.delete_file(APPWRITE_BUCKET_ID, file_id)
        except AppwriteException:
            pass  # File might not exist or already deleted
        
        return True
    except AppwriteException as e:
        if e.code == 404:
            return False
        raise RuntimeError(f"Failed to delete module: {e.message}")
