'use client';

import { useState, useEffect, useCallback } from 'react';
import { T, useGT } from 'gt-next';
import { useSWRConfig } from 'swr';
import { RotateCcw, Clock, Loader2 } from 'lucide-react';
import { format, formatDistance, isToday, isYesterday, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

import type { Document } from '@snow-leopard/db';
import { getDocumentTimestampByIndex } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { useArtifact } from '@/hooks/use-artifact';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VersionHeaderProps {
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
  documents: Array<Document> | undefined;
  currentVersionIndex: number;
}

export const VersionHeader = ({
  handleVersionChange,
  documents,
  currentVersionIndex,
}: VersionHeaderProps) => {
  const { artifact, setArtifact } = useArtifact();
  const { mutate } = useSWRConfig();
  const [isMutating, setIsMutating] = useState(false);
  
  const handleRestoreVersion = useCallback(async () => {
    if (!documents || currentVersionIndex < 0 || currentVersionIndex >= documents.length) {
      toast.error('Invalid version selected');
      return;
    }

    setIsMutating(true);
    try {
      const versionToRestore = documents[currentVersionIndex];
      const timestamp = getDocumentTimestampByIndex(documents, currentVersionIndex);
      
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: artifact.documentId,
          content: versionToRestore.content,
          title: versionToRestore.title,
          restoreFromTimestamp: timestamp
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to restore version: ${response.status}`);
      }
      
      await mutate(`/api/document?id=${artifact.documentId}`);
      
      setArtifact(current => ({
        ...current,
        content: versionToRestore.content || '',
        title: versionToRestore.title || current.title
      }));
      
      handleVersionChange('latest');
      
      const event = new CustomEvent('version-restored', {
        detail: {
          documentId: artifact.documentId,
          content: versionToRestore.content,
          title: versionToRestore.title
        }
      });
      window.dispatchEvent(event);
      
      toast.success('Version restored successfully');
    } catch (error) {
      console.error('[Version] Error restoring version:', error);
      toast.error('Failed to restore version');
    } finally {
      setIsMutating(false);
    }
  }, [documents, currentVersionIndex, artifact.documentId, setArtifact, handleVersionChange, mutate]);
  
  if (!documents || documents.length === 0) return null;

  const t = useGT();
  
  const formatVersionLabel = (date: Date) => {
    if (isToday(date)) return t("Today");
    if (isYesterday(date)) return t("Yesterday");
    
    const days = differenceInDays(new Date(), date);
    if (days < 7) return format(date, 'EEE');
    if (days < 60) return format(date, 'MMM d');
    return format(date, 'MMM yyyy');
  };
  
  const formatVersionTime = (date: Date) => {
    return format(date, 'h:mm a');
  };

  // Use currentVersionIndex directly instead of activeIndex
  const currentDoc = documents[currentVersionIndex];

  if (!currentDoc) return null; // Handle case where currentDoc might be undefined

  const dateString = formatVersionLabel(new Date(currentDoc.createdAt));
  const timeString = formatVersionTime(new Date(currentDoc.createdAt));
  const relativeTimeString = formatDistance(new Date(currentDoc.createdAt), new Date(), { addSuffix: true });

  return (
    <TooltipProvider>
      <div
        className="relative border-b border-border backdrop-blur-sm overflow-hidden"
      >
        <div className="px-4 py-2.5 flex items-center justify-between"> {/* Simplified to single row */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm text-primary/90 font-medium">
                 {/* Display version based on currentVersionIndex */}
                <span className="rounded-full bg-primary/10 w-5 h-5 flex items-center justify-center text-[10px] text-primary">
                  {currentVersionIndex + 1}
                </span>
                <span>
                  {dateString}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeString}
                </span>
              </div>
              
              <div className="flex items-center text-xs text-muted-foreground gap-1">
                <Clock className="w-3 h-3" />
                <span>{relativeTimeString}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5 h-7 px-2.5"
                    onClick={handleRestoreVersion}
                    disabled={isMutating}
                  >
                    {isMutating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    <T><span>Restore</span></T>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <T>Make this version the current version</T>
                </TooltipContent>
              </Tooltip>
              
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => handleVersionChange('latest')}
              >
                <T>Exit History</T>
              </Button>
            </div>
        </div>
      </div>
    </TooltipProvider>
  );
}; 