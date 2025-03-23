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

export function AppSidebar({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { width } = useWindowSize();
  const isMobile = width < 768;

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
