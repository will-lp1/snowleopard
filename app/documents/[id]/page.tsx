import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDocumentById } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage({ params }: { params: { id: string } }) {
  try {
    const documentId = params.id;
    
    let document = null;
    try {
      document = await getDocumentById({ id: documentId });
    } catch (error) {
      console.error(`Error fetching document ${documentId}:`, error);
      // Let the !document check handle this
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // No document found or accessible
    if (!document || !user || (user.id !== document.userId)) {
      // Check if user is logged in to show create prompt
      if (user && !document) { 
        return (
          <AlwaysVisibleArtifact 
            chatId="placeholder-for-artifact" // Artifact might need a stable ID
            initialDocumentId="init"
            showCreateDocumentForId={documentId}
          />
        );
      }
      // Otherwise, truly not found/authorized
      return notFound();
    }

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