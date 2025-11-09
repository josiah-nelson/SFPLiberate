/**
 * Appwrite resource identifiers and configuration helpers.
 *
 * Values default to the canonical naming scheme but can be overridden with
 * environment variables for development or future migrations.
 */

const DEFAULT_IDS = {
  databaseId: 'lib-core',
  userModulesCollectionId: 'user-modules',
  communityModulesCollectionId: 'community-modules',
  userModulesBucketId: 'user-eeprom',
  communityBlobBucketId: 'community-blobs',
  communityPhotoBucketId: 'community-photos',
};

type EnvKey =
  | 'APPWRITE_DATABASE_ID'
  | 'APPWRITE_USER_COLLECTION_ID'
  | 'APPWRITE_COMMUNITY_COLLECTION_ID'
  | 'APPWRITE_USER_BUCKET_ID'
  | 'APPWRITE_COMMUNITY_BLOB_BUCKET_ID'
  | 'APPWRITE_COMMUNITY_PHOTO_BUCKET_ID'
  | 'APPWRITE_SESSION_COOKIE'
  | 'APPWRITE_JWT_COOKIE';

function getEnv(key: EnvKey): string | undefined {

  return process.env[key] ?? process.env[`NEXT_PUBLIC_${key}`];
}

export const appwriteResourceIds = {
  databaseId: getEnv('APPWRITE_DATABASE_ID') ?? DEFAULT_IDS.databaseId,
  userModulesCollectionId:
    getEnv('APPWRITE_USER_COLLECTION_ID') ?? DEFAULT_IDS.userModulesCollectionId,
  communityModulesCollectionId:
    getEnv('APPWRITE_COMMUNITY_COLLECTION_ID') ?? DEFAULT_IDS.communityModulesCollectionId,
  userModulesBucketId:
    getEnv('APPWRITE_USER_BUCKET_ID') ?? DEFAULT_IDS.userModulesBucketId,
  communityBlobBucketId:
    getEnv('APPWRITE_COMMUNITY_BLOB_BUCKET_ID') ?? DEFAULT_IDS.communityBlobBucketId,
  communityPhotoBucketId:
    getEnv('APPWRITE_COMMUNITY_PHOTO_BUCKET_ID') ?? DEFAULT_IDS.communityPhotoBucketId,
} as const;

export function getAppwriteSessionCookieName(projectId?: string): string {
  const explicit = getEnv('APPWRITE_SESSION_COOKIE');
  if (explicit) {

    return explicit;
  }
  if (!projectId) {
    throw new Error('Project ID is required to derive the Appwrite session cookie name.');
  }

  return `a_session_${projectId}`;
}

export function getAppwriteJwtCookieName(projectId?: string): string {
  const explicit = getEnv('APPWRITE_JWT_COOKIE');
  if (explicit) return explicit;
  if (!projectId) {
    throw new Error('Project ID is required to derive the Appwrite JWT cookie name.');
  }
  return `a_jwt_${projectId}`;
}

export type AppwriteResourceIds = typeof appwriteResourceIds;
export const defaultAppwriteResourceIds = DEFAULT_IDS;
