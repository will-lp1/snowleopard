'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import Image from 'next/image';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon, FileIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { VisibilityType } from './visibility-selector';
import { cn } from '@/lib/utils';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth < 768;
  const isCompact = windowWidth < 1024;
  const { handleNewChat, isCreatingChat, createNewDocument, isCreatingDocument } = useDocumentUtils();

  return (
    <header className="flex sticky top-0 bg-background/80 backdrop-blur-sm z-10 border-b border-border items-center px-3 h-[45px] gap-2 transition-all duration-200">
      {/* Only show sidebar toggle when we're in mobile view */}
      {isMobile && <SidebarToggle />}

      {/* New Chat Button with Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={isCreatingChat || isCreatingDocument}
          >
            {isCreatingChat || isCreatingDocument ? (
              <svg className="animate-spin size-4 text-muted-foreground" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <PlusIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleNewChat}>
            <div className="mr-2">
              <PlusIcon size={16} />
            </div>
            New Chat
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={createNewDocument}>
            <div className="mr-2">
              <FileIcon size={16} />
            </div>
            New Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Model Selector - Only show if not readonly */}
      {!isReadonly && (
        <div className="transition-all duration-200 min-w-0 flex-shrink">
          <ModelSelector
            selectedModelId={selectedModelId}
            className={cn("ml-0", {
              'w-[140px] md:px-2 md:h-[34px]': isCompact,
              'w-[180px] md:px-3 md:h-[34px]': !isCompact
            })}
          />
        </div>
      )}

      {/* GitHub Link */}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-8"
        asChild
      >
        <Link
          href="https://github.com/will-lp1/cursorforwriting"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image 
            src="/images/github-white.svg" 
            alt="Github" 
            width={16} 
            height={16}
          />
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
