import { NextResponse } from 'next/server';
import { getSession } from '@/app/(auth)/auth'; // Use the aliased path
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET() {
  try {
    const session = await getSession();

    // Default to allowing access. If Stripe is enabled and the requester is authenticated, evaluate their subscription.
    let hasActiveSubscription = true;

    if (process.env.STRIPE_ENABLED === 'true' && session?.user?.id) {
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
    } else if (process.env.STRIPE_ENABLED === 'true') {
      // Stripe is enabled but there's no authenticated user; default to granting access.
      console.log('[api/user/subscription-status] No authenticated user detected. Granting access by default.');
    } else {
      console.log('[api/user/subscription-status] Stripe DISABLED, granting access.');
    }

    return NextResponse.json({ hasActiveSubscription });

  } catch (error) {
    console.error('[api/user/subscription-status] Error fetching subscription status:', error);
    // Return true in case of error to avoid blocking users unnecessarily? Or false?
    // Let's return an error status for clarity.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 