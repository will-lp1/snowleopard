import { useState, useEffect, useCallback, useRef } from 'react';
import { useArtifact } from './use-artifact';
import { toast } from 'sonner';

export function useDebouncedSave(debounceMs: number = 2000) {
  const [isSaving, setIsSaving] = useState(false);
  const { artifact } = useArtifact();
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const contentRef = useRef<string>('');
  const lastSavedRef = useRef<string>('');
  
  const saveDocument = useCallback(async (content: string) => {
    if (!artifact.documentId || content === lastSavedRef.current) return;
    
    // Update local content immediately
    contentRef.current = content;
    
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set up new debounced save
    debounceTimerRef.current = setTimeout(async () => {
      // Only save if content has changed since last save
      if (contentRef.current !== lastSavedRef.current) {
        setIsSaving(true);
        try {
          const response = await fetch(`/api/document?id=${artifact.documentId}`, {
            method: 'POST',
            body: JSON.stringify({
              title: artifact.title,
              content: contentRef.current,
              kind: artifact.kind,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to save document');
          }

          lastSavedRef.current = contentRef.current;
        } catch (err) {
          console.error('Error saving document:', err);
          toast.error('Failed to save changes');
        } finally {
          setIsSaving(false);
        }
      }
    }, debounceMs);
    
  }, [artifact.documentId, artifact.title, artifact.kind, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    saveDocument,
    currentContent: contentRef.current
  };
} 