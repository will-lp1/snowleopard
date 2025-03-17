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

  return (
    <AnimatePresence>
      {!isExpanded ? (
        <motion.div
          className={cn('cursor-pointer text-muted-foreground p-1', {
            'absolute -right-8': artifactKind === 'text',
          })}
          onClick={() => setIsExpanded(true)}
          whileHover={{ scale: 1.1 }}
        >
          <MessageIcon size={windowWidth && windowWidth < 768 ? 16 : 14} />
        </motion.div>
      ) : (
        <motion.div
          key={suggestion.id}
          className="absolute bg-background p-3 flex flex-col gap-3 rounded-2xl border text-sm w-80 shadow-xl z-50 -right-12 md:-right-16 font-sans"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: -20 }}
          exit={{ opacity: 0, y: -10 }}
          whileHover={{ scale: 1.05 }}
        >
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2">
              <div className="size-4 bg-muted-foreground/25 rounded-full" />
              <div className="font-medium">snow leopard</div>
            </div>
            <button
              type="button"
              className="text-xs text-gray-500 cursor-pointer"
              onClick={() => setIsExpanded(false)}
            >
              <CrossIcon size={12} />
            </button>
          </div>
          
          <div className="text-sm text-muted-foreground">{suggestion.description}</div>
          
          <div className="border rounded-lg p-2 bg-muted/50">
            <DiffView oldContent={suggestion.originalText} newContent={suggestion.suggestedText} />
          </div>

          <div className="flex flex-row gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
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
              className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/50"
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
