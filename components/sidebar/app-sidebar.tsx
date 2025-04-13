'use client';

import { useRouter } from 'next/navigation';
import { SidebarUserNav } from '@/components/sidebar/sidebar-user-nav';
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
import { SidebarDocuments } from '@/components/sidebar/sidebar-documents';
import { FeedbackWidget } from '@/components/feedback-widget';

export function AppSidebar({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [activeTab, setActiveTab] = useState<SidebarTab>('documents');

  return (
    <Sidebar className="border-none shadow-none">
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
        <div className="px-2">
          <SidebarDocuments user={user} />
        </div>
      </SidebarContent>
      
      <SidebarFooter>
        <div className="px-2 pb-2 flex flex-col space-y-1">
          {user && (
            <>
              <FeedbackWidget authUserId={user.id} />
              <SidebarUserNav user={user} />
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
