'use client';

import { isAfter } from 'date-fns';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
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

  // Check to ensure we're not showing the footer unnecessarily
  const shouldShowFooter = () => {
    if (!documents || documents.length <= 1) return false;
    
    // Only show if viewing a document and we're not on the latest version
    return artifact.documentId !== 'init' && 
           currentVersionIndex >= 0 && 
           currentVersionIndex < documents.length - 1;
  };

  if (!shouldShowFooter()) return null;

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t z-50"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="container max-w-screen-xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium">Viewing Previous Version</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Restore this version to continue editing
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <Button
              className="w-full md:w-auto"
              disabled={isMutating}
              onClick={async () => {
                setIsMutating(true);
                try {
                  await mutate(
                    `/api/document?id=${artifact.documentId}`,
                    await fetch(`/api/document?id=${artifact.documentId}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        timestamp: getDocumentTimestampByIndex(
                          documents as Document[],
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
                                    documents as Document[],
                                    currentVersionIndex,
                                  ),
                                ),
                              ),
                            ),
                          ]
                        : [],
                    },
                  );
                } finally {
                  setIsMutating(false);
                }
              }}
            >
              <span className="flex items-center gap-2">
                Restore Version
                {isMutating && <LoaderIcon size={16} />}
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => handleVersionChange('latest')}
            >
              Back to Latest
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
