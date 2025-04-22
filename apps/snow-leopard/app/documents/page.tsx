import { redirect } from 'next/navigation';
// Remove Supabase client import
// import { createClient } from '@/lib/supabase/server';
// Import Better Auth session helper
import { getSession } from '@/app/(auth)/auth'; 
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';

// This page now acts as a placeholder entry point to the documents view.
// It renders the AlwaysVisibleArtifact in its initial state when no specific document ID is in the URL.

export default async function Page() {
  // Use Better Auth helper to get session
  const session = await getSession();

  // Unauthenticated users are redirected by middleware, but check again just in case
  if (!session || !session.user) {
    redirect('/'); // Redirect to landing page if no session
  }

  // Render the artifact component in its initial/empty state.
  // AlwaysVisibleArtifact will handle showing the "Start typing..." placeholder.
  return (
    <AlwaysVisibleArtifact 
      chatId="placeholder-documents-page" // Provide a stable placeholder ID or determine appropriately
      initialDocumentId="init" 
    />
  );

  /* 
  // --- OLD LOGIC (Removed) --- 
  // Create a new document with a unique ID
  const documentId = generateUUID();
  
  // Get current user
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session || !session.user) {
    // If not logged in, redirect to auth page
    redirect('/'); // Updated redirect target
  }
  
  // Create a new empty document
  await saveDocument({
    id: documentId,
    title: 'Untitled Document',
    kind: 'text',
    content: '',
    userId: session.user.id
  });
  
  // Redirect to the newly created document
  redirect(`/documents/${documentId}`);
  */
} 