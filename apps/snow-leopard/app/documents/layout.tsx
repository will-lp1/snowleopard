"use client"

import { useState, useEffect, ReactNode, Suspense } from 'react';
import useSWR from 'swr';
import { Chat } from '@/components/chat/chat';
import { ResizablePanel } from '@/components/resizable-panel';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { SidebarProvider, SidebarRail } from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { fetcher } from '@/lib/utils';
import { EditorSkeleton } from '@/components/always-visible-artifact';

export const experimental_ppr = true;

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const shouldFetchSubscription = !isSessionLoading && !!session?.user?.id;
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSWR(
    shouldFetchSubscription ? '/api/user/subscription-status' : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const sidebarState = document.cookie.split('; ').find(row => row.startsWith('sidebar:state'));
    setIsCollapsed(sidebarState ? sidebarState.split('=')[1] !== 'true' : true);
  }, []);

  const hasActiveSubscription = 
    !isSubscriptionLoading && 
    !!subscriptionData && 
    subscriptionData.hasActiveSubscription;

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <div className="flex flex-row h-dvh w-full bg-background">
        <div className="relative">
          <AppSidebar user={session?.user} />
          <SidebarRail className="bg-background/80 backdrop-blur-sm" />
        </div>
        
        <div className="flex-1 flex flex-row">
          <div className="flex-1 min-w-0 overflow-hidden border-r subtle-border transition-all duration-200 ease-in-out">
            <Suspense fallback={
              <div className="flex flex-col h-full bg-background">
                <div className="flex items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
                  <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                </div>
                <div className="px-8 py-6 mx-auto max-w-3xl flex-1">
                  <EditorSkeleton />
                </div>
              </div>
            }>
              {children}
            </Suspense>
          </div>

          <ResizablePanel 
            defaultSize={400} 
            minSize={320} 
            maxSize={600}
            className="border-l subtle-border transition-all duration-200"
          >
            <Chat
              initialMessages={[]}
              hasActiveSubscription={hasActiveSubscription}
            />
          </ResizablePanel>
        </div>
      </div>
    </SidebarProvider>
  );
} 