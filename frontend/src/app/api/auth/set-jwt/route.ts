import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAppwriteJwtCookieName } from '@/lib/appwrite/config';
import { getAppwriteProjectId } from '@/lib/features';

export async function POST(req: Request) {
  const projectId = getAppwriteProjectId();
  const name = getAppwriteJwtCookieName(projectId);

  const body = await req.json().catch(() => ({}));
  const jwt = body?.jwt as string | undefined;
  if (!jwt) {
    return new NextResponse('Missing jwt', { status: 400 });
  }

  const jar = await cookies();
  // Short-lived JWT per Appwrite default (15 minutes). Set slightly less.
  jar.set({
    name,
    value: jwt,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 14 * 60, // 14 minutes
  });

  return new NextResponse(null, { status: 204 });
}

