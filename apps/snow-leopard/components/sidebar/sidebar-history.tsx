'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { User } from '@/lib/auth';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';

// This component is replaced by sidebar-documents
export function SidebarHistory({ user }: { user: User | undefined }) {
  // Left empty as we're using sidebar-documents instead
  return null;
}
