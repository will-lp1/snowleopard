'use client';

import { useState } from 'react';
import { ChevronDownIcon, LoaderIcon } from '../icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Markdown } from '../markdown';
import { T } from 'gt-next';

interface MessageReasoningProps {
  isLoading: boolean;
  reasoning: string;
}

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const variants = {
    collapsed: {
      height: 0,
      opacity: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      marginTop: '1rem',
      marginBottom: '0.5rem',
    },
  };

  return (
    <div className="flex flex-col">
      {isLoading ? (
        <div className="flex flex-row gap-2 items-center">
          <T>
            <div className="font-medium">Reasoning</div>
          </T>
          <div className="animate-spin">
            <LoaderIcon />
          </div>
        </div>
      ) : (
        <div className="flex flex-row gap-2 items-center">
          <T>
            <div className="font-medium">Reasoned for a few seconds</div>
          </T>
          <button
            data-testid="message-reasoning-toggle"
            type="button"
            className="cursor-pointer"
            onClick={() => {
              setIsExpanded(!isExpanded);
            }}
          >
            <ChevronDownIcon />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            data-testid="message-reasoning"
            key="content"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={variants}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
            className="pl-4 text-zinc-600 dark:text-zinc-400 border-l flex flex-col gap-4"
          >
            <Markdown>{reasoning}</Markdown>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
