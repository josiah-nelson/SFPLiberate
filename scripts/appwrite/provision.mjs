#!/usr/bin/env node
import { Client, Databases, Storage } from 'node-appwrite';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY must be set.');
  process.exit(1);
}

const defaults = {
  databaseId: process.env.APPWRITE_DATABASE_ID ?? 'lib-core',
  personalCollectionId: process.env.APPWRITE_USER_COLLECTION_ID ?? 'user-modules',
  communityCollectionId: process.env.APPWRITE_COMMUNITY_COLLECTION_ID ?? 'community-modules',
  userBucketId: process.env.APPWRITE_USER_BUCKET_ID ?? 'user-eeprom',
  blobBucketId: process.env.APPWRITE_COMMUNITY_BLOB_BUCKET_ID ?? 'community-blobs',
  photoBucketId: process.env.APPWRITE_COMMUNITY_PHOTO_BUCKET_ID ?? 'community-photos',
};

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);
const storage = new Storage(client);

async function ensureDatabase(databaseId, name) {
  try {
    await databases.get(databaseId);
    console.log(`✓ Database '${databaseId}' exists`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await databases.create(databaseId, name);
    console.log(`➕ Created database '${databaseId}'`);
  }
}

async function ensureCollection(databaseId, collectionId, name, documentSecurity = true) {
  try {
    await databases.getCollection(databaseId, collectionId);
    console.log(`✓ Collection '${collectionId}' exists`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await databases.createCollection(databaseId, collectionId, name, documentSecurity, []);
    console.log(`➕ Created collection '${collectionId}'`);
  }
}

async function listAttributes(databaseId, collectionId) {
  const response = await databases.listAttributes(databaseId, collectionId);

  return new Map(response.attributes.map((attribute) => [attribute.key, attribute]));
}

async function ensureStringAttribute(databaseId, collectionId, key, size, required = false) {
  const attributes = await listAttributes(databaseId, collectionId);
  if (attributes.has(key)) {

    return;
  }
  await databases.createStringAttribute(databaseId, collectionId, key, size, required);
  console.log(`➕ Added string attribute '${key}'`);
}

async function ensureIntegerAttribute(databaseId, collectionId, key, required = false) {
  const attributes = await listAttributes(databaseId, collectionId);
  if (attributes.has(key)) {

    return;
  }
  await databases.createIntegerAttribute(databaseId, collectionId, key, required);
  console.log(`➕ Added integer attribute '${key}'`);
}

async function ensureBooleanAttribute(databaseId, collectionId, key, required = false) {
  const attributes = await listAttributes(databaseId, collectionId);
  if (attributes.has(key)) {

    return;
  }
  await databases.createBooleanAttribute(databaseId, collectionId, key, required);
  console.log(`➕ Added boolean attribute '${key}'`);
}

async function ensureIndex(databaseId, collectionId, key, type, attributes, orders = []) {
  const response = await databases.listIndexes(databaseId, collectionId);
  if (response.indexes.some((index) => index.key === key)) {

    return;
  }
  await databases.createIndex(databaseId, collectionId, key, type, attributes, orders);
  console.log(`➕ Created index '${key}' on ${attributes.join(', ')}`);
}

async function ensureBucket(bucketId, name, options = {}) {
  try {
    await storage.getBucket(bucketId);
    console.log(`✓ Bucket '${bucketId}' exists`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await storage.createBucket(bucketId, name, [], {
      enabled: true,
      fileSecurity: true,
      maximumFileSize: 262144,
      allowedFileExtensions: ['bin'],
      compression: 'none',
      encryption: true,
      antivirus: true,
      ...options,
    });
    console.log(`➕ Created bucket '${bucketId}'`);
  }
}

async function ensurePersonalCollection() {
  const { databaseId, personalCollectionId } = defaults;
  await ensureCollection(databaseId, personalCollectionId, 'User Modules', true);

  await ensureStringAttribute(databaseId, personalCollectionId, 'name', 255, true);
  await ensureStringAttribute(databaseId, personalCollectionId, 'vendor', 100, false);
  await ensureStringAttribute(databaseId, personalCollectionId, 'model', 100, false);
  await ensureStringAttribute(databaseId, personalCollectionId, 'serial', 100, false);
  await ensureStringAttribute(databaseId, personalCollectionId, 'sha256', 64, true);
  await ensureStringAttribute(databaseId, personalCollectionId, 'eeprom_file_id', 64, true);
  await ensureIntegerAttribute(databaseId, personalCollectionId, 'size', true);

  await ensureIndex(databaseId, personalCollectionId, 'idx_sha256', 'unique', ['sha256']);
  await ensureIndex(databaseId, personalCollectionId, 'idx_created', 'key', ['$createdAt'], ['DESC']);
}

async function ensureCommunityCollection() {
  const { databaseId, communityCollectionId } = defaults;
  await ensureCollection(databaseId, communityCollectionId, 'Community Modules', true);

  await ensureStringAttribute(databaseId, communityCollectionId, 'name', 255, true);
  await ensureStringAttribute(databaseId, communityCollectionId, 'vendor', 100, false);
  await ensureStringAttribute(databaseId, communityCollectionId, 'model', 100, false);
  await ensureStringAttribute(databaseId, communityCollectionId, 'serial', 100, false);
  await ensureStringAttribute(databaseId, communityCollectionId, 'sha256', 64, true);
  await ensureStringAttribute(databaseId, communityCollectionId, 'blobId', 64, true);
  await ensureStringAttribute(databaseId, communityCollectionId, 'photoId', 64, false);
  await ensureStringAttribute(databaseId, communityCollectionId, 'submittedBy', 64, false);
  await ensureStringAttribute(databaseId, communityCollectionId, 'linkType', 32, false);
  await ensureIntegerAttribute(databaseId, communityCollectionId, 'size', true);
  await ensureIntegerAttribute(databaseId, communityCollectionId, 'downloads', false);
  await ensureBooleanAttribute(databaseId, communityCollectionId, 'verified', false);

  await ensureIndex(databaseId, communityCollectionId, 'idx_sha256', 'unique', ['sha256']);
  await ensureIndex(databaseId, communityCollectionId, 'idx_created', 'key', ['$createdAt'], ['DESC']);
}

async function main() {
  const { databaseId, userBucketId, blobBucketId, photoBucketId } = defaults;

  await ensureDatabase(databaseId, 'SFPLiberate Core');
  await ensurePersonalCollection();
  await ensureCommunityCollection();

  await ensureBucket(userBucketId, 'User EEPROM Data', {
    allowedFileExtensions: ['bin'],
  });
  await ensureBucket(blobBucketId, 'Community EEPROM Blobs', {
    allowedFileExtensions: ['bin'],
  });
  await ensureBucket(photoBucketId, 'Community Module Photos', {
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  });

  console.log('✅ Appwrite resources are provisioned.');
}

main().catch((error) => {
  console.error('❌ Failed to provision Appwrite resources');
  console.error(error);
  process.exit(1);
});
