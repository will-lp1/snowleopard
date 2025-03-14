"use client"

import { useCallback, useEffect, useState, useRef } from 'react';
import { X, Check, ChevronDown } from 'lucide-react';
import { useArtifact } from '@/hooks/use-artifact';
import { DiffView } from '@/components/diffview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface HighlightedTextProps {
  text: string;
  startIndex: number;
  endIndex: number;
}

// Define interface for metadata with our suggestion fields
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
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string>('');
  const [isSelectionExpanded, setIsSelectionExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

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

      let adjustedX = position.x;
      let adjustedY = position.y;

      // Adjust horizontal position if needed
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // Adjust vertical position if needed
      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      // Update position if adjustments were made
      if (adjustedX !== position.x || adjustedY !== position.y) {
        overlay.style.left = `${adjustedX}px`;
        overlay.style.top = `${adjustedY}px`;
      }
    }
  }, [isOpen, position]);

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

    setIsGenerating(true);
    setError(null);
    setSuggestion('');

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Create URL with parameters for EventSource
      const params = new URLSearchParams({
        documentId,
        description: prompt.trim()
      });
      
      if (selectedText) {
        params.append('selectedText', selectedText);
      }
      
      const url = `/api/suggestion?${params.toString()}`;
      
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
  }, [documentId, selectedText]);

  const handleAcceptSuggestion = async (suggestionText: string) => {
    if (!documentId || !artifact.content) {
      toast.error("No document is currently open");
      return;
    }

    setIsSaving(true);
    try {
      // Update the content with the suggestion
      let updatedContent = artifact.content;
      if (selectedText) {
        updatedContent = updatedContent.replace(selectedText, suggestionText);
      } else {
        updatedContent = suggestionText;
      }

      // Save the document
      const response = await fetch(`/api/document?id=${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: updatedContent,
          title: artifact.title,
          kind: artifact.kind,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      // Update local state
      setArtifact(prev => ({
        ...prev,
        content: updatedContent
      }));

      // Update metadata to mark suggestion as resolved if it exists
      if (metadata?.suggestions) {
        setMetadata((prev: SuggestionMetadata) => ({
          ...prev,
          suggestions: prev.suggestions?.map(s => 
            s.originalText === selectedText ? { ...s, isResolved: true } : s
          ) || []
        }));
      }

      toast.success('Changes saved successfully');
      onAcceptSuggestion(suggestionText);
      onClose();
    } catch (err) {
      console.error('Error saving document:', err);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-[400px] overflow-hidden"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <div className="px-3 py-2 space-y-2">
        {/* Header with close button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Suggestion</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" 
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
              <span>Selected Text</span>
              <ChevronDown
                size={16}
                className={cn("transition-transform", {
                  "transform rotate-180": isSelectionExpanded
                })}
              />
            </button>
            {isSelectionExpanded && (
              <div className="px-3 py-2 text-sm border-t">
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
            placeholder="Describe what changes you'd like to make..."
            className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 text-sm bg-transparent outline-none focus:ring-2 ring-blue-500/20"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isGenerating) {
                handleSubmitPrompt(inputValue);
              }
            }}
            disabled={isGenerating}
          />
        </div>
        
        {/* Error message */}
        {error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        
        {/* Diff view for original vs suggestion */}
        {originalContent && suggestion && (
          <div className="border rounded-lg overflow-hidden bg-muted/30">
            <div className="p-2 max-h-[300px] overflow-y-auto">
              <DiffView
                oldContent={originalContent}
                newContent={suggestion}
              />
            </div>
            
            {/* Action buttons */}
            <div className="flex justify-end gap-2 p-2 border-t bg-background/50">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-red-500"
                disabled={isSaving}
              >
                <X size={13} strokeWidth={2.5} />
                <span className="text-xs">Reject</span>
              </button>
              <button
                onClick={() => handleAcceptSuggestion(suggestion)}
                disabled={isSaving}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  isSaving 
                    ? "text-muted-foreground opacity-50 cursor-not-allowed" 
                    : "text-muted-foreground hover:text-green-500"
                )}
              >
                <Check size={13} strokeWidth={2.5} />
                <span className="text-xs">{isSaving ? 'Saving...' : 'Accept'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

