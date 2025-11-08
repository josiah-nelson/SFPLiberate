'use server';

import { mapRepositoryModule, type ModuleRow } from './types';

import { listUserModules as listAppwriteUserModules } from '@/lib/appwrite/modules';
import { getDeploymentMode } from '@/lib/features';
import { StandaloneRepository } from '@/lib/repositories/StandaloneRepository';

export async function loadModulesAction(): Promise<ModuleRow[]> {
  const mode = getDeploymentMode();

  if (mode === 'appwrite') {

    return await listAppwriteUserModules();
  }

  const repository = new StandaloneRepository();
  const modules = await repository.listModules();

  return modules.map((module) => mapRepositoryModule(module));
}
