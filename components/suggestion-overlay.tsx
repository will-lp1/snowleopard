"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, X, Command } from "lucide-react"

interface AiSuggestionOverlayProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  model?: string
  selectedText?: string
  onAcceptSuggestion?: (suggestion: string) => void
  suggestion?: string
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
  suggestion = "",
  isLoading = false,
  onSubmitPrompt,
}: AiSuggestionOverlayProps) {
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

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
      } else if (e.key === "Enter" && isOpen && inputValue && onSubmitPrompt) {
        onSubmitPrompt(inputValue)
        setInputValue("")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, inputValue, onSubmitPrompt])

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

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed z-50 bg-white rounded-md shadow-md border border-gray-200/80 w-[450px] overflow-hidden"
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
            placeholder="Editing instructions... (↑↓ for history, @ for code / documentation)"
            className="flex-1 outline-none text-gray-600 placeholder:text-gray-400 text-sm"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSubmitPrompt) {
                onSubmitPrompt(inputValue)
                setInputValue("")
              }
            }}
          />
          <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Close instruction */}
        <div className="text-xs text-gray-400">Esc to close</div>

        {/* Selected text display */}
        {selectedText && (
          <div className="mt-2 p-2 bg-gray-50 rounded-sm border border-gray-100 text-xs text-gray-600 font-mono max-h-[100px] overflow-y-auto">
            {selectedText}
          </div>
        )}

        {/* AI suggestion display */}
        {suggestion && (
          <div className="mt-2 p-2 bg-blue-50 rounded-sm border border-blue-100 text-xs text-gray-700">
            <div className="text-xs font-medium text-blue-700 mb-1">Suggestion:</div>
            {suggestion}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="ml-2 text-xs text-gray-500">Generating suggestion...</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-gray-100">
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

