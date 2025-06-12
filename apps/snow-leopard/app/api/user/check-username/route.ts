import { NextRequest, NextResponse } from 'next/server';
import { checkUsernameAvailability } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  if (!username) {
    return NextResponse.json({ available: false }, { status: 400 });
  }
  const available = await checkUsernameAvailability({ username });
  return NextResponse.json({ available });
} 