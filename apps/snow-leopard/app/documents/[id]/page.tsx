import { notFound } from 'next/navigation';
import { getUser } from '@/app/(auth)/auth';
import { getDocumentsById } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Paywall } from '@/components/paywall'; 
import type { Document } from '@snow-leopard/db';

export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(documentId)) {
      console.warn(`[DocumentPage] Invalid document ID format: ${documentId}`);
      return notFound(); 
    }

    // Fetch subscription status and user in parallel
    const [{ hasActiveSubscription }, user] = await Promise.all([
      checkSubscriptionStatus(),
      getUser(),
    ]);
    
    if (!hasActiveSubscription) {
      return <Paywall isOpen={true} required={true} />;
    }

    if (!user) {
      console.warn(`[DocumentPage] User not found after subscription check. Redirecting.`);
      return notFound(); 
    }

    // Fetch the documents once with the authenticated user
    const documents: Document[] = await getDocumentsById({
      ids: [documentId],
      userId: user.id,
    });

    if (!documents || documents.length === 0) {
      console.log(`[DocumentPage] Document ${documentId} not found for user ${user.id}. Showing create prompt.`);
      return (
        <AlwaysVisibleArtifact 
          chatId="placeholder-for-artifact"
          initialDocumentId="init"
          initialDocuments={[]}
          showCreateDocumentForId={documentId}
          user={user}
        />
      );
    }
    
    return (
      <AlwaysVisibleArtifact 
        chatId="placeholder-for-artifact"
        initialDocumentId={documentId}
        initialDocuments={documents}
        user={user}
      />
    );

  } catch (error) {
    console.error(`[DocumentPage] Page error for document ${params.id}:`, error);
    return notFound();
  }
} 