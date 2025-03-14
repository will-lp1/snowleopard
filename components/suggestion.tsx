'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useWindowSize } from 'usehooks-ts';
import type { UISuggestion } from '@/lib/editor/suggestions';
import { CheckIcon, CrossIcon, MessageIcon } from './icons';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { ArtifactKind } from './artifact';
import { DiffView } from './diffview';

export const Suggestion = ({
  suggestion,
  onApply,
  onReject,
  artifactKind,
}: {
  suggestion: UISuggestion;
  onApply: () => void;
  onReject: () => void;
  artifactKind: ArtifactKind;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth < 768;

  return (
    <AnimatePresence>
      {!isExpanded ? (
        <motion.div
          className={cn('cursor-pointer text-muted-foreground hover:text-foreground p-1 transition-colors', {
            'absolute right-2': artifactKind === 'text',
          })}
          onClick={() => setIsExpanded(true)}
          whileHover={{ scale: 1.1 }}
        >
          <MessageIcon size={isMobile ? 16 : 14} />
        </motion.div>
      ) : (
        <motion.div
          key={suggestion.id}
          className="absolute bg-background p-4 flex flex-col gap-3 rounded-xl border border-border text-sm w-96 shadow-xl z-50 -right-2 -top-6 dark:border-zinc-700"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2">
              <div className="h-5 w-5 bg-primary/10 text-primary flex items-center justify-center rounded-full">
                <MessageIcon size={12} />
              </div>
              <div className="font-medium">Suggestion</div>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-1 rounded-md"
              onClick={() => setIsExpanded(false)}
            >
              <CrossIcon size={12} />
            </button>
          </div>
          
          <div className="text-sm text-muted-foreground">{suggestion.description}</div>
          
          <div className="border rounded-lg p-3 bg-muted/30 dark:bg-muted/10">
            <DiffView oldContent={suggestion.originalText} newContent={suggestion.suggestedText} />
          </div>

          <div className="flex flex-row gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 border-red-200 dark:border-red-900/30"
              onClick={() => {
                onReject();
                setIsExpanded(false);
              }}
            >
              <CrossIcon size={12} />
              Reject
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/50 border-green-200 dark:border-green-900/30"
              onClick={() => {
                onApply();
                setIsExpanded(false);
              }}
            >
              <CheckIcon size={12} />
              Accept
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
