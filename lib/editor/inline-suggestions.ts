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
        abortController: null
      };
    },
    apply(tr, state) {
      // Update decorations based on transaction
      const meta = tr.getMeta(inlineSuggestionsKey);
      
      // Clear suggestions if content changed
      if (tr.docChanged && !tr.getMeta('no-suggestion-clear')) {
        return {
          ...state,
          decorations: DecorationSet.empty,
          currentSuggestion: ''
        };
      }

      if (meta) {
        if (meta.type === 'clear') {
          return {
            ...state,
            decorations: DecorationSet.empty,
            currentSuggestion: '',
          };
        }
        if (meta.type === 'update') {
          return {
            ...state,
            decorations: meta.decorations,
            currentSuggestion: meta.suggestion,
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
            state.abortController.abort();
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
        if (pluginState.currentSuggestion) {
          event.preventDefault();
          
          // Insert the suggestion at cursor position
          const { tr } = view.state;
          const pos = view.state.selection.from;
          tr.insertText(pluginState.currentSuggestion);
          
          // Clear the suggestion
          tr.setMeta(inlineSuggestionsKey, { type: 'clear' });
          
          view.dispatch(tr);
          return true;
        }
      }

      // Clear suggestions on Escape
      if (event.key === 'Escape') {
        if (pluginState.currentSuggestion) {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
          return true;
        }
      }

      // Clear suggestions on arrow keys
      if (event.key.startsWith('Arrow')) {
        if (pluginState.currentSuggestion) {
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
        }
      }

      return false;
    }
  },

  view(editorView) {
    let timeout: NodeJS.Timeout | null = null;
    let isRequestInProgress = false;

    return {
      update: (view, prevState) => {
        const state = view.state;
        const pluginState = inlineSuggestionsKey.getState(state);
        
        if (!pluginState?.documentId) {
          return;
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
        if (prevState && 
            (state.selection.from !== prevState.selection.from || state.doc !== prevState.doc) &&
            timeSinceLastRequest > SUGGESTION_DEBOUNCE) {
          
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
        if (timeout) {
          clearTimeout(timeout);
        }
        const pluginState = inlineSuggestionsKey.getState(editorView.state);
        if (pluginState?.abortController) {
          pluginState.abortController.abort();
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
    
    if (!node || node.type.name !== 'paragraph') {
      return;
    }

    // Get context before cursor (within the current paragraph)
    const contextBefore = node.textBetween(0, $pos.parentOffset);
    
    // Get some context after cursor for better predictions
    const contextAfter = node.textBetween($pos.parentOffset, node.content.size);

    const response = await fetch('/api/inline-suggestion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        currentContent: contextBefore,
        contextAfter,
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
                  break;
                  
                case 'finish':
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
  const pos = state.selection.from;
  
  // Create inline decoration for suggestion
  const decoration = Decoration.widget(pos, () => {
    const span = document.createElement('span');
    span.className = 'inline-suggestion';
    span.setAttribute('aria-label', 'Press Tab to accept suggestion');
    span.textContent = suggestion;
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
} 