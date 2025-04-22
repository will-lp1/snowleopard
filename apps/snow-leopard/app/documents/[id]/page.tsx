import { notFound } from 'next/navigation';
import { getUser } from '@/app/(auth)/auth';
import { getDocumentById } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;
    
    // Fetch document and user concurrently
    const [document, user] = await Promise.all([
      getDocumentById({ id: documentId }),
      getUser() // Use Better Auth helper
    ]);

    // No document found or accessible
    if (!document || !user || (user.id !== document.userId)) {
      // Check if user is logged in but document just doesn't exist for them
      if (user && !document) { 
        return (
          <AlwaysVisibleArtifact 
            chatId="placeholder-for-artifact" // Artifact might need a stable ID
            initialDocumentId="init"
            showCreateDocumentForId={documentId}
          />
        );
      }
      // Otherwise, truly not found or unauthorized (user not logged in or doesn't own doc)
      return notFound();
    }

    // User is authenticated and owns the document
    // Render only the artifact - chat is handled by layout
    return (
      <AlwaysVisibleArtifact 
        chatId="placeholder-for-artifact" // Artifact might need a stable ID
        initialDocumentId={documentId}
      />
    );
  } catch (error) {
    console.error(`Page error for document ${params.id}:`, error);
    return notFound();
  }
} 