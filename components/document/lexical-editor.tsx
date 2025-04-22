'use client';

import { useCallback, useEffect, useState, useRef, memo } from 'react';
import { 
  $getRoot, 
  $createParagraphNode, 
  $createTextNode, 
  createEditor, 
  EditorState, 
  LexicalNode,
  ElementNode,
  TextNode,
  LexicalEditor as LexicalEditorType,
  KEY_TAB_COMMAND, 
  KEY_ARROW_RIGHT_COMMAND,
  COMMAND_PRIORITY_EDITOR, 
  createCommand,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $nodesOfType,
  RangeSelection,
  $addUpdateTag
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS, CHECK_LIST, STRIKETHROUGH } from '@lexical/markdown';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { CheckIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { toast } from 'sonner';
import { useAiOptions } from '@/hooks/ai-options';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

import SuggestionOverlay from '@/components/suggestion-overlay';
import EditorToolbar from '@/components/document/editor-toolbar';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  documentId: string;
  saveState?: 'idle' | 'saving' | 'error';
  isNewDocument?: boolean;
  onCreateDocument?: (initialContent: string) => Promise<void>;
};

// Constants for inline suggestions
const SUGGESTION_DEBOUNCE = 300; // ms
const MIN_CONTENT_LENGTH = 5;
const SET_INLINE_SUGGESTION = createCommand('SET_INLINE_SUGGESTION');
const CLEAR_INLINE_SUGGESTION = createCommand('CLEAR_INLINE_SUGGESTION');

// Define theme for the editor
const theme = {
  root: 'editor-root',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    code: 'editor-text-code',
  },
  paragraph: 'editor-paragraph',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
    h4: 'editor-heading-h4',
    h5: 'editor-heading-h5',
    h6: 'editor-heading-h6',
  },
  list: {
    ul: 'editor-list-ul',
    ol: 'editor-list-ol',
    li: 'editor-list-li',
    nested: {
      listitem: 'editor-nested-listitem',
    },
    listitemChecked: 'editor-listitem-checked',
    listitemUnchecked: 'editor-listitem-unchecked',
  },
  quote: 'editor-quote',
  link: 'editor-link',
  placeholder: 'editor-placeholder',
  horizontalRule: 'editor-horizontal-rule',
};

// Function to catch any errors that occur during Lexical updates
function onError(error: Error) {
  console.error(error);
}

// Create placeholder plugin for the editor
function PlaceholderPlugin({ isNewDocument }: { isNewDocument?: boolean }) {
  return (
    <div className="editor-placeholder pointer-events-none select-none">
      {isNewDocument 
        ? <div className="opacity-60">
            <p className="text-base font-medium text-primary">Start typing...</p>
            <p className="text-sm text-muted-foreground mt-1">Your document will be created automatically.</p>
          </div>
        : <span className="opacity-60">Start typing here...</span>
      }
    </div>
  );
}

// Custom plugin for inline suggestions with improved tab handling
function InlineSuggestionsPlugin({ documentId, onSaveContent }: { documentId: string; onSaveContent: (content: string, debounce: boolean) => void }) {
  const [editor] = useLexicalComposerContext();
  const [currentSuggestion, setCurrentSuggestion] = useState<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestInProgressRef = useRef<boolean>(false);
  const suggestionNodeRef = useRef<HTMLSpanElement | null>(null);
  const lastContentRef = useRef<string>('');
  const contentChangedRef = useRef<boolean>(false);
  const saveAttemptRef = useRef<number>(0); // Track save attempts
  const { suggestionLength, customInstructions } = useAiOptions(); // Get settings from hook

  // Improved update position function
  const updateSuggestionPosition = useCallback(() => {
    const suggestionNode = suggestionNodeRef.current;
    if (!suggestionNode || !suggestionNode.querySelector('.suggestion-text')?.textContent?.trim()) {
      if (suggestionNode) suggestionNode.style.display = 'none';
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      suggestionNode.style.display = 'none';
      return;
    }

    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
      // Invalid rect, don't show suggestion
      suggestionNode.style.display = 'none';
      return;
    }
    
    // Get the editor element to determine boundaries and styling
    const editorElement = document.querySelector('.lexical-editor-content-editable');
    if (!editorElement) {
      suggestionNode.style.display = 'none';
      return;
    }
    
    // Get the client rect of the editor for boundaries
    const editorRect = editorElement.getBoundingClientRect();
    
    // Get computed styles for matching text appearance exactly
    const computedStyle = window.getComputedStyle(editorElement);
    
    // Match all text-related styling exactly
    suggestionNode.style.fontSize = computedStyle.fontSize;
    suggestionNode.style.lineHeight = computedStyle.lineHeight;
    suggestionNode.style.fontFamily = computedStyle.fontFamily;
    suggestionNode.style.fontWeight = computedStyle.fontWeight;
    suggestionNode.style.letterSpacing = computedStyle.letterSpacing;
    suggestionNode.style.textTransform = computedStyle.textTransform;
    
    // Get window scroll position for accurate positioning
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    
    // Position right after cursor
    suggestionNode.style.left = `${rect.right + scrollX}px`;
    suggestionNode.style.top = `${rect.top + scrollY}px`;
    
    // Get the suggestion text for calculations
    const suggestionText = suggestionNode.querySelector('.suggestion-text')?.textContent || '';
    
    // Measure the width the suggestion would take
    const measuringSpan = document.createElement('span');
    measuringSpan.style.visibility = 'hidden';
    measuringSpan.style.position = 'absolute';
    measuringSpan.style.whiteSpace = 'pre-wrap';
    measuringSpan.style.fontSize = computedStyle.fontSize;
    measuringSpan.style.fontFamily = computedStyle.fontFamily;
    measuringSpan.style.fontWeight = computedStyle.fontWeight;
    measuringSpan.style.letterSpacing = computedStyle.letterSpacing;
    measuringSpan.textContent = suggestionText;
    document.body.appendChild(measuringSpan);
    
    const measuredWidth = measuringSpan.offsetWidth;
    document.body.removeChild(measuringSpan);
    
    // Determine if we need to wrap to next line based on editor boundaries
    const rightEdge = editorRect.right + scrollX;
    
    // Check if suggestion would exceed editor boundaries
    if (rect.right + measuredWidth > rightEdge - 20) { // 20px buffer
      // Calculate the line height for proper positioning on next line
      const lineHeight = parseFloat(computedStyle.lineHeight || '0');
      const fontSize = parseFloat(computedStyle.fontSize || '0');
      const effectiveLineHeight = !isNaN(lineHeight) ? lineHeight : fontSize * 1.2;
      
      // Position at beginning of next line
      suggestionNode.style.top = `${rect.top + scrollY + effectiveLineHeight}px`;
      suggestionNode.style.left = `${editorRect.left + scrollX + 4}px`; // 4px indent
    }
    
    // Set maximum width to prevent extending beyond editor
    suggestionNode.style.maxWidth = `${rightEdge - parseFloat(suggestionNode.style.left) - 10}px`;
    
    // Position the tooltip appropriately
    const tooltip = suggestionNode.querySelector('.suggestion-tooltip') as HTMLElement;
    if (tooltip) {
      // Adjust tooltip position based on available space
      const spaceAbove = rect.top - editorRect.top;
      
      // If not enough space above, position tooltip below
      if (spaceAbove < 40) {
        tooltip.style.top = 'auto';
        tooltip.style.bottom = '-26px';
      } else {
        tooltip.style.top = '-26px';
        tooltip.style.bottom = 'auto';
      }
      
      // Center horizontally based on suggestion width
      if (measuredWidth > 100) {
        tooltip.style.right = '50%';
        tooltip.style.transform = 'translateX(50%)';
      } else {
        tooltip.style.right = '0';
        tooltip.style.transform = 'none';
      }
    }
    
    // Ensure display is set last after all positioning is complete
    suggestionNode.style.display = 'inline-block';
  }, []);

  // Function to request inline suggestions from the API
  const requestInlineSuggestion = useCallback(async () => {
    if (isRequestInProgressRef.current || !documentId || documentId === 'init') {
      console.log('[Suggestions] Skipping request - already in progress or invalid document ID');
      return;
    }

    // Clear existing suggestion
    editor.dispatchCommand(CLEAR_INLINE_SUGGESTION, null);

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isRequestInProgressRef.current = true;
    
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    
    try {
      // Get current selection and text context
      let contextBefore = '';
      let contextAfter = '';
      
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        
        const node = selection.anchor.getNode();
        if (!node) return;
        
        // Get text before cursor
        const textContent = node.getTextContent();
        contextBefore = textContent.slice(0, selection.anchor.offset);
        
        // Get text after cursor for better predictions
        contextAfter = textContent.slice(selection.anchor.offset);
      });
      
      // Only request suggestions if we have enough context
      if (!contextBefore || contextBefore.length < MIN_CONTENT_LENGTH) {
        console.log('[Suggestions] Skipping request - not enough context');
        isRequestInProgressRef.current = false;
        return;
      }
      
      // Get the entire document content for better context
      let fullContent = '';
      editor.getEditorState().read(() => {
        const root = $getRoot();
        fullContent = root.getTextContent();
      });
      
      console.log('[Suggestions] Requesting suggestion for', { contextBefore: contextBefore.slice(-20) });
      
      // Use a more reliable approach to detect cursor position for suggestion placement
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0) {
        // Ensure suggestion element is correctly positioned when request is made
        setTimeout(updateSuggestionPosition, 0);
      }
      
      console.log('[Suggestions] Using AI options:', { suggestionLength, hasCustomInstructions: !!customInstructions });
      
      const response = await fetch('/api/inline-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          currentContent: contextBefore,
          contextAfter,
          fullContent,
          nodeType: 'paragraph',
          aiOptions: { // Pass options
            suggestionLength,
            customInstructions
          }
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch suggestion: ${response.status}`);
      }

      if (!response.body) {
        isRequestInProgressRef.current = false;
        return;
      }
      
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let suggestion = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(5));
              
              switch (data.type) {
                case 'suggestion-delta':
                  suggestion += data.content;
                  console.log('[Suggestions] Received suggestion delta:', data.content);
                  editor.dispatchCommand(SET_INLINE_SUGGESTION, suggestion);
                  setCurrentSuggestion(suggestion);
                  
                  // Force position update after each new suggestion part
                  setTimeout(updateSuggestionPosition, 0);
                  break;
                  
                case 'finish':
                  console.log('[Suggestions] Suggestion complete:', suggestion);
                  isRequestInProgressRef.current = false;
                  return;
                  
                case 'error':
                  console.error('Suggestion error:', data.content);
                  isRequestInProgressRef.current = false;
                  return;
              }
            } catch (err) {
              // Silently ignore parse errors from incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Expected when aborting
      } else {
        console.error('Error requesting suggestion:', err);
      }
    } finally {
      isRequestInProgressRef.current = false;
      if (reader) {
        try {
          reader.releaseLock();
        } catch (e) {
          // Ignore errors from releasing the lock
        }
      }
    }
  }, [editor, documentId, updateSuggestionPosition, suggestionLength, customInstructions]);

  // Create DOM node for showing suggestion with improved styling
  useEffect(() => {
    if (!suggestionNodeRef.current) {
      console.log('[Suggestions] Creating suggestion element');
      const suggestionNode = document.createElement('span');
      suggestionNode.className = 'inline-suggestion';
      suggestionNode.setAttribute('aria-label', 'Press Tab to accept suggestion');
      suggestionNode.style.display = 'none';
      suggestionNode.style.whiteSpace = 'pre-wrap'; // Allow suggestions to wrap properly
      suggestionNode.style.wordBreak = 'break-word'; // Handle long words
      suggestionNode.style.overflow = 'hidden'; // Hide overflow text
      
      // Create suggestion text container
      const textContainer = document.createElement('span');
      textContainer.className = 'suggestion-text';
      
      // Create inline tab button at the end of text
      const inlineTabButton = document.createElement('span');
      inlineTabButton.className = 'inline-tab-button';
      
      // Create tab key visual
      const tabKeyVisual = document.createElement('span');
      tabKeyVisual.className = 'tab-key';
      tabKeyVisual.innerHTML = 'tab';
      inlineTabButton.appendChild(tabKeyVisual);
      
      // Add the elements to the suggestion node
      suggestionNode.appendChild(textContainer);
      suggestionNode.appendChild(inlineTabButton);
      
      // Create floating tooltip for keyboard shortcuts (shows on hover)
      const tooltipEl = document.createElement('div');
      tooltipEl.className = 'suggestion-tooltip';
      tooltipEl.innerHTML = '<span class="key">Tab</span> or <span class="key">→</span> to accept';
      suggestionNode.appendChild(tooltipEl);
      
      document.body.appendChild(suggestionNode);
      suggestionNodeRef.current = suggestionNode;
    }
  }, []);

  // Register command for showing suggestion
  useEffect(() => {
    const setSuggestionListener = editor.registerCommand(
      SET_INLINE_SUGGESTION,
      (suggestion: string) => {
        console.log('[DEBUG] Setting suggestion:', suggestion);
        if (!suggestion.trim() || !suggestionNodeRef.current) {
          return false;
        }

        // Update the suggestion node
        const suggestionNode = suggestionNodeRef.current;
        
        // Store suggestion as a data attribute
        suggestionNode.setAttribute('data-suggestion', suggestion);
        
        // Find the text container and update its content
        const textContainer = suggestionNode.querySelector('.suggestion-text');
        if (textContainer) {
          textContainer.textContent = suggestion;
        }
        
        // Make sure to also update the state
        setCurrentSuggestion(suggestion);
        
        // First position the suggestion while it's invisible
        updateSuggestionPosition();
        
        // Then make it visible in the next frame
        requestAnimationFrame(() => {
          if (suggestionNodeRef.current) {
            suggestionNodeRef.current.style.display = 'inline-block';
            // Add visible class in the next frame for smooth transition
            requestAnimationFrame(() => {
              if (suggestionNodeRef.current) {
                suggestionNodeRef.current.classList.add('visible');
              }
            });
          }
        });
        
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    return () => {
      setSuggestionListener();
    };
  }, [editor, updateSuggestionPosition]);

  // Register commands for clearing suggestions and handling tab/arrow keys
  useEffect(() => {
    // Register command for clearing suggestion
    const clearSuggestionListener = editor.registerCommand(
      CLEAR_INLINE_SUGGESTION,
      () => {
        console.log('[Suggestions] Clearing suggestion');
        if (suggestionNodeRef.current) {
          // Add a fade-out effect
          const node = suggestionNodeRef.current;
          node.classList.add('suggestion-fade-out');
          
          // After animation completes, hide the node and clean up
          setTimeout(() => {
            if (suggestionNodeRef.current) {
              // Clear all content and reset styles
              suggestionNodeRef.current.style.display = 'none';
              suggestionNodeRef.current.classList.remove('suggestion-fade-out');
              suggestionNodeRef.current.classList.remove('suggestion-accepted');
              
              // Clear text content
              const textEl = suggestionNodeRef.current.querySelector('.suggestion-text');
              if (textEl) {
                textEl.textContent = '';
              }
              
              // Clear data attribute
              suggestionNodeRef.current.setAttribute('data-suggestion', '');
              
              // Reset position to avoid flashing in wrong location on next appearance
              suggestionNodeRef.current.style.left = '0';
              suggestionNodeRef.current.style.top = '0';
            }
          }, 150);
        }
        setCurrentSuggestion('');
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    // Handle Tab key to accept suggestion - with improved priority and handling
    const tabKeyListener = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        console.log('[DEBUG] Tab key pressed, currentSuggestion:', currentSuggestion);
        
        // Case 1: No suggestion exists, and Shift isn't pressed -> Request suggestion
        if ((!currentSuggestion || !currentSuggestion.trim()) && !event.shiftKey) {
          console.log('[DEBUG] No suggestion exists, requesting suggestion...');
          event.preventDefault(); // Prevent default tab behavior (like focus change)
          requestInlineSuggestion(); // Trigger suggestion request
          return true; // Indicate the command was handled
        } 
        // Case 2: Suggestion exists, and Shift isn't pressed -> Accept suggestion
        else if (currentSuggestion && currentSuggestion.trim() && !event.shiftKey) {
          console.log('[DEBUG] Applying suggestion:', currentSuggestion);
          event.preventDefault();
          
          // Add visual feedback when applying suggestion
          const suggestionNode = suggestionNodeRef.current;
          if (suggestionNode) {
            suggestionNode.classList.add('suggestion-accepted');
          }
          
          // Store suggestion locally to ensure we use the correct value
          const suggestionToApply = currentSuggestion;
          
          // Insert the suggestion text at current position and position cursor at end
          editor.update(() => {
            // Get current selection
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              // Get current node and position
              const node = selection.anchor.getNode();
              const currentOffset = selection.anchor.offset;
              
              // Insert text at current position
              selection.insertText(suggestionToApply);
              
              // Explicitly set selection to end of inserted text
              // This ensures cursor ends up after the suggestion
              if ($isTextNode(node) && node.isAttached()) {
                // Position cursor at the end of the inserted text
                selection.focus.offset = currentOffset + suggestionToApply.length;
                selection.anchor.offset = currentOffset + suggestionToApply.length;
              }
              
              console.log('[DEBUG] Inserted suggestion successfully with cursor at end');
            }
          });
          
          // Clear the suggestion - must happen AFTER the update
          setTimeout(() => {
            editor.dispatchCommand(CLEAR_INLINE_SUGGESTION, null);
            
            // Double-check that suggestion state is cleared
            setCurrentSuggestion('');
            contentChangedRef.current = true;
          }, 150);
          
          // Let the editor's onChange handler handle saving naturally
          // No need for custom save logic here
          
          return true;
        }
        
        console.log('[DEBUG] No suggestion to apply, letting tab indentation handle it');
        return false;
      },
      // Use the highest priority to make sure it takes precedence over TabIndentationPlugin
      1 // Highest priority
    );

    // Add keyboard shortcut for accepting suggestions (Right Arrow at end of suggestion)
    const handleRightArrow = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (payload: KeyboardEvent) => {
        // Only handle if a suggestion exists
        if (!currentSuggestion || !currentSuggestion.trim()) {
          return false;
        }
        
        let isAtEndOfNode = false;
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) { // Check if collapsed
            const node = selection.anchor.getNode();
            if (node) {
              const textContent = node.getTextContent();
              const cursorOffset = selection.anchor.offset;
              // Ensure cursor is at the very end of the node's text
              isAtEndOfNode = cursorOffset === textContent.length; 
            }
          }
        });
        
        // Only accept suggestion if cursor is collapsed and at the end of text
        if (isAtEndOfNode) {
          console.log('[DEBUG] Right arrow at end of text, accepting suggestion');
          payload.preventDefault();
          
          // Visual feedback
          const suggestionNode = suggestionNodeRef.current;
          if (suggestionNode) {
            suggestionNode.classList.add('suggestion-accepted');
          }
          
          const suggestionToApply = currentSuggestion;
          
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const node = selection.anchor.getNode();
              const currentOffset = selection.anchor.offset;
              selection.insertText(suggestionToApply);
              if ($isTextNode(node) && node.isAttached()) {
                selection.focus.offset = currentOffset + suggestionToApply.length;
                selection.anchor.offset = currentOffset + suggestionToApply.length;
              }
            }
          });
          
          // Clear suggestion
          setTimeout(() => {
            editor.dispatchCommand(CLEAR_INLINE_SUGGESTION, null);
            setCurrentSuggestion('');
            contentChangedRef.current = true;
          }, 150);
          
          return true; // Handled
        }
        
        // If not at the end, let the default arrow key behavior happen
        return false;
      },
      COMMAND_PRIORITY_EDITOR
    );

    return () => {
      clearSuggestionListener();
      tabKeyListener();
      handleRightArrow();
    };
  }, [editor, currentSuggestion, onSaveContent, requestInlineSuggestion]); // Added requestInlineSuggestion dependency

  // Add listeners for editor updates (for positioning and clearing only)
  useEffect(() => {
    // UpdateListener: Only used for updating position now
    const updateListener = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      // Update suggestion position after editor state changes
      // Use requestAnimationFrame for smoother updates
      requestAnimationFrame(updateSuggestionPosition);
    });

    // SelectionListener: Clears suggestion if selection changes or becomes non-collapsed
    const selectionListener = editor.registerUpdateListener(({ editorState }) => {
      const selection = editorState.read(() => $getSelection());
      // Clear suggestion if selection is not range, not collapsed, or moves away
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        // Check if a suggestion exists before clearing, avoid redundant dispatches
        if (currentSuggestion) {
          editor.dispatchCommand(CLEAR_INLINE_SUGGESTION, null);
        }
      } else {
        // Update suggestion position when selection changes (e.g., moving cursor with arrows)
        requestAnimationFrame(updateSuggestionPosition);
      }
    });

    return () => {
      updateListener();
      selectionListener();
    };
  }, [editor, updateSuggestionPosition, currentSuggestion]); // Added currentSuggestion dependency

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (suggestionNodeRef.current) {
        // Check if the node is still attached before removing
        if (document.body.contains(suggestionNodeRef.current)) {
          document.body.removeChild(suggestionNodeRef.current);
        }
        suggestionNodeRef.current = null;
      }
    };
  }, []);

  return null;
}

// Nodes configuration for the editor
const nodes = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  HorizontalRuleNode,
];

// Transformers for Markdown shortcuts
const PLAYGROUND_TRANSFORMERS = [
  CHECK_LIST,
  STRIKETHROUGH,
  ...TRANSFORMERS,
];

function PureLexicalEditor({
  content,
  onSaveContent,
  documentId,
  saveState,
  isNewDocument,
  onCreateDocument,
}: EditorProps) {
  const editorStateRef = useRef<EditorState | null>(null);
  const lastContentRef = useRef<string>(content ?? '');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentChangedRef = useRef<boolean>(false);
  const editorRef = useRef<LexicalEditorType | null>(null);
  const lastDocumentIdRef = useRef<string>(documentId);
  const lastSyncedPropContentRef = useRef<string>(content ?? '');

  const [selectedText, setSelectedText] = useState<string>('');
  const [showSuggestionOverlay, setShowSuggestionOverlay] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });

  const initialConfig = {
    namespace: `Document-${documentId}`,
    theme,
    onError,
    nodes,
    editorState: null,
  };

  // Effect to synchronize editor state with content prop (Further Refined)
  useEffect(() => {
    const editor = editorRef.current;
    const currentPropContent = content ?? '';

    const needsSyncDueToDocId = documentId !== lastDocumentIdRef.current;
    const propContentChangedFromLastSync = currentPropContent !== lastSyncedPropContentRef.current;

    // Only read editor content if we suspect a content mismatch based on prop value change
    let currentEditorContentString: string | undefined = undefined;
    if (editor && propContentChangedFromLastSync) {
        try {
             currentEditorContentString = editor.getEditorState().read(() => $getRoot().getTextContent());
        } catch (e) {
            // Reading state might fail if editor is destroyed concurrently
            console.warn("[Editor Sync Effect] Failed to read editor state for comparison.", e);
            return; // Avoid syncing if state is unreadable
        }
    }

    // Check if the prop content actually differs from the current editor state
    const propContentDiffersFromEditor = propContentChangedFromLastSync && (currentEditorContentString === undefined || currentPropContent !== currentEditorContentString);

    // Conditions to sync: editor ready AND (docId changed OR (prop content changed AND differs from editor content))
    if (editor && (needsSyncDueToDocId || propContentDiffersFromEditor)) {
      console.log(`[Editor Sync Effect] Syncing editor for ${documentId}. Reason: ${needsSyncDueToDocId ? 'Doc ID change' : 'Content prop value changed & differs from editor state'}`);

      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs = currentPropContent.split(/\n\n+/);
        paragraphs.forEach((paragraphText) => {
          const paragraphNode = $createParagraphNode();
          if (paragraphText.trim()) {
            paragraphNode.append($createTextNode(paragraphText));
          }
          root.append(paragraphNode);
        });
        if (root.isEmpty()) root.append($createParagraphNode());
        root.selectEnd();
      }, { tag: 'history-merge' });

      lastSyncedPropContentRef.current = currentPropContent;
      lastContentRef.current = currentPropContent;
      lastDocumentIdRef.current = documentId;
      contentChangedRef.current = false;

      console.log(`[Editor Sync Effect] Editor state synced for ${documentId}`);
    }
  }, [content, documentId, editorRef.current]);

  const handleEditorReference = useCallback((editor: LexicalEditorType | null) => {
    editorRef.current = editor;
  }, []);

  const onChange = useCallback((editorState: EditorState) => {
    editorStateRef.current = editorState;
    let serializedContent = '';
    editorState.read(() => {
      serializedContent = $getRoot().getChildren().map(node => node.getTextContent()).join('\n\n');
    });

    if (serializedContent === lastContentRef.current) return;

    if (isNewDocument && lastContentRef.current === '' && serializedContent !== '' && onCreateDocument) {
        lastContentRef.current = serializedContent;
        contentChangedRef.current = true;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        onCreateDocument(serializedContent);
        return;
    }

    lastContentRef.current = serializedContent;
    contentChangedRef.current = true;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const currentDocId = documentId;
    if (saveState !== 'saving') {
      saveTimeoutRef.current = setTimeout(() => {
        if (currentDocId !== documentId) return;
        if (contentChangedRef.current && editorRef.current) {
          const contentToSave = lastContentRef.current;
          editorRef.current.update(() => { $addUpdateTag('skip-dom-selection'); });
          onSaveContent(contentToSave, true);
          contentChangedRef.current = false;
        }
        saveTimeoutRef.current = null;
      }, 800);
    }
  }, [documentId, onSaveContent, saveState, isNewDocument, onCreateDocument]);

  useEffect(() => {
    const saveOnUnmount = () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (contentChangedRef.current && saveState !== 'saving' && documentId === lastDocumentIdRef.current) {
        onSaveContent(lastContentRef.current, false);
      }
    };
    window.addEventListener('beforeunload', saveOnUnmount);
    return () => {
        saveOnUnmount(); // Also save on component unmount
        window.removeEventListener('beforeunload', saveOnUnmount);
    };
  }, [onSaveContent, saveState, documentId]);

  useEffect(() => {
    const handleManualSave = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (editorRef.current) {
          const currentContent = editorRef.current.getEditorState().read(() => $getRoot().getTextContent());
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
          onSaveContent(currentContent, false);
          contentChangedRef.current = false;
          lastContentRef.current = currentContent;
          toast.success('Document saved', { duration: 1500 });
        }
      }
    };
    window.addEventListener('keydown', handleManualSave);
    return () => window.removeEventListener('keydown', handleManualSave);
  }, [onSaveContent]);

  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;

      const { originalText, suggestion, documentId: suggestionDocId } = event.detail;

      if (suggestionDocId !== documentId) {
        console.warn('[LexicalEditor apply-suggestion] Event ignored: Document ID mismatch.');
        return;
      }

      console.log('[LexicalEditor apply-suggestion] Event received for doc:', documentId);
      console.log('[LexicalEditor apply-suggestion] Original text:', originalText);
      console.log('[LexicalEditor apply-suggestion] Suggestion:', suggestion);

      editorRef.current.update(() => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const currentSelectedText = selection.getTextContent();
          console.log('[LexicalEditor apply-suggestion] Current selection:', currentSelectedText);

          if (currentSelectedText === originalText) {
            console.log('[LexicalEditor apply-suggestion] Applying suggestion...');
            selection.insertText(suggestion);
            toast.success("Suggestion applied");

            lastContentRef.current = '';
            contentChangedRef.current = true;
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
              if (contentChangedRef.current && editorRef.current) {
                const contentToSave = editorRef.current.getEditorState().read(() => $getRoot().getTextContent());
                editorRef.current.update(() => $addUpdateTag('skip-dom-selection'));
                onSaveContent(contentToSave, false);
                contentChangedRef.current = false;
              }
              saveTimeoutRef.current = null;
            }, 50);
          } else {
            console.warn('[LexicalEditor apply-suggestion] Suggestion not applied: Selection changed.');
            toast.warning("Selection changed, suggestion not applied.");
          }
        } else {
          console.warn('[LexicalEditor apply-suggestion] Suggestion not applied: No range selection.');
        }
      });
    };

    window.addEventListener('apply-suggestion', handleApplySuggestion as EventListener);
    return () => window.removeEventListener('apply-suggestion', handleApplySuggestion as EventListener);
  }, [documentId, onSaveContent]); // Keep onSaveContent dependency for the immediate save

  // Effect for handling 'apply-document-update' events
  useEffect(() => {
    const handleApplyUpdate = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;

      const { documentId: updateDocId, newContent } = event.detail;

      // Ignore if event is for a different document
      if (updateDocId !== documentId) {
        console.warn('[LexicalEditor apply-document-update] Event ignored: Document ID mismatch.');
        return;
      }

      console.log(`[LexicalEditor apply-document-update] Event received for doc: ${documentId}`);
      
      // Update the editor content by replacing everything
      editorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        // Split content by double newlines to try and preserve paragraph structure
        const paragraphs = newContent.split(/\n\n+/); 
        paragraphs.forEach((paragraphText: string) => {
          const paragraphNode = $createParagraphNode();
          if (paragraphText.trim()) { // Avoid creating nodes for empty lines between paragraphs
            paragraphNode.append($createTextNode(paragraphText));
          }
          root.append(paragraphNode);
        });
        // Ensure editor isn't empty if newContent was empty or whitespace
        if (root.isEmpty()) {
           root.append($createParagraphNode());
        }
         // Move cursor to the end after update
        root.selectEnd(); 
      }, { tag: 'history-merge' }); // Merge this change into history

      // Update internal refs and trigger immediate save
      lastContentRef.current = newContent; // Update internal state
      lastSyncedPropContentRef.current = newContent; // Sync with prop state assumption
      contentChangedRef.current = true; // Mark as changed
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); // Clear any pending debounced save
      saveTimeoutRef.current = null;

      // Schedule an immediate save (no debounce)
      setTimeout(() => {
          if (contentChangedRef.current && editorRef.current) {
              const contentToSave = editorRef.current.getEditorState().read(() => $getRoot().getTextContent());
              editorRef.current.update(() => $addUpdateTag('skip-dom-selection'));
              onSaveContent(contentToSave, false); // Save immediately
              contentChangedRef.current = false; // Reset flag
          }
      }, 50); // Small delay

      toast.success("Document updated");
    };

    window.addEventListener('apply-document-update', handleApplyUpdate as EventListener);
    return () => window.removeEventListener('apply-document-update', handleApplyUpdate as EventListener);
  }, [documentId, onSaveContent]); // Dependencies: documentId and onSaveContent

  const handleAcceptSuggestion = useCallback((suggestion: string) => {
      if (!editorRef.current || !selectedText) return;
      editorRef.current.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
              selection.insertText(suggestion);
              lastContentRef.current = '';
              contentChangedRef.current = true;
          }
      });
      setTimeout(() => {
          if (editorRef.current) {
              const content = editorRef.current.getEditorState().read(() => $getRoot().getTextContent());
              onSaveContent(content, false);
          }
      }, 50);
      setShowSuggestionOverlay(false);
      setSelectedText('');
  }, [selectedText, onSaveContent]);

  const handleShowSuggestionOverlay = useCallback(() => {
    if (!editorRef.current) return;
    let text = '';
    let position = { x: 0, y: 0 };
    let hasPos = false;
    editorRef.current.getEditorState().read(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel) && !sel.isCollapsed()) {
        text = sel.getTextContent();
        const domSel = window.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          const rect = domSel.getRangeAt(0).getBoundingClientRect();
          position = { x: rect.left, y: rect.bottom };
          hasPos = true;
        }
      }
    });
    if (text && hasPos) {
      setSelectedText(text);
      const scrollX = window.scrollX || 0;
      const scrollY = window.scrollY || 0;
      setOverlayPosition({ x: position.x + scrollX, y: position.y + scrollY + 10 });
      setShowSuggestionOverlay(true);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        handleShowSuggestionOverlay();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleShowSuggestionOverlay]);

  return (
    <div className="relative">
      {showSuggestionOverlay && (
        <SuggestionOverlay
          documentId={documentId}
          selectedText={selectedText}
          isOpen={showSuggestionOverlay}
          onClose={() => setShowSuggestionOverlay(false)}
          onAcceptSuggestion={handleAcceptSuggestion}
          position={overlayPosition}
        />
      )}
      <LexicalComposer initialConfig={initialConfig}>
        <EditorToolbar />
        <div className="relative lexical-editor-wrapper mt-2">
          <div className="lexical-editor-container p-4 rounded-b-md">
            <RichTextPlugin
              contentEditable={<ContentEditable className="lexical-editor-content-editable min-h-[300px] outline-none" />}
              placeholder={<PlaceholderPlugin isNewDocument={isNewDocument} />}
              ErrorBoundary={() => <div>Error loading editor</div>}
            />
            <HistoryPlugin />
            <AutoFocusPlugin />
            <ListPlugin />
            <CheckListPlugin />
            <LinkPlugin />
            <InlineSuggestionsPlugin documentId={documentId} onSaveContent={onSaveContent} />
            <TabIndentationPlugin />
            <MarkdownShortcutPlugin transformers={PLAYGROUND_TRANSFORMERS} />
            <OnChangePlugin onChange={onChange} ignoreHistoryMergeTagChange={true} />
            <EditorRefPlugin onRef={handleEditorReference} />
          </div>
        </div>
        <style jsx global>{`
          .lexical-editor-content-editable {
            border: 0; font-family: inherit; font-size: 1rem; line-height: 1.6;
            color: var(--foreground); resize: none; width: 100%; caret-color: var(--foreground);
            position: relative; tab-size: 1; outline: 0; padding: 0; min-height: 300px;
          }
          .lexical-editor-placeholder {
            color: var(--muted-foreground); overflow: hidden; position: absolute;
            text-overflow: ellipsis; top: 1rem; left: 1rem; font-size: 1rem;
            user-select: none; pointer-events: none; line-height: 1.6;
          }
          .inline-suggestion {
            display: none; pointer-events: none; user-select: none; color: var(--foreground);
            padding: 0; margin: 0; font-family: inherit; font-size: inherit; line-height: inherit;
            position: absolute !important; z-index: 9999 !important; white-space: pre-wrap;
            word-break: break-word; max-width: 100%; overflow-wrap: break-word;
            text-overflow: ellipsis; overflow: hidden; opacity: 0; transition: opacity 0.15s ease;
          }
          .inline-suggestion.visible { opacity: 1; }
          .suggestion-text {
            opacity: 0.5; font-weight: 450; color: var(--foreground); white-space: inherit;
            word-break: inherit; overflow-wrap: inherit; transition: opacity 0.15s ease;
            padding: 0 1px; text-shadow: 0 0 0.5px rgba(0, 0, 0, 0.03);
          }
          .inline-tab-button {
            display: inline-flex; align-items: center; justify-content: center; margin-left: 2px;
            vertical-align: baseline; opacity: 0.9; transition: all 0.15s ease;
          }
          .inline-tab-button .tab-key {
            font-size: 10px; font-weight: 500; letter-spacing: 0.3px; padding: 2px 6px;
            border-radius: 3px; background: var(--muted-foreground); color: var(--background);
            text-transform: lowercase; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); position: relative; top: -1px;
          }
          .suggestion-tooltip {
            position: absolute; top: -26px; right: 0; background: var(--background);
            border-radius: 4px; font-size: 11px; font-weight: 450; padding: 3px 8px;
            white-space: nowrap; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
            border: 1px solid var(--border); opacity: 0; transform: translateY(4px);
            transition: all 0.2s ease; pointer-events: none; color: var(--foreground);
          }
          .suggestion-tooltip .key {
            font-weight: 500; background: var(--muted); color: var(--foreground);
            padding: 1px 5px; border-radius: 3px; margin: 0 1px; border: 1px solid var(--border);
          }
          .inline-suggestion:hover .suggestion-text { opacity: 0.85; background: rgba(0, 122, 255, 0.08); border-radius: 2px; }
          .inline-suggestion:hover .inline-tab-button { opacity: 1; transform: scale(1.02); }
          @keyframes flash-highlight { 0% { background-color: transparent; } 30% { background-color: rgba(0, 122, 255, 0.12); } 100% { background-color: transparent; } }
          .suggestion-accepted .suggestion-text { animation: flash-highlight 0.4s ease-out; }
          .suggestion-fade-out { opacity: 0 !important; transition: opacity 0.15s ease; }
          .inline-suggestion:hover .suggestion-tooltip { opacity: 1; transform: translateY(0); }
          .editor-text-bold { font-weight: bold; }
          .editor-text-italic { font-style: italic; }
          .editor-text-underline { text-decoration: underline; }
          .editor-text-strikethrough { text-decoration: line-through; }
          .editor-text-code { background-color: hsl(var(--muted)); padding: 0.1em 0.3em; font-family: Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 90%; border-radius: 3px; }
          .editor-paragraph { margin: 0 0 0.8rem 0; position: relative; }
          .editor-heading-h1 { font-size: 1.8rem; font-weight: 700; line-height: 1.3; margin: 1.5rem 0 0.8rem; padding-bottom: 0.2em; border-bottom: 1px solid hsl(var(--border)); }
          .editor-heading-h2 { font-size: 1.5rem; font-weight: 600; line-height: 1.3; margin: 1.4rem 0 0.7rem; padding-bottom: 0.2em; border-bottom: 1px solid hsl(var(--border)); }
          .editor-heading-h3 { font-size: 1.25rem; font-weight: 600; line-height: 1.3; margin: 1.3rem 0 0.6rem; }
          .editor-quote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); font-style: italic; }
          .editor-list-ul, .editor-list-ol { margin: 0 0 0.8rem 1.5rem; padding: 0; list-style-position: outside; }
          .editor-list-li { margin: 0.2rem 0; line-height: 1.6; position: relative; }
          .editor-list-ol { list-style-type: decimal; }
          .editor-list-ul { list-style-type: disc; }
          .editor-nested-listitem { list-style-type: none; }
          .editor-list-li .editor-list-ul { margin-left: 1.5rem; list-style-type: circle; }
          .editor-list-li .editor-list-ol { margin-left: 1.5rem; list-style-type: lower-alpha; }
          .editor-list-li .editor-list-ul .editor-list-ul { list-style-type: square; }
          .editor-list-li .editor-list-ol .editor-list-ol { list-style-type: lower-roman; }
          .editor-listitem-unchecked, .editor-listitem-checked { position: relative; padding-left: 24px; list-style-type: none; outline: none; }
          .editor-listitem-unchecked::before, .editor-listitem-checked::before { content: ''; position: absolute; left: 0; top: 0.2em; width: 16px; height: 16px; display: block; border-radius: 3px; background-color: transparent; border: 1.5px solid hsl(var(--muted-foreground)); cursor: pointer; transition: all 0.15s ease; }
          .editor-listitem-checked::before { border-color: hsl(var(--primary)); background-color: hsl(var(--primary)); }
          .editor-listitem-checked::after { content: ''; position: absolute; left: 4px; top: 0.2em + 4px; width: 8px; height: 4px; border-left: 2px solid hsl(var(--primary-foreground)); border-bottom: 2px solid hsl(var(--primary-foreground)); transform: rotate(-45deg); pointer-events: none; }
          .editor-listitem-checked { text-decoration: line-through; color: hsl(var(--muted-foreground)); }
          .editor-horizontal-rule { border: none; margin: 1.5em 0; height: 1px; background-color: hsl(var(--border)); }
          .editor-code { background-color: hsl(var(--muted)); font-family: Menlo, Monaco, Consolas, 'Courier New', monospace; padding: 1rem; margin-bottom: 0.8rem; font-size: 90%; overflow-x: auto; position: relative; line-height: 1.4; border-radius: 4px; }
          .editor-code:before { content: attr(data-highlight-language); position: absolute; top: 4px; right: 6px; font-size: 0.75rem; color: hsl(var(--muted-foreground)); opacity: 0.7; }
          .editor-tokenComment { color: slategray; } .editor-tokenPunctuation { color: #999; } .editor-tokenProperty { color: #905; } .editor-tokenSelector { color: #690; } .editor-tokenOperator { color: #9a6e3a; } .editor-tokenAttr { color: #07a; } .editor-tokenVariable { color: #e90; } .editor-tokenFunction { color: #dd4a68; }
          .lexical-editor-content-editable::selection, .lexical-editor-content-editable *::selection { background-color: var(--primary-light); color: var(--foreground); }
          .lexical-editor-content-editable { caret-color: var(--foreground) !important; }
          :root { --primary-light: rgba(0, 122, 255, 0.3); --border: #e2e8f0; }
          .dark { --primary-light: rgba(66, 153, 225, 0.3); --border: #2d3748; }
          .editor-link { color: hsl(var(--primary)); text-decoration: underline; text-decoration-color: hsl(var(--primary) / 0.4); transition: all 0.15s ease-out; cursor: pointer; }
          .editor-link:hover { color: hsl(var(--primary-hover)); text-decoration-color: hsl(var(--primary)); }
          .editor-list-li.checked { text-decoration: line-through; color: hsl(var(--muted-foreground)); }
          .editor-list-li.unchecked .editor-list-li-checkbox { border-color: hsl(var(--muted-foreground)); }
        `}</style>
      </LexicalComposer>
    </div>
  );
}

function EditorRefPlugin({ onRef }: { onRef: (editor: LexicalEditorType | null) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onRef(editor);
  }, [editor, onRef]);
  return null;
}

function areEqual(prevProps: Readonly<EditorProps>, nextProps: Readonly<EditorProps>) {
  if (prevProps.documentId !== nextProps.documentId) return false;
  if (prevProps.content !== nextProps.content) return false;
  if (prevProps.isNewDocument !== nextProps.isNewDocument) return false;

  return true;
}

export const LexicalEditor = memo(PureLexicalEditor, areEqual); 