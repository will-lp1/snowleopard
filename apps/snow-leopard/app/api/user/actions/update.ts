import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { setUsername } from '@/lib/db/queries';
import { getGT } from 'gt-next/server';

export async function updateUsernameAction(request: NextRequest) {
  const t = await getGT();
  const readonlyHeaders = await headers();
  const requestHeaders = new Headers(readonlyHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: t('Unauthorized') }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const { username } = body;
  if (!username) {
    return NextResponse.json({ error: t('Invalid username') }, { status: 400 });
  }

  try {
    await setUsername({ userId, username });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /user] Update username error:', error);
    return NextResponse.json({ error: error.message || t('Failed to set username') }, { status: 500 });
  }
} 