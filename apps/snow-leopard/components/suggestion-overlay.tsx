"use client"

import { useCallback, useEffect, useState, useRef } from 'react';
import { X, Check, ChevronDown, GripVertical, Loader2 } from 'lucide-react';
import { useArtifact } from '@/hooks/use-artifact';
import { DiffView } from '@/components/document/diffview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAiOptions } from '@/hooks/ai-options';

export interface HighlightedTextProps {
  text: string;
  startIndex: number;
  endIndex: number;
}

interface SuggestionMetadata {
  originalContent?: string;
  pendingSuggestion?: string;
  suggestions?: Array<{
    originalText: string;
    suggestedText: string;
    isResolved: boolean;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface SuggestionOverlayProps {
  documentId: string;
  selectedText?: string;
  isOpen: boolean;
  onClose: () => void;
  onAcceptSuggestion: (suggestion: string) => void;
  highlightedTextProps?: HighlightedTextProps;
  position?: { x: number; y: number };
}

export default function SuggestionOverlay({
  documentId,
  selectedText = '',
  isOpen,
  onClose,
  onAcceptSuggestion,
  position = { x: 100, y: 100 },
}: SuggestionOverlayProps) {
  const [currentPosition, setCurrentPosition] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string>('');
  const [isSelectionExpanded, setIsSelectionExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { customInstructions } = useAiOptions();

  // Function to truncate text to first 5 words
  const truncateText = (text: string, wordCount = 5) => {
    const words = text.split(/\s+/);
    if (words.length <= wordCount) return text;
    return words.slice(0, wordCount).join(' ') + '...';
  };

  // Update current position when initial position prop changes
  useEffect(() => {
    setCurrentPosition(position);
  }, [position]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow dragging from the header
    if (!(e.target as HTMLElement).closest('.drag-handle')) return;

    e.preventDefault();
    setIsDragging(true);
    
    const rect = overlayRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const overlayWidth = overlayRef.current?.offsetWidth || 0;
    const overlayHeight = overlayRef.current?.offsetHeight || 0;

    // Calculate new position
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // Constrain to viewport bounds with padding
    const padding = 10;
    newX = Math.max(padding, Math.min(viewportWidth - overlayWidth - padding, newX));
    newY = Math.max(padding, Math.min(viewportHeight - overlayHeight - padding, newY));

    setCurrentPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add and remove mouse move and up listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Reset state when the overlay opens
  useEffect(() => {
    if (isOpen) {
      setIsGenerating(false);
      setError(null);
      setSuggestion('');
      setOriginalContent(null);
      
      if (selectedText) {
        setOriginalContent(selectedText);
      }
    }
  }, [isOpen, selectedText]);

  // Close and cleanup when the component unmounts
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Adjust position to ensure overlay is visible within viewport
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      const overlay = overlayRef.current;
      const rect = overlay.getBoundingClientRect();

      // Check if overlay is outside viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = currentPosition.x;
      let adjustedY = currentPosition.y;

      // Adjust horizontal position if needed
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // Adjust vertical position if needed
      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      // Update position if adjustments were made
      if (adjustedX !== currentPosition.x || adjustedY !== currentPosition.y) {
        overlay.style.left = `${adjustedX}px`;
        overlay.style.top = `${adjustedY}px`;
      }
    }
  }, [isOpen, currentPosition]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && isOpen && inputValue && !isGenerating) {
      handleSubmitPrompt(inputValue);
    }
  }, [isOpen, onClose, inputValue, isGenerating]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  const handleSubmitPrompt = useCallback(async (prompt: string) => {
    if (!documentId) {
      toast.error("No document is currently open");
      return;
    }

    // Don't proceed if no text was selected for suggestion context
    if (!selectedText || selectedText.trim() === '') {
      toast.warning("Please select text to generate a suggestion for");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuggestion('');
    setOriginalContent(selectedText); // Keep track of original content

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Create URL with parameters for EventSource
      const params = new URLSearchParams({
        documentId,
        description: prompt.trim(),
      });
      
      if (selectedText) {
        params.append('selectedText', selectedText);
      }
      
      // Only add custom instructions if they exist
      if (customInstructions) {
        params.append('customInstructions', customInstructions);
      }
      
      const url = `/api/suggestion?${params.toString()}`;
      console.log('[SuggestionOverlay] Requesting suggestion with options:', { customInstructions: customInstructions ? '(custom)' : '(none)' });
      
      // Create new EventSource connection
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      eventSource.onerror = (event) => {
        console.error('EventSource error:', event);
        setError('Error connecting to suggestion service. Please try again.');
        setIsGenerating(false);
        eventSource.close();
        eventSourceRef.current = null;
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'id':
              // Document ID confirmation, nothing to do
              break;
              
            case 'original':
              setOriginalContent(data.content);
              break;
              
            case 'clear':
              // Clear current content if needed
              break;
              
            case 'suggestion-delta':
              setSuggestion(prev => prev + data.content);
              break;
              
            case 'error':
              setError(data.content);
              setIsGenerating(false);
              eventSource.close();
              eventSourceRef.current = null;
              break;
              
            case 'finish':
              setIsGenerating(false);
              setInputValue('');
              eventSource.close();
              eventSourceRef.current = null;
              break;
              
            default:
              console.warn('Unknown event type:', data.type);
          }
        } catch (err) {
          console.error('Error parsing event data:', event.data, err);
          setError('Error processing suggestion. Please try again.');
          setIsGenerating(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
      };
    } catch (err) {
      console.error('Error setting up EventSource:', err);
      setError('Failed to connect to suggestion service. Please try again.');
      setIsGenerating(false);
    }
  }, [documentId, selectedText, customInstructions]);

  const handleAcceptSuggestion = useCallback(async (suggestedText: string) => {
    if (!artifact.documentId || !originalContent) return;

    // Try to apply to ProseMirror editor if available
    try {
      // Define interface for Vue-enhanced elements 
      interface VueElement extends Element {
        __vue__?: {
          $refs?: {
            editor?: {
              view?: any;
            };
          };
        };
      }

      // Get the ProseMirror view instance
      const editorView = (document.querySelector('.ProseMirror') as VueElement)?.__vue__?.$refs?.editor?.view;
      
      if (editorView) {
        const { state, dispatch } = editorView;
        const { tr } = state;
        
        // Search for original content in document
        const docText = state.doc.textContent;
        let startPos = docText.indexOf(originalContent);
        
        if (startPos !== -1) {
          // Find exact position in document structure
          const endPos = startPos + originalContent.length;
          
          // Search for closest textNode containing the original content
          let foundNode = false;
          let nodeStartPos = 0;
          let nodeEndPos = 0;
          
          state.doc.descendants((node: any, pos: number) => {
            if (foundNode) return false;
            
            if (node.isText && node.text?.includes(originalContent)) {
              nodeStartPos = pos;
              nodeEndPos = pos + node.nodeSize;
              foundNode = true;
              return false;
            }
            
            if (node.textContent.includes(originalContent)) {
              // Check if this is a formatted node like a list item
              const isListItem = node.type.name === 'listItem' || 
                                node.type.name === 'bulletList' || 
                                node.type.name === 'orderedList';
              
              if (isListItem) {
                // For list items, handle specially
                nodeStartPos = pos;
                nodeEndPos = pos + node.nodeSize;
                foundNode = true;
                return false;
              }
            }
            
            return true;
          });
          
          if (foundNode) {
            // For list items and other formatting, try to preserve structure
            const $start = state.doc.resolve(nodeStartPos);
            const $end = state.doc.resolve(nodeEndPos);
            const isListItem = $start.parent.type.name === 'listItem' || 
                              $start.node().type.name === 'listItem' ||
                              $start.parent.type.name === 'bulletList' ||
                              $start.parent.type.name === 'orderedList';
            
            if (isListItem) {
              // For list items, create proper structure
              const schema = state.schema;
              const paragraphType = schema.nodes.paragraph;
              const listItemType = schema.nodes.listItem;
              
              // Create content with preserved formatting
              const paragraph = paragraphType.create(
                null,
                schema.text(suggestedText)
              );
              
              const listItem = listItemType.create(
                $start.parent.attrs,
                paragraph
              );
              
              tr.replaceWith(nodeStartPos, nodeEndPos, listItem);
            } else {
              // For regular text, simple replacement
              tr.replaceWith(nodeStartPos, nodeEndPos, state.schema.text(suggestedText));
            }
            
            dispatch(tr);
            toast.success('Changes applied');
            onClose();
            return;
          }
        }
      }
    } catch (err) {
      console.error('Error applying to ProseMirror:', err);
      // Fall back to direct content replacement
    }

    // Fallback: Update the content in the artifact directly
    const updatedContent = artifact.content.replace(originalContent, suggestedText);
    
    // Update local state
    setArtifact(prev => ({
      ...prev,
      content: updatedContent,
    }));

    // Update metadata to mark suggestion as resolved
    if (metadata?.suggestions) {
      setMetadata((prev: SuggestionMetadata) => ({
        ...prev,
        suggestions: prev.suggestions?.map(s => 
          s.originalText === originalContent ? { ...s, isResolved: true } : s
        ) || [],
      }));
    }

    toast.success('Changes applied');
    onClose();
  }, [artifact, originalContent, setArtifact, metadata, setMetadata, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await handleSubmitPrompt(inputValue);
    },
    [handleSubmitPrompt, inputValue],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "fixed z-50 bg-background rounded-lg shadow-lg border border-border w-[400px] overflow-hidden select-none",
        isDragging && "pointer-events-none"
      )}
      style={{
        top: `${currentPosition.y}px`,
        left: `${currentPosition.x}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="px-3 py-2 space-y-2">
        {/* Header with close button */}
        <div className="flex justify-between items-center drag-handle cursor-move">
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">Suggestion</h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground transition-colors" 
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selected text collapsible section */}
        {selectedText && (
          <div className="border rounded-md overflow-hidden bg-muted/30">
            <button
              onClick={() => setIsSelectionExpanded(!isSelectionExpanded)}
              className="w-full px-3 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <span className="truncate">
                {isSelectionExpanded ? "Selected Text" : truncateText(selectedText)}
              </span>
              <ChevronDown
                size={16}
                className={cn("transition-transform", {
                  "transform rotate-180": isSelectionExpanded
                })}
              />
            </button>
            {isSelectionExpanded && (
              <div className="px-3 py-2 text-sm border-t max-h-[150px] overflow-y-auto">
                {selectedText}
              </div>
            )}
          </div>
        )}
        
        {/* Input field */}
        <div>
          <input
            ref={inputRef}
            type="text"
            placeholder={selectedText ? "Describe what changes you'd like to make..." : "Select text first..."}
            className="w-full p-2 rounded-md border border-input text-sm bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isGenerating) {
                handleSubmitPrompt(inputValue);
              }
            }}
            disabled={isGenerating || !selectedText}
          />
        </div>
        
        {/* Error message */}
        {error && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive">
            {error}
          </div>
        )}
        
        {/* Diff view for original vs suggestion */}
        {(isGenerating || suggestion) && originalContent && (
          <div className="border rounded-lg overflow-hidden bg-muted/30">
            <div className="p-2 max-h-[300px] overflow-y-auto">
              <DiffView
                oldContent={originalContent}
                newContent={suggestion || originalContent} // Show old content while generating
              />
            </div>
            
            {/* Action buttons - only show on completion */}
            {!isGenerating && suggestion && (
              <div className="flex justify-end gap-2 p-2 border-t bg-background/50">
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-destructive"
                >
                  <X size={13} strokeWidth={2.5} />
                  <span className="text-xs">Reject</span>
                </button>
                <button
                  onClick={() => onAcceptSuggestion(suggestion)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-primary"
                >
                  <Check size={13} strokeWidth={2.5} />
                  <span className="text-xs">Accept</span>
                </button>
              </div>
            )}
            
            {/* Show loading state with spinner */}
            {isGenerating && (
              <div className="flex justify-center items-center p-2 border-t bg-background/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Generating suggestion...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

