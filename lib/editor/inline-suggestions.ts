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
          
          // Use the new helper function to insert formatted content
          insertFormattedContent(view, pluginState.currentSuggestion);
          
          // Clear the suggestion
          view.dispatch(view.state.tr.setMeta(inlineSuggestionsKey, { type: 'clear' }));
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
    const contextAfter = node.textBetween($pos.parentOffset, node.content.size, '\n', '  ');

    const response = await fetch('/api/inline-suggestion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        currentContent: contextBefore,
        contextAfter,
        nodeType,
        nodeAttrs,
        parentNodeType,
        isListItem: nodeType === 'listItem' || parentNodeType === 'bulletList' || parentNodeType === 'orderedList'
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
  const $pos = state.selection.$from;
  const pos = $pos.pos;
  
  // Create inline decoration for suggestion
  const decoration = Decoration.widget(pos, () => {
    const span = document.createElement('span');
    span.className = 'inline-suggestion';
    span.setAttribute('aria-label', 'Press Tab to accept suggestion');
    
    // Handle list items and other formatted content
    const isListItem = $pos.parent.type.name === 'listItem' || 
                      $pos.node().type.name === 'listItem' ||
                      $pos.parent.type.name === 'bulletList' ||
                      $pos.parent.type.name === 'orderedList';
    
    // Format suggestion based on context
    if (isListItem) {
      // For list items, ensure proper indentation and bullet point handling
      const lines = suggestion.split('\n');
      span.textContent = lines.map(line => line.trim()).join('\n  ');
    } else {
      span.textContent = suggestion;
    }
    
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

// Add helper function to handle formatted content insertion
function insertFormattedContent(view: EditorView, suggestion: string) {
  const state = view.state;
  const { tr } = state;
  const $pos = state.selection.$from;
  const node = $pos.node();
  
  if (!node) return;

  const isListItem = node.type.name === 'listItem' || 
                    $pos.parent.type.name === 'listItem' ||
                    $pos.parent.type.name === 'bulletList' ||
                    $pos.parent.type.name === 'orderedList';

  if (isListItem) {
    // Handle list item insertion with proper node structure
    const schema = state.schema;
    const listItemType = schema.nodes.listItem;
    const paragraphType = schema.nodes.paragraph;
    const bulletListType = schema.nodes.bulletList;
    const orderedListType = schema.nodes.orderedList;
    
    // Determine if we're in a bullet list or ordered list
    const parentNode = $pos.parent;
    const isOrderedList = parentNode.type.name === 'orderedList' || 
                          (parentNode.type.name === 'listItem' && 
                           $pos.depth > 1 && $pos.node($pos.depth - 1).type.name === 'orderedList');
    
    // Get parent attributes to maintain consistency
    const parentAttrs = parentNode.attrs || {};
    
    const lines = suggestion.split('\n');
    
    if (lines.length === 1) {
      // For single line, just insert the text at cursor position
      const startPos = $pos.pos;
      const endPos = startPos + node.textContent.length - $pos.parentOffset;
      tr.insertText(suggestion, startPos);
    } else {
      // For multiple lines, create proper list item structure
      const listItems = lines.map(line => {
        // Create paragraph for the list item content
        const paragraph = paragraphType.create(
          null,
          schema.text(line.trim())
        );
        
        // Create list item with the paragraph as content
        return listItemType.create(
          parentAttrs,
          paragraph
        );
      });
      
      // Create the list container with appropriate type
      const listNode = isOrderedList ? 
        orderedListType.create(null, listItems) : 
        bulletListType.create(null, listItems);
      
      // Find position to insert
      const depth = $pos.depth;
      const startPos = $pos.start(depth);
      const endPos = $pos.end(depth);
      
      // Replace the current list item(s) with our new list structure
      tr.replaceWith(startPos, endPos, listNode);
    }
  } else {
    // For regular text, simply insert at cursor position
    tr.insertText(suggestion, $pos.pos);
  }
  
  view.dispatch(tr);
} 