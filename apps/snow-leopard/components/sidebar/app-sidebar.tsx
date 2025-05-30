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
import { useWindowSize } from 'usehooks-ts';
import { SidebarDocuments } from '@/components/sidebar/sidebar-documents';
import { FeedbackWidget } from '@/components/sidebar/feedback-widget';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/auth';
import { Crimson_Text } from 'next/font/google'

const crimson = Crimson_Text({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export function AppSidebar({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { width } = useWindowSize();
  const isMobile = width < 768;

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
              <span className={`text-2xl ${crimson.className} hover:bg-muted rounded-md px-2 py-1 transition-colors`}>
                {isMobile ? "SL" : "Snow Leopard"}
              </span>
            </Link>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        <div className="px-2">
          <SidebarDocuments user={user} />
        </div>
      </SidebarContent>
      
      <SidebarFooter>
        <div className="px-2 pb-2 flex flex-col space-y-2">
          {user && (
            <>
              <FeedbackWidget/>
              <SidebarUserNav user={user} />
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}