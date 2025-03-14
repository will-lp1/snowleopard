import { useState, useEffect, useCallback } from 'react';
import { useArtifact } from './use-artifact';
import { toast } from 'sonner';

export function useDebouncedSave() {
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const { artifact } = useArtifact();
  
  const saveDocument = useCallback(async (content: string) => {
    if (!artifact.documentId) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/document?id=${artifact.documentId}`, {
        method: 'POST',
        body: JSON.stringify({
          title: artifact.title,
          content,
          kind: artifact.kind,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      setPendingSave(false);
    } catch (err) {
      console.error('Error saving document:', err);
      toast.error('Failed to save changes');
      setPendingSave(true);
    } finally {
      setIsSaving(false);
    }
  }, [artifact.documentId, artifact.title, artifact.kind]);

  return {
    isSaving,
    pendingSave,
    setPendingSave,
    saveDocument
  };
} 