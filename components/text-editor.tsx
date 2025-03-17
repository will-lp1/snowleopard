'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, Transaction } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef, useCallback } from 'react';
import { useDebouncedSave } from '@/hooks/use-debounced-save';

import type { Suggestion } from '@/lib/db/schema';
import {
  documentSchema,
  handleTransaction,
  headingRule,
} from '@/lib/editor/config';
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  createDecorations,
} from '@/lib/editor/functions';
import {
  projectWithPositions,
  suggestionsPlugin,
  suggestionsPluginKey,
} from '@/lib/editor/suggestions';
import { inlineSuggestionsPlugin, setDocumentId } from '@/lib/editor/inline-suggestions';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
  onSuggestionResolve: (suggestionId: string, shouldApply: boolean) => void;
  documentId: string;
};

function PureEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  onSuggestionResolve,
  documentId,
}: EditorProps & { documentId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const { debouncedSave, saveImmediately, isSaving } = useDebouncedSave(2500); // 2.5 second debounce
  const lastContentRef = useRef<string>(content);
  const editorInitializedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

  // Initialize editor
  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      console.log('[Editor] Initializing editor with document ID:', documentId);
      
      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1),
              headingRule(2),
              headingRule(3),
              headingRule(4),
              headingRule(5),
              headingRule(6),
            ],
          }),
          suggestionsPlugin,
          inlineSuggestionsPlugin,
        ],
      });

      editorRef.current = new EditorView(containerRef.current, {
        state,
      });

      // Initialize document ID for inline suggestions
      setDocumentId(editorRef.current, documentId);
      editorInitializedRef.current = true;
      lastContentRef.current = content;
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      
      // Clear any pending timers
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [documentId]); // Remove content dependency to avoid reinitialization

  // Update document ID whenever it changes
  useEffect(() => {
    if (editorRef.current && documentId) {
      console.log('Updating document ID:', documentId);
      setDocumentId(editorRef.current, documentId);
    }
  }, [documentId]);

  // Configure transaction handling and save logic
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          if (!editorRef.current) return;

          // Apply the transaction to get the new state
          const newState = editorRef.current.state.apply(transaction);
          
          // Update the editor with the new state
          editorRef.current.updateState(newState);
          
          // Only trigger save if this isn't a 'no-save' transaction and we're not already saving
          if (!transaction.getMeta('no-save') && !isSavingRef.current) {
            const updatedContent = buildContentFromDocument(newState.doc);
            
            // Skip if content is essentially the same
            if (Math.abs(updatedContent.length - lastContentRef.current.length) < 5 &&
                (updatedContent === lastContentRef.current || 
                 updatedContent.includes(lastContentRef.current) || 
                 lastContentRef.current.includes(updatedContent))) {
              return;
            }
            
            // Update reference for future comparisons
            lastContentRef.current = updatedContent;
            
            // Clear existing timeout
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
              console.log('[Editor] Cleared existing save timeout');
            }
            
            // Create a new timeout for saving
            saveTimeoutRef.current = setTimeout(() => {
              if (!isSavingRef.current) {
                console.log(`[Editor] Initiating save for document ID: ${documentId} (${updatedContent.length} chars)`);
                isSavingRef.current = true;
                onSaveContent(updatedContent, true);
                
                // Reset saving state after a timeout in case the save callback fails
                setTimeout(() => {
                  isSavingRef.current = false;
                }, 5000); // Reset after 5 seconds if no response
              }
              saveTimeoutRef.current = null;
            }, 1000); // 1 second debounce
          }
        },
      });
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      isSavingRef.current = false;
    };
  }, [onSaveContent, documentId]);

  // Reset saving state when content changes from parent
  useEffect(() => {
    if (content !== editorRef.current?.state.doc.toString()) {
      isSavingRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      console.log('[Editor] Content updated from parent, resetting save state');
    }
  }, [content]);

  // Handle content updates from parent - only run when editor is already initialized
  useEffect(() => {
    if (editorRef.current && content && editorInitializedRef.current) {
      const currentContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );
      
      // Skip this update if it would cause a loop
      if (currentContent === content) {
        return;
      }

      const newDocument = buildDocumentFromContent(content);
      const transaction = editorRef.current.state.tr
        .replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        )
        .setMeta('no-save', true);
      
      editorRef.current.dispatch(transaction);
      lastContentRef.current = content;
    }
  }, [content]);

  useEffect(() => {
    if (editorRef.current?.state.doc && content) {
      const projectedSuggestions = projectWithPositions(
        editorRef.current.state.doc,
        suggestions.filter(suggestion => !suggestion.isResolved)
      ).filter(
        (suggestion) => suggestion.selectionStart && suggestion.selectionEnd,
      );

      const decorations = createDecorations(
        projectedSuggestions,
        editorRef.current,
        (suggestion) => {
          onSuggestionResolve(suggestion.id, false);
        }
      );

      const transaction = editorRef.current.state.tr;
      transaction.setMeta(suggestionsPluginKey, { decorations });
      editorRef.current.dispatch(transaction);
    }
  }, [suggestions, content, onSuggestionResolve]);

  const handleDocumentChange = useCallback((tr: Transaction) => {
    // Skip save for certain transaction types
    if (tr.getMeta('no-save') || tr.getMeta('loading')) {
      return;
    }

    // Only trigger save if there are actual content changes
    if (!tr.docChanged) {
      return;
    }

    const newContent = editorRef.current?.state.doc.toString() || '';
    console.log('[Editor] Document changed, scheduling save');
    
    // Clear any existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule a new save with debounce
    saveTimeoutRef.current = setTimeout(() => {
      if (onSaveContent && typeof onSaveContent === 'function') {
        console.log('[Editor] Executing debounced save');
        onSaveContent(newContent, true);
      }
    }, 1000); // 1 second debounce
  }, [onSaveContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative prose dark:prose-invert" ref={containerRef}>
      <style jsx global>{`
        .inline-suggestion {
          display: inline-block !important;
          pointer-events: none;
          user-select: none;
          opacity: 0.6;
          color: var(--foreground);
          background: var(--accent);
          border-radius: 4px;
          padding: 1px 4px;
          margin: 0 2px;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          transition: opacity 0.15s ease;
          position: relative;
          z-index: 100;
        }

        .inline-suggestion:hover {
          opacity: 0.8;
        }

        /* Show a subtle indicator that TAB will accept the suggestion */
        .inline-suggestion::before {
          content: '⇥';
          display: inline-block;
          margin-right: 4px;
          font-size: 0.8em;
          opacity: 0.7;
          color: var(--foreground);
        }

        /* Ensure suggestion text doesn't wrap */
        .inline-suggestion span {
          white-space: pre;
        }

        /* Animate suggestion appearance */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 0.6; transform: translateY(0); }
        }

        .inline-suggestion {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent &&
    prevProps.onSuggestionResolve === nextProps.onSuggestionResolve &&
    prevProps.documentId === nextProps.documentId
  );
}

export const Editor = memo(PureEditor, areEqual);

/**
 * Example of how to use the suggestion overlay in another component:
 * 
 * import { useSuggestionOverlay } from '@/components/suggestion-overlay-provider';
 * 
 * function MyTextEditorWrapper() {
 *   const { openSuggestionOverlay } = useSuggestionOverlay();
 *   
 *   // Setup shortcut to open suggestion overlay on text selection
 *   useEffect(() => {
 *     function handleKeyDown(e: KeyboardEvent) {
 *       // Listen for Cmd+K or Ctrl+K
 *       if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
 *         e.preventDefault();
 *         
 *         // Get selected text if any
 *         const selection = window.getSelection();
 *         const selectedText = selection?.toString() || '';
 *         
 *         // Get position near cursor
 *         let position = { x: 100, y: 100 }; // Default
 *         if (selection && selection.rangeCount > 0) {
 *           const range = selection.getRangeAt(0);
 *           const rect = range.getBoundingClientRect();
 *           position = { x: rect.right, y: rect.bottom + 10 };
 *         }
 *         
 *         // Open the suggestion overlay
 *         openSuggestionOverlay({ position, selectedText });
 *       }
 *     }
 *     
 *     window.addEventListener('keydown', handleKeyDown);
 *     return () => window.removeEventListener('keydown', handleKeyDown);
 *   }, [openSuggestionOverlay]);
 *   
 *   return <Editor {...props} />;
 * }
 */
