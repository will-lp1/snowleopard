import { redirect } from 'next/navigation';
import { getSession, getUser } from '@/app/(auth)/auth';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall';

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) { // Check for user ID  
    redirect('/'); // Redirect if not logged in
  }

  const { hasActiveSubscription } = await checkSubscriptionStatus();

  // Fetch user data for passing to client component
  const user = await getUser();
  if (!user) {
    // If getUser fails, redirect to login or home
    redirect('/');
  }

  return (
    <>
      {hasActiveSubscription ? (
        <AlwaysVisibleArtifact 
          chatId="new-chat"
          initialDocumentId="init"
          initialDocuments={[]} // No existing docs for new chat
          user={user}
        />
      ) : (
        <Paywall isOpen={true} required={true} />
      )}
    </>
  );
} 