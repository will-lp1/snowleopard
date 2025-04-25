import 'server-only';

import { getSession } from '@/app/(auth)/auth';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
}

/**
 * Checks the subscription status for the currently logged-in user.
 * Assumes Stripe is enabled if STRIPE_ENABLED env var is 'true'.
 * Always returns true if Stripe is not enabled.
 * @returns {Promise<SubscriptionStatus>} Object containing the boolean status.
 */
export async function checkSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const session = await getSession();

    // If no user session, they definitely don't have a subscription tied to an account
    if (!session?.user?.id) {
      return { hasActiveSubscription: false };
    }

    // Default to true if Stripe is not configured/enabled
    if (process.env.STRIPE_ENABLED !== 'true') {
      console.log(`[checkSubscriptionStatus] Stripe DISABLED for user ${session.user.id}, granting access.`);
      return { hasActiveSubscription: true };
    }

    // Stripe is enabled, check the database
    const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
    console.log(`[checkSubscriptionStatus] User: ${session.user.id}, DB Sub Status: ${subscription?.status}, IsActive: ${isActive}`);

    return { hasActiveSubscription: isActive };

  } catch (error) {
    console.error('[checkSubscriptionStatus] Error checking subscription status:', error);
    // Fail closed - if there's an error checking, assume no active subscription
    // This prevents accidentally granting access due to temporary DB/API issues.
    return { hasActiveSubscription: false };
  }
} 