'use client';

import { useRouter } from 'next/navigation';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { User } from '@supabase/auth-helpers-nextjs';
import { useWindowSize } from 'usehooks-ts';
import { SidebarDocuments } from '@/components/sidebar-documents';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type SidebarTab = 'documents' | 'chats';

export function AppSidebar({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [activeTab, setActiveTab] = useState<SidebarTab>('documents');

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
          </div>
        </SidebarMenu>
      </SidebarHeader>
      
      {user && (
        <div className="px-4 pt-2 pb-2 border-b">
          <div className="flex gap-2 items-center">
            <button 
              onClick={() => setActiveTab('documents')} 
              className={cn(
                "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === 'documents' 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-primary/10 text-muted-foreground"
              )}
            >
              Documents
            </button>
            <button 
              onClick={() => setActiveTab('chats')} 
              className={cn(
                "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === 'chats' 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-primary/10 text-muted-foreground"
              )}
            >
              Chats
            </button>
          </div>
        </div>
      )}
      
      <SidebarContent>
        <div className="px-2 space-y-4">
          {user && activeTab === 'documents' && <SidebarDocuments user={user} />}
          {user && activeTab === 'chats' && <SidebarHistory user={user} />}
          {!user && (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              Sign in to see your documents and chats
            </div>
          )}
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
