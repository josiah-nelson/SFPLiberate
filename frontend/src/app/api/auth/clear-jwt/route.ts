import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAppwriteJwtCookieName } from '@/lib/appwrite/config';
import { getAppwriteProjectId } from '@/lib/features';

export async function POST() {
  const projectId = getAppwriteProjectId();
  const name = getAppwriteJwtCookieName(projectId);
  const jar = await cookies();
  jar.set({ name, value: '', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return new NextResponse(null, { status: 204 });
}

