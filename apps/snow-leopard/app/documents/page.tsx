// Remove 'use client' - This should be a Server Component
// import { useState, useEffect } from 'react'; 

import { redirect } from 'next/navigation';
// Import Better Auth session (Server-side)
import { getSession } from '@/app/(auth)/auth'; 
// Use DocumentsView again
import { DocumentsView } from '@/components/documents-view'; 
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
// Import the subscription query 
import { getActiveSubscriptionByUserId } from '@/lib/db/queries'; 

// This is now an async Server Component
export default async function Page() {
  // --- Server-Side Data Fetching --- 
  const session = await getSession();

  // 1. Check if logged in
  if (!session?.user?.id) { // Check for user ID
    redirect('/'); // Redirect if not logged in
  }

  // 2. Fetch subscription status directly
  const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });

  // 3. Determine subscription status, considering STRIPE_ENABLED
  const hasActiveSubscription = 
        process.env.STRIPE_ENABLED !== 'true' || // Bypass check if Stripe is disabled
        subscription?.status === 'active' || 
        subscription?.status === 'trialing';

  console.log(`[page.tsx Server] User: ${session.user.id}, Subscription Status: ${subscription?.status}, Stripe Enabled: ${process.env.STRIPE_ENABLED}, HasActive: ${hasActiveSubscription}`);

  // --- Render DocumentsView with appropriate props --- 
  return (
    <DocumentsView
      userId={session.user.id} // Pass user ID
      hasActiveSubscription={hasActiveSubscription}
      // NOTE: If DocumentsView needs children or other props passed from the 
      // previous DocumentsClientLayout version, add them back here.
    />
  );
} 