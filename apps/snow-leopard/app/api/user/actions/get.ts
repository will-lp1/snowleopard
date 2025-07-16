import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/app/(auth)/auth';
import { getActiveSubscriptionByUserId, clearUsername } from '@/lib/db/queries';
import { getGT } from 'gt-next/server';

export async function getUserAction(request: NextRequest) {
  try {
    const t = await getGT();
    const userDetails = await getUserDetails();
    if (!userDetails || !userDetails.id) {
      return NextResponse.json({ error: t('Unauthorized') }, { status: 401 });
    }
    
    // Check subscription status and clear username for unsubscribed users
    let hasActiveSubscription = true;
    if (process.env.STRIPE_ENABLED === 'true') {
      const subscription = await getActiveSubscriptionByUserId({ userId: userDetails.id });
      hasActiveSubscription = Boolean(subscription);
    }
    if (!hasActiveSubscription) {
      if (userDetails.username) {
        await clearUsername({ userId: userDetails.id });
      }
      return NextResponse.json({ username: null });
    }

    return NextResponse.json({ username: userDetails.username });
  } catch (error: any) {
    console.error('[API /user] GET error:', error);
    const t = await getGT();
    return NextResponse.json({ error: error.message || t('Error fetching user') }, { status: 500 });
  }
} 