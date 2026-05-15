'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

const posthogEnabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true'
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (posthogEnabled && typeof window !== 'undefined' && posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') posthog.debug()
    },
    capture_pageview: false 
  })
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!posthogEnabled) return;

    const handleError = (event: ErrorEvent) => {
      posthog.captureException(event.error ?? new Error(event.message));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      posthog.captureException(err);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  if (!posthogEnabled || !posthogKey || !posthogHost) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
} 