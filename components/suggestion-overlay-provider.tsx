'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import SuggestionOverlay from './suggestion-overlay';
import { useArtifact } from '@/hooks/use-artifact';
import { toast } from 'sonner';

interface SuggestionOverlayContextType {
  openSuggestionOverlay: (options: {
    position?: { x: number; y: number };
    selectedText?: string;
  }) => void;
  closeSuggestionOverlay: () => void;
}

const SuggestionOverlayContext = createContext<SuggestionOverlayContextType | null>(null);

export function SuggestionOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const { artifact, setArtifact } = useArtifact();

  const openSuggestionOverlay = useCallback(
    ({ selectedText, position }: { selectedText?: string; position?: { x: number; y: number } }) => {
      if (selectedText) {
        setSelectedText(selectedText);
      } else {
        setSelectedText('');
      }
      
      if (position) {
        setPosition(position);
      }
      
      setIsOpen(true);
    },
    []
  );

  const closeSuggestionOverlay = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleAcceptSuggestion = useCallback((suggestion: string) => {
    if (!artifact.documentId || artifact.documentId === 'init') {
      return;
    }

    // If we have selected text, we replace that portion
    // Otherwise replace the entire content
    if (selectedText) {
      const newContent = artifact.content.replace(selectedText, suggestion);
      setArtifact({
        ...artifact,
        content: newContent
      });
      toast.success("Suggestion applied");
    } else {
      setArtifact({
        ...artifact,
        content: suggestion
      });
      toast.success("Document updated with suggestion");
    }
  }, [artifact, selectedText, setArtifact]);

  // Setup global keyboard shortcut for cmd+k
  useEffect(() => {
    const handleCommandK = (e: KeyboardEvent) => {
      // If command+k (or ctrl+k) is pressed
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        
        // Get selected text if any
        const selection = window.getSelection();
        const selectedText = selection?.toString() || '';
        
        // Find position near the cursor
        const range = selection?.getRangeAt(0);
        let position = { x: 100, y: 100 }; // Default fallback
        
        if (range && selectedText) {
          const rect = range.getBoundingClientRect();
          position = {
            x: rect.right,
            y: rect.bottom + 10
          };
        }
        
        // Open the overlay
        openSuggestionOverlay({ 
          position,
          selectedText 
        });
      }
    };
    
    window.addEventListener('keydown', handleCommandK);
    return () => window.removeEventListener('keydown', handleCommandK);
  }, [openSuggestionOverlay]);

  return (
    <SuggestionOverlayContext.Provider
      value={{
        openSuggestionOverlay,
        closeSuggestionOverlay,
      }}
    >
      {children}
      {artifact.documentId && artifact.documentId !== 'init' && (
        <SuggestionOverlay
          documentId={artifact.documentId}
          isOpen={isOpen}
          onClose={closeSuggestionOverlay}
          selectedText={selectedText}
          position={position}
          onAcceptSuggestion={handleAcceptSuggestion}
        />
      )}
    </SuggestionOverlayContext.Provider>
  );
}

export function useSuggestionOverlay() {
  const context = useContext(SuggestionOverlayContext);
  
  if (!context) {
    throw new Error('useSuggestionOverlay must be used within a SuggestionOverlayProvider');
  }
  
  return context;
} 