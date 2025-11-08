/**
 * Community Module Database Functions
 *
 * Handles interactions with Appwrite Databases for community-submitted
 * SFP module profiles. Only available in Appwrite deployment mode.
 */

import { getAppwriteClient } from './auth';
import { isAppwrite } from './features';
import { appwriteResourceIds } from './appwrite/config';

type AppwriteDatabases = import('appwrite').Databases;
type AppwriteStorage = import('appwrite').Storage;
type AppwriteQuery = typeof import('appwrite').Query;
type AppwriteID = typeof import('appwrite').ID;

// Lazy-loaded Appwrite services
let databasesService: AppwriteDatabases | null = null;
let storageService: AppwriteStorage | null = null;
let QueryService: AppwriteQuery | null = null;
let IDService: AppwriteID | null = null;

/**
 * Get Appwrite Databases service
 */
async function getDatabases(): Promise<AppwriteDatabases> {
    if (databasesService) {

        return databasesService;
    }

    const { Databases } = await import('appwrite');
    const client = await getAppwriteClient();
    databasesService = new Databases(client);

    return databasesService;
}

/**
 * Get Appwrite Storage service
 */
async function getStorage(): Promise<AppwriteStorage> {
    if (storageService) {

        return storageService;
    }

    const { Storage } = await import('appwrite');
    const client = await getAppwriteClient();
    storageService = new Storage(client);

    return storageService;
}

/**
 * Get Appwrite Query helper
 */
async function getQuery(): Promise<AppwriteQuery> {
    if (QueryService) {

        return QueryService;
    }

    const { Query } = await import('appwrite');
    QueryService = Query;

    return QueryService;
}

/**
 * Get Appwrite ID helper
 */
async function getID(): Promise<AppwriteID> {
    if (IDService) {

        return IDService;
    }

    const { ID } = await import('appwrite');
    IDService = ID;

    return IDService;
}

// Database and collection IDs (configured in Appwrite Console)
const DATABASE_ID = appwriteResourceIds.databaseId;
const MODULES_COLLECTION_ID = appwriteResourceIds.communityModulesCollectionId;
const BLOBS_BUCKET_ID = appwriteResourceIds.communityBlobBucketId;
const PHOTOS_BUCKET_ID = appwriteResourceIds.communityPhotoBucketId;

/**
 * Community module metadata
 */
export interface CommunityModule {
    $id: string;
    name: string;
    vendor?: string;
    model?: string;
    serial?: string;
    sha256: string;
    size: number;
    blobId: string;
    photoId?: string;
    comments?: string;
    wavelength?: string;
    maxDistance?: string;
    linkType?: string;
    formFactor?: string;
    connectorType?: string;
    submittedBy?: string;
    submittedAt: string;
    verified: boolean;
    downloads: number;
}

/**
 * Module submission form data
 */
export interface ModuleSubmission {
    name: string;
    comments?: string;
    wavelength?: string;
    maxDistance?: string;
    linkType?: string;
    formFactor?: string;
    connectorType?: string;
    eepromFile: File;
    photoFile?: File;
}

/**
 * List all community modules
 */
export async function listCommunityModules(): Promise<CommunityModule[]> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        const Query = await getQuery();

        const response = await databases.listDocuments(DATABASE_ID, MODULES_COLLECTION_ID, [
            Query.orderDesc('$createdAt'),
            Query.limit(100),
        ]);


        return response.documents as unknown as CommunityModule[];
    } catch (error) {
        console.error('Failed to list community modules:', error);
        throw new Error('Failed to load community modules');
    }
}

/**
 * Get a single community module by ID
 */
export async function getCommunityModule(moduleId: string): Promise<CommunityModule> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        const doc = await databases.getDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId);

        return doc as unknown as CommunityModule;
    } catch (error) {
        console.error('Failed to get community module:', error);
        throw new Error('Failed to load module details');
    }
}

/**
 * Download EEPROM blob for a module
 */
export async function downloadModuleBlob(blobId: string): Promise<ArrayBuffer> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const storage = await getStorage();
        const result = await storage.getFileDownload(BLOBS_BUCKET_ID, blobId);

        return result as unknown as ArrayBuffer;
    } catch (error) {
        console.error('Failed to download module blob:', error);
        throw new Error('Failed to download module data');
    }
}

/**
 * Get photo URL for a module
 */
export async function getModulePhotoUrl(photoId: string): Promise<string> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const storage = await getStorage();
        const result = storage.getFileView(PHOTOS_BUCKET_ID, photoId);

        return result.toString();
    } catch (error) {
        console.error('Failed to get module photo URL:', error);
        throw new Error('Failed to load module photo');
    }
}

/**
 * Submit a new module to the community database
 */
export async function submitCommunityModule(submission: ModuleSubmission): Promise<CommunityModule> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        const storage = await getStorage();
        const ID = await getID();

        // Read EEPROM file as ArrayBuffer
        const eepromData = await submission.eepromFile.arrayBuffer();
        const eepromBlob = new Blob([eepromData], { type: 'application/octet-stream' });

        // Parse EEPROM to extract metadata (SFF-8472 spec)
        const view = new DataView(eepromData);
        const textDecoder = new TextDecoder('ascii');

        // Extract vendor (bytes 20-35)
        const vendorBytes = new Uint8Array(eepromData, 20, 16);
        const vendor = textDecoder.decode(vendorBytes).trim();

        // Extract model (bytes 40-55)
        const modelBytes = new Uint8Array(eepromData, 40, 16);
        const model = textDecoder.decode(modelBytes).trim();

        // Extract serial (bytes 68-83)
        const serialBytes = new Uint8Array(eepromData, 68, 16);
        const serial = textDecoder.decode(serialBytes).trim();

        // Calculate SHA256 hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', eepromData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        // Check for duplicate (same SHA256)
        const Query = await getQuery();
        const existing = await databases.listDocuments(DATABASE_ID, MODULES_COLLECTION_ID, [
            Query.equal('sha256', sha256),
            Query.limit(1),
        ]);

        if (existing.documents.length > 0) {
            throw new Error('This module already exists in the community database');
        }

        // Upload EEPROM blob
        const blobFile = new File([eepromBlob], `${sha256.substring(0, 16)}.bin`, {
            type: 'application/octet-stream',
        });
        const blobUpload = await storage.createFile(BLOBS_BUCKET_ID, ID.unique(), blobFile);

        // Upload photo if provided
        let photoId: string | undefined;
        if (submission.photoFile) {
            const photoUpload = await storage.createFile(PHOTOS_BUCKET_ID, ID.unique(), submission.photoFile);
            photoId = photoUpload.$id;
        }

        // Create module document
        const moduleDoc = await databases.createDocument(DATABASE_ID, MODULES_COLLECTION_ID, ID.unique(), {
            name: submission.name,
            vendor,
            model,
            serial: serial || undefined,
            sha256,
            size: eepromData.byteLength,
            blobId: blobUpload.$id,
            photoId,
            comments: submission.comments || undefined,
            wavelength: submission.wavelength,
            maxDistance: submission.maxDistance,
            linkType: submission.linkType,
            formFactor: submission.formFactor,
            connectorType: submission.connectorType,
            verified: false, // Admin must verify
            downloads: 0,
        });


        return moduleDoc as unknown as CommunityModule;
    } catch (error) {
        console.error('Failed to submit module:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to submit module');
    }
}

/**
 * Increment download count for a module
 */
export async function incrementModuleDownloads(moduleId: string): Promise<void> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        const moduleDoc = await databases.getDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId);

        await databases.updateDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId, {
            downloads: ((moduleDoc.downloads as number) || 0) + 1,
        });
    } catch (error) {
        console.error('Failed to increment download count:', error);
        // Don't throw - this is non-critical
    }
}

/**
 * Admin function: Verify a module
 */
export async function verifyModule(moduleId: string): Promise<void> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        await databases.updateDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId, {
            verified: true,
        });
    } catch (error) {
        console.error('Failed to verify module:', error);
        throw new Error('Failed to verify module');
    }
}

/**
 * Admin function: Delete a module
 */
export async function deleteModule(moduleId: string): Promise<void> {
    if (!isAppwrite()) {
        throw new Error('Community features are only available in Appwrite deployment mode');
    }

    try {
        const databases = await getDatabases();
        const storage = await getStorage();

        // Get module to find associated files
        const moduleDoc = await databases.getDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId);

        // Delete blob
        if (moduleDoc.blobId) {
            await storage.deleteFile(BLOBS_BUCKET_ID, moduleDoc.blobId as string);
        }

        // Delete photo if exists
        if (moduleDoc.photoId) {
            await storage.deleteFile(PHOTOS_BUCKET_ID, moduleDoc.photoId as string);
        }

        // Delete document
        await databases.deleteDocument(DATABASE_ID, MODULES_COLLECTION_ID, moduleId);
    } catch (error) {
        console.error('Failed to delete module:', error);
        throw new Error('Failed to delete module');
    }
}
