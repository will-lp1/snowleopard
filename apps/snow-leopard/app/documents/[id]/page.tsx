import { notFound } from 'next/navigation';
import { getUser } from '@/app/(auth)/auth'; // Keep getUser for ownership check if needed
import { getDocumentById } from '@/lib/db/queries';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { checkSubscriptionStatus } from '@/lib/subscription'; // Import helper
import { Paywall } from '@/components/paywall'; // Import Paywall

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const documentId = params.id;

    // Check subscription status first. If false, show paywall immediately.
    // No need to fetch document or user details if they can't access anyway.
    const { hasActiveSubscription } = await checkSubscriptionStatus();
    
    if (!hasActiveSubscription) {
      return <Paywall isOpen={true} required={true} />;
    }

    // Subscription is active (or Stripe disabled), proceed with fetching document & user
    // Fetch document and user concurrently
    const [document, user] = await Promise.all([
      getDocumentById({ id: documentId }),
      getUser(),
    ]);

    // If user is null here, it means checkSubscriptionStatus allowed access (Stripe disabled)
    // but the user isn't actually logged in according to getUser. Redirect or show error.
    if (!user) {
      console.warn(`[documents/[id]/page.tsx] User ${documentId}: Active subscription status but no logged-in user found by getUser(). Redirecting.`);
      // Redirect to login or show a generic not found/error?
      // Showing Paywall might be confusing if Stripe is disabled.
      return notFound(); // Or redirect('/login')
    }

    // User is logged in AND has an active subscription (or Stripe disabled).
    // Now check document existence and ownership.
    if (!document || user.id !== document.userId) {
      // Document doesn't exist or user doesn't own it.
      // Show create prompt ONLY IF the document ID was simply not found.
      if (!document) { 
        // Already checked subscription, so just show create prompt.
        return (
          <AlwaysVisibleArtifact 
            chatId="placeholder-for-artifact"
            initialDocumentId="init"
            showCreateDocumentForId={documentId}
          />
        );
      } else {
        // Document exists but user doesn't own it - treat as not found.
        return notFound();
      }
    }

    // User owns the document and has subscription. Render the artifact.
    return (
      <AlwaysVisibleArtifact 
        chatId="placeholder-for-artifact" // Consider how to get/set this properly
        initialDocumentId={documentId}
      />
    );

  } catch (error) {
    console.error(`Page error for document ${params.id}:`, error);
    return notFound();
  }
} 