'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef } from 'react';
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
  const lastSaveAttemptRef = useRef<number>(Date.now());
  const consecutiveErrorsRef = useRef<number>(0);

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
          
          // Only trigger save if this isn't a 'no-save' transaction
          if (!transaction.getMeta('no-save')) {
            const updatedContent = buildContentFromDocument(newState.doc);
            
            // Skip if content is essentially the same
            if (Math.abs(updatedContent.length - lastContentRef.current.length) < 5 &&
                (updatedContent === lastContentRef.current || 
                 updatedContent.includes(lastContentRef.current) || 
                 lastContentRef.current.includes(updatedContent))) {
              return;
            }
            
            // Set pending changes flag
            pendingChangesRef.current = true;
            
            // Update reference for future comparisons
            lastContentRef.current = updatedContent;
            
            // Call parent component's onSaveContent to update UI immediately
            onSaveContent(updatedContent, true);
            
            // Debounce the actual save to the server
            if (documentId && documentId !== 'init') {
              try {
                // Check if we're hitting rate limits
                const now = Date.now();
                const timeSinceLastSave = now - lastSaveAttemptRef.current;
                
                // If we've had consecutive errors, increase the delay
                const baseDelay = Math.min(500 * Math.pow(2, consecutiveErrorsRef.current), 10000);
                const minTimeBetweenSaves = Math.max(500, baseDelay);
                
                console.log(`[Editor] Save metrics - Time since last save: ${timeSinceLastSave}ms, Consecutive errors: ${consecutiveErrorsRef.current}, Current delay: ${baseDelay}ms`);
                
                // Clear existing timeout
                if (saveTimeoutRef.current) {
                  clearTimeout(saveTimeoutRef.current);
                  console.log('[Editor] Cleared existing save timeout');
                }
                
                // Create a new timeout for saving
                saveTimeoutRef.current = setTimeout(() => {
                  console.log(`[Editor] Initiating save for document ID: ${documentId} (${updatedContent.length} chars)`);
                  lastSaveAttemptRef.current = Date.now();
                  
                  debouncedSave(updatedContent, documentId)
                    .then(() => {
                      console.log('[Editor] Save completed successfully');
                      consecutiveErrorsRef.current = 0;
                      pendingChangesRef.current = false;
                    })
                    .catch((error) => {
                      console.error('[Editor] Save failed:', error);
                      consecutiveErrorsRef.current++;
                      // Trigger another save attempt with exponential backoff
                      if (consecutiveErrorsRef.current < 5) {
                        console.log(`[Editor] Scheduling retry with ${baseDelay}ms delay`);
                        setTimeout(() => {
                          onSaveContent(updatedContent, true);
                        }, baseDelay);
                      } else {
                        console.error('[Editor] Too many consecutive errors, stopping retry attempts');
                      }
                    });
                  
                  saveTimeoutRef.current = null;
                }, Math.max(0, minTimeBetweenSaves - timeSinceLastSave));
                
                console.log(`[Editor] Scheduled save with ${Math.max(0, minTimeBetweenSaves - timeSinceLastSave)}ms delay`);
              } catch (error) {
                console.error('[Editor] Error in save scheduling:', error);
              }
            } else {
              console.log(`[Editor] Not saving - invalid document ID: ${documentId}`);
            }
          }
        },
      });
    }
    
    return () => {
      // Clean up any pending operations when the component unmounts
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      console.log('[Editor] Cleaning up pending operations');
    };
  }, [onSaveContent, debouncedSave, documentId]);

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

      if (status === 'streaming') {
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
        return;
      }

      if (currentContent !== content) {
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
    }
  }, [content, status]);

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
