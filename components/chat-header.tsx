'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import Image from 'next/image';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { VisibilityType, VisibilitySelector } from './visibility-selector';

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

  return (
    <header className="flex sticky top-0 bg-background z-10 border-b border-border items-center px-3 h-[45px] gap-2">
      {/* Only show sidebar toggle when we're in mobile view */}
      {isMobile && <SidebarToggle />}

      {/* New Chat Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              router.push('/chat');
              router.refresh();
            }}
          >
            <div className="mr-1 flex items-center">
              <PlusIcon />
            </div>
            <span className={isMobile ? "sr-only" : ""}>New Chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New Chat</TooltipContent>
      </Tooltip>

      {/* Model Selector - Only show if not readonly */}
      {!isReadonly && (
        <ModelSelector
          selectedModelId={selectedModelId}
          className="ml-0"
        />
      )}

      {/* Visibility Selector - Only show if not readonly */}
      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {/* GitHub Link on larger screens */}
      <Button
        className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 hidden md:flex py-1.5 px-2 h-8 ml-auto"
        asChild
      >
        <Link
          href="https://github.com/will-lp1/cursorforwriting"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image src="/images/github-white.svg" alt="Github" width={16} height={16} className="mr-2" />
          <span className="text-sm">GitHub</span>
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
