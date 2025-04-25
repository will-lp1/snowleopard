import { notFound } from 'next/navigation';
import { getUser, getSession } from '@/app/(auth)/auth';
import { getDocumentById, getActiveSubscriptionByUserId } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;
    
    // Fetch document, user, AND session concurrently (session needed for subscription check)
    const [document, user, session] = await Promise.all([
      getDocumentById({ id: documentId }),
      getUser(), // Keep for ownership check
      getSession() // Fetch session for subscription status
    ]);

    // Check if user is logged in first
    if (!session?.user?.id) {
      return notFound(); // Or redirect to login
    }

    // Now check document existence and ownership
    if (!document || (user && user.id !== document.userId)) {
      // Check if user is logged in but document just doesn't exist for them
      if (user && !document) { 
         // Subscription check before showing create prompt
         let hasActiveSubscription = true;
         if (process.env.STRIPE_ENABLED === 'true') {
           const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
           hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
         }

         if (hasActiveSubscription) {
           return (
             <AlwaysVisibleArtifact 
               chatId="placeholder-for-artifact" // Artifact might need a stable ID
               initialDocumentId="init"
               showCreateDocumentForId={documentId}
             />
           );
         } else {
            // User doesn't have subscription, show placeholder instead of create prompt
             return (
               <div className="flex items-center justify-center h-full text-muted-foreground">
                 Subscription required to create or access documents.
               </div>
             );
         }
      }
      // Otherwise, truly not found or unauthorized (user doesn't own doc)
      return notFound();
    }

    // User is authenticated and owns the document. Now check subscription.
    let hasActiveSubscription = true;
    if (process.env.STRIPE_ENABLED === 'true') {
      const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
      hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
      console.log(`[documents/[id]/page.tsx] User: ${session.user.id}, Sub Status: ${subscription?.status}, HasActive: ${hasActiveSubscription}`);
    } else {
      console.log(`[documents/[id]/page.tsx] Stripe DISABLED, granting access.`);
    }

    // Conditionally render artifact or placeholder
    return (
       <>
         {hasActiveSubscription ? (
            <AlwaysVisibleArtifact 
              chatId="placeholder-for-artifact" // Consider how to get/set this properly
              initialDocumentId={documentId}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Subscription required to access this document.
            </div>
          )}
        </>
    );
  } catch (error) {
    console.error(`Page error for document ${params.id}:`, error);
    return notFound();
  }
} 