import 'server-only';

import { getSession } from '@/app/(auth)/auth';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
}

export async function checkSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return { hasActiveSubscription: false };
    }

    if (process.env.STRIPE_ENABLED !== 'true') {
      console.log(`[checkSubscriptionStatus] Stripe DISABLED for user ${session.user.id}, granting access.`);
      return { hasActiveSubscription: true };
    }

    const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
    let isActive = false;
    if (subscription) {
      if (subscription.status === 'active') {
        isActive = true;
      } else if (
        subscription.status === 'trialing' &&
        subscription.trialEnd &&
        new Date(subscription.trialEnd) > new Date()
      ) {
        isActive = true;
      }
    }
    console.log(`[checkSubscriptionStatus] User: ${session.user.id}, DB Sub Status: ${subscription?.status}, IsActive: ${isActive}`);

    return { hasActiveSubscription: isActive };

  } catch (error) {
    console.error('[checkSubscriptionStatus] Error checking subscription status:', error);
    return { hasActiveSubscription: false };
  }
}