import { redirect } from 'next/navigation';
import { getSession } from '@/app/(auth)/auth'; 
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) { // Check for user ID  
    redirect('/'); // Redirect if not logged in
  }

  let hasActiveSubscription = true; // Assume true by default or if Stripe disabled
  if (process.env.STRIPE_ENABLED === 'true') {
      const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
      hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
      console.log(`[documents/page.tsx] User: ${session.user.id}, Subscription Status: ${subscription?.status}, HasActive: ${hasActiveSubscription}`);
  } else {
      console.log(`[documents/page.tsx] Stripe DISABLED, granting access.`);
  }

  return (
    <>
      {hasActiveSubscription ? (
        <AlwaysVisibleArtifact 
          chatId="new-chat" 
          initialDocumentId="init" 
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Subscription required to access documents.
        </div>
      )}
    </>
  );
} 