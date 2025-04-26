import { notFound } from 'next/navigation';
import { getUser } from '@/app/(auth)/auth';
import { getDocumentById } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall'; 

export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;

    const { hasActiveSubscription } = await checkSubscriptionStatus();
    
    if (!hasActiveSubscription) {
      return <Paywall isOpen={true} required={true} />;
    }

    const [document, user] = await Promise.all([
      getDocumentById({ id: documentId }),
      getUser(),
    ]);

    if (!user) {
      console.warn(`[documents/[id]/page.tsx] User ${documentId}: Active subscription status but no logged-in user found by getUser(). Redirecting.`);
      return notFound(); // Or redirect('/login')
    }

    if (!document || user.id !== document.userId) {
      if (!document) { 
        return (
          <AlwaysVisibleArtifact 
            chatId="placeholder-for-artifact"
            initialDocumentId="init"
            showCreateDocumentForId={documentId}
          />
        );
      } else {
        return notFound();
      }
    }

    return (
      <AlwaysVisibleArtifact 
        chatId="placeholder-for-artifact"
        initialDocumentId={documentId}
      />
    );

  } catch (error) {
    console.error(`Page error for document ${params.id}:`, error);
    return notFound();
  }
} 