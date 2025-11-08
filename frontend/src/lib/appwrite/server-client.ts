import { cookies } from 'next/headers';
import { Client } from 'node-appwrite';

import { getAppwriteEndpoint, getAppwriteProjectId } from '../features';
import { getAppwriteSessionCookieName } from './config';

export function createServerAppwriteClient(): Client {
  const endpoint = getAppwriteEndpoint();
  const projectId = getAppwriteProjectId();

  if (!endpoint || !projectId) {
    throw new Error('Appwrite endpoint or project ID is not configured.');
  }

  const cookieStore = cookies();
  const sessionCookieName = getAppwriteSessionCookieName(projectId);
  const sessionCookie = cookieStore.get(sessionCookieName);

  if (!sessionCookie?.value) {
    throw new Error('Missing Appwrite session cookie. Please sign in again.');
  }


  return new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setSession(sessionCookie.value);
}
