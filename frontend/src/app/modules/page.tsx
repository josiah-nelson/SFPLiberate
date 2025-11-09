import type { Metadata } from 'next';

import { ModuleTable } from './ModuleTable';
import { loadModulesAction } from './actions';
import type { ModuleRow } from './types';

import { getDeploymentMode, getAppwriteProjectId } from '@/lib/features';
import { getAppwriteSessionCookieName } from '@/lib/appwrite/config';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Module Library',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ModulesPage() {
  const deploymentMode = getDeploymentMode();

  // SSR auth guard for Appwrite mode: require session cookie, otherwise redirect to /login
  if (deploymentMode === 'appwrite') {
    try {
      const cookieStore = await cookies();
      const projectId = getAppwriteProjectId();
      const sessionCookieName = projectId ? getAppwriteSessionCookieName(projectId) : undefined;
      const jwtCookieName = projectId ? `a_jwt_${projectId}` : undefined;
      const hasSession = sessionCookieName ? !!cookieStore.get(sessionCookieName)?.value : false;
      const hasJwt = jwtCookieName ? !!cookieStore.get(jwtCookieName)?.value : false;
      if (!hasSession && !hasJwt) redirect('/login');
    } catch {
      redirect('/login');
    }
  }

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
