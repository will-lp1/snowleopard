import { cookies } from 'next/headers';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import Script from 'next/script';
import { createClient } from '@/utils/supabase/server';
import { initialArtifactData } from '@/hooks/use-artifact';

export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get('sidebar:state');
  const isCollapsed = sidebarState?.value !== 'true';

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <SidebarProvider defaultOpen={!isCollapsed}>
        <div className="flex flex-row h-dvh w-full">
          <AppSidebar user={session?.user} />
          {/* Main content area without SidebarInset */}
          {children}
        </div>
      </SidebarProvider>
    </>
  );
}
