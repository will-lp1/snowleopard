'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import { AiSuggestionOverlay } from './suggestion-overlay';

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
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [selectedText, setSelectedText] = useState('');

  const openSuggestionOverlay = useCallback(
    ({ position, selectedText }: { position?: { x: number; y: number }; selectedText?: string }) => {
      if (position) {
        setPosition(position);
      }
      
      if (selectedText) {
        setSelectedText(selectedText);
      } else {
        setSelectedText('');
      }
      
      setIsOpen(true);
    },
    []
  );

  const closeSuggestionOverlay = useCallback(() => {
    setIsOpen(false);
  }, []);

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
      <AiSuggestionOverlay
        isOpen={isOpen}
        onClose={closeSuggestionOverlay}
        position={position}
        selectedText={selectedText}
      />
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