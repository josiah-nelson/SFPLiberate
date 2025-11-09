/**
 * Appwrite Repository Implementation (IMPROVED)
 *
 * This version implements critical fixes from the adversarial review:
 * - Permissions on documents and files
 * - TypeScript generics for type safety
 * - Orphaned file cleanup
 * - AppwriteException error handling
 * - Retry logic for transient errors
 * - Query optimization with select()
 * - Input sanitization (XSS prevention)
 */

import { getAppwriteClient, getAccount } from '../auth';
import { parseSFPData, calculateSHA256 } from '../sfp/parser';
import { sanitizeModuleData } from '../security/sanitization';
import { appwriteResourceIds } from '../appwrite/config';
import type {
  Module,
  CreateModuleData,
  CreateModuleResult,
  ModuleRepository,
} from './types';

// Lazy-loaded Appwrite services with proper types
type AppwriteDatabases = import('appwrite').Databases;
type AppwriteStorage = import('appwrite').Storage;
type AppwriteQuery = typeof import('appwrite').Query;
type AppwriteID = typeof import('appwrite').ID;
type AppwritePermission = typeof import('appwrite').Permission;
type AppwriteRole = typeof import('appwrite').Role;
type AppwriteException = import('appwrite').AppwriteException;
type AppwriteDocument = import('appwrite').Models.Document;

// Document type for type-safe queries
interface UserModuleDocument extends AppwriteDocument {
  name: string;
  vendor?: string;
  model?: string;
  serial?: string;
  sha256: string;
  eeprom_file_id: string;
  size: number;
  read_from_device?: boolean;
  community_module_ref?: string;
}

interface CommunityModuleDocument extends AppwriteDocument {
  name: string;
  vendor?: string;
  model?: string;
  serial?: string;
  sha256: string;
  blobId: string;
  size: number;
  parent_user_module_id?: string;
  device_timestamp?: string;
  submittedBy?: string;
  verified?: boolean;
  downloads?: number;
}

// Service singletons
let databasesService: AppwriteDatabases | null = null;
let storageService: AppwriteStorage | null = null;
let QueryService: AppwriteQuery | null = null;
let IDService: AppwriteID | null = null;
let PermissionService: AppwritePermission | null = null;
let RoleService: AppwriteRole | null = null;

/**
 * Get Appwrite services
 */
async function getServices() {
  if (databasesService && storageService && QueryService && IDService && PermissionService && RoleService) {

    return {
      databases: databasesService,
      storage: storageService,
      Query: QueryService,
      ID: IDService,
      Permission: PermissionService,
      Role: RoleService,
    };
  }

  const appwrite = await import('appwrite');
  const client = await getAppwriteClient();

  databasesService = new appwrite.Databases(client);
  storageService = new appwrite.Storage(client);
  QueryService = appwrite.Query;
  IDService = appwrite.ID;
  PermissionService = appwrite.Permission;
  RoleService = appwrite.Role;


  return {
    databases: databasesService,
    storage: storageService,
    Query: QueryService,
    ID: IDService,
    Permission: PermissionService,
    Role: RoleService,
  };
}

/**
 * Get current user ID (required for permissions)
 */
async function getCurrentUserId(): Promise<string> {
  const account = await getAccount();
  const user = await account.get();

  return user.$id;
}

/**
 * Retry operation with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {

      return await operation();
    } catch (error: any) {
      // Check if it's an AppwriteException with retryable code
      const retryableCodes = [429, 500, 502, 503, 504];
      const isRetryable = error.code && retryableCodes.includes(error.code);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry logic exhausted');
}

/**
 * Handle Appwrite errors with user-friendly messages
 */
function handleAppwriteError(error: any, context: string): never {
  if (error.code) {
    // AppwriteException
    switch (error.code) {
      case 401:
        throw new Error('Authentication required. Please log in and try again.');
      case 404:
        throw new Error(`${context} not found.`);
      case 429:
        throw new Error('Too many requests. Please wait a moment and try again.');
      case 503:
        throw new Error('Service temporarily unavailable. Please try again in a few moments.');
      default:
        throw new Error(`${context} failed: ${error.message || 'Unknown error'}`);
    }
  }

  // Generic error
  throw new Error(`${context} failed: ${error instanceof Error ? error.message : String(error)}`);
}

// Appwrite configuration
const DATABASE_ID = appwriteResourceIds.databaseId;
const USER_MODULES_COLLECTION_ID = appwriteResourceIds.userModulesCollectionId;
const COMMUNITY_MODULES_COLLECTION_ID = appwriteResourceIds.communityModulesCollectionId;
const USER_EEPROM_BUCKET_ID = appwriteResourceIds.userModulesBucketId;
const COMMUNITY_BLOBS_BUCKET_ID = appwriteResourceIds.communityBlobBucketId;

/**
 * Generate filename for community blob with timestamp, serial, and parent ID
 */
function generateCommunityBlobFilename(
  vendor: string,
  model: string,
  serial: string,
  parentId: string,
  sha256: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitized = {
    vendor: vendor?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
    model: model?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
    serial: serial?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown',
  };
  return `${sanitized.vendor}_${sanitized.model}_${sanitized.serial}_${timestamp}_${parentId.substring(0, 8)}_${sha256.substring(0, 8)}.bin`;
}

/**
 * Get community permissions (alpha/admin can read, only admin can edit)
 */
function getCommunityPermissions(Permission: AppwritePermission, Role: AppwriteRole) {
  return [
    Permission.read(Role.label('alpha')),
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
  ];
}

/**
 * Improved Appwrite repository with best practices
 */
export class AppwriteRepository implements ModuleRepository {
  /**
   * List all modules for current user with pagination support
   */
  async listModules(): Promise<Module[]> {
    try {
      const { databases, Query } = await getServices();

      const response = await retryWithBackoff(() =>
        databases.listDocuments<UserModuleDocument>(
          DATABASE_ID,
          USER_MODULES_COLLECTION_ID,
          [
            Query.orderDesc('$createdAt'),
            Query.limit(100), // Reasonable page size
          ]
        )
      );

      return response.documents.map((doc) => ({
        id: doc.$id,
        name: doc.name,
        vendor: doc.vendor,
        model: doc.model,
        serial: doc.serial,
        sha256: doc.sha256,
        size: doc.size,
        created_at: doc.$createdAt,
        read_from_device: doc.read_from_device,
        community_module_ref: doc.community_module_ref,
      }));
    } catch (error) {
      handleAppwriteError(error, 'List modules');
    }
  }

  /**
   * Private helper: Submit module to community database
   */
  private async submitToCommunityDatabase(params: {
    userModuleId: string;
    name: string;
    vendor?: string;
    model?: string;
    serial?: string;
    sha256: string;
    eepromData: ArrayBuffer;
    size: number;
    userId: string;
  }): Promise<void> {
    try {
      const { databases, storage, Query, ID, Permission, Role } = await getServices();

      // Check if community module already exists (by vendor+model, not SHA256)
      const vendor = params.vendor || 'unknown';
      const model = params.model || 'unknown';
      
      const existingCommunityMods = await databases.listDocuments<CommunityModuleDocument>(
        DATABASE_ID,
        COMMUNITY_MODULES_COLLECTION_ID,
        [
          Query.equal('vendor', vendor),
          Query.equal('model', model),
          Query.limit(1),
        ]
      );

      const timestamp = new Date().toISOString();
      const communityPermissions = getCommunityPermissions(Permission, Role);

      if (existingCommunityMods.documents.length > 0) {
        // Module exists - just log this submission as metadata (duplicate)
        const existingDoc = existingCommunityMods.documents[0];
        console.log(`Community module already exists: ${existingDoc.$id}. Logging duplicate submission.`);
        
        // TODO: In future, store duplicate submission metadata
        // For now, just increment downloads counter or store in a log collection
        return;
      }

      // Create new community module with timestamped blob
      const filename = generateCommunityBlobFilename(
        vendor,
        params.model || 'unknown',
        params.serial || 'unknown',
        params.userModuleId,
        params.sha256
      );

      const blobFile = new File([params.eepromData], filename, {
        type: 'application/octet-stream',
      });

      // Upload blob to community bucket
      const blobUpload = await storage.createFile(
        COMMUNITY_BLOBS_BUCKET_ID,
        ID.unique(),
        blobFile,
        communityPermissions
      );

      // Create community document
      await databases.createDocument<CommunityModuleDocument>(
        DATABASE_ID,
        COMMUNITY_MODULES_COLLECTION_ID,
        ID.unique(),
        {
          name: params.name,
          vendor: params.vendor,
          model: params.model,
          serial: params.serial,
          sha256: params.sha256,
          blobId: blobUpload.$id,
          size: params.size,
          parent_user_module_id: params.userModuleId,
          device_timestamp: timestamp,
          submittedBy: params.userId,
          verified: false,
          downloads: 0,
        },
        communityPermissions
      );

      console.log(`Submitted to community database: ${vendor} ${model}`);
    } catch (error) {
      // Log but don't fail the user module creation
      console.error('Failed to submit to community database:', error);
    }
  }

  /**
   * Create a new module with proper permissions and cleanup
   */
  async createModule(data: CreateModuleData): Promise<CreateModuleResult> {
    try {
      const { databases, storage, Query, ID, Permission, Role } = await getServices();
      const userId = await getCurrentUserId();

      // Parse EEPROM if metadata not provided
      const parsed = parseSFPData(data.eepromData);
      const vendor = data.vendor || parsed.vendor;
      const model = data.model || parsed.model;
      const serial = data.serial || parsed.serial;

      // Sanitize all user-provided text inputs (XSS prevention)
      const sanitized = sanitizeModuleData({
        name: data.name,
        vendor,
        model,
        serial,
      });

      // Calculate SHA256 if not provided
      const sha256 = data.sha256 || (await calculateSHA256(data.eepromData));

      // Check for duplicates (optimized query - only fetch $id)
      const existingDocs = await databases.listDocuments<UserModuleDocument>(
        DATABASE_ID,
        USER_MODULES_COLLECTION_ID,
        [Query.equal('sha256', sha256), Query.select(['$id']), Query.limit(1)]
      );

      if (existingDocs.documents.length > 0) {
        // Duplicate found - fetch full document
        const existingDoc = await databases.getDocument<UserModuleDocument>(
          DATABASE_ID,
          USER_MODULES_COLLECTION_ID,
          existingDocs.documents[0].$id
        );

        return {
          module: {
            id: existingDoc.$id,
            name: existingDoc.name,
            vendor: existingDoc.vendor,
            model: existingDoc.model,
            serial: existingDoc.serial,
            sha256: existingDoc.sha256,
            size: existingDoc.size,
            created_at: existingDoc.$createdAt,
          },
          isDuplicate: true,
          message: `Module already exists (SHA256 match). Using existing ID ${existingDoc.$id}.`,
        };
      }

      // Prepare file
      const eepromBlob = new Blob([data.eepromData], { type: 'application/octet-stream' });
      const eepromFile = new File([eepromBlob], `${sha256.substring(0, 16)}.bin`, {
        type: 'application/octet-stream',
      });

      // Define permissions for this user only
      const permissions = [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ];

      let fileUpload: Awaited<ReturnType<AppwriteStorage['createFile']>> | undefined;
      try {
        // Upload EEPROM file with permissions
        fileUpload = await retryWithBackoff(() =>
          storage.createFile(USER_EEPROM_BUCKET_ID, ID.unique(), eepromFile, permissions)
        );

        // Create module document with permissions (using sanitized data)
        const doc = await retryWithBackoff(() =>
          databases.createDocument<UserModuleDocument>(
            DATABASE_ID,
            USER_MODULES_COLLECTION_ID,
            ID.unique(),
            {
              name: sanitized.name,
              vendor: sanitized.vendor || undefined,
              model: sanitized.model || undefined,
              serial: sanitized.serial || undefined,
              sha256,
              eeprom_file_id: fileUpload!.$id,
              size: data.eepromData.byteLength,
              read_from_device: data.read_from_device ?? true, // Default to true (device read)
              community_module_ref: data.community_module_ref || undefined,
            },
            permissions
          )
        );

        // If this was read from device, also submit to community database
        if (data.read_from_device !== false) {
          await this.submitToCommunityDatabase({
            userModuleId: doc.$id,
            name: sanitized.name,
            vendor: sanitized.vendor,
            model: sanitized.model,
            serial: sanitized.serial,
            sha256,
            eepromData: data.eepromData,
            size: data.eepromData.byteLength,
            userId,
          });
        }

        return {
          module: {
            id: doc.$id,
            name: doc.name,
            vendor: doc.vendor,
            model: doc.model,
            serial: doc.serial,
            sha256: doc.sha256,
            size: doc.size,
            created_at: doc.$createdAt,
            read_from_device: doc.read_from_device,
            community_module_ref: doc.community_module_ref,
          },
          isDuplicate: false,
          message: `Module '${data.name}' saved successfully.`,
        };
      } catch (error) {
        // Cleanup orphaned file on failure
        if (fileUpload) {
          try {
            await storage.deleteFile(USER_EEPROM_BUCKET_ID, fileUpload.$id);
            console.info('Cleaned up orphaned file after document creation failure');
          } catch (cleanupError) {
            console.error('Failed to cleanup orphaned file:', cleanupError);
          }
        }
        throw error;
      }
    } catch (error) {
      handleAppwriteError(error, 'Create module');
    }
  }

  /**
   * Get module by ID
   */
  async getModule(id: string): Promise<Module> {
    try {
      const { databases } = await getServices();

      const doc = await retryWithBackoff(() =>
        databases.getDocument<UserModuleDocument>(DATABASE_ID, USER_MODULES_COLLECTION_ID, id)
      );

      return {
        id: doc.$id,
        name: doc.name,
        vendor: doc.vendor,
        model: doc.model,
        serial: doc.serial,
        sha256: doc.sha256,
        size: doc.size,
        created_at: doc.$createdAt,
        read_from_device: doc.read_from_device,
        community_module_ref: doc.community_module_ref,
      };
    } catch (error) {
      handleAppwriteError(error, 'Get module');
    }
  }

  /**
   * Get EEPROM binary data
   */
  async getEEPROMData(id: string): Promise<ArrayBuffer> {
    try {
      const { databases, storage, Query } = await getServices();

      // Get module (only fetch file ID)
      const doc = await databases.getDocument<UserModuleDocument>(
        DATABASE_ID,
        USER_MODULES_COLLECTION_ID,
        id,
        [Query.select(['eeprom_file_id'])]
      );

      const fileId = doc.eeprom_file_id;
      if (!fileId) {
        throw new Error(`Module ${id} has no associated EEPROM file`);
      }

      // Get download URL (Web SDK returns URL object with href property)
      const downloadUrl = storage.getFileDownload(USER_EEPROM_BUCKET_ID, fileId);

      // Fetch the actual file data
      const response = await retryWithBackoff(() => fetch(downloadUrl.toString()));

      if (!response.ok) {
        throw new Error(`Failed to download EEPROM file: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      handleAppwriteError(error, 'Get EEPROM data');
    }
  }

  /**
   * Delete a module (document first, then file for safety)
   */
  async deleteModule(id: string): Promise<void> {
    try {
      const { databases, storage, Query } = await getServices();

      // Get module (only fetch file ID)
      const doc = await databases.getDocument<UserModuleDocument>(
        DATABASE_ID,
        USER_MODULES_COLLECTION_ID,
        id,
        [Query.select(['eeprom_file_id'])]
      );

      const fileId = doc.eeprom_file_id;

      // Delete document first (prevents dangling reference)
      await retryWithBackoff(() => databases.deleteDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, id));

      // Try to delete file (best effort)
      if (fileId) {
        try {
          await storage.deleteFile(USER_EEPROM_BUCKET_ID, fileId);
        } catch (error) {
          console.warn(`Failed to delete file ${fileId} (document already deleted):`, error);
          // Don't throw - document is already deleted
        }
      }
    } catch (error) {
      handleAppwriteError(error, 'Delete module');
    }
  }

  /**
   * Save a community module as a favorite (reference only, no blob upload)
   */
  async favoriteModule(communityModuleId: string, customName?: string): Promise<Module> {
    try {
      const { databases, ID, Permission, Role } = await getServices();
      const userId = await getCurrentUserId();

      // Fetch community module to get its metadata and blob reference
      const communityMod = await databases.getDocument<CommunityModuleDocument>(
        DATABASE_ID,
        COMMUNITY_MODULES_COLLECTION_ID,
        communityModuleId
      );

      // Define permissions for this user only
      const permissions = [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ];

      // Create user-module document that references the community blob
      const doc = await retryWithBackoff(() =>
        databases.createDocument<UserModuleDocument>(
          DATABASE_ID,
          USER_MODULES_COLLECTION_ID,
          ID.unique(),
          {
            name: customName || communityMod.name,
            vendor: communityMod.vendor,
            model: communityMod.model,
            serial: communityMod.serial,
            sha256: communityMod.sha256,
            eeprom_file_id: communityMod.blobId, // Reference community blob
            size: communityMod.size,
            read_from_device: false, // This is a favorite, not a device read
            community_module_ref: communityModuleId,
          },
          permissions
        )
      );

      return {
        id: doc.$id,
        name: doc.name,
        vendor: doc.vendor,
        model: doc.model,
        serial: doc.serial,
        sha256: doc.sha256,
        size: doc.size,
        created_at: doc.$createdAt,
        read_from_device: doc.read_from_device,
        community_module_ref: doc.community_module_ref,
      };
    } catch (error) {
      handleAppwriteError(error, 'Favorite module');
    }
  }
}
