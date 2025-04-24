import { redirect } from 'next/navigation';
import { getSession } from '@/app/(auth)/auth'; 
import { DocumentsView } from '@/components/documents-view'; 

// This page acts as the entry point for the documents section.
// It handles server-side auth and subscription checks.

export default async function Page() {
  const session = await getSession();

  if (!session?.user?.id) {
    // Redirect to landing or login if not authenticated
    // Middleware should ideally handle this, but double-check
    redirect('/'); 
    // return null; // Stop further execution
  }

  // 2. Check subscription status from the session object
  // The better-auth Stripe plugin injects subscription data here.
  const subscription = session.subscription;
  
  // Determine subscription status. If Stripe is not enabled, always treat as active.
  const hasActiveSubscription = process.env.STRIPE_ENABLED !== 'true' || 
                                subscription?.status === 'active' || 
                                subscription?.status === 'trialing';

  // 3. Render the client component, passing necessary data
  // The client component will handle showing the paywall or the document view.
  return (
    <DocumentsView 
      userId={session.user.id} // Pass user ID for potential client-side needs
      hasActiveSubscription={hasActiveSubscription} // Pass the determined status
    />
  );

  /* 
  // --- OLD LOGIC (Rendering artifact directly) --- 
  return (
    <AlwaysVisibleArtifact 
      chatId="placeholder-documents-page" // Provide a stable placeholder ID or determine appropriately
      initialDocumentId="init" 
    />
  );
  */
} 