'use client';

import { SidebarUserNav } from '@/components/sidebar/sidebar-user-nav';
import { SidebarDocuments } from '@/components/sidebar/sidebar-documents';
import type { Document } from '@snow-leopard/db';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { FeedbackWidget } from '@/components/sidebar/feedback-widget';
import type { User } from '@/lib/auth';
import { Crimson_Text } from 'next/font/google'
import { LocaleSelector, T } from 'gt-next';

const crimson = Crimson_Text({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export function AppSidebar({ user, initialDocuments }: { user: User | undefined; initialDocuments?: any[] }) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar className="shadow-none">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center px-2">
            <Link
              href="/"
              onClick={() => setOpenMobile(false)}
              className="flex items-center gap-2"
            >
              <span className={`text-2xl ${crimson.className} hover:bg-accent rounded-md px-2 py-1 transition-colors`}>
                <T>
                  <span className="hidden md:inline">Snow Leopard</span>
                  <span className="inline md:hidden">SL</span>
                </T>
              </span>
            </Link>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        <div className="px-2">
          <SidebarDocuments user={user} initialDocuments={initialDocuments} />
        </div>
      </SidebarContent>
      
      <SidebarFooter>
        <div className="px-2 pb-2 flex flex-col space-y-2">
          <LocaleSelector />
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