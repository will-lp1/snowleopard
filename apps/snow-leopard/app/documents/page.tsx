import { redirect } from 'next/navigation';
import { getSession, getUser } from '@/app/(auth)/auth';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';
import { Onboard } from '@/components/onboard';

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) { 
    redirect('/'); 
  }

  const user = await getUser();
  if (!user) {
    redirect('/');
  }

  // Determine if user has already begun a trial or subscription
  let subscription = null;
  if (process.env.STRIPE_ENABLED === 'true') {
    subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
  }

  const { hasActiveSubscription } = await checkSubscriptionStatus();

  // If Stripe is enabled and no subscription/trial started, show onboarding dialog
  if (process.env.STRIPE_ENABLED === 'true' && !subscription) {
    return <Onboard isOpen={true} required={true} />;
  }

  return (
    <>
      {hasActiveSubscription ? (
        <AlwaysVisibleArtifact 
          chatId="new-chat"
          initialDocumentId="init"
          initialDocuments={[]} 
          user={user}
        />
      ) : (
        <Paywall isOpen={true} required={true} />
      )}
    </>
  );
} 