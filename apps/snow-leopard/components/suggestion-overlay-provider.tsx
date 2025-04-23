'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import SuggestionOverlay from './suggestion-overlay';
import { useArtifact } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { getActiveEditorView } from '@/lib/editor/editor-state';

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
    from?: number;
    to?: number;
  }) => void;
  closeSuggestionOverlay: () => void;
}

const SuggestionOverlayContext = createContext<SuggestionOverlayContextType | null>(null);

export function SuggestionOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const { artifact } = useArtifact();

  const openSuggestionOverlay = useCallback(
    ({
      selectedText,
      position,
      from,
      to,
    }: {
      selectedText?: string;
      position?: { x: number; y: number };
      from?: number;
      to?: number;
    }) => {
      if (selectedText) {
        setSelectedText(selectedText);
      } else {
        setSelectedText('');
      }

      if (typeof from === 'number' && typeof to === 'number') {
        setSelectionRange({ from, to });
      } else {
        setSelectionRange(null);
      }

      if (position) {
        setPosition(position);
      } else {
        setPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 3 });
      }

      setIsOpen(true);
    },
    []
  );

  const closeSuggestionOverlay = useCallback(() => {
    setIsOpen(false);
    setSelectedText('');
    setSelectionRange(null);
  }, []);

  const handleAcceptSuggestion = useCallback((suggestion: string) => {
    if (!artifact.documentId || artifact.documentId === 'init') {
      toast.error("Cannot apply suggestion: No document loaded.");
      return;
    }

    if (selectedText && selectedText.trim() !== '' && selectionRange) {
      console.log(`[Provider] Dispatching apply-suggestion event for range [${selectionRange.from}, ${selectionRange.to}]`);
      const event = new CustomEvent('apply-suggestion', {
        detail: {
          from: selectionRange.from,
          to: selectionRange.to,
          suggestion: suggestion,
          documentId: artifact.documentId,
          originalText: selectedText,
        }
      });
      window.dispatchEvent(event);
      closeSuggestionOverlay();
    } else {
      if (!selectionRange) {
        toast.warning("Cannot apply suggestion: Text range not captured.");
      } else {
        toast.warning("Cannot apply suggestion: No text was selected.");
      }
    }
  }, [artifact.documentId, selectedText, selectionRange, closeSuggestionOverlay]);

  // Setup global keyboard shortcut for cmd+k
  useEffect(() => {
    const handleCommandK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();

        const activeEditorView = getActiveEditorView();

        if (activeEditorView && activeEditorView.state) {
          const { state } = activeEditorView;
          const { from, to, empty } = state.selection;

          if (!empty) {
            const text = state.doc.textBetween(from, to, ' \n\n ');
            let pos = { x: 100, y: 100 };
            const domSelection = window.getSelection();
            const range = domSelection?.getRangeAt(0);
            if (range) {
              const rect = range.getBoundingClientRect();
              pos = { x: rect.left, y: rect.bottom + 10 }; 
            }

            console.log(`[Provider] Opening overlay via Cmd+K from editor state. Range: [${from}, ${to}]`);
            openSuggestionOverlay({
              position: pos,
              selectedText: text,
              from,
              to,
            });
          } else {
            toast.info("Select text in the editor before pressing Cmd+K.");
          }
        } else {
          console.warn('[Provider] Cmd+K pressed, but no active editor view found.');
          toast.error("Cannot open suggestion overlay: Editor not active.");
        }
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