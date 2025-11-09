import { cookies } from 'next/headers';
import { Client } from 'node-appwrite';

import { getAppwriteEndpoint, getAppwriteProjectId } from '../features';
import { getAppwriteSessionCookieName, getAppwriteJwtCookieName } from './config';

export async function createServerAppwriteClient(): Promise<Client> {
  const endpoint = getAppwriteEndpoint();
  const projectId = getAppwriteProjectId();

  if (!endpoint || !projectId) {
    throw new Error('Appwrite endpoint or project ID is not configured.');
  }

  const cookieStore = await cookies();
  const sessionCookieName = getAppwriteSessionCookieName(projectId);
  const sessionCookie = cookieStore.get(sessionCookieName);

  const client = new Client().setEndpoint(endpoint).setProject(projectId);

  if (sessionCookie?.value) {
    return client.setSession(sessionCookie.value);
  }

  // Fallback to JWT cookie bridge
  const jwtCookieName = getAppwriteJwtCookieName(projectId);
  const jwtCookie = cookieStore.get(jwtCookieName);
  if (jwtCookie?.value) {
    return client.setJWT(jwtCookie.value);
  }

  throw new Error('Missing Appwrite auth. Please sign in again.');
}
