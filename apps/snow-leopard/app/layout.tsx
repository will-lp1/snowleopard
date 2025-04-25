import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/theme-provider';
import { SuggestionOverlayProvider } from '@/components/suggestion-overlay-provider';
import { DocumentProvider } from '@/hooks/use-document-context';
import { Analytics } from "@vercel/analytics/react"
import { Paywall } from '@/components/paywall';
import { getSession } from '@/app/(auth)/auth';
import { getActiveSubscriptionByUserId } from '@/lib/db/queries';

import './globals.css';

export const metadata: Metadata = {
  title: 'snowleopard',
  description: 'Tab, Tab, Apply Brilliance',
};

export const viewport = {
  maximumScale: 1, 
};

const LIGHT_THEME_COLOR = 'hsl(0 0% 100%)';
const DARK_THEME_COLOR = 'hsl(240deg 10% 3.92%)';
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  let hasActiveSubscription = true;
  let showPaywall = false;

  if (session?.user?.id && process.env.STRIPE_ENABLED === 'true') {
    const subscription = await getActiveSubscriptionByUserId({ userId: session.user.id });
    hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
    console.log(`[RootLayout] User: ${session.user.id}, Subscription Status: ${subscription?.status}, HasActive: ${hasActiveSubscription}`);
    showPaywall = !hasActiveSubscription;
  } else if (session?.user?.id && process.env.STRIPE_ENABLED !== 'true') {
    console.log(`[RootLayout] User: ${session.user.id}, Stripe DISABLED, granting access.`);
    hasActiveSubscription = true;
    showPaywall = false;
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SuggestionOverlayProvider>
            <DocumentProvider>
              <Toaster position="top-center" />
              
              {/* Render children ALWAYS */}
              {children} 

              {/* Conditionally render Paywall overlay on top */}
              {showPaywall && (
                <Paywall 
                  isOpen={true} 
                  required={true} 
                />
              )}

              <Analytics />
            </DocumentProvider>
          </SuggestionOverlayProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
