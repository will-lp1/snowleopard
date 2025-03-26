'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import SuggestionOverlay from './suggestion-overlay';
import { useArtifact } from '@/hooks/use-artifact';
import { toast } from 'sonner';

// Define interface for Vue-enhanced elements
interface VueElement extends Element {
  __vue__?: {
    $refs?: {
      editor?: {
        view?: any;
      };
    };
  };
}

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

    // Get the ProseMirror view instance
    const editorView = (document.querySelector('.ProseMirror') as VueElement)?.__vue__?.$refs?.editor?.view;
    if (!editorView) {
      toast.error("Could not find editor instance");
      return;
    }

    const { state, dispatch } = editorView;
    const { tr } = state;
    
    try {
      if (selectedText) {
        // Find the exact position of the selected text in the document
        const docText = state.doc.textContent;
        const startPos = docText.indexOf(selectedText);
        
        if (startPos !== -1) {
          const endPos = startPos + selectedText.length;
          const $start = state.doc.resolve(startPos);
          const $end = state.doc.resolve(endPos);
          
          // Create a text selection
          tr.replaceWith($start.pos, $end.pos, state.schema.text(suggestion));
          dispatch(tr);
          toast.success("Suggestion applied");
        } else {
          toast.error("Could not locate selected text");
        }
      } else {
        // Replace entire node content while preserving formatting
        const node = tr.selection.$from.node();
        if (node) {
          const pos = tr.selection.$from.start();
          const end = tr.selection.$from.end();
          tr.replaceWith(pos, end, state.schema.text(suggestion));
          dispatch(tr);
          toast.success("Document updated with suggestion");
        }
      }
    } catch (error) {
      console.error('Error applying suggestion:', error);
      toast.error("Failed to apply suggestion");
    }
  }, [artifact, selectedText]);

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