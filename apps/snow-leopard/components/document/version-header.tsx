'use client';

import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { RotateCcw, Clock, Calendar, Loader2 } from 'lucide-react';
import { format, formatDistance, isToday, isYesterday, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

import type { Document } from '@snow-leopard/db';
import { getDocumentTimestampByIndex } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
  const [isDragging, setIsDragging] = useState(false);
  const [activeIndex, setActiveIndex] = useState(currentVersionIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<boolean>(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  
  const pulseTimeline = useRef<HTMLDivElement>(null);
  const [pulseTick, setPulseTick] = useState<number | null>(null);
  
  const x = useMotionValue(0);
  const springX = useSpring(x, { damping: 50, stiffness: 400 });
  
  const handleCommitVersion = useCallback(() => {
    if (activeIndex !== currentVersionIndex) {
      if (activeIndex < currentVersionIndex) {
        for (let i = 0; i < currentVersionIndex - activeIndex; i++) {
          handleVersionChange('prev');
        }
      } else if (activeIndex > currentVersionIndex) {
        for (let i = 0; i < activeIndex - currentVersionIndex; i++) {
          handleVersionChange('next');
        }
      }
    }
  }, [activeIndex, currentVersionIndex, handleVersionChange]);
  
  useEffect(() => {
    if (!documents || documents.length === 0) return;
    setActiveIndex(currentVersionIndex);
    
    if (trackRef.current) {
      const trackWidth = trackRef.current.offsetWidth;
      const segmentWidth = trackWidth / Math.max(1, documents.length - 1);
      const newX = (documents.length - 1 - currentVersionIndex) * segmentWidth;
      x.set(newX);
    }
  }, [documents, currentVersionIndex, x]);
  
  useEffect(() => {
    if (!documents || documents.length <= 1) return;
    
    const unsubscribe = springX.onChange((value) => {
      if (!trackRef.current || !documents) return;
      
      const trackWidth = trackRef.current.offsetWidth;
      const segmentWidth = trackWidth / Math.max(1, documents.length - 1);
      
      const exactIndex = Math.round((documents.length - 1) - (value / segmentWidth));
      const clampedIndex = Math.max(0, Math.min(documents.length - 1, exactIndex));
      
      if (clampedIndex !== activeIndex) {
        setActiveIndex(clampedIndex);
        
        if (dragging.current) {
          setPulseTick(clampedIndex);
          setTimeout(() => setPulseTick(null), 300);
          
          if (window.navigator && window.navigator.vibrate) {
            try {
              window.navigator.vibrate(8);
            } catch (e) {
            }
          }
        }
      }
    });
    
    return unsubscribe;
  }, [documents, activeIndex, springX]);
  
  if (!documents || documents.length === 0) return null;

  const onDragEnd = () => {
    setIsDragging(false);
    dragging.current = false;
    handleCommitVersion();
  };
  
  const formatVersionLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    
    const days = differenceInDays(new Date(), date);
    if (days < 7) return format(date, 'EEE');
    if (days < 60) return format(date, 'MMM d');
    return format(date, 'MMM yyyy');
  };
  
  const formatVersionTime = (date: Date) => {
    return format(date, 'h:mm a');
  };
  
  const currentDoc = documents[activeIndex];
  
  const handleRestoreVersion = async () => {
    if (!documents || activeIndex < 0 || activeIndex >= documents.length) {
      toast.error('Invalid version selected');
      return;
    }

    setIsMutating(true);
    try {
      const versionToRestore = documents[activeIndex];
      const timestamp = getDocumentTimestampByIndex(documents, activeIndex);
      
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
  };

  const maxVersions = documents.length;
  const dateString = formatVersionLabel(new Date(currentDoc.createdAt));
  const timeString = formatVersionTime(new Date(currentDoc.createdAt));
  const relativeTimeString = formatDistance(new Date(currentDoc.createdAt), new Date(), { addSuffix: true });
  
  if (!hasPlayed && documents.length > 1) {
    setTimeout(() => setHasPlayed(true), 100);
  }

  return (
    <TooltipProvider>
      <motion.div
        className="relative border-b border-border backdrop-blur-sm bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="px-4 py-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm text-primary/90 font-medium">
                <span className="rounded-full bg-primary/10 w-5 h-5 flex items-center justify-center text-[10px] text-primary">
                  {activeIndex + 1}
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
                    <span>Restore</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Make this version the current version
                </TooltipContent>
              </Tooltip>
              
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => handleVersionChange('latest')}
              >
                Exit History
              </Button>
            </div>
          </div>
          
          {documents.length > 1 && (
            <div className="py-2 px-1 relative" ref={trackRef}>
              <div className="h-[3px] bg-primary/10 rounded-full relative">
                {documents.map((doc, i) => (
                  <AnimatePresence key={i}>
                    <motion.div 
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full",
                        i === activeIndex ? "bg-primary" : "bg-primary/30",
                        i === documents.length - 1 ? "right-0" : "",
                        i === 0 ? "left-0" : "",
                      )}
                      style={{
                        left: i === 0 ? 0 : i === documents.length - 1 ? undefined : `${(i / (documents.length - 1)) * 100}%`,
                      }}
                      whileHover={{ scale: 1.7 }}
                      initial={{ scale: hasPlayed ? 1 : 0 }}
                      animate={{ scale: i === activeIndex ? 1.7 : 1 }}
                      transition={{ duration: 0.2 }}
                    />
                    
                    {pulseTick === i && (
                      <motion.div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary/20 pointer-events-none"
                        style={{
                          left: i === 0 ? 0 : i === documents.length - 1 ? undefined : `${(i / (documents.length - 1)) * 100}%`,
                          right: i === documents.length - 1 ? 0 : undefined,
                          marginLeft: i === 0 ? 0 : -6,
                          marginRight: i === documents.length - 1 ? -6 : 0,
                        }}
                        initial={{ scale: 0, opacity: 0.8 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </AnimatePresence>
                ))}
              </div>
              
              <motion.div
                className={cn(
                  "absolute top-0 left-0 w-full transition-opacity",
                  isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                style={{ y: "-50%" }}
              >
                <motion.div
                  drag="x"
                  dragConstraints={trackRef}
                  dragElastic={0}
                  dragMomentum={false}
                  onDragStart={() => {
                    setIsDragging(true);
                    dragging.current = true;
                  }}
                  onDragEnd={onDragEnd}
                  style={{ x: springX }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <div className={cn(
                    "w-5 h-5 bg-primary rounded-full shadow-sm flex items-center justify-center -mt-[9px]",
                    "transition-all duration-150",
                    isDragging ? "scale-125" : "scale-100 hover:scale-110"
                  )}>
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                </motion.div>
              </motion.div>
              
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground px-1">
                <div>
                  {formatVersionLabel(new Date(documents[0].createdAt))}
                </div>
                
                {documents.length > 2 && (
                  <div>
                    {formatVersionLabel(new Date(documents[Math.floor(documents.length / 2)].createdAt))}
                  </div>
                )}
                
                <div>
                  {formatVersionLabel(new Date(documents[documents.length - 1].createdAt))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  );
}; 