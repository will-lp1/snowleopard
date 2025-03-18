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
import { VisibilityType } from './visibility-selector';
import { cn } from '@/lib/utils';

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

  return (
    <header className="flex sticky top-0 bg-background/80 backdrop-blur-sm z-10 border-b border-border items-center px-3 h-[45px] gap-2 transition-all duration-200">
      {/* Only show sidebar toggle when we're in mobile view */}
      {isMobile && <SidebarToggle />}

      {/* New Chat Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => {
              router.push('/chat');
              router.refresh();
            }}
          >
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New Chat</TooltipContent>
      </Tooltip>

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
