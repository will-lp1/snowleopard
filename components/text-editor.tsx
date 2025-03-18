'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, Transaction } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef, useCallback } from 'react';

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
  saveState?: 'idle' | 'saving' | 'error';
  lastSaveError?: string | null;
};

function PureEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  onSuggestionResolve,
  documentId,
  saveState,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const lastContentRef = useRef<string>(content);
  const editorInitializedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentChangedRef = useRef<boolean>(false);

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
  }, [documentId]); // Keep documentId dependency only

  // Update document ID whenever it changes
  useEffect(() => {
    if (editorRef.current && documentId) {
      console.log('[Editor] Updating document ID:', documentId);
      setDocumentId(editorRef.current, documentId);
    }
  }, [documentId]);

  // Reset content changed flag when saving completes
  useEffect(() => {
    if (saveState === 'idle' && contentChangedRef.current) {
      // The save has completed, we can mark content as not needing saving
      contentChangedRef.current = false;
      console.log('[Editor] Save completed, resetting content changed flag');
    }
  }, [saveState]);

  // Configure transaction handling and save logic
  useEffect(() => {
    if (!editorRef.current) return;

    editorRef.current.setProps({
      dispatchTransaction: (transaction) => {
        if (!editorRef.current) return;

        // Apply the transaction to get the new state
        const newState = editorRef.current.state.apply(transaction);
        
        // Update the editor with the new state
        editorRef.current.updateState(newState);
        
        // Only trigger save if this is a content-changing transaction and not marked as no-save
        if (!transaction.getMeta('no-save') && transaction.docChanged) {
          // Get updated content
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
          contentChangedRef.current = true;
          
          // Clear existing timeout to prevent multiple save attempts
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          
          // Only schedule a new save if we're not already in a saving state
          if (saveState !== 'saving') {
            saveTimeoutRef.current = setTimeout(() => {
              if (contentChangedRef.current) {
                console.log(`[Editor] Triggering save for document ID: ${documentId}`);
                onSaveContent(updatedContent, true);
              }
              saveTimeoutRef.current = null;
            }, 1000); // 1 second debounce
          } else {
            console.log('[Editor] Not scheduling save - already saving');
          }
        }
      },
    });
    
    return () => {
      // Cleanup
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [onSaveContent, documentId, saveState]);

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

      console.log('[Editor] Updating content from parent');
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
      contentChangedRef.current = false; // Reset since we just got new content from parent
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Only save if there are unsaved changes and we're not already saving
      if (contentChangedRef.current && editorRef.current && saveState !== 'saving') {
        const finalContent = buildContentFromDocument(editorRef.current.state.doc);
        console.log('[Editor] Saving on unmount');
        onSaveContent(finalContent, false); // immediate save
      }
    };
  }, [onSaveContent, saveState]);

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
    prevProps.documentId === nextProps.documentId &&
    prevProps.saveState === nextProps.saveState
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
