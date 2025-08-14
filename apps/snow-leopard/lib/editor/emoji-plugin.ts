import { Plugin, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Schema, Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import * as emoji from 'node-emoji';

interface EmojiSuggestion {
  emoji: string;
  code: string;
  score: number;
}

interface Coordinates {
  left: number;
  top: number;
}

interface EmojiSearchResult {
  emoji: string;
  name: string;
}

interface EmojiPluginState {
  suggestionElement: HTMLElement | null;
  currentQuery: string;
  selectedIndex: number;
  suggestions: EmojiSuggestion[];
  editorView: EditorView | null;
}

export function emojiPlugin(): Plugin {
  const pluginState: EmojiPluginState = {
    suggestionElement: null,
    currentQuery: '',
    selectedIndex: 0,
    suggestions: [],
    editorView: null
  };

  function setEditorView(view: EditorView): void {
    pluginState.editorView = view;
    // console.log('Emoji plugin: Editor view set', view);
  }

  function insertEmojiAtCursor(emojiCode: string): boolean {
    if (!pluginState.editorView) return false;
    
    const { from } = pluginState.editorView.state.selection;
    const doc = pluginState.editorView.state.doc;
    
    if (from < 0 || from > doc.content.size) {
      console.warn('Emoji plugin: Invalid cursor position:', from, 'doc size:', doc.content.size);
      return false;
    }
    
    let lineStart = from;
    while (lineStart > 0 && doc.textBetween(lineStart - 1, lineStart) !== '\n') {
      lineStart--;
    }
    
    const lineText = doc.textBetween(lineStart, from);
    const colonIndex = lineText.lastIndexOf(':');
    
    if (colonIndex !== -1) {
      const start = lineStart + colonIndex;
      const end = from;
      
      if (start < 0 || start > doc.content.size || end < 0 || end > doc.content.size) {
        console.warn('Emoji plugin: Calculated positions out of bounds:', { start, end, docSize: doc.content.size });
        return false;
      }
      
      // console.log('Emoji plugin: Inserting emoji', emojiCode, 'from', start, 'to', end);
      
      const tr = pluginState.editorView.state.tr.replaceWith(start, end, pluginState.editorView.state.schema.text(emojiCode));
      
      const newPos = start + emojiCode.length;
      
      if (newPos >= 0 && newPos <= tr.doc.content.size) {
        tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
      }
      
      pluginState.editorView.dispatch(tr);
      
      setTimeout(() => {
        if (pluginState.editorView && pluginState.editorView.dom) {
          pluginState.editorView.focus();
        }
      }, 0);
      
      return true;
    }
    
    return false;
  }

  function createSuggestionElement(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'emoji-suggestion-panel';
    element.style.cssText = `
      position: absolute;
      background: #000000;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      display: none;
      max-width: 600px;
      overflow-x: auto;
      white-space: nowrap;
    `;
    
    element.tabIndex = -1;
    
    element.addEventListener('keydown', (event: KeyboardEvent) => {
      // console.log('Emoji plugin: Key pressed on suggestion panel:', event.key);
      
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'Tab':
          event.preventDefault();
          if (pluginState.suggestions.length > 0) {
            pluginState.selectedIndex = Math.min(pluginState.selectedIndex + 1, pluginState.suggestions.length - 1);
            renderSuggestions();
          }
          break;
          
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          if (pluginState.suggestions.length > 0) {
            pluginState.selectedIndex = Math.max(pluginState.selectedIndex - 1, 0);
            renderSuggestions();
          }
          break;
          
        case 'Home':
          event.preventDefault();
          if (pluginState.suggestions.length > 0) {
            pluginState.selectedIndex = 0;
            renderSuggestions();
          }
          break;
          
        case 'End':
          event.preventDefault();
          if (pluginState.suggestions.length > 0) {
            pluginState.selectedIndex = pluginState.suggestions.length - 1;
            renderSuggestions();
          }
          break;
          
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (pluginState.suggestions.length > 0 && pluginState.selectedIndex < pluginState.suggestions.length) {
            const selectedSuggestion = pluginState.suggestions[pluginState.selectedIndex];
            if (selectedSuggestion) {
              // console.log('Emoji plugin: Keyboard selection, inserting:', selectedSuggestion.code);
              insertEmojiAtCursor(selectedSuggestion.code);
              hideSuggestions();
            }
          }
          break;
          
        case 'Escape':
          event.preventDefault();
          hideSuggestions();
          break;
      }
    });
    
    return element;
  }

  function showSuggestions(query: string, coords: Coordinates): void {
    // console.log('Emoji plugin: Showing suggestions for query:', query, 'at coords:', coords);
    
    if (!pluginState.suggestionElement) {
      pluginState.suggestionElement = createSuggestionElement();
      document.body.appendChild(pluginState.suggestionElement);
    }

    pluginState.currentQuery = query;
    pluginState.suggestions = getEmojiSuggestions(query);
    pluginState.selectedIndex = 0;

    // console.log('Emoji plugin: Found suggestions:', pluginState.suggestions);

    if (pluginState.suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    renderSuggestions();
    if (pluginState.suggestionElement) {
      pluginState.suggestionElement.style.display = 'block';
      pluginState.suggestionElement.style.left = `${coords.left}px`;
      pluginState.suggestionElement.style.top = `${coords.top + 20}px`;
      
      // Auto-focus after 1 second to enable keyboard navigation
      setTimeout(() => {
        if (pluginState.suggestionElement && pluginState.suggestionElement.style.display !== 'none') {
          pluginState.suggestionElement.focus();
        }
      }, 1000);
    }
  }

  function hideSuggestions(): void {
    // console.log('Emoji plugin: Hiding suggestions');
    if (pluginState.suggestionElement) {
      pluginState.suggestionElement.style.display = 'none';
    }
  }

  function getEmojiSuggestions(query: string): EmojiSuggestion[] {
    if (query.length < 1) return [];
    
    // console.log('Emoji plugin: Searching for query:', query);
    
    const searchTerm = query.replace(/^:/, '');
    if (searchTerm.length === 0) return [];
    
    const allEmojis: EmojiSearchResult[] = emoji.search(searchTerm);
    // console.log('Emoji plugin: Raw search results:', allEmojis);
    
    return allEmojis
      .map((item: EmojiSearchResult, index: number) => ({
        emoji: item.emoji,
        code: `:${item.name}:`,
        score: allEmojis.length - index
      }))
      .sort((a: EmojiSuggestion, b: EmojiSuggestion) => b.score - a.score)
      .slice(0, 20);
  }

  function renderSuggestions(): void {
    if (!pluginState.suggestionElement) return;

    pluginState.suggestionElement.innerHTML = `
      <div class="emoji-suggestion-header" style="
        color: rgb(255 255 255);
        font-size: 12px;
        margin-bottom: 8px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">EMOJI MATCHING ${pluginState.currentQuery.toUpperCase()}</div>
      <div class="emoji-suggestion-shortcuts" style="
        color: rgb(156 163 175);
        font-size: 10px;
        margin-bottom: 8px;
        text-align: center;
        font-family: monospace;
        ">↑↓←→ Navigate • Enter/Space Select • Esc Close • Tab Next</div>
      <div class="emoji-suggestion-list" style="
        display: flex;
        gap: 8px;
        flex-wrap: nowrap;
        overflow-x: auto;
      ">
        ${pluginState.suggestions.map((suggestion: EmojiSuggestion, index: number) => `
          <div class="emoji-suggestion-item ${index === pluginState.selectedIndex ? 'selected' : ''}" 
               data-index="${index}"
               data-emoji="${suggestion.emoji}"
               data-code="${suggestion.code}"
               style="
                 display: flex;
                 align-items: center;
                 gap: 8px;
                 padding: 8px 12px;
                 border-radius: 6px;
                 cursor: pointer;
                 transition: all 0.2s;
                 min-width: fit-content;
                 ${index === pluginState.selectedIndex ? 'background: #374151;' : ''}
               "
               onmouseover="this.style.background='#374151'"
               onmouseout="this.style.background='${index === pluginState.selectedIndex ? '#374151' : 'transparent'}'"
               onclick="window.insertEmojiSuggestion('${suggestion.code}')"
               onmousedown="event.preventDefault(); window.insertEmojiSuggestion('${suggestion.code}')"
          >
            <span style="font-size: 20px;">${suggestion.emoji}</span>
            <span style="
              color: rgb(255 255 255);
              font-size: 12px;
              font-family: monospace;
              white-space: nowrap;
            ">${suggestion.code}</span>
          </div>
        `).join('')}
      </div>
    `;
    
    setTimeout(() => {
      scrollToSelectedEmoji();
    }, 100);
  }

  function scrollToSelectedEmoji(): void {
    if (!pluginState.suggestionElement) return;
    
    const suggestionList = pluginState.suggestionElement.querySelector('.emoji-suggestion-list') as HTMLElement;
    const selectedItem = pluginState.suggestionElement.querySelector(`[data-index="${pluginState.selectedIndex}"]`) as HTMLElement;
    
    if (suggestionList && selectedItem) {
      const listRect = suggestionList.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      
      const itemCenter = itemRect.left + itemRect.width / 2;
      const listCenter = listRect.left + listRect.width / 2;
      const scrollOffset = itemCenter - listCenter;
      
      suggestionList.scrollBy({
        left: scrollOffset,
        behavior: 'smooth'
      });
    }
  }

  (window as any).insertEmojiSuggestion = (emojiCode: string): void => {
    // console.log('Emoji plugin: Inserting emoji:', emojiCode);
    
    if (pluginState.suggestionElement) {
      hideSuggestions();
    }
    
    const success = insertEmojiAtCursor(emojiCode);
    
    if (!success) {
      console.warn('Emoji plugin: Failed to insert emoji, could not find colon');
    }
    
    setTimeout(() => {
      if (pluginState.editorView && pluginState.editorView.dom) {
        pluginState.editorView.focus();
      }
    }, 0);
  };

  return new Plugin({
    view: (editorView: EditorView) => {
      setEditorView(editorView);
      return {};
    },
    props: {
      decorations: (state: EditorState): DecorationSet => {
        const decorations: Decoration[] = [];
        const doc = state.doc;
        
        doc.descendants((node: ProseMirrorNode, pos: number) => {
          if (node.isText) {
            const text = node.text || '';
            const emojiMatches = text.match(/:[\w+-]+:/g);
            
            if (emojiMatches) {
              emojiMatches.forEach((match: string) => {
                const emojiChar = emoji.emojify(match);
                if (emojiChar !== match) {
                  const start = pos + text.indexOf(match);
                  const end = start + match.length;
                  
                  decorations.push(
                    Decoration.widget(start, () => {
                      const span = document.createElement('span');
                      span.textContent = emojiChar;
                      span.className = 'emoji-widget';
                      span.setAttribute('data-emoji-code', match);
                      span.title = `Emoji: ${match}`;
                      return span;
                    }, { side: -1 })
                  );
                  
                  decorations.push(
                    Decoration.inline(start, end, {
                      class: 'emoji-hidden'
                    })
                  );
                }
              });
            }
          }
        });
        
        return DecorationSet.create(doc, decorations);
      }
    },
    
    appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null => {
      const tr = newState.tr;
      let modified = false;
      
      transactions.forEach((transaction: Transaction) => {
        if (transaction.docChanged) {
          newState.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (node.isText) {
              const text = node.text || '';
              
              const emojiMatches = text.match(/:[\w+-]+:/g);
              if (emojiMatches) {
                emojiMatches.forEach((match: string) => {
                  const emojiChar = emoji.emojify(match);
                  if (emojiChar !== match) {
                    const start = pos + text.indexOf(match);
                    const end = start + match.length;
                    tr.replaceWith(start, end, newState.schema.text(emojiChar));
                    modified = true;
                  }
                });
              }
              
              const partialMatch = text.match(/:[\w]*$/);
              // console.log('Emoji plugin: Text:', text, 'Partial match:', partialMatch);
              
              if (partialMatch && partialMatch[0].length > 1 && pluginState.editorView) {
                // console.log('Emoji plugin: Found partial match:', partialMatch[0]);
                
                if (partialMatch.index !== null && partialMatch.index !== undefined) {
                  const calculatedPos = pos + partialMatch.index;
                  const docSize = pluginState.editorView.state.doc.content.size;
                  
                  if (calculatedPos >= 0 && calculatedPos <= docSize) {
                    const coords = pluginState.editorView.coordsAtPos(calculatedPos);
                    if (coords) {
                      showSuggestions(partialMatch[0], coords);
                    }
                  } else {
                    console.warn('Emoji plugin: Calculated position out of bounds:', calculatedPos, 'doc size:', docSize);
                  }
                } else {
                  console.warn('Emoji plugin: Invalid partialMatch.index:', partialMatch.index);
                }
              } else if (partialMatch && partialMatch[0] === ':' && pluginState.editorView) {
                // console.log('Emoji plugin: Found colon, showing suggestions');
                
                if (partialMatch.index !== null && partialMatch.index !== undefined) {
                  const calculatedPos = pos + partialMatch.index;
                  const docSize = pluginState.editorView.state.doc.content.size;
                  
                  if (calculatedPos >= 0 && calculatedPos <= docSize) {
                    const coords = pluginState.editorView.coordsAtPos(calculatedPos);
                    if (coords) {
                      showSuggestions(':', coords);
                    }
                  } else {
                    console.warn('Emoji plugin: Calculated position out of bounds:', calculatedPos, 'doc size:', docSize);
                  }
                } else {
                  console.warn('Emoji plugin: Invalid partialMatch.index:', partialMatch.index);
                }
              } else {
                const hasColon = text.includes(':');
                if (!hasColon) {
                  hideSuggestions();
                }
              }
            }
          });
        }
      });
      
      return modified ? tr : null;
    },

    keymap: {
      ':': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        // console.log('Emoji plugin: Colon key pressed');
        
        const { from } = view.state.selection;
        if (from >= 0 && from <= view.state.doc.content.size) {
          const coords = view.coordsAtPos(from);
          if (coords) {
            showSuggestions(':', coords);
          }
        } else {
          console.warn('Emoji plugin: Invalid cursor position for colon key:', from);
        }
        return false;
      },
      'Backspace': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        const { from } = view.state.selection;
        const textBefore = view.state.doc.textBetween(Math.max(0, from - 10), from);
        if (!textBefore.includes(':')) {
          hideSuggestions();
        }
        return false;
      },
      'Escape': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        hideSuggestions();
        return false;
      },
      'ArrowRight': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) {
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = Math.min(pluginState.selectedIndex + 1, pluginState.suggestions.length - 1);
          renderSuggestions();
          return true;
        }
        return false;
      },
      'ArrowLeft': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) { 
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = Math.max(pluginState.selectedIndex - 1, 0);
          renderSuggestions();
          return true;
        }
        return false;
      },
      'Tab': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) {
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = Math.min(pluginState.selectedIndex + 1, pluginState.suggestions.length - 1);
          renderSuggestions();
          return true;
        }
        return false;
      },
      'Shift-Tab': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) {   
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = Math.max(pluginState.selectedIndex - 1, 0);
          renderSuggestions();
          return true;
        }
        return false;
      },
      'Enter': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0 && pluginState.selectedIndex < pluginState.suggestions.length) {
          const selectedSuggestion = pluginState.suggestions[pluginState.selectedIndex];
          if (selectedSuggestion) {
            // console.log('Emoji plugin: Enter pressed, inserting:', selectedSuggestion.code);
            const success = insertEmojiAtCursor(selectedSuggestion.code);
            if (success) {
              hideSuggestions();
              return true;
            }
          }
        }
        return false;
      },
      'Space': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0 && pluginState.selectedIndex < pluginState.suggestions.length) {
          const selectedSuggestion = pluginState.suggestions[pluginState.selectedIndex];
          if (selectedSuggestion) {
            // console.log('Emoji plugin: Space pressed, inserting:', selectedSuggestion.code);
            const success = insertEmojiAtCursor(selectedSuggestion.code);
            if (success) {
              hideSuggestions();
              return true;
            }
          }
        }
        return false;
      },
      'Home': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) {
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = 0;
          renderSuggestions();
          return true;
        }
        return false;
      },
      'End': (state: EditorState, dispatch: ((tr: Transaction) => void) | null, view: EditorView): boolean => {
        if (pluginState.suggestions.length > 0) {
          if (pluginState.suggestionElement) {
            pluginState.suggestionElement.focus();
          }
          pluginState.selectedIndex = pluginState.suggestions.length - 1;
          renderSuggestions();
          return true;
        }
        return false;
      }
    }
  });
} 