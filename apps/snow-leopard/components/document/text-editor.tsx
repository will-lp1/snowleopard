'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
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

  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
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
        ],
      });

      const view = new EditorView(containerRef.current, {
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
        dispatchTransaction: (transaction) => {
          if (!editorRef.current) return;
          handleTransaction({
            transaction,
            editorRef,
            onSaveContent,
          });
        }
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
  }, []);

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
    <div className="relative prose dark:prose-invert" ref={containerRef} />
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