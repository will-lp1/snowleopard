'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  documentSchema,
  headingRule,
} from '@/lib/editor/config';
import {
  buildContentFromDocument,
  buildDocumentFromContent,
} from '@/lib/editor/functions';

// Import the new state functions
import { setActiveEditorView } from '@/lib/editor/editor-state';
import { useAiOptions } from '@/hooks/ai-options'; // Import AI options hook

// Import the plugin and related constants
import {
  inlineSuggestionPlugin,
  inlineSuggestionPluginKey,
  START_SUGGESTION_LOADING,
  SET_SUGGESTION,
  CLEAR_SUGGESTION,
  FINISH_SUGGESTION_LOADING
} from '@/lib/editor/inline-suggestion-plugin';

// Import the custom placeholder plugin
import { placeholderPlugin } from '@/lib/editor/placeholder-plugin';

// Import the NEW save plugin
import { savePlugin, savePluginKey, setSaveStatus, type SaveState, type SaveStatus } from '@/lib/editor/save-plugin';

type EditorProps = {
  content: string;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  documentId: string;
  initialLastSaved: Date | null;
  onStatusChange?: (status: SaveState) => void;
};

function PureEditor({
  content,
  status,
  isCurrentVersion,
  currentVersionIndex,
  documentId,
  initialLastSaved,
  onStatusChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null); 
  const { suggestionLength, customInstructions } = useAiOptions(); 
  const savePromiseRef = useRef<Promise<Partial<SaveState> | void> | null>(null);

  // Define the save function using useCallback
  const performSave = useCallback(async (contentToSave: string): Promise<{ updatedAt: string | Date } | null> => {
    // Do not save if documentId is invalid or still 'init'
    if (!documentId || documentId === 'init' || documentId === 'undefined' || documentId === 'null') {
      console.warn('[Editor Save Callback] Attempted to save with invalid or init documentId:', documentId);
      // Returning null or throwing an error signals the plugin that save didn't happen/failed
      // Throwing might be better for explicit error handling in the dispatchTransaction catch block.
      throw new Error('Cannot save with invalid or initial document ID.');
    }

    console.log(`[Editor Save Callback] Saving document ${documentId}...`);
    try {
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: documentId,
          content: contentToSave,
          // Maybe fetch title/kind from parent/context if needed, or let API handle defaults
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
        console.error(`[Editor Save Callback] Save failed: ${response.status}`, errorData);
        throw new Error(`API Error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log(`[Editor Save Callback] Save successful for ${documentId}. UpdatedAt:`, result.updatedAt);
      // Ensure we return an object with updatedAt for the plugin's success path
      return { updatedAt: result.updatedAt || new Date().toISOString() }; 
    } catch (error) {
      console.error(`[Editor Save Callback] Error during save for ${documentId}:`, error);
      // Re-throw the error so the catch block in dispatchTransaction can handle it
      throw error;
    }
  }, [documentId]); // Dependency: documentId

  const requestInlineSuggestionCallback = useCallback(async (state: EditorState) => {
    const editor = editorRef.current;
    if (!editor) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { selection } = state;
      const { head } = selection; 

      const $head = state.doc.resolve(head);
      const startOfNode = $head.start();
      const contextBefore = state.doc.textBetween(startOfNode, head, '\n');
      const endOfNode = $head.end();
      const contextAfter = state.doc.textBetween(head, endOfNode, '\n');
      const fullContent = state.doc.textContent;

      if (contextBefore.length < 3) {
        if (editorRef.current) {
           editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
        }
        return;
      }

      console.log('[Editor Component] Requesting inline suggestion via plugin callback...');
      const response = await fetch('/api/inline-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          currentContent: contextBefore,
          contextAfter,
          fullContent,
          nodeType: 'paragraph', 
          aiOptions: { 
            suggestionLength,
            customInstructions,
          }
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedSuggestion = '';
      let receivedAnyData = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(5));
              if (data.type === 'suggestion-delta') {
                accumulatedSuggestion += data.content;
                receivedAnyData = true;
                if (editorRef.current) {
                   editorRef.current.dispatch(
                       editorRef.current.state.tr.setMeta(SET_SUGGESTION, { text: accumulatedSuggestion })
                   );
                }
              } else if (data.type === 'error') {
                throw new Error(data.content);
              } else if (data.type === 'finish') {
                break; 
              }
            } catch (err) {
              console.warn('Error parsing SSE line:', line, err);
            }
          }
        }
      }
      if (!controller.signal.aborted && editorRef.current) {
         console.log('[Editor Component] Stream finished, dispatching FINISH_SUGGESTION_LOADING');
         editorRef.current.dispatch(editorRef.current.state.tr.setMeta(FINISH_SUGGESTION_LOADING, true));
      } else if (controller.signal.aborted) {
         console.log('[Editor Component] Suggestion request aborted.');
         if (editorRef.current) {
             editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
         }
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[Editor Component] Error fetching inline suggestion:', error);
        toast.error(`Suggestion error: ${error.message}`);
        if (editorRef.current) {
           editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
        }
      }
    } finally {
      if (abortControllerRef.current === controller) {
         abortControllerRef.current = null; 
      }
    }
  }, [editorRef, documentId, suggestionLength, customInstructions]);

  useEffect(() => {
    let view: EditorView | null = null; 
    if (containerRef.current && !editorRef.current) {
      const plugins = [
        placeholderPlugin('Start typing...'),
        ...exampleSetup({ schema: documentSchema, menuBar: false }),
        inputRules({
          rules: [
            headingRule(1), headingRule(2), headingRule(3),
            headingRule(4), headingRule(5), headingRule(6),
          ],
        }),
        inlineSuggestionPlugin({ requestSuggestion: requestInlineSuggestionCallback }),
        // Add the save plugin instance here
        savePlugin({
          saveFunction: performSave, // Pass the memoized save function
          initialLastSaved: initialLastSaved,
          debounceMs: 1500, // Or adjust as needed
        })
      ];
      
      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: plugins,
      });
      
      view = new EditorView(containerRef.current, {
        state,
        handleDOMEvents: {
          focus: (view) => {
            console.log('[Editor] Focus event');
            setActiveEditorView(view);
            return false;
          },
          blur: (view) => {
            console.log('[Editor] Blur event');
            return false;
          }
        },
        dispatchTransaction: (transaction: Transaction) => {
          if (!editorRef.current) return;
          const editorView = editorRef.current;
          
          const newState = editorView.state.apply(transaction);
          editorView.updateState(newState);
          
          // --- Save Plugin Status Handling --- 
          const newSaveState = savePluginKey.getState(newState);
          const oldSaveState = savePluginKey.getState(editorView.state);

          // Notify parent if save state changed
          if (newSaveState && newSaveState !== oldSaveState) {
            onStatusChange?.(newSaveState);
          }

          // Check if the plugin's debounce timer has finished and we should trigger a save
          // The plugin itself sets the status to 'debouncing'. We trigger the actual save here.
          if (oldSaveState?.status === 'debouncing' && newSaveState?.status === 'debouncing' && newSaveState.isDirty && !savePromiseRef.current) {
              console.log('[Editor Dispatch] Debounce finished, initiating save...');
              
              // Update status to 'saving' via meta transaction
              setSaveStatus(editorView, { status: 'saving', isDirty: false }); // isDirty becomes false once saving starts
              onStatusChange?.(savePluginKey.getState(editorView.state)!); // Notify parent immediately

              const contentToSave = buildContentFromDocument(newState.doc);
              
              // Call the actual save function (passed in via props eventually, or defined here)
              savePromiseRef.current = performSave(contentToSave)
                .then((result: { updatedAt: string | Date } | null) => {
                  savePromiseRef.current = null; // Clear the promise ref
                  console.log('[Editor Dispatch] Save successful via promise.');
                  const finalState: Partial<SaveState> = { 
                      status: 'saved', 
                      lastSaved: result?.updatedAt ? new Date(result.updatedAt) : new Date(), // Use updatedAt from result
                      errorMessage: null,
                      isDirty: false // Not dirty after successful save
                  };
                  setSaveStatus(editorView, finalState);
                  onStatusChange?.(savePluginKey.getState(editorView.state)!); // Notify parent
                  // Return value isn't strictly needed here unless chaining promises
                })
                .catch((error: Error) => {
                  savePromiseRef.current = null; // Clear the promise ref
                  console.error('[Editor Dispatch] Save failed via promise:', error);
                  const finalState: Partial<SaveState> = { 
                      status: 'error', 
                      errorMessage: error.message || 'Unknown save error',
                      isDirty: true // Still dirty if save failed
                  };
                  setSaveStatus(editorView, finalState);
                  onStatusChange?.(savePluginKey.getState(editorView.state)!); // Notify parent
                  // Consider re-throwing or handling the error further if needed
                });
          }
          
        },
      });

      editorRef.current = view;
      setActiveEditorView(view);
    }

    return () => {
      if (editorRef.current) {
        setActiveEditorView(null);
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [requestInlineSuggestionCallback, onStatusChange]);

  // Handle external content updates (e.g., from version switching or initial load)
  useEffect(() => {
    if (editorRef.current) {
      const editorView = editorRef.current;
      const currentDoc = editorView.state.doc;
      const currentContent = buildContentFromDocument(currentDoc);

      // Only apply update if the incoming content is different
      if (content !== currentContent) {
        // Check the save plugin state
        const saveState = savePluginKey.getState(editorView.state);
        
        // If the editor has unsaved changes, log and skip the external update
        if (saveState?.isDirty) {
          console.warn('[Editor] External content update received, but editor is dirty. Ignoring update.');
          return; 
        }

        // Apply the external update if the editor is not dirty
        console.log('[Editor] Applying external content update.');
        const newDocument = buildDocumentFromContent(content);
        const transaction = editorView.state.tr.replaceWith(
            0,
            currentDoc.content.size,
            newDocument.content
        );
        // Mark the transaction as external to prevent triggering the save plugin's dirty state
        transaction.setMeta('external', true); 
        transaction.setMeta('addToHistory', false); // Prevent this state change from being undoable
        editorView.dispatch(transaction);
      }
    }
  // Run this effect when the external content prop changes, or status changes (e.g., streaming)
  // Also re-run if the editor instance is created (editorRef.current changes)
  }, [content, status, editorRef]); // Removed the setTimeout logic

  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const editorView = editorRef.current;
      const { state, dispatch } = editorView;

      const { from, to, suggestion, documentId: suggestionDocId } = event.detail;

      if (suggestionDocId !== documentId) {
        console.warn(`[Editor apply-suggestion] Event ignored: Document ID mismatch. Expected ${documentId}, got ${suggestionDocId}.`);
        return;
      }

      if (
        typeof from !== 'number' || 
        typeof to !== 'number' || 
        from < 0 || 
        to > state.doc.content.size || 
        from > to
      ) {
        console.error(`[Editor apply-suggestion] Invalid range received: [${from}, ${to}]. Document size: ${state.doc.content.size}`);
        toast.error("Cannot apply suggestion: Invalid text range.");
        return;
      }

      console.log(`[Editor apply-suggestion] Event received for doc: ${documentId}`);
      console.log(`[Editor apply-suggestion] Applying suggestion "${suggestion}" at range [${from}, ${to}]`);

      try {
        const transaction = state.tr.replaceWith(from, to, state.schema.text(suggestion));
        
        dispatch(transaction);
        
        toast.success("Suggestion applied");

      } catch (error) {
        console.error(`[Editor apply-suggestion] Error applying transaction:`, error);
        toast.error("Failed to apply suggestion.");
      }
    };

    window.addEventListener('apply-suggestion', handleApplySuggestion as EventListener);
    return () => window.removeEventListener('apply-suggestion', handleApplySuggestion as EventListener);
  }, [documentId]); // Removed onStatusChange dependency

  useEffect(() => {
    const handleApplyUpdate = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const editorView = editorRef.current;
      const { state, dispatch } = editorView;

      const { documentId: updateDocId, newContent } = event.detail;

      if (updateDocId !== documentId) {
        console.warn(`[Editor apply-document-update] Event ignored: Document ID mismatch. Expected ${documentId}, got ${updateDocId}.`);
        return;
      }

      console.log(`[Editor apply-document-update] Event received for doc: ${documentId}. Replacing entire content.`);

      try {
        const newDocumentNode = buildDocumentFromContent(newContent);
        const transaction = state.tr.replaceWith(0, state.doc.content.size, newDocumentNode.content);

        dispatch(transaction);
        
        toast.success("Document updated");

      } catch (error) {
          console.error('[Editor apply-document-update] Error processing update:', error);
          toast.error('Failed to apply document update.');
      }
    };

    window.addEventListener('apply-document-update', handleApplyUpdate as EventListener);
    return () => window.removeEventListener('apply-document-update', handleApplyUpdate as EventListener);
  }, [documentId]); // Removed onStatusChange dependency

  return (
    <>
      <div className="relative prose dark:prose-invert" ref={containerRef} />
      <style jsx global>{`
        .suggestion-decoration-inline {
          display: contents;
        }
        .suggestion-decoration-inline::after {
          content: attr(data-suggestion);
          color: inherit;
          opacity: 0.5;
          pointer-events: none;
          user-select: none;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          white-space: pre-wrap;
          vertical-align: initial; 
        }

        .ProseMirror .is-placeholder-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          left: 0;
          top: 0;
          color: #adb5bd;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          pointer-events: none;
          user-select: none;
        }

        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }

        div.ProseMirror {
          position: relative;
        }
      `}</style>
    </>
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.documentId === nextProps.documentId &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.initialLastSaved === nextProps.initialLastSaved &&
    prevProps.onStatusChange === nextProps.onStatusChange
  );
}

export const Editor = memo(PureEditor, areEqual);