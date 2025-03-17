import { useCallback, useRef, useState } from 'react';

/**
 * A hook that provides debounced document saving functionality
 * 
 * @param delay The delay in milliseconds to wait before saving
 * @returns Object containing the debounced save function and saving status
 */
export function useDebouncedSave(delay: number = 2000) {
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const saveInProgressRef = useRef<boolean>(false);

  /**
   * Debounced save function. This will wait for the specified delay
   * before triggering the actual save operation. If called multiple times
   * within the delay period, only the last call will result in a save.
   */
  const debouncedSave = useCallback(
    async (content: string, documentId: string, title?: string, kind?: string) => {
      // Store the content that needs to be saved
      pendingContentRef.current = content;
      
      console.log(`Scheduling save for document ID: ${documentId}`);

      // Set isSaving immediately to show UI indication
      setIsSaving(true);

      // If a save is already scheduled, cancel it
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Don't schedule a save if the content hasn't changed significantly
      // This prevents saving on every single character
      if (content === lastSavedContentRef.current || 
          (lastSavedContentRef.current && 
           Math.abs(content.length - lastSavedContentRef.current.length) < 10 &&
           Date.now() - (timeoutRef.current ? Date.now() : 0) < 1000)) {
        console.log('Skipping save - content hasn\'t changed significantly');
        setIsSaving(false);
        return;
      }

      // Schedule a new save operation with a longer delay
      timeoutRef.current = setTimeout(async () => {
        try {
          // Don't save if another save is already in progress
          if (saveInProgressRef.current) {
            console.log('Skipping save - another save is already in progress');
            return;
          }

          // Only save if we have an actual document ID (not 'init')
          if (documentId && documentId !== 'init' && pendingContentRef.current) {
            console.log(`Saving document ${documentId} (${pendingContentRef.current.length} chars)`);
            saveInProgressRef.current = true;
            
            // The actual save operation
            const response = await fetch(`/api/document?id=${documentId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                content: pendingContentRef.current,
                title: title || 'Untitled Document',
                kind: kind || 'text',
              }),
              // Ensure we wait for completion
              cache: 'no-cache',
              credentials: 'same-origin',
            });
            
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unknown error');
              throw new Error(`Failed to save document: ${response.status} - ${errorText}`);
            }
            
            console.log(`Document ${documentId} saved successfully`);
            
            // Update the last saved content reference
            lastSavedContentRef.current = pendingContentRef.current;
            pendingContentRef.current = null;
          } else {
            console.log(`Skipping save - invalid document ID: ${documentId}`);
          }
        } catch (error) {
          console.error('Error saving document:', error);
        } finally {
          setIsSaving(false);
          saveInProgressRef.current = false;
          timeoutRef.current = null;
        }
      }, delay);
    },
    [delay]
  );

  /**
   * Immediately save the document without debouncing
   */
  const saveImmediately = useCallback(
    async (content: string, documentId: string, title?: string, kind?: string) => {
      if (documentId && documentId !== 'init' && content !== lastSavedContentRef.current) {
        // Don't save if another save is already in progress
        if (saveInProgressRef.current) {
          console.log('Skipping immediate save - another save is already in progress');
          return;
        }

        try {
          console.log(`Saving document ${documentId} immediately (${content.length} chars)`);
          setIsSaving(true);
          saveInProgressRef.current = true;
          
          // The actual save operation
          const response = await fetch(`/api/document?id=${documentId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              content,
              title: title || 'Untitled Document',
              kind: kind || 'text',
            }),
            // Ensure we wait for completion
            cache: 'no-cache',
            credentials: 'same-origin',
          });
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Failed to save document immediately: ${response.status} - ${errorText}`);
          }
          
          console.log(`Document ${documentId} saved immediately and successfully`);
          lastSavedContentRef.current = content;
          pendingContentRef.current = null;
          
          // Clear any pending debounced saves
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } catch (error) {
          console.error('Error saving document immediately:', error);
        } finally {
          setIsSaving(false);
          saveInProgressRef.current = false;
        }
      } else {
        console.log(`Skipping immediate save - invalid document ID: ${documentId} or unchanged content`);
      }
    },
    []
  );

  /**
   * Cancel any pending save operations
   */
  const cancelPendingSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      pendingContentRef.current = null;
      setIsSaving(false);
    }
  }, []);

  return {
    debouncedSave,
    saveImmediately,
    cancelPendingSave,
    isSaving
  };
} 