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

  return (
    <Sidebar className="shadow-none border-r">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center px-2">
            <Link
              href="/"
              onClick={() => setOpenMobile(false)}
              className="flex items-center gap-2"
            >
              <span className={`text-2xl ${crimson.className} hover:bg-accent rounded-md px-2 py-1 transition-colors`}>
                <span className="hidden md:inline">Snow Leopard</span>
                <span className="inline md:hidden">SL</span>
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