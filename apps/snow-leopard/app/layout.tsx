import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/theme-provider';
import { SuggestionOverlayProvider } from '@/components/suggestion-overlay-provider';
import { DocumentProvider } from '@/hooks/use-document-context';
import { CSPostHogProvider } from '@/providers/posthog-provider';
import { PostHogPageView } from '@/providers/posthog-pageview';
import { Analytics } from "@vercel/analytics/react"

import './globals.css';

export const metadata: Metadata = {
  title: 'snowleopard',
  description: 'Tab, Tab, Apply Brilliance',
  icons: {
    icon: '/images/leopardprintbw.svg',
  },
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
            <CSPostHogProvider>
              <PostHogPageView />
              <DocumentProvider>
                <Toaster position="top-center" />
                
                {/* Render children ALWAYS */}
                {children} 

                <Analytics />
              </DocumentProvider>
            </CSPostHogProvider>
          </SuggestionOverlayProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
