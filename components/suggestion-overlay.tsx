"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronDown, X, Command, CheckCircle, XCircle } from "lucide-react"
import { useArtifact } from "@/hooks/use-artifact"
import { DiffView } from '@/components/diffview'
import { toast } from "sonner"

// Define interface for metadata with our suggestion fields
interface SuggestionMetadata {
  originalContent?: string;
  pendingSuggestion?: string;
  suggestions?: any[];
  [key: string]: any;
}

interface AiSuggestionOverlayProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  model?: string
  selectedText?: string
  onAcceptSuggestion?: (suggestion: string) => void
  isLoading?: boolean
  onSubmitPrompt?: (prompt: string) => void
}

export function AiSuggestionOverlay({
  isOpen,
  onClose,
  position,
  model = "claude-3.5-sonnet",
  selectedText = "",
  onAcceptSuggestion,
  isLoading: externalIsLoading = false,
  onSubmitPrompt,
}: AiSuggestionOverlayProps) {
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const { artifact, metadata, setMetadata, setArtifact } = useArtifact()

  // Update loading state from external source
  useEffect(() => {
    setIsLoading(externalIsLoading);
  }, [externalIsLoading]);
  
  // Submit the prompt to our suggestion API
  const handleSubmitPrompt = useCallback(async (prompt: string) => {
    if (!artifact.documentId || artifact.documentId === 'init') {
      toast.error("No document is currently open");
      return;
    }
    
    setIsLoading(true);
    setIsStreaming(true);
    console.log("Submitting prompt for suggestion:", prompt);
    
    try {
      // Make sure we're showing pending changes in metadata
      setMetadata((prevMetadata: SuggestionMetadata) => ({
        ...prevMetadata,
        originalContent: selectedText || "",
        pendingSuggestion: ""
      }));

      const response = await fetch('/api/suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: artifact.documentId,
          description: prompt,
          selectedText: selectedText
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      console.log("Response received, starting to process stream");
      
      // Use the native EventSource API to handle server-sent events
      // This is more reliable than manual parsing
      const responseText = await response.text();
      const events = responseText.split('\n\n').filter(e => e.trim());
      
      console.log(`Received ${events.length} events from stream`);
      
      for (const event of events) {
        try {
          if (event.startsWith('data: ')) {
            const jsonStr = event.slice(6);
            const data = JSON.parse(jsonStr);
            console.log("Parsed event:", data.type);
            
            // Process each event type
            if (data.type === 'original') {
              console.log("Setting original content:", data.content);
              setMetadata((prevMetadata: SuggestionMetadata) => ({
                ...prevMetadata,
                originalContent: data.content,
                pendingSuggestion: ''
              }));
            } else if (data.type === 'suggestion-delta') {
              setMetadata((prevMetadata: SuggestionMetadata) => ({
                ...prevMetadata,
                pendingSuggestion: (prevMetadata.pendingSuggestion || '') + data.content
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing event:', e, event);
        }
      }
      
      console.log("Finished processing all events");
      setIsStreaming(false);
      setInputValue("");
      
    } catch (error) {
      console.error('Error generating suggestion:', error);
      toast.error("Failed to generate suggestion");
      
      setIsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  }, [artifact.documentId, selectedText, setMetadata]);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isOpen])

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      } else if (e.key === "Enter" && isOpen && inputValue && !isLoading && !isStreaming) {
        handleSubmitPrompt(inputValue)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, inputValue, isLoading, isStreaming, handleSubmitPrompt])

  // Adjust position to ensure overlay is visible within viewport
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      const overlay = overlayRef.current
      const rect = overlay.getBoundingClientRect()

      // Check if overlay is outside viewport
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = position.x
      let adjustedY = position.y

      // Adjust horizontal position if needed
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10
      }

      // Adjust vertical position if needed
      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10
      }

      // Update position if adjustments were made
      if (adjustedX !== position.x || adjustedY !== position.y) {
        overlay.style.left = `${adjustedX}px`
        overlay.style.top = `${adjustedY}px`
      }
    }
  }, [isOpen, position])

  // Handle applying the suggestion to the document
  const handleApplySuggestion = useCallback(() => {
    if (!metadata?.pendingSuggestion) return;
    
    const newContent = selectedText 
      ? artifact.content.replace(selectedText, metadata.pendingSuggestion)
      : metadata.pendingSuggestion;
    
    // Update the artifact content
    setArtifact(prevArtifact => ({
      ...prevArtifact,
      content: newContent
    }));
    
    // Clear the pending suggestion
    setMetadata((prevMetadata: SuggestionMetadata) => ({
      ...prevMetadata,
      originalContent: "",
      pendingSuggestion: ""
    }));
    
    toast.success("Suggestion applied");
    onClose();
  }, [artifact.content, metadata?.pendingSuggestion, selectedText, setArtifact, setMetadata, onClose]);

  // Handle rejecting the suggestion
  const handleRejectSuggestion = useCallback(() => {
    // Clear the pending suggestion
    setMetadata((prevMetadata: SuggestionMetadata) => ({
      ...prevMetadata,
      originalContent: "",
      pendingSuggestion: ""
    }));
    
    toast.info("Suggestion rejected");
    onClose();
  }, [setMetadata, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-md shadow-md border border-gray-200 dark:border-gray-700 w-[500px] overflow-hidden"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <div className="px-4 py-3 space-y-1.5">
        {/* Input field */}
        <div className="flex items-center">
          <input
            ref={inputRef}
            type="text"
            placeholder="Editing instructions... (↑↓ for history, Enter to submit)"
            className="flex-1 outline-none text-gray-600 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm bg-transparent"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading && !isStreaming) {
                handleSubmitPrompt(inputValue);
              }
            }}
            disabled={isLoading || isStreaming}
          />
          <button 
            onClick={onClose} 
            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" 
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Close instruction */}
        <div className="text-xs text-gray-400">Esc to close</div>

        {/* Selected text display */}
        {selectedText && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-sm border border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 font-mono max-h-[100px] overflow-y-auto">
            {selectedText}
          </div>
        )}

        {/* Loading indicator */}
        {(isLoading || isStreaming) && (
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="ml-2 text-xs text-gray-500">
              {isStreaming ? "Generating suggestion..." : "Loading..."}
            </span>
          </div>
        )}

        {/* Show debugging info if metadata is present but not displayed */}
        {!isLoading && !isStreaming && metadata?.pendingSuggestion && !metadata?.originalContent && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-900/30 text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-400">Suggestion received but can't display diff</p>
            <p className="text-amber-600 dark:text-amber-500 mt-1">
              Length of suggestion: {metadata.pendingSuggestion.length} characters
            </p>
            <div className="mt-2">
              <button
                onClick={() => {
                  // Force setting original content if it's missing
                  setMetadata((prevMetadata: SuggestionMetadata) => ({
                    ...prevMetadata,
                    originalContent: selectedText || ""
                  }));
                }}
                className="px-2 py-1 bg-amber-100 dark:bg-amber-800 rounded text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-700"
              >
                Fix Display
              </button>
            </div>
          </div>
        )}

        {/* Diff view for original vs suggestion */}
        {metadata?.originalContent && metadata?.pendingSuggestion && !isStreaming && (
          <div className="mt-2 border rounded-lg overflow-hidden">
            <div className="px-2 py-1 bg-muted text-xs font-medium">Changes:</div>
            <div className="p-2 max-h-[200px] overflow-y-auto">
              <DiffView 
                oldContent={metadata.originalContent} 
                newContent={metadata.pendingSuggestion} 
              />
            </div>
            
            {/* Action buttons */}
            <div className="flex justify-end gap-2 p-2 bg-muted/50 border-t">
              <button
                onClick={handleRejectSuggestion}
                className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                <XCircle size={14} />
                Reject
              </button>
              <button
                onClick={handleApplySuggestion}
                className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
              >
                <CheckCircle size={14} />
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Fallback display without diff view if only suggestion exists */}
        {!isLoading && !isStreaming && metadata?.pendingSuggestion && !metadata?.originalContent && (
          <div className="mt-2 border rounded-lg overflow-hidden">
            <div className="px-2 py-1 bg-muted text-xs font-medium">Suggestion:</div>
            <div className="p-2 max-h-[200px] overflow-y-auto bg-green-50 dark:bg-green-900/10 text-xs">
              {metadata.pendingSuggestion}
            </div>
            
            {/* Action buttons */}
            <div className="flex justify-end gap-2 p-2 bg-muted/50 border-t">
              <button
                onClick={handleRejectSuggestion}
                className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                <XCircle size={14} />
                Reject
              </button>
              <button
                onClick={() => {
                  // If we're missing the original content, just use the suggested content directly
                  setArtifact(prevArtifact => ({
                    ...prevArtifact,
                    content: metadata.pendingSuggestion
                  }));
                  
                  setMetadata((prevMetadata: SuggestionMetadata) => ({
                    ...prevMetadata,
                    originalContent: "",
                    pendingSuggestion: ""
                  }));
                  
                  toast.success("Suggestion applied");
                  onClose();
                }}
                className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
              >
                <CheckCircle size={14} />
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center text-xs text-gray-500">
            <ChevronDown size={14} className="mr-1" />
            <span>{model}</span>
          </div>

          <div className="flex items-center text-xs text-gray-500">
            <Command size={14} className="mr-1" />
            <span>K to toggle</span>
          </div>
        </div>
      </div>
    </div>
  )
}

