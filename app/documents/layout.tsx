"use client"

import { useState, useEffect, ReactNode } from 'react';
import { Chat } from '@/components/chat/chat';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { ResizablePanel } from '@/components/resizable-panel';
import { generateUUID } from '@/lib/utils';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarRail } from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';

export const experimental_ppr = true;

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  // Generate a stable placeholder ID for chat/data stream if needed.
  // Chat component manages its *real* internal ID.
  const layoutChatId = generateUUID(); 

  const [session, setSession] = useState<any>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    // Get sidebar state from cookie
    const sidebarState = document.cookie.split('; ').find(row => row.startsWith('sidebar:state'));
    setIsCollapsed(sidebarState?.split('=')[1] !== 'true');

    // Get session data
    const getSession = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };
    
    getSession();
  }, []);

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <div className="flex flex-row h-dvh w-full bg-background">
        {/* Left Sidebar */}
        <div className="relative">
          <AppSidebar user={session?.user} />
          <SidebarRail className="bg-background/80 backdrop-blur-sm" />
        </div>
        
        {/* Main content area */}
        <div className="flex-1 flex flex-row">
          {/* Left panel - Document Content (from page.tsx) */}
          <div className="flex-1 min-w-0 overflow-hidden border-r subtle-border transition-all duration-200 ease-in-out">
            {children} 
          </div>

          {/* Right panel - Persistent Chat */}
          <ResizablePanel 
            defaultSize={400} 
            minSize={320} 
            maxSize={600}
            className="border-l subtle-border transition-all duration-200"
          >
            <Chat
              // id prop is optional, Chat manages its own state
              initialMessages={[]} // Start empty, state is preserved internally
              // isReadonly needs to be determined within Chat component now
            />
          </ResizablePanel>
          <DataStreamHandler id={layoutChatId} /> 
          {/* DataStreamHandler might need adjustment depending on how it uses the ID */}
          {/* If it needs the *actual* chat ID, it might need to move inside Chat or use context */}
        </div>
      </div>
    </SidebarProvider>
  );
} 