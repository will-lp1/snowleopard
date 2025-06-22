"use client";

import { exampleSetup } from "prosemirror-example-setup";
import { inputRules } from "prosemirror-inputrules";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React, { memo, useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";

import { documentSchema, headingRule } from "@/lib/editor/config";
import {
  buildContentFromDocument,
  buildDocumentFromContent,
} from "@/lib/editor/functions";

import { setActiveEditorView } from "@/lib/editor/editor-state";
import { useAiOptions, useAiOptionsValue } from "@/hooks/ai-options";

import {
  inlineSuggestionPlugin,
  inlineSuggestionPluginKey,
  START_SUGGESTION_LOADING,
  SET_SUGGESTION,
  CLEAR_SUGGESTION,
  FINISH_SUGGESTION_LOADING,
} from "@/lib/editor/inline-suggestion-plugin";

import { placeholderPlugin } from "@/lib/editor/placeholder-plugin";

import {
  savePlugin,
  savePluginKey,
  setSaveStatus,
  type SaveState,
  type SaveStatus,
} from "@/lib/editor/save-plugin";

import { synonymsPlugin } from "@/lib/editor/synonym-plugin";
import { EditorToolbar } from "@/components/editor-toolbar";
import { creationStreamingPlugin } from "@/lib/editor/creation-streaming-plugin";
import { selectionContextPlugin } from "@/lib/editor/selection-context-plugin";
import { diffEditor } from "@/lib/editor/diff";

const { nodes, marks } = documentSchema;

function isMarkActive(state: EditorState, type: any): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marks());
  } else {
    return state.doc.rangeHasMark(from, to, type);
  }
}

function isBlockActive(
  state: EditorState,
  type: any,
  attrs: Record<string, any> = {}
): boolean {
  const { $from } = state.selection;
  const node = $from.node($from.depth);
  return node?.hasMarkup(type, attrs);
}

function isListActive(state: EditorState, type: any): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === type) {
      return true;
    }
  }
  return false;
}

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

function PureEditor({
  content,
  status,
  isCurrentVersion,
  currentVersionIndex,
  documentId,
  initialLastSaved,
  onStatusChange,
  onCreateDocumentRequest,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const currentDocumentIdRef = useRef(documentId);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>(
    {}
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const savePromiseRef = useRef<Promise<Partial<SaveState> | void> | null>(
    null
  );

  // State refs for update preview handling
  const previewOriginalContentRef = useRef<string | null>(null);
  const previewActiveRef = useRef<boolean>(false);
  const lastPreviewContentRef = useRef<string | null>(null);

  const { suggestionLength, customInstructions } = useAiOptionsValue();
  const suggestionLengthRef = useRef(suggestionLength);
  const customInstructionsRef = useRef(customInstructions);
  useEffect(() => {
    suggestionLengthRef.current = suggestionLength;
  }, [suggestionLength]);
  useEffect(() => {
    customInstructionsRef.current = customInstructions;
  }, [customInstructions]);

  useEffect(() => {
    currentDocumentIdRef.current = documentId;
  }, [documentId]);

  const performSave = useCallback(
    async (
      contentToSave: string
    ): Promise<{ updatedAt: string | Date } | null> => {
      const docId = currentDocumentIdRef.current;
      if (
        !docId ||
        docId === "init" ||
        docId === "undefined" ||
        docId === "null"
      ) {
        console.warn(
          "[Editor Save Callback] Attempted to save with invalid or init documentId:",
          docId
        );
        throw new Error("Cannot save with invalid or initial document ID.");
      }

      try {
        const response = await fetch(`/api/document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: docId,
            content: contentToSave,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown API error" }));
          console.error(
            `[Editor Save Callback] Save failed: ${response.status}`,
            errorData
          );
          throw new Error(
            `API Error: ${errorData.error || response.statusText}`
          );
        }

        const result = await response.json();
        return { updatedAt: result.updatedAt || new Date().toISOString() };
      } catch (error) {
        console.error(
          `[Editor Save Callback] Error during save for ${docId}:`,
          error
        );
        throw error;
      }
    },
    []
  );

  const requestInlineSuggestionCallback = useCallback(
    async (state: EditorState) => {
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
        const contextBefore = state.doc.textBetween(startOfNode, head, "\n");
        const endOfNode = $head.end();
        const contextAfter = state.doc.textBetween(head, endOfNode, "\n");
        const fullContent = state.doc.textContent;

        if (contextBefore.length < 3) {
          if (editorRef.current) {
            editorRef.current.dispatch(
              editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true)
            );
          }
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
        let receivedAnyData = false;

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
                  receivedAnyData = true;
                  if (editorRef.current) {
                    editorRef.current.dispatch(
                      editorRef.current.state.tr.setMeta(SET_SUGGESTION, {
                        text: accumulatedSuggestion,
                      })
                    );
                  }
                } else if (data.type === "error") {
                  throw new Error(data.content);
                } else if (data.type === "finish") {
                  break;
                }
              } catch (err) {
                console.warn("Error parsing SSE line:", line, err);
              }
            }
          }
        }
        if (!controller.signal.aborted && editorRef.current) {
          editorRef.current.dispatch(
            editorRef.current.state.tr.setMeta(FINISH_SUGGESTION_LOADING, true)
          );
        } else if (controller.signal.aborted) {
          if (editorRef.current) {
            editorRef.current.dispatch(
              editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true)
            );
          }
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error(
            "[Editor Component] Error fetching inline suggestion:",
            error
          );
          toast.error(`Suggestion error: ${error.message}`);
          if (editorRef.current) {
            editorRef.current.dispatch(
              editorRef.current.state.tr.setMeta(CLEAR_SUGGESTION, true)
            );
          }
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [editorRef, documentId]
  );

  useEffect(() => {
    let view: EditorView | null = null;
    if (containerRef.current && !editorRef.current) {
      const plugins = [
        creationStreamingPlugin(documentId),
        placeholderPlugin(
          documentId === "init" ? "Start typing" : "Start typing..."
        ),
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
        inlineSuggestionPlugin({
          requestSuggestion: requestInlineSuggestionCallback,
        }),
        selectionContextPlugin(),
        synonymsPlugin(),
        savePlugin({
          saveFunction: performSave,
          initialLastSaved: initialLastSaved,
          debounceMs: 200,
          documentId: documentId,
        }),
      ];

      const initialEditorState = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: plugins,
      });

      view = new EditorView(containerRef.current, {
        state: initialEditorState,
        handleDOMEvents: {
          focus: (view) => {
            setActiveEditorView(view);
            return false;
          },
          blur: () => false,
        },
        dispatchTransaction: (transaction: Transaction) => {
          if (!editorRef.current) return;
          const editorView = editorRef.current;

          const oldEditorState = editorView.state;
          const oldSaveState = savePluginKey.getState(oldEditorState);

          const newState = editorView.state.apply(transaction);

          editorView.updateState(newState);

          setActiveFormats({
            h1: isBlockActive(newState, nodes.heading, { level: 1 }),
            h2: isBlockActive(newState, nodes.heading, { level: 2 }),
            p: isBlockActive(newState, nodes.paragraph),
            bulletList: isListActive(newState, nodes.bullet_list),
            orderedList: isListActive(newState, nodes.ordered_list),
            bold: isMarkActive(newState, marks.strong),
            italic: isMarkActive(newState, marks.em),
          });

          const newSaveState = savePluginKey.getState(newState);

          if (onStatusChange && newSaveState && newSaveState !== oldSaveState) {
            onStatusChange(newSaveState);
          }

          if (
            newSaveState?.createDocument &&
            newSaveState.initialContent &&
            onCreateDocumentRequest
          ) {
            setTimeout(() => {
              if (editorView) {
                setSaveStatus(editorView, { createDocument: false });
              }
            }, 0);
          }
        },
      });

      editorRef.current = view;
      setActiveEditorView(view);

      const initialSaveState = savePluginKey.getState(view.state);
      if (onStatusChange && initialSaveState) {
        onStatusChange(initialSaveState);
      }

      setActiveFormats({
        h1: isBlockActive(initialEditorState, nodes.heading, { level: 1 }),
        h2: isBlockActive(initialEditorState, nodes.heading, { level: 2 }),
        p: isBlockActive(initialEditorState, nodes.paragraph),
        bulletList: isListActive(initialEditorState, nodes.bullet_list),
        orderedList: isListActive(initialEditorState, nodes.ordered_list),
        bold: isMarkActive(initialEditorState, marks.strong),
        italic: isMarkActive(initialEditorState, marks.em),
      });
    } else if (editorRef.current) {
      const currentView = editorRef.current;
      const currentDocId = currentDocumentIdRef.current;

      if (documentId !== currentDocId) {
        // Re-create plugins with the new documentId to ensure save plugin has correct doc ID
        const newPlugins = [
          creationStreamingPlugin(documentId),
          placeholderPlugin(
            documentId === "init" ? "Start typing" : "Start typing..."
          ),
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
          inlineSuggestionPlugin({
            requestSuggestion: requestInlineSuggestionCallback,
          }),
          selectionContextPlugin(),
          synonymsPlugin(),
          savePlugin({
            saveFunction: performSave,
            initialLastSaved: initialLastSaved,
            debounceMs: 200,
            documentId: documentId,
          }),
        ];

        const newDoc = buildDocumentFromContent(content);

        // Create a completely new state and update the view
        const newState = EditorState.create({
          doc: newDoc,
          plugins: newPlugins,
        });
        currentView.updateState(newState);
      } else {
        // Document ID is the same, check for external content updates
        const currentContent = buildContentFromDocument(currentView.state.doc);
        if (content !== currentContent) {
          const saveState = savePluginKey.getState(currentView.state);
          if (saveState?.isDirty) {
            console.warn(
              "[Editor] External content update received, but editor is dirty. Ignoring update."
            );
          } else {
            console.log("[Editor] Content update for same document.");
            const newDocument = buildDocumentFromContent(content);
            const transaction = currentView.state.tr.replaceWith(
              0,
              currentView.state.doc.content.size,
              newDocument.content
            );
            transaction.setMeta("external", true);
            transaction.setMeta("addToHistory", false);
            currentView.dispatch(transaction);
          }
        }
      }

      currentView.setProps({
        editable: () => isCurrentVersion,
      });
    }

    return () => {
      if (editorRef.current && !view) {
        // console.log('[Editor] Destroying view on cleanup (not re-init)');
        // editorRef.current.destroy();
        // editorRef.current = null;
      } else if (view) {
        console.log("[Editor] Destroying view on effect re-run/unmount");
        view.destroy();
        if (editorRef.current === view) {
          editorRef.current = null;
        }
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [
    content,
    documentId,
    initialLastSaved,
    isCurrentVersion,
    performSave,
    onStatusChange,
    onCreateDocumentRequest,
    requestInlineSuggestionCallback,
  ]);

  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const editorView = editorRef.current;
      const { state, dispatch } = editorView;

      const {
        from,
        to,
        suggestion,
        documentId: suggestionDocId,
      } = event.detail;

      if (suggestionDocId !== documentId) {
        console.warn(
          `[Editor apply-suggestion] Event ignored: Document ID mismatch. Expected ${documentId}, got ${suggestionDocId}.`
        );
        return;
      }

      if (
        typeof from !== "number" ||
        typeof to !== "number" ||
        from < 0 ||
        to > state.doc.content.size ||
        from > to
      ) {
        console.error(
          `[Editor apply-suggestion] Invalid range received: [${from}, ${to}]. Document size: ${state.doc.content.size}`
        );
        toast.error("Cannot apply suggestion: Invalid text range.");
        return;
      }

      console.log(
        `[Editor apply-suggestion] Event received for doc: ${documentId}`
      );
      console.log(
        `[Editor apply-suggestion] Applying suggestion "${suggestion}" at range [${from}, ${to}]`
      );

      try {
        const transaction = state.tr.replaceWith(
          from,
          to,
          state.schema.text(suggestion)
        );

        dispatch(transaction);

        toast.success("Suggestion applied");
      } catch (error) {
        console.error(
          `[Editor apply-suggestion] Error applying transaction:`,
          error
        );
        toast.error("Failed to apply suggestion.");
      }
    };

    window.addEventListener(
      "apply-suggestion",
      handleApplySuggestion as EventListener
    );
    return () =>
      window.removeEventListener(
        "apply-suggestion",
        handleApplySuggestion as EventListener
      );
  }, [documentId]);

  useEffect(() => {
    const handlePreviewUpdate = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const { documentId: previewDocId, newContent } = event.detail;
      if (previewDocId !== documentId) return;

      const editorView = editorRef.current;

      if (lastPreviewContentRef.current === newContent) return; // no-op if same preview

      if (!previewActiveRef.current) {
        // store original content only once per preview lifecycle
        previewOriginalContentRef.current = buildContentFromDocument(editorView.state.doc);
      }

      const oldContent = previewOriginalContentRef.current ?? buildContentFromDocument(editorView.state.doc);
      if (newContent === oldContent) return; // nothing to diff

      const oldDocNode = buildDocumentFromContent(oldContent);
      const newDocNode = buildDocumentFromContent(newContent);

      const diffedDoc = diffEditor(documentSchema, oldDocNode.toJSON(), newDocNode.toJSON());

      const tr = editorView.state.tr
        .replaceWith(0, editorView.state.doc.content.size, diffedDoc.content)
        .setMeta('external', true)
        .setMeta('addToHistory', false);

      // batch DOM updates
      requestAnimationFrame(() => editorView.dispatch(tr));

      previewActiveRef.current = true;
      lastPreviewContentRef.current = newContent;
    };

    const handleCancelPreview = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const { documentId: cancelDocId } = event.detail;
      if (cancelDocId !== documentId) return;
      if (!previewActiveRef.current || previewOriginalContentRef.current === null) return;

      const editorView = editorRef.current;
      const originalDocNode = buildDocumentFromContent(previewOriginalContentRef.current);
      const tr = editorView.state.tr.replaceWith(0, editorView.state.doc.content.size, originalDocNode.content);
      editorView.dispatch(tr);

      previewActiveRef.current = false;
      previewOriginalContentRef.current = null;
      lastPreviewContentRef.current = null;
    };

    window.addEventListener('preview-document-update', handlePreviewUpdate as EventListener);
    window.addEventListener('cancel-document-update', handleCancelPreview as EventListener);

    return () => {
      window.removeEventListener('preview-document-update', handlePreviewUpdate as EventListener);
      window.removeEventListener('cancel-document-update', handleCancelPreview as EventListener);
    };
  }, [documentId]);

  // When final apply-document-update happens, apply clean new content, clear preview, and flash highlight
  useEffect(() => {
    const handleApply = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      const { documentId: applyDocId, newContent } = event.detail;
      if (applyDocId !== documentId) return;

      // Replace editor content with the clean new content (no diff marks)
      const editorView = editorRef.current;
      const currentContent = buildContentFromDocument(editorView.state.doc);
      if (currentContent === newContent) return;

      const newDocNode = buildDocumentFromContent(newContent);
      const tr = editorView.state.tr
        .replaceWith(0, editorView.state.doc.content.size, newDocNode.content)
        .setMeta('external', true)
        .setMeta('addToHistory', false);

      editorView.dispatch(tr);

      // Reset preview state
      previewActiveRef.current = false;
      previewOriginalContentRef.current = null;
      lastPreviewContentRef.current = null;
    };
    window.addEventListener('apply-document-update', handleApply as EventListener);
    return () => window.removeEventListener('apply-document-update', handleApply as EventListener);
  }, [documentId]);

  useEffect(() => {
    const handleCreationStreamFinished = (event: CustomEvent) => {
      const finishedDocId = event.detail.documentId;
      const editorView = editorRef.current;
      const currentEditorPropId = documentId;

      console.log(
        `[Editor] Received creation-stream-finished event. Event Doc ID: ${finishedDocId}, Editor Prop Doc ID: ${currentEditorPropId}`
      );

      if (
        editorView &&
        finishedDocId === currentEditorPropId &&
        currentEditorPropId !== "init"
      ) {
        const saveState = savePluginKey.getState(editorView.state);
        if (
          saveState &&
          saveState.status !== "saving" &&
          saveState.status !== "debouncing"
        ) {
          console.log(
            `[Editor] Triggering initial save for newly created document ${currentEditorPropId} after stream finish.`
          );
          setSaveStatus(editorView, { triggerSave: true });
        } else {
          console.log(
            `[Editor] Skipping initial save trigger for ${currentEditorPropId} - already saving/debouncing or state unavailable.`
          );
        }
      }
    };

    window.addEventListener(
      "editor:creation-stream-finished",
      handleCreationStreamFinished as EventListener
    );
    return () =>
      window.removeEventListener(
        "editor:creation-stream-finished",
        handleCreationStreamFinished as EventListener
      );
  }, [documentId]);

  useEffect(() => {
    const handleForceSave = async (event: any) => {
      const forceSaveDocId = event.detail.documentId;
      const editorView = editorRef.current;
      const currentEditorPropId = documentId;

      if (
        !editorView ||
        forceSaveDocId !== currentEditorPropId ||
        currentEditorPropId === "init"
      ) {
        return;
      }

      try {
        const content = buildContentFromDocument(editorView.state.doc);

        console.log(`[Editor] Force-saving document ${currentEditorPropId}`);

        const response = await fetch("/api/document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentEditorPropId,
            content: content,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        setSaveStatus(editorView, {
          status: "saved",
          lastSaved: new Date(data.updatedAt || new Date().toISOString()),
          isDirty: false,
        });
      } catch (error) {
        console.error(
          `[Editor] Force-save failed for ${currentEditorPropId}:`,
          error
        );
      }
    };

    window.addEventListener(
      "editor:force-save-document",
      handleForceSave as unknown as EventListener
    );
    return () =>
      window.removeEventListener(
        "editor:force-save-document",
        handleForceSave as unknown as EventListener
      );
  }, [documentId]);

  return (
    <>
      {isCurrentVersion && documentId !== "init" && (
        <EditorToolbar activeFormats={activeFormats} />
      )}
      <div className="prose dark:prose-invert pt-2" ref={containerRef} />
      <style jsx global>{`
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
      `}</style>
    </>
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.documentId === nextProps.documentId &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === "streaming" && nextProps.status === "streaming") &&
    prevProps.content === nextProps.content
  );
}

export const Editor = memo(PureEditor, areEqual);
