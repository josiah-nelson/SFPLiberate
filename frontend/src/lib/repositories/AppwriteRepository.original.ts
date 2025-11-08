/**
 * Appwrite Repository Implementation
 *
 * Uses Appwrite Database + Storage for module storage.
 * This implementation is for Appwrite Cloud deployments.
 */

import { getAppwriteClient } from '../auth';
import { parseSFPData, calculateSHA256 } from '../sfp/parser';
import type {
  Module,
  CreateModuleData,
  CreateModuleResult,
  ModuleRepository,
} from './types';

// Lazy-loaded Appwrite services
type AppwriteDatabases = import('appwrite').Databases;
type AppwriteStorage = import('appwrite').Storage;
type AppwriteQuery = typeof import('appwrite').Query;
type AppwriteID = typeof import('appwrite').ID;

let databasesService: AppwriteDatabases | null = null;
let storageService: AppwriteStorage | null = null;
let QueryService: AppwriteQuery | null = null;
let IDService: AppwriteID | null = null;

/**
 * Get Appwrite Databases service
 */
async function getDatabases(): Promise<AppwriteDatabases> {
  if (databasesService) return databasesService;
  const { Databases } = await import('appwrite');
  const client = await getAppwriteClient();
  databasesService = new Databases(client);
  return databasesService;
}

/**
 * Get Appwrite Storage service
 */
async function getStorage(): Promise<AppwriteStorage> {
  if (storageService) return storageService;
  const { Storage } = await import('appwrite');
  const client = await getAppwriteClient();
  storageService = new Storage(client);
  return storageService;
}

/**
 * Get Appwrite Query helper
 */
async function getQuery(): Promise<AppwriteQuery> {
  if (QueryService) return QueryService;
  const { Query } = await import('appwrite');
  QueryService = Query;
  return QueryService;
}

/**
 * Get Appwrite ID helper
 */
async function getID(): Promise<AppwriteID> {
  if (IDService) return IDService;
  const { ID } = await import('appwrite');
  IDService = ID;
  return IDService;
}

// Appwrite configuration
const DATABASE_ID = 'sfpliberate';
const USER_MODULES_COLLECTION_ID = 'user_modules';
const USER_EEPROM_BUCKET_ID = 'user_eeprom_data';

/**
 * Appwrite repository using Appwrite SDK
 */
export class AppwriteRepository implements ModuleRepository {
  /**
   * List all modules for current user
   */
  async listModules(): Promise<Module[]> {
    try {
      const databases = await getDatabases();
      const Query = await getQuery();

      const response = await databases.listDocuments(DATABASE_ID, USER_MODULES_COLLECTION_ID, [
        Query.orderDesc('$createdAt'),
        Query.limit(1000), // Adjust as needed
      ]);

      return response.documents.map((doc) => ({
        id: doc.$id,
        name: doc.name as string,
        vendor: (doc.vendor as string) || undefined,
        model: (doc.model as string) || undefined,
        serial: (doc.serial as string) || undefined,
        sha256: (doc.sha256 as string) || undefined,
        size: (doc.size as number) || undefined,
        created_at: doc.$createdAt,
      }));
    } catch (error) {
      console.error('Failed to list modules from Appwrite:', error);
      throw new Error(`Failed to fetch modules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new module
   */
  async createModule(data: CreateModuleData): Promise<CreateModuleResult> {
    try {
      const databases = await getDatabases();
      const storage = await getStorage();
      const Query = await getQuery();
      const ID = await getID();

      // Parse EEPROM if metadata not provided
      let vendor = data.vendor;
      let model = data.model;
      let serial = data.serial;

      if (!vendor || !model || !serial) {
        const parsed = parseSFPData(data.eepromData);
        vendor = vendor || parsed.vendor;
        model = model || parsed.model;
        serial = serial || parsed.serial;
      }

      // Calculate SHA256 if not provided
      const sha256 = data.sha256 || (await calculateSHA256(data.eepromData));

      // Check for duplicates (same SHA256)
      const existingDocs = await databases.listDocuments(DATABASE_ID, USER_MODULES_COLLECTION_ID, [
        Query.equal('sha256', sha256),
        Query.limit(1),
      ]);

      if (existingDocs.documents.length > 0) {
        // Duplicate found - return existing module
        const existingDoc = existingDocs.documents[0];
        const existingModule: Module = {
          id: existingDoc.$id,
          name: existingDoc.name as string,
          vendor: (existingDoc.vendor as string) || undefined,
          model: (existingDoc.model as string) || undefined,
          serial: (existingDoc.serial as string) || undefined,
          sha256: existingDoc.sha256 as string,
          size: (existingDoc.size as number) || undefined,
          created_at: existingDoc.$createdAt,
        };

        return {
          module: existingModule,
          isDuplicate: true,
          message: `Module already exists (SHA256 match). Using existing ID ${existingModule.id}.`,
        };
      }

      // Upload EEPROM file to storage
      const eepromBlob = new Blob([data.eepromData], { type: 'application/octet-stream' });
      const eepromFile = new File([eepromBlob], `${sha256.substring(0, 16)}.bin`, {
        type: 'application/octet-stream',
      });

      const fileUpload = await storage.createFile(USER_EEPROM_BUCKET_ID, ID.unique(), eepromFile);

      // Create module document
      const doc = await databases.createDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, ID.unique(), {
        name: data.name,
        vendor: vendor || undefined,
        model: model || undefined,
        serial: serial || undefined,
        sha256,
        eeprom_file_id: fileUpload.$id,
        size: data.eepromData.byteLength,
      });

      const module: Module = {
        id: doc.$id,
        name: doc.name as string,
        vendor: (doc.vendor as string) || undefined,
        model: (doc.model as string) || undefined,
        serial: (doc.serial as string) || undefined,
        sha256: doc.sha256 as string,
        size: doc.size as number,
        created_at: doc.$createdAt,
      };

      return {
        module,
        isDuplicate: false,
        message: `Module '${data.name}' saved successfully.`,
      };
    } catch (error) {
      console.error('Failed to create module in Appwrite:', error);
      throw new Error(`Failed to save module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get module by ID
   */
  async getModule(id: string): Promise<Module> {
    try {
      const databases = await getDatabases();
      const doc = await databases.getDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, id);

      return {
        id: doc.$id,
        name: doc.name as string,
        vendor: (doc.vendor as string) || undefined,
        model: (doc.model as string) || undefined,
        serial: (doc.serial as string) || undefined,
        sha256: (doc.sha256 as string) || undefined,
        size: (doc.size as number) || undefined,
        created_at: doc.$createdAt,
      };
    } catch (error) {
      console.error(`Failed to get module ${id} from Appwrite:`, error);
      throw new Error(`Failed to fetch module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get EEPROM binary data
   */
  async getEEPROMData(id: string): Promise<ArrayBuffer> {
    try {
      const databases = await getDatabases();
      const storage = await getStorage();

      // Get module to find associated file ID
      const doc = await databases.getDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, id);
      const fileId = doc.eeprom_file_id as string;

      if (!fileId) {
        throw new Error(`Module ${id} has no associated EEPROM file`);
      }

      // Download file from storage
      const result = await storage.getFileDownload(USER_EEPROM_BUCKET_ID, fileId);

      // Convert Blob/response to ArrayBuffer
      if (result instanceof Blob) {
        return await result.arrayBuffer();
      } else if (result instanceof ArrayBuffer) {
        return result;
      } else {
        // Fallback: might be a URL, fetch it
        const response = await fetch(result.toString());
        return await response.arrayBuffer();
      }
    } catch (error) {
      console.error(`Failed to get EEPROM data for module ${id}:`, error);
      throw new Error(`Failed to fetch EEPROM data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a module
   */
  async deleteModule(id: string): Promise<void> {
    try {
      const databases = await getDatabases();
      const storage = await getStorage();

      // Get module to find associated file
      const doc = await databases.getDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, id);
      const fileId = doc.eeprom_file_id as string;

      // Delete file from storage
      if (fileId) {
        await storage.deleteFile(USER_EEPROM_BUCKET_ID, fileId);
      }

      // Delete document
      await databases.deleteDocument(DATABASE_ID, USER_MODULES_COLLECTION_ID, id);
    } catch (error) {
      console.error(`Failed to delete module ${id}:`, error);
      throw new Error(`Failed to delete module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
