'use client';

import { useState, useRef, useCallback } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import { toast } from 'sonner';

/**
 * A hook that provides debounced document saving functionality
 * 
 * @param delay The delay in milliseconds to wait before saving
 * @returns Object containing the debounced save function and saving status
 */
export function useDebouncedSave(debounceMs = 2000) {
  const [isSaving, setIsSaving] = useState(false);
  const savePromiseRef = useRef<Promise<any> | null>(null);
  const pendingSaveRef = useRef<boolean>(false);
  
  // The actual save function that makes the API call
  const performSave = useCallback(async (
    content: string,
    documentId: string,
    title: string,
    kind: string
  ) => {
    if (documentId === 'init') {
      console.error('[useDebouncedSave] Cannot save document with ID "init"');
      return;
    }
    
    try {
      console.log(`[useDebouncedSave] Saving document ${documentId}`);
      
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: documentId,
          title: title || 'Untitled Document',
          content: content || '',
          kind: kind || 'text'
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save document: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error('[useDebouncedSave] Error saving document:', error);
      throw error;
    }
  }, []);
  
  // The debounced version of the save function
  const debouncedSaveFn = useDebounceCallback(
    async (content: string, documentId: string, title: string, kind: string) => {
      // Use setTimeout to avoid React scheduling issues
      setTimeout(async () => {
        if (pendingSaveRef.current) {
          return; // Another save is already planned
        }
        
        pendingSaveRef.current = true;
        setIsSaving(true);
        
        try {
          await performSave(content, documentId, title, kind);
        } catch (error) {
          console.error('[useDebouncedSave] Debounced save failed:', error);
          toast.error('Failed to save document');
        } finally {
          pendingSaveRef.current = false;
          setIsSaving(false);
        }
      }, 0);
    },
    debounceMs
  );
  
  // The immediate save function (no debounce)
  const saveImmediately = useCallback(async (
    content: string, 
    documentId: string, 
    title: string, 
    kind: string
  ) => {
    // Use setTimeout to avoid React scheduling issues
    return new Promise<any>((resolve, reject) => {
      setTimeout(async () => {
        setIsSaving(true);
        
        try {
          const result = await performSave(content, documentId, title, kind);
          resolve(result);
        } catch (error) {
          console.error('[useDebouncedSave] Immediate save failed:', error);
          reject(error);
        } finally {
          setIsSaving(false);
        }
      }, 0);
    });
  }, [performSave]);
  
  return {
    debouncedSave: debouncedSaveFn,
    saveImmediately,
    isSaving
  };
} 