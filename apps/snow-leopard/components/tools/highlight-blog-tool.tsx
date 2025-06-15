'use client';

import { memo } from 'react';
import {
  CheckCircleFillIcon,
  LoaderIcon,
  MessageIcon as SearchIcon,
} from '@/components/icons';
import type { ToolInvocation } from 'ai';

interface HighlightToolProps {
  toolInvocation: ToolInvocation;
}

function PureHighlightTool({ toolInvocation }: HighlightToolProps) {
  const { toolName, state } = toolInvocation;

  if (toolName !== 'highlightBlogText') {
    return null;
  }

  const isCalling = state === 'call';
  const isResult = state === 'result';
  const quote =
    isResult && 'result' in toolInvocation
      ? (toolInvocation.result as { quote: string }).quote
      : '';

  return (
    <div className="bg-background border rounded-xl w-full max-w-md flex flex-col items-start text-sm overflow-hidden">
      {/* Header */}
      <div className="p-3 flex flex-row gap-3 items-center w-full bg-muted/30 border-b">
        <div className="flex-shrink-0 text-muted-foreground">
          <SearchIcon size={16} />
        </div>
        <div className="text-left flex-grow font-medium text-foreground">
          {isCalling && 'Finding reference in text...'}
          {isResult && 'Reference found'}
        </div>
        {isCalling && (
          <div className="animate-spin text-muted-foreground flex-shrink-0">
            <LoaderIcon size={16} />
          </div>
        )}
        {isResult && (
          <div className="text-green-600 flex-shrink-0">
            <CheckCircleFillIcon size={16} />
          </div>
        )}
      </div>

      {/* Content */}
      {isResult && quote && (
        <div className="p-3 w-full text-xs text-muted-foreground">
          <blockquote className="border-l-2 pl-2 italic">
            &ldquo;{quote}&rdquo;
          </blockquote>
        </div>
      )}
    </div>
  );
}

export const HighlightTool = memo(PureHighlightTool); 