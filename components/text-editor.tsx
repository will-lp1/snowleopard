'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState, Transaction } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef, useCallback, useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

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
import { DiffView } from './diffview';

// Import Plugin for placeholder
import { Plugin } from 'prosemirror-state';
import { Decoration } from 'prosemirror-view';

// Add types for section-based diffs
interface DiffSection {
  id: string;
  oldContent: string;
  newContent: string;
  isExpanded?: boolean;
}

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

// Create a plugin for placeholder text
function placeholderPlugin(text: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const empty = doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0;
        
        if (!empty) return null;
        
        const decoration = Decoration.node(0, doc.firstChild!.nodeSize, { 
          class: "editor-placeholder",
          "data-placeholder": text
        });
        
        return DecorationSet.create(doc, [decoration]);
      }
    }
  });
}

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
  const hasShownToastRef = useRef<boolean>(false);
  
  // Add state for handling AI updates and diff view
  const [showDiff, setShowDiff] = useState(false);
  const [previousContent, setPreviousContent] = useState<string>('');
  const [aiUpdatedContent, setAiUpdatedContent] = useState<string>('');
  // Add state for section-by-section diffs
  const [diffSections, setDiffSections] = useState<DiffSection[]>([]);
  const aiUpdateInProgressRef = useRef<boolean>(false);

  // New function to create diff sections from old and new content
  const generateDiffSections = useCallback((oldText: string, newText: string) => {
    // Guard against null/undefined inputs
    if (!oldText || !newText) {
      console.log('[Editor] Cannot generate diff sections - missing content');
      return;
    }
    
    // Simple algorithm to split by paragraphs (can be improved for more granular diffs)
    const oldParagraphs = oldText.split(/\n\n+/);
    const newParagraphs = newText.split(/\n\n+/);
    
    // Create diff sections where paragraphs are different
    const sections: DiffSection[] = [];
    
    // Use a simple LCS-based approach to find changed sections
    let i = 0, j = 0;
    
    while (i < oldParagraphs.length || j < newParagraphs.length) {
      // Make sure both i and j are within bounds before comparing
      if (i < oldParagraphs.length && j < newParagraphs.length && 
          oldParagraphs[i]?.trim() === newParagraphs[j]?.trim()) {
        // No difference - just skip identical paragraphs
        i++;
        j++;
        continue;
      }
      
      // Try to find the next matching paragraph
      let nextMatch = -1;
      let searchLimit = Math.min(5, oldParagraphs.length - i); // Only look ahead a few paragraphs
      
      for (let k = 1; k <= searchLimit; k++) {
        // Add bounds checking for both arrays
        if (i + k < oldParagraphs.length && j < newParagraphs.length && 
            oldParagraphs[i + k]?.trim() === newParagraphs[j]?.trim()) {
          nextMatch = k;
          break;
        }
      }
      
      if (nextMatch > 0) {
        // Found a match ahead - the paragraphs in between were removed
        sections.push({
          id: `diff-${sections.length}`,
          oldContent: oldParagraphs.slice(i, i + nextMatch).join('\n\n') || '',
          newContent: '',
          isExpanded: true
        });
        i += nextMatch;
      } else {
        // No match found ahead - this is a new paragraph
        sections.push({
          id: `diff-${sections.length}`,
          oldContent: i < oldParagraphs.length ? oldParagraphs[i] || '' : '',
          newContent: j < newParagraphs.length ? newParagraphs[j] || '' : '',
          isExpanded: true
        });
        i++;
        j++;
      }
    }
    
    // Filter out sections where old and new are identical
    const filteredSections = sections.filter(section => 
      section.oldContent?.trim() !== section.newContent?.trim()
    );
    
    console.log('[Editor] Generated diff sections:', filteredSections.length);
    setDiffSections(filteredSections);
  }, []);

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
          placeholderPlugin('Start typing here...'),
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

      // Check if this content update might be from an AI update
      if (status === 'streaming' || aiUpdateInProgressRef.current) {
        console.log('[Editor] AI update detected, saving current content for diff view');
        
        // Save current content for diff view and mark as AI update in progress
        if (!aiUpdateInProgressRef.current) {
          setPreviousContent(currentContent);
          aiUpdateInProgressRef.current = true;
        }
        
        // Update AI updated content for diff view
        setAiUpdatedContent(content);
        
        // Generate diff sections from the old and new content
        if (previousContent && content) {
          generateDiffSections(previousContent, content);
        }
        
        // Show diff view when we get content during AI streaming
        setShowDiff(true);
      }
      
      // If AI updates just completed, keep diff view visible but reset flag
      if (status !== 'streaming' && aiUpdateInProgressRef.current) {
        aiUpdateInProgressRef.current = false;
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
      
      // Show toast only on first load (not for every content change)
      if (!hasShownToastRef.current && documentId !== 'init') {
        hasShownToastRef.current = true;
        console.log('[Editor] First load of document, showing toast');
      }
    }
  }, [content, status]);

  // Handle AI-driven document updates and diff view
  useEffect(() => {
    // Function to handle artifactUpdate data events
    // These come from the stream, not browser events
    const handleStreamArtifactUpdate = (e: CustomEvent) => {
      try {
        const data = e.detail;
        if (data.type === 'artifactUpdate') {
          // Parse the data from the stream
          const updateData = JSON.parse(data.content);
          
          console.log('[Editor] Received artifactUpdate data from stream:', updateData);
          
          // Check if this update is for our document
          if (updateData.type === 'documentUpdated' && 
              updateData.documentId === documentId) {
              
            console.log('[Editor] Processing document update for current document');
            
            // Get current editor content to show diff against
            if (editorRef.current) {
              const currentContent = buildContentFromDocument(editorRef.current.state.doc);
              setPreviousContent(currentContent);
              setAiUpdatedContent(updateData.newContent || '');
              
              // Generate diff sections from the old and new content
              generateDiffSections(currentContent, updateData.newContent || '');
              
              // Mark as AI update and show diff view
              aiUpdateInProgressRef.current = true;
              setShowDiff(true);
              
              // Dispatch a browser event for other components that might need this info
              if (typeof window !== 'undefined') {
                try {
                  const event = new CustomEvent('artifactUpdate', {
                    detail: updateData
                  });
                  window.dispatchEvent(event);
                } catch (error) {
                  console.error('[Editor] Error dispatching browser event:', error);
                }
              }
              
              console.log('[Editor] Diff view activated for updates');
            }
          }
        }
      } catch (error) {
        console.error('[Editor] Error handling artifact update data:', error);
      }
    };
    
    // Add this function to handle data from the stream with proper typing
    window.addEventListener('editor:stream-data', handleStreamArtifactUpdate as EventListener);
    
    return () => {
      window.removeEventListener('editor:stream-data', handleStreamArtifactUpdate as EventListener);
    };
  }, [documentId, generateDiffSections]);

  // Accept a single diff section
  const acceptDiffSection = useCallback((sectionId: string) => {
    if (!editorRef.current) return;
    
    const section = diffSections.find(s => s.id === sectionId);
    if (!section || !section.oldContent || !section.newContent) return;
    
    try {
      // Get the current editor content
      const currentContent = buildContentFromDocument(editorRef.current.state.doc);
      
      // Replace the old content with the new content
      const updatedContent = currentContent.replace(section.oldContent, section.newContent);
      
      // Apply the changes to the editor
      const newDocument = buildDocumentFromContent(updatedContent);
      const transaction = editorRef.current.state.tr
        .replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content
        )
        .setMeta('no-save', true);
      
      editorRef.current.dispatch(transaction);
      
      // Save the content
      onSaveContent(updatedContent, false);
      
      // Remove this section from the list
      setDiffSections(prev => prev.filter(s => s.id !== sectionId));
      
      // Close diff view if no more sections
      if (diffSections.length <= 1) {
        setShowDiff(false);
        setAiUpdatedContent('');
        setPreviousContent('');
        aiUpdateInProgressRef.current = false;
      }
    } catch (error) {
      console.error('[Editor] Error applying diff section:', error);
    }
  }, [diffSections, onSaveContent]);

  // Toggle section expansion
  const toggleSectionExpansion = useCallback((sectionId: string) => {
    setDiffSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, isExpanded: !section.isExpanded } 
        : section
    ));
  }, []);

  // Make the AI-updates more visible with improved diff view handling
  const acceptAiChanges = useCallback(() => {
    setShowDiff(false);
    
    // Apply all the AI changes to the editor
    if (editorRef.current && aiUpdatedContent) {
      const newDocument = buildDocumentFromContent(aiUpdatedContent);
      
      // Create a transaction that replaces the entire document content
      const transaction = editorRef.current.state.tr
        .replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content
        )
        .setMeta('no-save', true); // Don't trigger additional saves
      
      // Dispatch the transaction to update the editor
      editorRef.current.dispatch(transaction);
      
      // Save the content to the server
      onSaveContent(aiUpdatedContent, false);
      
      // Reset AI update state
      setAiUpdatedContent('');
      setPreviousContent('');
      setDiffSections([]);
      aiUpdateInProgressRef.current = false;
    }
  }, [aiUpdatedContent, onSaveContent]);

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
    <div className="relative prose dark:prose-invert">
      {/* Show section-by-section diff view when AI has updated the document */}
      {showDiff && status !== 'streaming' && diffSections.length > 0 && (
        <div className="mb-6 border rounded-md overflow-hidden">
          <div className="bg-primary/10 p-3 flex justify-between items-center">
            <h3 className="text-sm font-medium m-0">AI Updates</h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setDiffSections([])}
                className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-md flex items-center gap-1"
              >
                <X size={12} strokeWidth={2.5} />
                <span>Reject All</span>
              </button>
              <button 
                onClick={acceptAiChanges}
                className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-md flex items-center gap-1"
              >
                <Check size={12} strokeWidth={2.5} />
                <span>Accept All</span>
              </button>
            </div>
          </div>
          
          <div className="divide-y">
            {diffSections.map((section) => (
              <div key={section.id} className="bg-muted/30">
                <div 
                  className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleSectionExpansion(section.id)}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    Change {section.id.split('-')[1]}
                  </span>
                  <div className="flex items-center gap-2">
                    {section.isExpanded ? 
                      <ChevronUp size={14} className="text-muted-foreground" /> : 
                      <ChevronDown size={14} className="text-muted-foreground" />
                    }
                  </div>
                </div>
                
                {section.isExpanded && (
                  <div className="p-3 border-t">
                    <div className="mb-2">
                      <DiffView oldContent={section.oldContent} newContent={section.newContent} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDiffSections(prev => prev.filter(s => s.id !== section.id))}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors text-muted-foreground hover:text-destructive"
                      >
                        <X size={12} strokeWidth={2.5} />
                        <span>Skip</span>
                      </button>
                      <button
                        onClick={() => acceptDiffSection(section.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors text-muted-foreground hover:text-green-500"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span>Apply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div ref={containerRef}>
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
          
          /* Style diff view */
          .diff-editor span.bg-green-100 {
            background-color: rgba(74, 222, 128, 0.2);
            padding: 2px 0;
          }
          
          .diff-editor span.bg-red-100 {
            background-color: rgba(248, 113, 113, 0.2);
            padding: 2px 0;
          }
          
          /* Placeholder styles */
          .editor-placeholder {
            position: relative;
          }
          
          .editor-placeholder::before {
            content: attr(data-placeholder);
            color: var(--muted-foreground);
            position: absolute;
            pointer-events: none;
            opacity: 0.6;
          }
        `}</style>
      </div>
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
