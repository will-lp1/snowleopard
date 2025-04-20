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

import EditorToolbar from '@/components/document/editor-toolbar';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  documentId: string;
  saveState?: 'idle' | 'saving' | 'error';
  lastSaveError?: string | null;
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
  status,
  documentId,
  saveState,
  lastSaveError,
  isNewDocument,
  onCreateDocument,
  isCurrentVersion,
  currentVersionIndex
}: EditorProps) {
  const [editor] = useLexicalComposerContext();
  const initialContentRef = useRef(content);
  const lastSavedContentRef = useRef(content);
  const hasUnsavedChangesRef = useRef(false);
  const isCreatingRef = useRef(isNewDocument);
  const [localSaveState, setLocalSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [localError, setLocalError] = useState<string | null>(null);
  const editorRef = useRef<LexicalEditorType | null>(null);

  // Combine external and internal save state/error
  const displaySaveState = saveState ?? localSaveState;
  const displayError = lastSaveError ?? localError;

  // Callback to handle content saving
  const handleSave = useCallback((updatedContent: string, forceSave = false) => {
    // Only save if content actually changed, unless forced
    if (forceSave || updatedContent !== lastSavedContentRef.current) {
      // If it's a new document being created, call onCreateDocument first
      if (isCreatingRef.current && onCreateDocument) {
        console.log('[LexicalEditor] Creating new document before first save...');
        setLocalSaveState('saving');
        setLocalError(null);
        onCreateDocument(updatedContent)
          .then(() => {
            console.log('[LexicalEditor] New document created successfully.');
            isCreatingRef.current = false; // No longer creating
            lastSavedContentRef.current = updatedContent;
            hasUnsavedChangesRef.current = false;
            setLocalSaveState('idle');
            onSaveContent(updatedContent, false); // Notify parent (no debounce needed after create)
          })
          .catch((err) => {
            console.error('[LexicalEditor] Error creating document:', err);
            setLocalSaveState('error');
            setLocalError(err.message || 'Failed to create document');
          });
      } else if (!isCreatingRef.current) {
        // Existing document, just save content
        console.log('[LexicalEditor] Saving existing document content...');
        setLocalSaveState('saving');
        setLocalError(null);
        // Call parent's onSaveContent (likely debounced)
        onSaveContent(updatedContent, true); 
        lastSavedContentRef.current = updatedContent;
        hasUnsavedChangesRef.current = false;
        // Parent should update saveState prop eventually, or we timeout
        setTimeout(() => {
           if (localSaveState === 'saving') setLocalSaveState('idle'); // Assume success if not updated
        }, 3000); 
      }
    }
  }, [onSaveContent, onCreateDocument, localSaveState]);

  // Debounced save function
  const debouncedSave = useCallback(debounce(handleSave, 1000), [handleSave]);

  // Handle content changes
  const handleContentChange = useCallback((editorState: EditorState) => {
    editorState.read(() => {
      const root = $getRoot();
      const currentTextContent = root.getTextContent();
      
      // Check if content has actually changed since last save
      if (currentTextContent !== lastSavedContentRef.current) {
        hasUnsavedChangesRef.current = true;
        // Trigger debounced save for existing docs, or immediate create for new docs
        if (!isCreatingRef.current) {
           debouncedSave(currentTextContent);
        } else {
           // For new docs, maybe wait for a slightly longer pause or explicit save?
           // Or trigger create immediately on first significant change? 
           // Let's try debounced save for now, handleSave will call onCreateDocument.
           debouncedSave(currentTextContent);
        }
      }
    });
  }, [debouncedSave]);

  // Effect to initialize editor state
  useEffect(() => {
    const initialContent = initialContentRef.current;
    if (editor && initialContent) {
      try {
        const initialEditorState = editor.parseEditorState(initialContent);
        editor.setEditorState(initialEditorState);
        lastSavedContentRef.current = initialContent; // Set initial saved state
      } catch (error) {
        console.error("Failed to parse initial editor state:", error);
        // Fallback to empty state if parsing fails
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode());
        });
        lastSavedContentRef.current = '';
      }
    }
  }, [editor]);

  // Effect to handle external save state changes
  useEffect(() => {
     if (saveState && saveState !== 'saving') {
        setLocalSaveState(saveState);
     }
     if (lastSaveError) {
        setLocalError(lastSaveError);
     }
  }, [saveState, lastSaveError]);

  return (
    <div className="relative">
      {/* Editor Toolbar Integration */}
      <EditorToolbar editor={editorRef.current} /> 
      <RichTextPlugin
        contentEditable={<ContentEditable className="lexical-editor-content-editable outline-none min-h-[200px]" spellCheck="false" />}
        placeholder={<PlaceholderPlugin isNewDocument={isNewDocument} />}
        ErrorBoundary={() => <div>Error loading editor content.</div>} 
      />
      <OnChangePlugin onChange={handleContentChange} ignoreSelectionChange ignoreHistoryMergeTagChange />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <LinkPlugin />
      <TabIndentationPlugin /> 
      <MarkdownShortcutPlugin transformers={[...TRANSFORMERS, CHECK_LIST, STRIKETHROUGH]} />
      {/* Custom Plugins */}
      <EditorRefPlugin onRef={editorRef} /> 
      <InlineSuggestionsPlugin documentId={documentId} onSaveContent={handleSave} /> 
      {/* Save Status Indicator */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        {displaySaveState === 'saving' && 'Saving...'}
        {displaySaveState === 'error' && `Error: ${displayError || 'Failed to save'}`}
        {/* {displaySaveState === 'idle' && hasUnsavedChangesRef.current && 'Unsaved'} */}
        {/* Optionally show saved status: {displaySaveState === 'idle' && !hasUnsavedChangesRef.current && 'Saved'} */}
      </div>
    </div>
  );
}

// Add editor reference plugin
function EditorRefPlugin({ onRef }: { onRef: (editor: LexicalEditorType) => void }) {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    onRef(editor);
  }, [editor, onRef]);
  
  return null;
}

// areEqual comparison function: Simplify by removing DiffView-related props
function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  if (prevProps.documentId !== nextProps.documentId) {
    return false;
  }
  
  // Don't re-render purely based on 'status' if it's just flipping during AI updates
  // Let the stream listener handle updates internally
  
  return (
    prevProps.content === nextProps.content &&
    prevProps.status === nextProps.status &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.saveState === nextProps.saveState &&
    prevProps.lastSaveError === nextProps.lastSaveError &&
    prevProps.isNewDocument === nextProps.isNewDocument &&
    prevProps.onCreateDocument === nextProps.onCreateDocument
  );
}

export const LexicalEditor = memo(PureLexicalEditor, areEqual); 