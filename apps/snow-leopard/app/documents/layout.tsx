"use client"

import { useState, useEffect, ReactNode } from 'react';
import useSWR from 'swr';
import { Chat } from '@/components/chat/chat';
import { ResizablePanel } from '@/components/resizable-panel';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { SidebarProvider, SidebarRail } from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { fetcher } from '@/lib/utils';

export const experimental_ppr = true;

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const shouldFetchSubscription = !isSessionLoading && !!session?.user?.id;
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSWR(
    shouldFetchSubscription ? '/api/user/subscription-status' : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000 }
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
            {children} 
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