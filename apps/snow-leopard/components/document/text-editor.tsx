'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

import {
  documentSchema,
  handleTransaction,
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

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  documentId: string;
};

function PureEditor({
  content,
  onSaveContent,
  status,
  isCurrentVersion,
  currentVersionIndex,
  documentId,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  
  // --- Removed Inline Suggestion State --- 
  // const [inlineSuggestion, setInlineSuggestion] = useState<string>('');
  // const [isSuggestionLoading, setIsSuggestionLoading] = useState<boolean>(false);
  // const suggestionSpanRef = useRef<HTMLSpanElement | null>(null); // For the visual display
  const abortControllerRef = useRef<AbortController | null>(null); 
  const { suggestionLength, customInstructions } = useAiOptions(); 
  
  // --- Removed Span Creation/Removal Effect --- 
  // useEffect(() => { ... }, []);

  // --- Removed updateSuggestionPosition --- 
  // const updateSuggestionPosition = useCallback(() => { ... }, [inlineSuggestion]);

  // --- Removed React State Clear/Accept Functions --- 
  // const clearInlineSuggestion = useCallback(() => { ... }, []);
  // const acceptInlineSuggestion = useCallback(() => { ... }, [...]);

  // --- Request Suggestion (Modified) --- 
  // This function is now passed as a callback to the plugin
  // It gets the state *at the time of request* from the plugin
  const requestInlineSuggestionCallback = useCallback(async (state: EditorState) => {
    const editor = editorRef.current;
    // Check isLoading via plugin state if needed, though plugin prevents calling if already loading
    // const pluginState = editor ? inlineSuggestionPluginKey.getState(editor.state) : null;
    // if (!editor || pluginState?.isLoading) return;
    if (!editor) return;

    // Abort previous request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Note: isLoading state is now managed by the plugin via START_SUGGESTION_LOADING meta

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
        // If not enough context, dispatch clear action to reset loading state
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
      let receivedAnyData = false; // Track if we got any delta

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
                receivedAnyData = true; // Mark that we received suggestion data
                // Dispatch meta action to update plugin state with new text
                if (editorRef.current) {
                   editorRef.current.dispatch(
                       editorRef.current.state.tr.setMeta(SET_SUGGESTION, { text: accumulatedSuggestion })
                   );
                }
              } else if (data.type === 'error') {
                throw new Error(data.content);
              } else if (data.type === 'finish') {
                 // No explicit action needed on finish, plugin handles isLoading state
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
         
         // Optional: If no suggestion data was received at all, clear immediately?
         // if (!receivedAnyData) {
         //    editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
         // }
      } else if (controller.signal.aborted) {
         console.log('[Editor Component] Suggestion request aborted.');
         // Ensure loading state is cleared if aborted during fetch
         if (editorRef.current) {
             editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
         }
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[Editor Component] Error fetching inline suggestion:', error);
        toast.error(`Suggestion error: ${error.message}`);
        // Dispatch clear action on error
        if (editorRef.current) {
           editorRef.current.dispatch(editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true));
        }
      }
    } finally {
      // isLoading state is managed by the plugin
      if (abortControllerRef.current === controller) {
         abortControllerRef.current = null; 
      }
    }
  // Dependencies now include AI options from hook
  }, [editorRef, documentId, suggestionLength, customInstructions]);

  useEffect(() => {
    let view: EditorView | null = null; 
    if (containerRef.current && !editorRef.current) {
      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1), headingRule(2), headingRule(3),
              headingRule(4), headingRule(5), headingRule(6),
            ],
          }),
          // Add the inline suggestion plugin instance
          inlineSuggestionPlugin({ requestSuggestion: requestInlineSuggestionCallback })
        ],
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
          
          // Apply the transaction to update the state FIRST
          const newState = editorView.state.apply(transaction);
          editorView.updateState(newState);
          
          // --- Plugin handles suggestion clearing/positioning internally via its apply method --- 
          // Remove explicit suggestion clearing/positioning from here
          // // let suggestionCleared = false;
          // // if (transaction.docChanged || (!transaction.selectionSet || !newState.selection.empty)) {
          // //     if(inlineSuggestion) { ... clearInlineSuggestion(); ... }
          // // }
          // // if (transaction.selectionSet && !suggestionCleared) {
          // //   requestAnimationFrame(updateSuggestionPosition); 
          // // }
          
          // --- Handle Saving (Keep this) --- 
          if (transaction.docChanged && !transaction.getMeta('no-save')) {
            const updatedContent = buildContentFromDocument(newState.doc);
            // Check if the change came from the suggestion plugin accepting
            // We might want immediate save after accepting a suggestion
            // The plugin's handleKeyDown dispatches the insertion transaction,
            // so this dispatchTransaction will run right after.
            const pluginState = inlineSuggestionPluginKey.getState(newState);
            const oldPluginState = inlineSuggestionPluginKey.getState(editorView.state); // State *before* apply
            const justAccepted = oldPluginState?.suggestionText && !pluginState?.suggestionText; // Suggestion existed before, now gone

            if (transaction.getMeta('no-debounce') || justAccepted) {
              onSaveContent(updatedContent, false); // Save immediately
            } else {
              onSaveContent(updatedContent, true); // Debounce other user edits
            }
          }
        },
        // --- Remove Keydown Handling from here (moved to plugin) --- 
        // handleKeyDown: (view, event) => { ... },
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
    // NOTE: we only want to run this effect once
    // eslint-disable-next-line
  }, [requestInlineSuggestionCallback]);

  useEffect(() => {
    if (editorRef.current && content) {
      const currentContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );

      if (status === 'streaming') {
        const newDocument = buildDocumentFromContent(content);

        const transaction = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        );

        transaction.setMeta('no-save', true);
        editorRef.current.dispatch(transaction);
        return;
      }

      if (currentContent !== content) {
        const newDocument = buildDocumentFromContent(content);

        const transaction = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        );

        transaction.setMeta('no-save', true);
        editorRef.current.dispatch(transaction);
      }
    }
  }, [content, status]);

  // --- Event Listener for Apply Suggestion --- 
  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const editorView = editorRef.current;
      const { state, dispatch } = editorView;

      // Expect from, to, suggestion, documentId from event
      const { from, to, suggestion, documentId: suggestionDocId } = event.detail;

      // Ignore if event is for a different document
      if (suggestionDocId !== documentId) {
        console.warn(`[Editor apply-suggestion] Event ignored: Document ID mismatch. Expected ${documentId}, got ${suggestionDocId}.`);
        return;
      }

      // --- Validate Range --- 
      // Check if from/to are valid numbers and within current doc bounds
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
      // Optional: Check if the text currently at from/to roughly matches originalText?
      // const currentTextInRange = state.doc.textBetween(from, to, ' ');
      // if (currentTextInRange !== originalText) { ... warn ... }

      console.log(`[Editor apply-suggestion] Event received for doc: ${documentId}`);
      console.log(`[Editor apply-suggestion] Applying suggestion "${suggestion}" at range [${from}, ${to}]`);

      try {
        // Use the provided range directly
        const transaction = state.tr.replaceWith(from, to, state.schema.text(suggestion));
        
        dispatch(transaction);
        
        // Trigger save immediately after applying suggestion
        const updatedContent = buildContentFromDocument(editorView.state.doc);
        onSaveContent(updatedContent, false);
        toast.success("Suggestion applied");

      } catch (error) {
        console.error(`[Editor apply-suggestion] Error applying transaction:`, error);
        toast.error("Failed to apply suggestion.");
      }
    };

    window.addEventListener('apply-suggestion', handleApplySuggestion as EventListener);
    return () => window.removeEventListener('apply-suggestion', handleApplySuggestion as EventListener);
  }, [documentId, onSaveContent]);

  // --- Event Listener for Apply Document Update --- 
  useEffect(() => {
    const handleApplyUpdate = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const editorView = editorRef.current;
      const { state, dispatch } = editorView;

      const { documentId: updateDocId, newContent } = event.detail;

      // Ignore if event is for a different document
      if (updateDocId !== documentId) {
        console.warn(`[Editor apply-document-update] Event ignored: Document ID mismatch. Expected ${documentId}, got ${updateDocId}.`);
        return;
      }

      console.log(`[Editor apply-document-update] Event received for doc: ${documentId}. Replacing entire content.`);

      try {
        // Build a new document node from the incoming content string
        const newDocumentNode = buildDocumentFromContent(newContent);
        // Create a transaction to replace the entire document content
        const transaction = state.tr.replaceWith(0, state.doc.content.size, newDocumentNode.content);

        dispatch(transaction);
        
        // Trigger save immediately after applying the full update
        const updatedContent = buildContentFromDocument(editorView.state.doc); // Get content from the *new* state
        onSaveContent(updatedContent, false);
        toast.success("Document updated");

      } catch (error) {
          console.error('[Editor apply-document-update] Error processing update:', error);
          toast.error('Failed to apply document update.');
      }
    };

    window.addEventListener('apply-document-update', handleApplyUpdate as EventListener);
    return () => window.removeEventListener('apply-document-update', handleApplyUpdate as EventListener);
  }, [documentId, onSaveContent]); // Depend on documentId and onSaveContent

  return (
    <>
      <div className="relative prose dark:prose-invert" ref={containerRef} />
      {/* Add CSS for the inline decoration pseudo-element */}
      <style jsx global>{`
        /* Style for the widget decoration span itself */
        .suggestion-decoration-inline {
          /* Make the container itself have no layout impact */
          display: contents;
        }
        /* Style for the pseudo-element showing the suggestion text */
        .suggestion-decoration-inline::after {
          content: attr(data-suggestion); /* Get text from data attribute */
          color: inherit; /* Inherit color from editor text */
          opacity: 0.5;   /* Adjust opacity for ghost effect */
          pointer-events: none;
          user-select: none;
          /* Inherit editor font styles */
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          /* Handle whitespace correctly */
          white-space: pre-wrap; 
          /* Optional: Adjust spacing if needed */
          /* margin-left: 1px; */ /* Avoid margin if possible */
          /* Add vertical-align if needed */
          vertical-align: initial; 
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
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const Editor = memo(PureEditor, areEqual);