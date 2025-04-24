'use client';

import { useState, useEffect } from 'react';
import { Paywall } from '@/components/paywall';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';

interface DocumentsViewProps {
  userId: string;
  hasActiveSubscription: boolean;
}

export function DocumentsView({ userId, hasActiveSubscription }: DocumentsViewProps) {
  // State to control the paywall modal visibility
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Effect to show the paywall if the user doesn't have an active subscription
  useEffect(() => {
    // Only show the paywall if the user does NOT have an active subscription
    setIsPaywallOpen(!hasActiveSubscription);
  }, [hasActiveSubscription]); // Re-run if subscription status changes (e.g., after successful payment)

  return (
    <>
      {/* Conditionally render the main document view only if subscribed */}
      {hasActiveSubscription && (
        <AlwaysVisibleArtifact 
          // Pass necessary props to the artifact component
          // You might need to adjust these based on your actual implementation
          chatId="new-chat" // Example chatId, fetch or determine as needed 
          initialDocumentId="init" 
        />
      )}

      {/* Render the Paywall component. It will be controlled by isPaywallOpen state. */}
      {/* It's rendered outside the conditional block so the modal can appear */}
      {/* even when the main content isn't rendered yet. */}
      <Paywall 
        isOpen={isPaywallOpen} 
        onOpenChange={setIsPaywallOpen} 
        required={true} // Make the paywall modal mandatory 
      />
    </>
  );
} 