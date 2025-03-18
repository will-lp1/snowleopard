'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { User } from '@supabase/auth-helpers-nextjs';
import { useWindowSize } from 'usehooks-ts';
import { useArtifact } from '@/hooks/use-artifact';
import { toast } from 'sonner';

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const { setArtifact } = useArtifact();
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const handleNewChat = () => {
    setIsCreatingChat(true);
    
    try {
      // Reset artifact state before navigation
      setArtifact({
        documentId: 'init', // Reset to initial state
        title: 'New Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
        boundingBox: { top: 0, left: 0, width: 0, height: 0 } // Default bounding box
      });
      
      // Close mobile sidebar
      setOpenMobile(false);
      
      // Navigate to new chat page
      router.push('/chat');
      router.refresh();
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
    } finally {
      setIsCreatingChat(false);
    }
  };

  return (
    <Sidebar className="group-data-[side=left]:border-r-0 transition-all duration-200">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center px-2">
            <Link
              href="/"
              onClick={() => setOpenMobile(false)}
              className="flex items-center gap-2"
            >
              <span className="text-lg font-semibold hover:bg-muted rounded-md px-2 py-1 transition-colors">
                {isMobile ? "SL" : "Snow Leopard"}
              </span>
            </Link>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={handleNewChat}
                  disabled={isCreatingChat}
                >
                  {isCreatingChat ? (
                    <svg className="animate-spin size-4 text-muted-foreground" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <PlusIcon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        <div className="px-2">
          <SidebarHistory user={user} />
        </div>
      </SidebarContent>
      
      <SidebarFooter>
        <div className="px-2 pb-2">
          {user && <SidebarUserNav user={user} />}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
