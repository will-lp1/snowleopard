'use client';

import { useEffect } from 'react';
import type { User } from '@supabase/auth-helpers-nextjs';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';

// This component is replaced by sidebar-documents
export function SidebarHistory({ user }: { user: User | undefined }) {
  // Left empty as we're using sidebar-documents instead
  return null;
}
