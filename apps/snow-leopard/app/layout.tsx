import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/theme-provider';
import { SuggestionOverlayProvider } from '@/components/suggestion-overlay-provider';
import { DocumentProvider } from '@/hooks/use-document-context';
import { CSPostHogProvider } from '@/providers/posthog-provider';
import { PostHogPageView } from '@/providers/posthog-pageview';
import { Analytics } from "@vercel/analytics/react";
import MobileWarning from '@/components/mobile-warning';
import { getLocale, getGT } from "gt-next/server";
import { GTProvider } from "gt-next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getGT();
  
  return {
    title: t('Snow Leopard'),
    description: t('Tab, Tab, Apply Brilliance'),
    metadataBase: new URL('https://www.cursorforwrit.ing'),
    verification: {
      google: 'q_spHn9uTXgy715SiSp97ElF_ZbU5SxZbIUnhn6Oe8E'
    },
    openGraph: {
      title: t('Snow Leopard'),
      description: t('The most satisfying, intuitive AI writing tool, and it\'s open source.'),
      url: 'https://www.cursorforwrit.ing',
      siteName: 'snowleopard',
      locale: 'en_US',
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title: t('Snow Leopard'),
      description: t('The most satisfying, intuitive AI writing tool, and it\'s open source.'),
      creator: '@wlovedaypowell',
      images: [
      {
        url: '/api/og',
        alt: t('Snow Leopard - Tab, Tab, Apply Brilliance')
      }]

    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: '/favicon.ico'
    }
  };
}

export const viewport = {
  maximumScale: 1
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
  children


}: Readonly<{children: React.ReactNode;}>) {
  return (
  <html

    suppressHydrationWarning lang={await getLocale()}>

      <head>
        <script
        dangerouslySetInnerHTML={{
          __html: THEME_COLOR_SCRIPT
        }} />

      </head>
      <body className="antialiased"><GTProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange>

          <SuggestionOverlayProvider>
            <CSPostHogProvider>
              <PostHogPageView />
              <DocumentProvider>
                <Toaster position="top-center" />
                
                {/* Render children ALWAYS */}
                {children} 

                <MobileWarning />

                <Analytics />
              </DocumentProvider>
            </CSPostHogProvider>
          </SuggestionOverlayProvider>
        </ThemeProvider>
      </GTProvider></body>
    </html>
  );
}