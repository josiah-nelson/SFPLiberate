'use server';

import { Databases, Query, type Models } from 'node-appwrite';

import { mapDocumentToModuleRow, type ModuleRow } from '@/app/modules/types';

import { appwriteResourceIds } from './config';
import { createServerAppwriteClient } from './server-client';

type UserModuleDocument = Models.Document & {
  name?: string;
  vendor?: string;
  model?: string;
  serial?: string;
  size?: number;
  sha256?: string;
  eeprom_file_id?: string;
};

export async function listUserModules(): Promise<ModuleRow[]> {
  const client = createServerAppwriteClient();
  const databases = new Databases(client);

  const response = await databases.listDocuments<UserModuleDocument>(
    appwriteResourceIds.databaseId,
    appwriteResourceIds.userModulesCollectionId,
    [Query.orderDesc('$createdAt'), Query.limit(100)]
  );

  return response.documents.map((doc) => mapDocumentToModuleRow(doc));
}
