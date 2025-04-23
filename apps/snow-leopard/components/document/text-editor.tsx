'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef } from 'react';
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

      editorRef.current = new EditorView(containerRef.current, {
        state,
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (editorRef.current && content && documentId !== 'init') {
      const currentEditorContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );

      if (currentEditorContent !== content && status !== 'streaming') {
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
  }, [content, status, documentId]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          handleTransaction({
            transaction,
            editorRef,
            onSaveContent,
          });
        },
      });
    }
  }, [onSaveContent]);

  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current) return;

      const { originalText, suggestion, documentId: eventDocId } = event.detail;

      if (eventDocId !== documentId) return;

      console.log(`[ProseMirror Editor] Applying suggestion for doc ${documentId}: "${originalText}" -> "${suggestion}"`);

      const view = editorRef.current;
      const { state, dispatch } = view;
      let transaction = state.tr;
      let found = false;

      state.doc.descendants((node, pos) => {
        if (found || !node.isText) return false;

        const text = node.text;
        if (!text) return true;

        const index = text.indexOf(originalText);
        if (index !== -1) {
          const from = pos + index;
          const to = from + originalText.length;
          console.log(`[ProseMirror Editor] Found text at ${from}-${to}. Replacing...`);
          transaction = transaction.replaceWith(from, to, state.schema.text(suggestion));
          found = true;
          return false;
        }
        return true;
      });

      if (found) {
        dispatch(transaction);
        toast.success("Suggestion applied");
      } else {
        console.warn(`[ProseMirror Editor] Could not find text "${originalText}" to apply suggestion.`);
        toast.warning("Could not apply suggestion: Original text not found.");
      }
    };

    window.addEventListener('apply-suggestion-prosemirror', handleApplySuggestion as EventListener);
    return () => window.removeEventListener('apply-suggestion-prosemirror', handleApplySuggestion as EventListener);
  }, [documentId, onSaveContent]);

  useEffect(() => {
    const handleApplyUpdate = (event: CustomEvent) => {
      if (!editorRef.current) return;

      const { documentId: eventDocId, newContent } = event.detail;

      if (eventDocId !== documentId) return;

      console.log(`[ProseMirror Editor] Applying full document update for doc ${documentId}`);

      const view = editorRef.current;
      const { state, dispatch } = view;
      
      try {
        const newDocument = buildDocumentFromContent(newContent); 
        const transaction = state.tr.replaceWith(
          0,
          state.doc.content.size,
          newDocument.content,
        );
        
        dispatch(transaction);
        
        toast.success('Document updated');
      } catch (error) {
        console.error("[ProseMirror Editor] Error building document from new content:", error);
        toast.error("Failed to apply document update: Invalid content format.");
      }
    };

    window.addEventListener('apply-document-update-prosemirror', handleApplyUpdate as EventListener);
    return () => window.removeEventListener('apply-document-update-prosemirror', handleApplyUpdate as EventListener);
  }, [documentId, onSaveContent]);

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