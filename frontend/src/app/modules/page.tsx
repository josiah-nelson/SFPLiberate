import type { Metadata } from 'next';

import { ModuleTable } from './ModuleTable';
import { loadModulesAction } from './actions';
import type { ModuleRow } from './types';

import { getDeploymentMode } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Module Library',
};

export default async function ModulesPage() {
  const deploymentMode = getDeploymentMode();

  let initialModules: ModuleRow[] = [];
  let initialError: string | null = null;

  try {
    initialModules = await loadModulesAction();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : 'Unable to load modules for this deployment mode.';
  }

  return (
    <ModuleTable
      initialModules={initialModules}
      deploymentMode={deploymentMode}
      initialError={initialError}
    />
  );
}
