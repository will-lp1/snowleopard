import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/app/(auth)/auth';

export async function getUserAction(request: NextRequest) {
  try {
    const userDetails = await getUserDetails();
    if (!userDetails || !userDetails.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ username: userDetails.username });
  } catch (error: any) {
    console.error('[API /user] GET error:', error);
    return NextResponse.json({ error: error.message || 'Error fetching user' }, { status: 500 });
  }
} 