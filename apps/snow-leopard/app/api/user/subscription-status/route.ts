import { NextResponse } from 'next/server';
import { getSession } from '@/app/(auth)/auth'; // Use the aliased path
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let hasActiveSubscription = true; // Assume true by default or if Stripe disabled

    if (process.env.STRIPE_ENABLED === 'true') {
      const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
      if (subscription) {
        if (subscription.status === 'active') {
          hasActiveSubscription = true;
        } else if (
          subscription.status === 'trialing' &&
          subscription.trialEnd &&
          new Date(subscription.trialEnd) > new Date()
        ) {
          hasActiveSubscription = true;
        } else {
          hasActiveSubscription = false;
        }
      } else {
        hasActiveSubscription = false;
      }
      console.log(`[api/user/subscription-status] User: ${session.user.id}, Sub Status: ${subscription?.status}, HasActive: ${hasActiveSubscription}`);
    } else {
      console.log(`[api/user/subscription-status] Stripe DISABLED, granting access.`);
      hasActiveSubscription = true;
    }

    return NextResponse.json({ hasActiveSubscription });

  } catch (error) {
    console.error('[api/user/subscription-status] Error fetching subscription status:', error);
    // Return true in case of error to avoid blocking users unnecessarily? Or false?
    // Let's return an error status for clarity.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 