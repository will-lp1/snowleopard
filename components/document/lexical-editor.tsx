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
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { CheckIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { toast } from 'sonner';
import { useAiOptions } from '@/hooks/ai-options';

import type { Suggestion } from '@/lib/db/schema';
import { DiffView } from './diffview';
import SuggestionOverlay from '@/components/suggestion-overlay';

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

function PureLexicalEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  onSuggestionResolve,
  documentId,
  saveState,
  lastSaveError,
  isNewDocument,
  onCreateDocument,
}: EditorProps) {
  const editorStateRef = useRef<EditorState | null>(null);
  const lastContentRef = useRef<string>(content);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [previousContent, setPreviousContent] = useState<string>('');
  const [aiUpdatedContent, setAiUpdatedContent] = useState<string>('');
  const [diffSections, setDiffSections] = useState<DiffSection[]>([]);
  const aiUpdateInProgressRef = useRef<boolean>(false);
  const contentChangedRef = useRef<boolean>(false);
  const editorRef = useRef<LexicalEditorType | null>(null);
  const initialLoadCompletedRef = useRef<boolean>(false);
  const lastDocumentIdRef = useRef<string>(documentId);
  const editorContentSynced = useRef<boolean>(false);
  
  // Add state for suggestion overlay
  const [selectedText, setSelectedText] = useState<string>('');
  const [showSuggestionOverlay, setShowSuggestionOverlay] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });

  // Initialize editor configuration
  const initialConfig = {
    namespace: `Document-${documentId}`,
    theme,
    onError,
    nodes,
    editorState: content ? () => {
      const editor = createEditor();
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create proper Lexical nodes from content
        const paragraphs = content.split(/\n\n+/);
        paragraphs.forEach(paragraph => {
          if (paragraph.trim()) {
            root.append($createParagraphNode().append($createTextNode(paragraph)));
          } else {
            // Keep empty paragraphs for structure
            root.append($createParagraphNode());
          }
        });
      });
      
      // Mark as initialized immediately
      initialLoadCompletedRef.current = true;
      editorContentSynced.current = true;
      lastContentRef.current = content;
      console.log(`[Editor] Initial content loaded for document: ${documentId}`);
    } : undefined,
  };

  // Reset editor when document ID changes
  useEffect(() => {
    if (documentId !== lastDocumentIdRef.current) {
      console.log(`[Editor] Document ID changed from ${lastDocumentIdRef.current} to ${documentId}`);
      
      // Reset initialization flags
      initialLoadCompletedRef.current = false;
      editorContentSynced.current = false;
      contentChangedRef.current = false;
      
      // Update refs
      lastDocumentIdRef.current = documentId;
      
      // Cancel any pending saves
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Force editor update with new content
      if (editorRef.current && content) {
        console.log(`[Editor] Initializing editor for new document ID: ${documentId}`);
        
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          
          // Create proper Lexical nodes from content
          const paragraphs = content.split(/\n\n+/);
          paragraphs.forEach(paragraph => {
            if (paragraph.trim()) {
              root.append($createParagraphNode().append($createTextNode(paragraph)));
            } else {
              // Keep empty paragraphs for structure
              root.append($createParagraphNode());
            }
          });
        });
        
        // Update tracking refs
        lastContentRef.current = content;
        editorContentSynced.current = true;
      } else if (editorRef.current) {
        // Clear editor for new document with no content
        console.log(`[Editor] Clearing editor for new document ID: ${documentId} with no content`);
        
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode());
        });
        
        // Update tracking refs
        lastContentRef.current = '';
        editorContentSynced.current = true;
      }
    }
  }, [documentId, content]);

  // Enhanced effect to ensure content is loaded on refresh or document change
  useEffect(() => {
    if (content && editorRef.current && !editorContentSynced.current) {
      console.log('[Editor] Syncing editor content:', content.substring(0, 50) + '...');
      
      editorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create proper Lexical nodes from content
        const paragraphs = content.split(/\n\n+/);
        paragraphs.forEach(paragraph => {
          if (paragraph.trim()) {
            root.append($createParagraphNode().append($createTextNode(paragraph)));
          } else {
            // Keep empty paragraphs for structure
            root.append($createParagraphNode());
          }
        });
      });
      
      // Update refs to track we've loaded content
      lastContentRef.current = content;
      editorContentSynced.current = true;
      initialLoadCompletedRef.current = true;
      console.log('[Editor] Editor content sync complete for document:', documentId);
    }
  }, [content, documentId]);

  // Function to show suggestion overlay for selected text
  const handleShowSuggestionOverlay = useCallback(() => {
    if (!editorRef.current) return;
    
    // Get selected text from editor
    let selection = '';
    let position = { x: 0, y: 0 };
    let hasValidPosition = false;
    
    editorRef.current.getEditorState().read(() => {
      const lexicalSelection = $getSelection();
      if ($isRangeSelection(lexicalSelection) && !lexicalSelection.isCollapsed()) {
        selection = lexicalSelection.getTextContent();
        
        // Get DOM selection for positioning
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          position.x = rect.left;
          position.y = rect.bottom;
          hasValidPosition = true;
        }
      }
    });
    
    if (selection && hasValidPosition) {
      setSelectedText(selection);
      
      // Calculate position for overlay
      const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
      const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
      
      setOverlayPosition({
        x: position.x + scrollX,
        y: position.y + scrollY + 10 // 10px below selection
      });
      
      setShowSuggestionOverlay(true);
    }
  }, []);

  // Fix the function to handle accepting a suggestion from the overlay
  const handleAcceptSuggestion = useCallback((suggestion: string) => {
    if (!editorRef.current || !selectedText) return;
    
    // Insert the suggestion in place of the selected text
    editorRef.current.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Delete the selected text first
        selection.insertText('');
        
        // Then insert the suggested text
        selection.insertText(suggestion);
        
        // Trigger a manual save to ensure persistence
        lastContentRef.current = '';  // Force a save by invalidating the ref
        contentChangedRef.current = true;
      }
    });
    
    // Force a save immediately after applying the suggestion
    setTimeout(() => {
      if (editorRef.current) {
        const currentState = editorRef.current.getEditorState();
        let content = '';
        currentState.read(() => {
          const root = $getRoot();
          const paragraphs: string[] = [];
          root.getChildren().forEach((node) => {
            const textContent = node.getTextContent();
            if (textContent.trim()) {
              paragraphs.push(textContent);
            }
          });
          content = paragraphs.join('\n\n');
        });
        
        console.log('[Editor] Saving content after applying suggestion');
        onSaveContent(content, false);
      }
    }, 50);
    
    // Close the overlay
    setShowSuggestionOverlay(false);
    setSelectedText('');
  }, [selectedText, onSaveContent]);

  // Text selection handler
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        // Enable context menu for suggestions on selection
        // This would be triggered by right-click or another UI element
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Add keyboard shortcut for showing suggestion overlay (Cmd+E / Ctrl+E)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        handleShowSuggestionOverlay();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleShowSuggestionOverlay]);

  // Store reference to editor
  const handleEditorReference = useCallback((editor: LexicalEditorType) => {
    editorRef.current = editor;
  }, []);

  // New function to generate diff sections from old and new content
  const generateDiffSections = useCallback((oldText: string, newText: string) => {
    // Guard against null/undefined inputs
    if (!oldText || !newText) {
      console.log('[Editor] Cannot generate diff sections - missing content');
      return;
    }
    
    // Simple algorithm to split by paragraphs
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
      let searchLimit = Math.min(5, oldParagraphs.length - i);
      
      for (let k = 1; k <= searchLimit; k++) {
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

  // Accept a single diff section
  const acceptDiffSection = useCallback((sectionId: string) => {
    const section = diffSections.find(s => s.id === sectionId);
    if (!section || !section.oldContent || !section.newContent) return;
    
    try {
      // Get the current editor content
      const currentContent = lastContentRef.current;
      
      // Replace the old content with the new content
      const updatedContent = currentContent.replace(section.oldContent, section.newContent);
      
      // Update the editor and save content
      lastContentRef.current = updatedContent;
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

  // Accept all AI changes
  const acceptAiChanges = useCallback(() => {
    setShowDiff(false);
    
    if (aiUpdatedContent) {
      // Save the AI-updated content
      onSaveContent(aiUpdatedContent, false);
      
      // Reset AI update state
      setAiUpdatedContent('');
      setPreviousContent('');
      setDiffSections([]);
      aiUpdateInProgressRef.current = false;
    }
  }, [aiUpdatedContent, onSaveContent]);

  // Handle AI-driven document updates and diff view
  useEffect(() => {
    // Function to handle artifactUpdate data events
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
            const currentContent = lastContentRef.current;
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
          }
        }
      } catch (error) {
        console.error('[Editor] Error handling artifact update data:', error);
      }
    };
    
    // Add listener for editor stream data
    window.addEventListener('editor:stream-data', handleStreamArtifactUpdate as EventListener);
    
    return () => {
      window.removeEventListener('editor:stream-data', handleStreamArtifactUpdate as EventListener);
    };
  }, [documentId, generateDiffSections]);

  // Handle content updates from parent
  useEffect(() => {
    if (content) {
      // Handle refresh case - force update if content doesn't match last saved
      if (lastContentRef.current !== content && editorRef.current && contentChangedRef.current === false) {
        console.log('[Editor] Detected stale content after refresh, updating editor');
        
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          
          // Create proper Lexical nodes from content
          const paragraphs = content.split(/\n\n+/);
          paragraphs.forEach(paragraph => {
            if (paragraph.trim()) {
              root.append($createParagraphNode().append($createTextNode(paragraph)));
            }
          });
        });
      }
      
      // Skip this update if it would cause a loop
      if (lastContentRef.current === content) {
        return;
      }

      // Check if this content update might be from an AI update
      if (status === 'streaming' || aiUpdateInProgressRef.current) {
        console.log('[Editor] AI update detected, saving current content for diff view');
        
        // Save current content for diff view and mark as AI update in progress
        if (!aiUpdateInProgressRef.current) {
          setPreviousContent(lastContentRef.current);
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
      lastContentRef.current = content;
      contentChangedRef.current = false; // Reset since we just got new content from parent
    }
  }, [content, status, previousContent, generateDiffSections]);

  // Add an event listener for the 'apply-suggestion' event
  useEffect(() => {
    const handleApplySuggestion = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      
      const { originalText, suggestion, documentId: suggestedDocId } = event.detail;
      
      // Only handle if this event is for our document
      if (suggestedDocId === documentId && originalText && suggestion) {
        console.log('[Editor] Handling apply-suggestion event for:', originalText);
        
        // Update the editor using Lexical's API
        editorRef.current.update(() => {
          const textNodes = $nodesOfType(TextNode);
          let found = false;

          for (const node of textNodes) {
            const textContent = node.getTextContent();
            const index = textContent.indexOf(originalText);

            if (index !== -1) {
              console.log('[Editor] Found text in node, applying spliceText');
              // Use spliceText for precise replacement within the node
              node.spliceText(index, originalText.length, suggestion);
              found = true;
              break; // Stop after the first match
            }
          }
          
          // Fallback: If spliceText didn't find/replace (e.g., selection across nodes?)
          // Revert to the simpler string replace and re-parse approach.
          if (!found) {
            console.warn('[Editor] SpliceText failed, falling back to full re-parse for suggestion.');
            const root = $getRoot();
            const currentContent = root.getTextContent(); // Get current content directly
            
            if (currentContent.includes(originalText)) {
              const updatedContent = currentContent.replace(originalText, suggestion);
              
              // Re-render the entire document
              root.clear();
              const paragraphs = updatedContent.split(/\n\n+/);
              paragraphs.forEach(paragraph => {
                if (paragraph.trim()) {
                  root.append($createParagraphNode().append($createTextNode(paragraph)));
                } else {
                  // Handle empty paragraphs if needed
                  root.append($createParagraphNode());
                }
              });
              
              // Update ref immediately since onChange might not catch this fast enough
              lastContentRef.current = updatedContent;
              found = true;
            }
          }

          if (!found) {
            console.error('[Editor] Failed to apply suggestion. Original text not found:', originalText);
          }
        });
        
        // Force a save immediately after the update completes
        // Use a small timeout to ensure the update has flushed
        setTimeout(() => {
          if (editorRef.current) {
            const currentState = editorRef.current.getEditorState();
            let content = '';
            currentState.read(() => {
              const root = $getRoot();
              // Use a more reliable way to get paragraphs, respecting structure
              content = root.getChildren().map(node => node.getTextContent()).join('\n\n');
            });
            
            console.log('[Editor] Saving content after applying suggestion event');
            onSaveContent(content, false); // Immediate save
          }
        }, 0); 
      }
    };
    
    // Listen for apply-suggestion events
    window.addEventListener('apply-suggestion', handleApplySuggestion as EventListener);
    
    return () => {
      window.removeEventListener('apply-suggestion', handleApplySuggestion as EventListener);
    };
  }, [documentId, onSaveContent]);

  // Add an event listener for version restoration events
  useEffect(() => {
    const handleVersionRestored = (event: CustomEvent) => {
      if (!editorRef.current || !event.detail) return;
      
      const { documentId: restoredDocId, content: restoredContent } = event.detail;
      
      // Only update editor if this event is for our current document
      if (restoredDocId === documentId && restoredContent) {
        console.log('[Editor] Handling version-restored event');
        
        // Force update the editor content with the restored version
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          
          // Create proper Lexical nodes from the restored content
          const paragraphs = (restoredContent as string).split(/\n\n+/);
          paragraphs.forEach((paragraph: string) => {
            if (paragraph.trim()) {
              root.append($createParagraphNode().append($createTextNode(paragraph)));
            } else {
              // Keep empty paragraphs for structure
              root.append($createParagraphNode());
            }
          });
        });
        
        // Update refs to track we've loaded content
        lastContentRef.current = restoredContent as string;
        contentChangedRef.current = false;
        console.log('[Editor] Editor content updated with restored version');
      }
    };
    
    // Listen for version restoration events
    window.addEventListener('version-restored', handleVersionRestored as EventListener);
    
    return () => {
      window.removeEventListener('version-restored', handleVersionRestored as EventListener);
    };
  }, [documentId]);

  // Simplified onChange handler to prevent cursor jumps during saves
  const onChange = useCallback((editorState: EditorState) => {
    editorStateRef.current = editorState;
    
    // Extract content without any selection side effects
    let serializedContent = '';
    let savedSelection = null;
    
    editorState.read(() => {
      // Get text content
      const root = $getRoot();
      const paragraphs: string[] = [];
      root.getChildren().forEach((node) => {
        paragraphs.push(node.getTextContent());
      });
      serializedContent = paragraphs.join('\n\n');
      
      // Save selection for later reference
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        savedSelection = selection.clone();
      }
    });

    // Skip if content hasn't changed
    if (serializedContent === lastContentRef.current) {
      return;
    }

    // --- NEW DOCUMENT CREATION LOGIC ---
    // Check if this is the first edit in a new document
    if (isNewDocument && lastContentRef.current === '' && serializedContent !== '') {
      console.log('[Editor] First edit detected in new document, triggering creation...');
      // Call the creation callback instead of the regular save
      if (onCreateDocument) {
        // Update refs immediately to prevent duplicate creation calls
        lastContentRef.current = serializedContent; 
        contentChangedRef.current = true; // Mark as dirty, though save is handled by creation
        
        // Clear any pending save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        
        // Call the creation handler passed from the parent
        onCreateDocument(serializedContent);
      }
      return; // Stop further processing in this onChange call
    }
    // --- END NEW DOCUMENT LOGIC ---

    // Update reference for comparison (for existing documents)
    lastContentRef.current = serializedContent;
    contentChangedRef.current = true;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Store current document ID to handle doc changes during timeout
    const currentDocId = documentId;
    
    // Schedule save
    if (saveState !== 'saving') {
      saveTimeoutRef.current = setTimeout(() => {
        // Check if document ID changed during timeout
        if (currentDocId !== documentId) {
          console.log('[Editor] Document changed during save timeout, cancelling save');
          return;
        }
        
        if (contentChangedRef.current && editorRef.current) {
          // THE CRITICAL FIX: Add skip-dom-selection tag OUTSIDE the update
          editorRef.current.update(() => {
            // This prevents Lexical from updating the DOM selection
            $addUpdateTag('skip-dom-selection');
          });
          
          console.log(`[Editor] Saving content for ${documentId}`);
          onSaveContent(serializedContent, true);
        }
        saveTimeoutRef.current = null;
      }, 800);
    }
  }, [documentId, onSaveContent, saveState, isNewDocument, onCreateDocument]);

  // Improved cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Only save if there are unsaved changes and we're not already saving
      if (contentChangedRef.current && saveState !== 'saving' && documentId === lastDocumentIdRef.current) {
        console.log('[Editor] Saving on unmount for document:', documentId);
        onSaveContent(lastContentRef.current, false); // immediate save
      }
    };
  }, [onSaveContent, saveState, documentId]);

  // Add keyboard shortcut for manual saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+S or Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        
        console.log('[Editor] Manual save triggered with keyboard shortcut');
        
        // Get current content and save immediately (no debounce)
        if (editorRef.current) {
          editorRef.current.getEditorState().read(() => {
            const root = $getRoot();
            const paragraphs: string[] = [];
            root.getChildren().forEach((node) => {
              const textContent = node.getTextContent();
              // Include all paragraphs
              paragraphs.push(textContent);
            });
            const content = paragraphs.join('\n\n');
            
            // Force immediate save
            onSaveContent(content, false);
            
            // Show visual indicator
            toast.success('Document saved', { duration: 1500 });
          });
        }
      }
    };
    
    // Add the event listener to the window
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onSaveContent]);

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
                <CheckIcon size={12} strokeWidth={2.5} />
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
                        <CheckIcon size={12} strokeWidth={2.5} />
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

      {/* Add suggestion overlay */}
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
        <div className="lexical-editor-container">
          <RichTextPlugin
            contentEditable={<ContentEditable className="lexical-editor-content-editable min-h-[300px] outline-none" />}
            placeholder={<PlaceholderPlugin isNewDocument={isNewDocument} />}
            ErrorBoundary={() => <div>Error loading editor</div>}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <ListPlugin />
          
          {/* Order is important! InlineSuggestionsPlugin needs to handle tab BEFORE TabIndentationPlugin */}
          <InlineSuggestionsPlugin documentId={documentId} onSaveContent={onSaveContent} />
          <TabIndentationPlugin />
          
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangePlugin onChange={onChange} />
          
          {/* Custom plugin to store editor reference */}
          <EditorRefPlugin onRef={handleEditorReference} />
        </div>
        <style jsx global>{`
          .lexical-editor-content-editable {
            border: 0;
            font-family: inherit;
            font-size: 1rem;
            resize: none;
            width: 100%;
            caret-color: var(--foreground);
            position: relative;
            tab-size: 1;
            outline: 0;
            padding: 0;
          }
          
          .lexical-editor-placeholder {
            color: var(--muted-foreground);
            overflow: hidden;
            position: absolute;
            text-overflow: ellipsis;
            top: 0;
            left: 0;
            user-select: none;
            pointer-events: none;
            opacity: 0.6;
          }

          .inline-suggestion {
            display: none;
            pointer-events: none;
            user-select: none;
            color: var(--foreground);
            padding: 0;
            margin: 0;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            position: absolute !important;
            z-index: 9999 !important;
            white-space: pre-wrap;
            word-break: break-word;
            max-width: 100%;
            overflow-wrap: break-word;
            text-overflow: ellipsis;
            overflow: hidden;
            opacity: 0;
            transition: opacity 0.15s ease;
          }

          .inline-suggestion.visible {
            opacity: 1;
          }

          /* Common styling for light and dark modes */
          .suggestion-text {
            opacity: 0.5;
            font-weight: 450;
            color: var(--foreground);
            white-space: inherit;
            word-break: inherit;
            overflow-wrap: inherit;
            transition: opacity 0.15s ease;
            padding: 0 1px;
            text-shadow: 0 0 0.5px rgba(0, 0, 0, 0.03);
          }
          
          /* Inline tab button with improved visibility */
          .inline-tab-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 2px;
            vertical-align: baseline;
            opacity: 0.9; /* Slightly more visible by default */
            transition: all 0.15s ease;
          }
          
          /* Tab key visualization with better contrast */
          .inline-tab-button .tab-key {
            font-size: 10px;
            font-weight: 500;
            letter-spacing: 0.3px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--muted-foreground);
            color: var(--background);
            text-transform: lowercase;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            position: relative;
            top: -1px;
          }

          /* Tooltip styling for both modes */
          .suggestion-tooltip {
            position: absolute;
            top: -26px;
            right: 0;
            background: var(--background);
            border-radius: 4px;
            font-size: 11px;
            font-weight: 450;
            padding: 3px 8px;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
            border: 1px solid var(--border);
            opacity: 0;
            transform: translateY(4px);
            transition: all 0.2s ease;
            pointer-events: none;
            color: var(--foreground);
          }
          
          /* Key styling in tooltip */
          .suggestion-tooltip .key {
            font-weight: 500;
            background: var(--muted);
            color: var(--foreground);
            padding: 1px 5px;
            border-radius: 3px;
            margin: 0 1px;
            border: 1px solid var(--border);
          }

          /* Hover states with smooth transitions */
          .inline-suggestion:hover .suggestion-text {
            opacity: 0.85;
            background: rgba(0, 122, 255, 0.08);
            border-radius: 2px;
          }
          
          .inline-suggestion:hover .inline-tab-button {
            opacity: 1;
            transform: scale(1.02);
          }

          /* Animation for suggestion acceptance */
          @keyframes flash-highlight {
            0% { background-color: transparent; }
            30% { background-color: rgba(0, 122, 255, 0.12); }
            100% { background-color: transparent; }
          }

          .suggestion-accepted .suggestion-text {
            animation: flash-highlight 0.4s ease-out;
          }

          /* Fade out animation */
          .suggestion-fade-out {
            opacity: 0 !important;
            transform: translateX(0);
            transition: opacity 0.15s ease;
          }

          /* Show tooltip on hover */
          .inline-suggestion:hover .suggestion-tooltip {
            opacity: 1;
            transform: translateY(0);
          }
          
          /* Editor theme styling */
          .editor-text-bold {
            font-weight: bold;
          }

          .editor-text-italic {
            font-style: italic;
          }

          .editor-text-underline {
            text-decoration: underline;
          }

          .editor-paragraph {
            margin: 0 0 1em 0;
            position: relative;
          }

          .editor-heading-h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-top: 2rem;
            margin-bottom: 1rem;
          }

          .editor-heading-h2 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
          }

          .editor-heading-h3 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-top: 1.25rem;
            margin-bottom: 0.5rem;
          }

          .editor-quote {
            margin: 1rem 0;
            padding-left: 1rem;
            border-left: 4px solid var(--border);
            color: var(--muted-foreground);
          }

          .editor-list-ul, .editor-list-ol {
            margin: 0 0 0 1rem;
            padding: 0;
          }

          .editor-list-li {
            margin: 0 0 0.5rem 0;
          }
          
          .editor-horizontal-rule {
            padding: 2px 0;
            border: none;
            margin: 1em 0;
            height: 1px;
            background-color: var(--border);
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

          /* Ensure selection styling works in both modes */
          .lexical-editor-content-editable::selection,
          .lexical-editor-content-editable *::selection {
            background-color: var(--primary-light);
            color: var(--foreground);
          }

          /* Fix caret color */
          .lexical-editor-content-editable {
            caret-color: var(--foreground) !important;
          }

          .editor-root {
            --caret-color: var(--foreground) !important;
          }

          /* Light/dark mode theme variables */
          :root {
            --primary-light: rgba(0, 122, 255, 0.3);
            --border: #e2e8f0;
          }

          .dark {
            --primary-light: rgba(66, 153, 225, 0.3);
            --border: #2d3748;
        `}</style>
      </LexicalComposer>
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

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  // Always re-render when documentId changes to ensure proper initialization
  if (prevProps.documentId !== nextProps.documentId) {
    return false;
  }
  
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent &&
    prevProps.onSuggestionResolve === nextProps.onSuggestionResolve &&
    prevProps.saveState === nextProps.saveState &&
    prevProps.isNewDocument === nextProps.isNewDocument &&
    prevProps.onCreateDocument === nextProps.onCreateDocument
  );
}

export const LexicalEditor = memo(PureLexicalEditor, areEqual); 