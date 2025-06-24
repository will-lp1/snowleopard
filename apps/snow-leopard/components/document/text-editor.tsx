'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SaveState } from '@/lib/editor/save-plugin';
import { EditorToolbar } from '../editor-toolbar';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { toast } from 'sonner';
import { InlineSuggestion } from '@/lib/editor/inline-suggestion-extension';
import { useAiOptionsValue } from '@/hooks/ai-options';
import { CLEAR_SUGGESTION, FINISH_SUGGESTION_LOADING, SET_SUGGESTION } from '@/lib/editor/inline-suggestion-plugin';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Synonym } from '@/lib/editor/synonym-extension';
import { SelectionContext } from '@/lib/editor/selection-context-extension';
import SuggestionOverlay from '../suggestion-overlay';

import UniqueId from '@tiptap/extension-unique-id';
import Details from '@tiptap/extension-details';
import DetailsSummary from '@tiptap/extension-details-summary';
import DetailsContent from '@tiptap/extension-details-content';
import Emoji from '@tiptap/extension-emoji';
import FileHandler from '@tiptap/extension-file-handler';
import Mathematics from '@tiptap/extension-mathematics';
import TableOfContents from '@tiptap/extension-table-of-contents';
import 'katex/dist/katex.min.css';
import { generateUUID } from '@/lib/utils';
import { GripVertical } from 'lucide-react';
import {
  ACTIVATE_SUGGESTION_CONTEXT,
  DEACTIVATE_SUGGESTION_CONTEXT,
  SET_SUGGESTION_LOADING_STATE
} from '@/lib/editor/selection-context-plugin';
import DragHandle from '@tiptap/extension-drag-handle'
import { Insertion, Deletion } from '@/lib/editor/diff-extension';
import { diffEditor } from '@/lib/editor/diff.js';
import { generateJSON } from '@tiptap/html';
import { Markdown } from 'tiptap-markdown';
import { renderToString } from 'react-dom/server';
import { Markdown as MarkdownComponent } from '@/components/markdown';
import { setActiveEditorView, getActiveEditorView } from '@/lib/editor/editor-state';

type EditorProps = {
  content: string;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  documentId: string;
  initialLastSaved: Date | null;
  onStatusChange?: (status: SaveState) => void;
  onCreateDocumentRequest?: (initialContent: string) => void;
};

const TiptapEditor = ({
    content,
    isCurrentVersion,
    documentId,
    initialLastSaved,
    onStatusChange,
    onCreateDocumentRequest,
}: EditorProps) => {
    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
    const [saveStatus, setSaveStatus] = useState<SaveState>({
        status: 'idle',
        lastSaved: initialLastSaved,
        errorMessage: null,
        isDirty: false,
    });
    
    const [isSuggestionOverlayOpen, setSuggestionOverlayOpen] = useState(false);
    const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });
    const [selectedTextForSuggestion, setSelectedTextForSuggestion] = useState('');
    const [suggestionRange, setSuggestionRange] = useState<{from: number, to: number} | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const previewOriginalContentRef = useRef<any | null>(null);
    const { suggestionLength, customInstructions } = useAiOptionsValue();
    const suggestionLengthRef = useRef(suggestionLength);
    const customInstructionsRef = useRef(customInstructions);
    useEffect(() => {
        suggestionLengthRef.current = suggestionLength;
    }, [suggestionLength]);
    useEffect(() => {
        customInstructionsRef.current = customInstructions;
    }, [customInstructions]);

    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSavingRef = useRef(false);

    const performSave = useCallback(async (contentToSave: string) => {
        if (!documentId || documentId === 'init') {
            return;
        }

        isSavingRef.current = true;
        setSaveStatus(prev => ({ ...prev, status: 'saving' }));

        try {
            const response = await fetch(`/api/document`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: documentId, content: contentToSave }),
            });

            if (!response.ok) {
                throw new Error(`Save failed: ${response.statusText}`);
            }

            const result = await response.json();
            const lastSaved = result.updatedAt ? new Date(result.updatedAt) : new Date();
            setSaveStatus({ status: 'saved', lastSaved, errorMessage: null, isDirty: false });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setSaveStatus(prev => ({ ...prev, status: 'error', errorMessage, isDirty: true }));
            toast.error(errorMessage);
        } finally {
            isSavingRef.current = false;
        }
    }, [documentId]);

    const requestInlineSuggestionCallback = useCallback(
    async (state: EditorState, view: EditorView) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const { selection } = state;
        const { head } = selection;

        const $head = state.doc.resolve(head);
        const startOfNode = $head.start();
        const contextBefore = state.doc.textBetween(startOfNode, head, "\n");
        const endOfNode = $head.end();
        const contextAfter = state.doc.textBetween(head, endOfNode, "\n");
        const fullContent = state.doc.textContent;

        if (contextBefore.length < 3) {
          view.dispatch(
            view.state.tr.setMeta(CLEAR_SUGGESTION, true)
          );
          return;
        }

        const response = await fetch("/api/inline-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId,
            currentContent: contextBefore,
            contextAfter,
            fullContent,
            nodeType: "paragraph",
            aiOptions: {
              suggestionLength: suggestionLengthRef.current,
              customInstructions: customInstructionsRef.current,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedSuggestion = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(5));
                if (data.type === "suggestion-delta") {
                  accumulatedSuggestion += data.content;
                  view.dispatch(
                    view.state.tr.setMeta(SET_SUGGESTION, {
                      text: accumulatedSuggestion,
                    })
                  );
                } else if (data.type === "error") {
                  throw new Error(data.content);
                }
              } catch (err) {
                console.warn("Error parsing SSE line:", line, err);
              }
            }
          }
        }
        if (!controller.signal.aborted) {
          view.dispatch(
            view.state.tr.setMeta(FINISH_SUGGESTION_LOADING, true)
          );
        } else if (controller.signal.aborted) {
          view.dispatch(
            view.state.tr.setMeta(CLEAR_SUGGESTION, true)
          );
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          toast.error(`Suggestion error: ${error.message}`);
          view.dispatch(
            view.state.tr.setMeta(CLEAR_SUGGESTION, true)
          );
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [documentId]
  );

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3, 4],
                },
                history: false, // We might use a different history extension later
            }),
            Placeholder.configure({
                placeholder: documentId === 'init' ? 'Start typing...' : '',
            }),
            Link.configure({
                openOnClick: false,
            }),
            InlineSuggestion.configure({
                requestSuggestion: requestInlineSuggestionCallback,
            }),
            Synonym,
            SelectionContext,
            Details.configure({
                HTMLAttributes: {
                    class: 'details',
                },
            }),
            DetailsSummary,
            DetailsContent,
            Emoji,
            FileHandler,
            Mathematics,
            TableOfContents,
            UniqueId.configure({
                types: ['heading', 'paragraph', 'listItem', 'details', 'math-block'],
                generateID: () => `id-${generateUUID()}`,
            }),
            DragHandle,
            Insertion,
            Deletion,
            Markdown,
        ],
        content: content,
        editable: isCurrentVersion,
        editorProps: {
            attributes: {
                class: 'prose dark:prose-invert focus:outline-none max-w-full',
            },
        },
        onSelectionUpdate({ editor }) {
            setActiveFormats({
                h1: editor.isActive('heading', { level: 1 }),
                h2: editor.isActive('heading', { level: 2 }),
                p: editor.isActive('paragraph'),
                bulletList: editor.isActive('bulletList'),
                orderedList: editor.isActive('orderedList'),
                bold: editor.isActive('bold'),
                italic: editor.isActive('italic'),
            });
        },
        onUpdate({ editor }) {
            if (isSavingRef.current) return;
            
            const textContent = editor.getText();

            if (documentId === 'init' && textContent.trim().length > 0 && onCreateDocumentRequest) {
                 onCreateDocumentRequest(editor.getHTML());
                 setSaveStatus(prev => ({ ...prev, status: 'saving' }));
                 return;
            }

            setSaveStatus(prev => ({ ...prev, status: 'debouncing', isDirty: true }));

            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }

            debounceTimeoutRef.current = setTimeout(() => {
                if(editor) {
                    performSave(editor.storage.markdown.getMarkdown());
                }
            }, 1500);
        }
    });

    const handleAcceptSuggestion = useCallback((suggestionToAccept: string) => {
        if (!editor || !suggestionRange) return;
        const { from, to } = suggestionRange;
    
        // Use the accepted suggestion passed from the overlay
        editor.chain().focus().deleteRange({ from, to }).insertContent(suggestionToAccept).run();
        setSuggestionOverlayOpen(false);
        editor.view.dispatch(editor.state.tr.setMeta(DEACTIVATE_SUGGESTION_CONTEXT, true));
        setSuggestionRange(null);
    }, [editor, suggestionRange]);

    const closeSuggestionOverlay = useCallback(() => {
        setSuggestionOverlayOpen(false);
        setSuggestionRange(null);
        if (editor) {
            editor.view.dispatch(editor.state.tr.setMeta(DEACTIVATE_SUGGESTION_CONTEXT, true));
        }
    }, [editor]);

    useEffect(() => {
        const handleStreamText = (event: CustomEvent) => {
            if (!editor || !event.detail) return;
            const { documentId: streamDocId, content } = event.detail;
            if (streamDocId !== documentId) return;
    
            editor.commands.insertContent(content);
        };

        const handleForceSave = (event: CustomEvent) => {
            if (!editor || !event.detail) return;
            const { documentId: saveDocId } = event.detail;
            if (saveDocId !== documentId) return;

            performSave(editor.getHTML());
        };

        const handleCreationStreamFinished = (event: CustomEvent) => {
            if (!editor || !event.detail) return;
            const { documentId: finishedDocId } = event.detail;
            if (finishedDocId !== documentId) return;

            // Trigger a save to ensure the full content is persisted
            performSave(editor.getHTML());
        };

        window.addEventListener('editor:stream-text', handleStreamText as EventListener);
        window.addEventListener('editor:force-save-document', handleForceSave as EventListener);
        window.addEventListener('editor:creation-stream-finished', handleCreationStreamFinished as EventListener);

        return () => {
            window.removeEventListener('editor:stream-text', handleStreamText as EventListener);
            window.removeEventListener('editor:force-save-document', handleForceSave as EventListener);
            window.removeEventListener('editor:creation-stream-finished', handleCreationStreamFinished as EventListener);
        };
    }, [editor, documentId, performSave]);

    useEffect(() => {
        if (!editor) return;

        const handlePreviewUpdate = (event: CustomEvent) => {
            const { documentId: previewDocId, newContent } = event.detail;
            if (previewDocId !== documentId) return;

            if (!previewOriginalContentRef.current) {
                previewOriginalContentRef.current = editor.getJSON();
            }

            const oldJSON = previewOriginalContentRef.current;
            const newHtml = renderToString(<MarkdownComponent>{newContent}</MarkdownComponent>);
            const newJSON = generateJSON(newHtml, editor.options.extensions);
            
            console.log("Old JSON:", oldJSON);
            console.log("New content:", newContent);
            console.log("New JSON:", newJSON);
            const diffedDoc = diffEditor(editor.schema, oldJSON, newJSON);
            console.log("Diffed Doc:", diffedDoc);
            
            editor.commands.setContent(diffedDoc, false);
        };
    
        const handleCancelPreview = (event: CustomEvent) => {
            const { documentId: cancelDocId } = event.detail;
            if (cancelDocId !== documentId || !previewOriginalContentRef.current) return;
    
            editor.commands.setContent(previewOriginalContentRef.current, false);
            previewOriginalContentRef.current = null;
        };
    
        const handleApplyUpdate = (event: CustomEvent) => {
            const { documentId: applyDocId, newContent } = event.detail;
            if (applyDocId !== documentId) return;
    
            editor.commands.setContent(newContent, true);
            previewOriginalContentRef.current = null;
        };

        window.addEventListener('preview-document-update', handlePreviewUpdate as EventListener);
        window.addEventListener('cancel-document-update', handleCancelPreview as EventListener);
        window.addEventListener('apply-document-update', handleApplyUpdate as EventListener);

        return () => {
            window.removeEventListener('preview-document-update', handlePreviewUpdate as EventListener);
            window.removeEventListener('cancel-document-update', handleCancelPreview as EventListener);
            window.removeEventListener('apply-document-update', handleApplyUpdate as EventListener);
        };
    }, [editor, documentId]);

    useEffect(() => {
      const handleApplySuggestion = (event: CustomEvent) => {
        if (!editor || !event.detail) return;
        const { state, dispatch } = editor.view;

        const {
            from,
            to,
            suggestion,
            documentId: suggestionDocId,
        } = event.detail;

        if (suggestionDocId !== documentId) return;
        
        const tr = state.tr.replaceWith(from, to, state.schema.text(suggestion));
        dispatch(tr);
        toast.success("Suggestion applied");
      };

      window.addEventListener("apply-suggestion", handleApplySuggestion as EventListener);
      return () => window.removeEventListener("apply-suggestion", handleApplySuggestion as EventListener);
  }, [documentId, editor]);

    useEffect(() => {
        if (!editor) return;

        setActiveEditorView(editor.view as any);

        return () => {
            const currentView = editor.view as any;
            if (currentView && getActiveEditorView() === currentView) {
                setActiveEditorView(null);
            }
        };
    }, [editor]);

    useEffect(() => {
        if (onStatusChange) {
            onStatusChange(saveStatus);
        }
    }, [saveStatus, onStatusChange]);

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, false, { preserveWhitespace: 'full' });
        }
    }, [content, editor]);

    useEffect(() => {
        if (editor) {
            editor.setEditable(isCurrentVersion);
        }
    }, [isCurrentVersion, editor]);

  return (
    <div className="relative">
        <SuggestionOverlay 
            documentId={documentId}
            isOpen={isSuggestionOverlayOpen}
            onClose={closeSuggestionOverlay}
            onAcceptSuggestion={handleAcceptSuggestion}
            position={overlayPosition}
            selectedText={selectedTextForSuggestion}
        />

        {isCurrentVersion && documentId !== "init" && editor && (
            <EditorToolbar activeFormats={activeFormats} editor={editor} />
        )}
        <EditorContent editor={editor} />
        <style jsx global>{`
            .ProseMirror-drag-handle {
              width: 18px;
              height: 28px;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: grab;
              position: absolute;
              left: -28px;
              top: 2px;
              opacity: 0;
              transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out;
            }
            .ProseMirror [draggable="true"]:hover > .ProseMirror-drag-handle {
                opacity: 1;
            }
            .ProseMirror-drag-handle:hover {
                background-color: rgba(0,0,0,0.05);
            }
            .dark .ProseMirror-drag-handle:hover {
                background-color: rgba(255,255,255,0.05);
            }
            .ProseMirror-drag-handle::before {
                content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>');
                opacity: 0.3;
                transition: opacity 0.2s ease-in-out;
            }
            .ProseMirror-drag-handle:hover::before {
                opacity: 0.6;
            }
            .ProseMirror-dragging .ProseMirror-drag-handle {
                cursor: grabbing;
                opacity: 1;
            }

            .details {
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 0.5rem;
            }
            .details summary {
              font-weight: bold;
              cursor: pointer;
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
            .suggestion-decoration-inline {
              /* Removed display: contents; */
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
            .synonym-word {
              display: inline;
            }
            .synonym-word.synonym-loading {
              position: relative; /* Only add positioning when showing hover overlay */
              display: inline-block; /* Only wrap word for hover overlay */
            }
            .synonym-overlay-menu {
              /* Dark background like the image */
              background: #282c34; /* Dark grey/black */
              color: #fff; /* White text */
              border: none; /* Remove default border */
              padding: 4px;
              border-radius: 4px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              display: flex; /* Arrange buttons horizontally */
              gap: 4px; /* Spacing between buttons */
            }
            .synonym-overlay-menu .synonym-option {
              background: none;
              border: none;
              padding: 2px 6px; /* Adjust padding */
              margin: 0; /* Remove default margin */
              cursor: pointer;
              font: inherit;
              color: inherit; /* Inherit white text color */
              border-radius: 3px; /* Slightly rounded corners */
            }
            .synonym-overlay-menu .synonym-option:hover {
              /* Slightly lighter background on hover */
              background: rgba(255, 255, 255, 0.1);
            }
            /* Loading state overlay */
            .synonym-loading::before {
              content: "";
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(
                100,
                100,
                100,
                0.2
              ); /* Semi-transparent gray overlay */
              border-radius: 2px; /* Optional: slightly rounded corners */
              pointer-events: none; /* Allow clicks/hovers to pass through */
              z-index: 1; /* Ensure it's above the text but below potential popups */
            }
            /* Styles for selection context highlighting */
            .suggestion-context-highlight {
              background-color: rgba(
                255,
                255,
                0,
                0.25
              ); /* Light yellow highlight */
              transition: background-color 0.3s ease-in-out;
            }

            .suggestion-context-loading {
              background-color: rgba(
                255,
                220,
                0,
                0.35
              ); /* Slightly different shade for loading */
              animation: pulse-animation 1.5s infinite ease-in-out;
            }

            @keyframes pulse-animation {
              0% {
                background-color: rgba(255, 220, 0, 0.35);
              }
              50% {
                background-color: rgba(255, 230, 80, 0.5);
              }
              100% {
                background-color: rgba(255, 220, 0, 0.35);
              }
            }

            ins {
                background-color: rgba(0, 255, 0, 0.15);
                text-decoration: none;
            }
            del {
                background-color: rgba(255, 0, 0, 0.15);
                text-decoration: line-through;
            }
        `}</style>
    </div>
  )
}

export default TiptapEditor; 