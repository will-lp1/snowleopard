'use client';

import { isAfter } from 'date-fns';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { useWindowSize } from 'usehooks-ts';

import type { Document } from '@/lib/db/schema';
import { getDocumentTimestampByIndex } from '@/lib/utils';

import { LoaderIcon } from './icons';
import { Button } from './ui/button';
import { useArtifact } from '@/hooks/use-artifact';

interface VersionFooterProps {
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
  documents: Array<Document> | undefined;
  currentVersionIndex: number;
}

export const VersionFooter = ({
  handleVersionChange,
  documents,
  currentVersionIndex,
}: VersionFooterProps) => {
  const { artifact } = useArtifact();

  const { width } = useWindowSize();
  const isMobile = width < 768;

  const { mutate } = useSWRConfig();
  const [isMutating, setIsMutating] = useState(false);

  if (!documents) return null;

  // Calculate the version number and total versions
  const currentVersion = currentVersionIndex + 1;
  const totalVersions = documents.length;
  
  // Calculate percentage for progress bar
  const versionPercentage = Math.max(1, Math.min(100, (currentVersion / totalVersions) * 100));

  return (
    <motion.div
      className="absolute flex flex-col gap-3 md:flex-row bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm p-4 border-t z-50 justify-between shadow-md"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">Comparing version {currentVersion} with current version</div>
          <div className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {currentVersion} of {totalVersions}
          </div>
        </div>
        
        {/* Version timeline bar */}
        <div className="mt-2 w-full md:w-64 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full" 
            style={{ width: `${versionPercentage}%` }}
          />
        </div>
      </div>

      <div className="flex flex-row gap-2 md:gap-3 self-end md:self-auto">
        <Button
          size={isMobile ? "sm" : "default"}
          disabled={isMutating}
          onClick={async () => {
            setIsMutating(true);

            mutate(
              `/api/document?id=${artifact.documentId}`,
              await fetch(`/api/document?id=${artifact.documentId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  timestamp: getDocumentTimestampByIndex(
                    documents,
                    currentVersionIndex,
                  ),
                }),
              }),
              {
                optimisticData: documents
                  ? [
                      ...documents.filter((document) =>
                        isAfter(
                          new Date(document.createdAt),
                          new Date(
                            getDocumentTimestampByIndex(
                              documents,
                              currentVersionIndex,
                            ),
                          ),
                        ),
                      ),
                    ]
                  : [],
              },
            );
          }}
          className="gap-2 items-center"
        >
          <span>Restore this version</span>
          {isMutating && (
            <div className="animate-spin">
              <LoaderIcon size={14} />
            </div>
          )}
        </Button>
        <Button
          size={isMobile ? "sm" : "default"}
          variant="outline"
          onClick={() => {
            handleVersionChange('latest');
          }}
        >
          Back to latest version
        </Button>
      </div>
    </motion.div>
  );
};
