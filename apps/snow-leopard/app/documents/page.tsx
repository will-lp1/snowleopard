import { redirect } from 'next/navigation';
import { getSession } from '@/app/(auth)/auth'; 
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall';

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) { // Check for user ID  
    redirect('/'); // Redirect if not logged in
  }

  const { hasActiveSubscription } = await checkSubscriptionStatus();

  return (
    <>
      {hasActiveSubscription ? (
        <AlwaysVisibleArtifact 
          chatId="new-chat" 
          initialDocumentId="init" 
        />
      ) : (
        <Paywall isOpen={true} required={true} />
      )}
    </>
  );
} 