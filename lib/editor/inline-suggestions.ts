import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { EditorView } from 'prosemirror-view';

export const inlineSuggestionsKey = new PluginKey('inline-suggestions');

interface InlineSuggestionState {
  decorations: DecorationSet;
  currentSuggestion: string;
  documentId: string | null;
  lastRequestTime: number;
  abortController: AbortController | null;
  suggestionActive: boolean;
  lastCursorPosition: number | null;
}

// Debounce delay for suggestion requests (ms)
const SUGGESTION_DEBOUNCE = 300;
// Minimum content length before requesting suggestions
const MIN_CONTENT_LENGTH = 5;

export const inlineSuggestionsPlugin = new Plugin<InlineSuggestionState>({
  key: inlineSuggestionsKey,

  state: {
    init() {
      console.log('Initializing inline suggestions plugin');
      return {
        decorations: DecorationSet.empty,
        currentSuggestion: '',
        documentId: null,
        lastRequestTime: 0,
        abortController: null,
        suggestionActive: false,
        lastCursorPosition: null
      };
    },
    apply(tr, state) {
      // Update decorations based on transaction
      const meta = tr.getMeta(inlineSuggestionsKey);
      
      // Track cursor position for stability
      if (tr.selectionSet) {
        const currentPos = tr.selection.from;
        const cursorMoved = state.lastCursorPosition !== null && 
                           state.lastCursorPosition !== currentPos;
        
        // If cursor moved significantly, clear suggestions
        if (cursorMoved && Math.abs((state.lastCursorPosition || 0) - currentPos) > 1) {
          return {
            ...state,
            decorations: DecorationSet.empty,
            currentSuggestion: '',
            suggestionActive: false,
            lastCursorPosition: currentPos
          };
        }
        
        return {
          ...state,
          lastCursorPosition: currentPos
        };
      }
      
      // Clear suggestions if content changed significantly
      if (tr.docChanged && !tr.getMeta('no-suggestion-clear')) {
        // Check if it's just the suggestion being applied
        // If so, don't clear the suggestion state
        const isSuggestionApplication = tr.getMeta('suggestion-applied');
        
        if (!isSuggestionApplication) {
          return {
            ...state,
            decorations: DecorationSet.empty,
            currentSuggestion: '',
            suggestionActive: false
          };
        }
      }

      if (meta) {
        if (meta.type === 'clear') {
          return {
            ...state,
            decorations: DecorationSet.empty,
            currentSuggestion: '',
            suggestionActive: false
          };
        }
        if (meta.type === 'update') {
          return {
            ...state,
            decorations: meta.decorations,
            currentSuggestion: meta.suggestion,
            suggestionActive: true
          };
        }
        if (meta.type === 'setDocumentId') {
          console.log('Setting document ID:', meta.documentId);
          return {
            ...state,
            documentId: meta.documentId
          };
        }
        if (meta.type === 'updateLastRequestTime') {
          return {
            ...state,
            lastRequestTime: meta.time
          };
        }
        if (meta.type === 'setAbortController') {
          if (state.abortController) {
            try {
              state.abortController.abort();
            } catch (e) {
              // Ignore abort errors
            }
          }
          return {
            ...state,
            abortController: meta.controller
          };
        }
      }

      // Map decorations through changes
      const mapped = state.decorations.map(tr.mapping, tr.doc);
      return {
        ...state,
        decorations: mapped
      };
    }
  },

  props: {
    decorations(state) {
      const pluginState = this.getState(state);
      return pluginState ? pluginState.decorations : DecorationSet.empty;
    },

    handleKeyDown(view, event) {
      const pluginState = this.getState(view.state);
      if (!pluginState) return false;

      // Handle TAB to accept suggestion
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (pluginState.currentSuggestion && pluginState.suggestionActive) {
          event.preventDefault();
          
          // Use the new helper function to insert formatted content
          insertFormattedContent(view, pluginState.currentSuggestion);
          
          // Mark this as a suggestion application to prevent clearing
          tr.setMeta('suggestion-applied', true);
          
          // Clear the suggestion
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
          return true;
        }
      }

      // Clear suggestions on Escape
      if (event.key === 'Escape') {
        if (pluginState.currentSuggestion && pluginState.suggestionActive) {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
          return true;
        }
      }

      // Clear suggestions on arrow keys
      if (event.key.startsWith('Arrow')) {
        if (pluginState.currentSuggestion && pluginState.suggestionActive) {
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
        }
      }

      return false;
    }
  },

  view(editorView) {
    let timeout: NodeJS.Timeout | null = null;
    let isRequestInProgress = false;
    let positionUpdateInterval: NodeJS.Timeout | null = null;

    // Set up an interval to periodically update suggestion position
    // This helps with stability during scrolling and window resizing
    positionUpdateInterval = setInterval(() => {
      const state = editorView.state;
      const pluginState = inlineSuggestionsKey.getState(state);
      
      if (pluginState?.suggestionActive && pluginState.currentSuggestion) {
        updateSuggestionNodePosition(editorView);
      }
    }, 100);

    return {
      update: (view, prevState) => {
        const state = view.state;
        const pluginState = inlineSuggestionsKey.getState(state);
        
        if (!pluginState?.documentId) {
          return;
        }

        // Update suggestion position whenever the view updates
        if (pluginState.suggestionActive && pluginState.currentSuggestion) {
          updateSuggestionNodePosition(view);
        }

        // Clear any pending request
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }

        // Don't make new requests if one is already in progress
        if (isRequestInProgress) {
          return;
        }

        const now = Date.now();
        const timeSinceLastRequest = now - (pluginState.lastRequestTime || 0);
        
        // Check if we should request a new suggestion
        const selectionChanged = prevState && state.selection.from !== prevState.selection.from;
        const contentChanged = prevState && state.doc !== prevState.doc;
        
        if ((selectionChanged || contentChanged) && timeSinceLastRequest > SUGGESTION_DEBOUNCE) {
          // Get the current paragraph node
          const $pos = state.selection.$from;
          const node = $pos.node();
          
          if (!node || node.type.name !== 'paragraph') {
            return;
          }
          
          const currentContent = node.textContent;
          
          // Only request suggestions if we have enough context
          if (currentContent.length >= MIN_CONTENT_LENGTH) {
            // Debounce the request
            timeout = setTimeout(() => {
              isRequestInProgress = true;
              requestInlineSuggestion(view, pluginState.documentId!)
                .finally(() => {
                  isRequestInProgress = false;
                });
              
              // Update last request time
              view.dispatch(state.tr.setMeta(inlineSuggestionsKey, {
                type: 'updateLastRequestTime',
                time: now
              }));
            }, SUGGESTION_DEBOUNCE);
          }
        }
      },
      destroy: () => {
        // Clean up resources
        if (timeout) {
          clearTimeout(timeout);
        }
        
        if (positionUpdateInterval) {
          clearInterval(positionUpdateInterval);
        }
        
        const pluginState = inlineSuggestionsKey.getState(editorView.state);
        if (pluginState?.abortController) {
          try {
            pluginState.abortController.abort();
          } catch (e) {
            // Ignore abort errors
          }
        }
        
        // Remove any suggestion nodes from DOM
        const suggestionNode = document.querySelector('.prosemirror-suggestion-widget');
        if (suggestionNode) {
          suggestionNode.remove();
        }
      }
    };
  }
});

export function setDocumentId(view: EditorView, documentId: string) {
  console.log('Setting document ID in editor:', documentId);
  view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, {
    type: 'setDocumentId',
    documentId
  }));
}

async function requestInlineSuggestion(view: EditorView, documentId: string): Promise<void> {
  const state = view.state;
  const pluginState = inlineSuggestionsKey.getState(state);
  
  if (!pluginState) {
    return;
  }

  // Clear existing suggestions
  view.dispatch(state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));

  // Create new abort controller
  const abortController = new AbortController();
  view.dispatch(state.tr.setMeta(inlineSuggestionsKey, {
    type: 'setAbortController',
    controller: abortController
  }));

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  
  try {
    const $pos = state.selection.$from;
    const node = $pos.node();
    
    if (!node) {
      return;
    }

    // Get node type and attributes for context
    const nodeType = node.type.name;
    const nodeAttrs = node.attrs;
    const parentNodeType = $pos.parent.type.name;

    // Get context before cursor (within the current block)
    const contextBefore = node.textBetween(0, $pos.parentOffset, '\n', '  ');
    
    // Get some context after cursor for better predictions
    const contextAfter = node.textBetween($pos.parentOffset, node.content.size);
    
    // Skip if not enough context
    if (contextBefore.length < MIN_CONTENT_LENGTH) {
      return;
    }

    // Get entire document content for better context
    let fullContent = '';
    const docSize = state.doc.content.size;
    if (docSize > 0) {
      fullContent = state.doc.textBetween(0, docSize);
    }

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
        nodeType: node.type.name
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch suggestion: ${response.status}`);
    }

    if (!response.body) {
      return;
    }
    
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let suggestion = '';

    try {
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
                  updateSuggestionDisplay(view, suggestion);
                  
                  // Update position after each suggestion update
                  setTimeout(() => updateSuggestionNodePosition(view), 0);
                  break;
                  
                case 'finish':
                  // Final position update
                  setTimeout(() => updateSuggestionNodePosition(view), 0);
                  return;
                  
                case 'error':
                  console.error('Suggestion error:', data.content);
                  return;
              }
            } catch (err) {
              // Silently ignore parse errors from incomplete chunks
            }
          }
        }
      }
    } finally {
      if (reader) {
        try {
          reader.releaseLock();
        } catch (e) {
          // Ignore errors from releasing the lock
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // This is expected when we abort, no need to log
    } else {
      console.error('Error requesting suggestion:', err);
    }
  }
}

function updateSuggestionDisplay(view: EditorView, suggestion: string) {
  if (!suggestion.trim()) return;

  const state = view.state;
  const $pos = state.selection.$from;
  const pos = $pos.pos;
  
  // Create inline decoration for suggestion
  const decoration = Decoration.widget(pos, () => {
    const span = document.createElement('span');
    span.className = 'prosemirror-suggestion-widget inline-suggestion';
    span.setAttribute('aria-label', 'Press Tab to accept suggestion');
    span.setAttribute('data-suggestion', suggestion);
    
    // Add Tab key indicator
    const tabKeyElement = document.createElement('span');
    tabKeyElement.className = 'tab-key-indicator';
    tabKeyElement.innerHTML = 'tab';
    span.appendChild(tabKeyElement);
    
    return span;
  }, {
    side: 1,
    key: 'suggestion'
  });
  
  // Update plugin state with new decoration
  view.dispatch(state.tr.setMeta(inlineSuggestionsKey, {
    type: 'update',
    decorations: DecorationSet.create(state.doc, [decoration]),
    suggestion
  }));
  
  // Immediately update position
  setTimeout(() => updateSuggestionNodePosition(view), 0);
}

// Separate function to update suggestion node position
function updateSuggestionNodePosition(view: EditorView) {
  // Find the suggestion node in the DOM
  const suggestionNode = document.querySelector('.prosemirror-suggestion-widget') as HTMLElement;
  if (!suggestionNode) return;
  
  // Get the editor DOM node
  const editorDOM = view.dom;
  if (!editorDOM) return;
  
  // Get editor boundaries
  const editorRect = editorDOM.getBoundingClientRect();
  
  // Get the current cursor position
  const state = view.state;
  const cursorPos = state.selection.from;
  
  // Get the DOM node and position for cursor
  const cursorCoords = view.coordsAtPos(cursorPos);
  
  if (!cursorCoords) return;
  
  // Get computed styles for the editor
  const editorStyle = window.getComputedStyle(editorDOM);
  
  // Apply styling to match editor text
  suggestionNode.style.fontSize = editorStyle.fontSize;
  suggestionNode.style.fontFamily = editorStyle.fontFamily;
  suggestionNode.style.lineHeight = editorStyle.lineHeight;
  suggestionNode.style.fontWeight = editorStyle.fontWeight;
  suggestionNode.style.letterSpacing = editorStyle.letterSpacing;
  
  // Set basic display properties
  suggestionNode.style.position = 'absolute';
  suggestionNode.style.whiteSpace = 'pre-wrap';
  suggestionNode.style.wordBreak = 'break-word';
  suggestionNode.style.zIndex = '9999';
  
  // Get scroll position
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  
  // Set position after cursor
  suggestionNode.style.left = `${cursorCoords.right + scrollX}px`;
  suggestionNode.style.top = `${cursorCoords.top + scrollY}px`;
  
  // Calculate available width
  const rightEdge = editorRect.right + scrollX;
  const availableWidth = rightEdge - cursorCoords.right - scrollX;
  
  // Check if we need to wrap to next line
  const suggestionWidth = suggestionNode.offsetWidth;
  
  if (suggestionWidth > availableWidth) {
    // Calculate line height for wrapping
    const lineHeight = parseFloat(editorStyle.lineHeight);
    const fontSize = parseFloat(editorStyle.fontSize);
    const effectiveLineHeight = isNaN(lineHeight) ? fontSize * 1.2 : lineHeight;
    
    // Position at beginning of next line
    suggestionNode.style.left = `${editorRect.left + scrollX}px`;
    suggestionNode.style.top = `${cursorCoords.bottom + scrollY}px`;
  }
  
  // Set maximum width to prevent extending beyond editor
  const currentLeft = parseFloat(suggestionNode.style.left) || 0;
  const maxWidth = rightEdge - currentLeft;
  suggestionNode.style.maxWidth = `${maxWidth}px`;
  
  // Ensure the node is visible
  suggestionNode.style.display = 'inline-block';
} 