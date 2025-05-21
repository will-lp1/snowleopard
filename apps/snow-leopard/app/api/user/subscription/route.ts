import { NextResponse } from 'next/server';
import { getSession } from '@/app/(auth)/auth';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

export const dynamic = 'force-dynamic'; 

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[api/user/subscription] Error fetching subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 