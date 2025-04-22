"use client"

import { useState, useEffect, ReactNode } from 'react';
import { Chat } from '@/components/chat/chat';
import { ResizablePanel } from '@/components/resizable-panel';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { SidebarProvider, SidebarRail } from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';

export const experimental_ppr = true;

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const sidebarState = document.cookie.split('; ').find(row => row.startsWith('sidebar:state'));
    setIsCollapsed(sidebarState ? sidebarState.split('=')[1] !== 'true' : true);
  }, []);

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
            />
          </ResizablePanel>
        </div>
      </div>
    </SidebarProvider>
  );
} 