import { redirect } from 'next/navigation';
import { getSession, getUser } from '@/app/(auth)/auth';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall';

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) { 
    redirect('/'); 
  }

  const { hasActiveSubscription } = await checkSubscriptionStatus();

  const user = await getUser();
  if (!user) {
    redirect('/');
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