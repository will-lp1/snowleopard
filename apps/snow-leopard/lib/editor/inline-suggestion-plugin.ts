import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

export interface InlineSuggestionState {
  suggestionText: string | null;
  suggestionPos: number | null;
  isLoading: boolean;
}

export const inlineSuggestionPluginKey = new PluginKey<InlineSuggestionState>('inlineSuggestion');

const initialState: InlineSuggestionState = {
  suggestionText: null,
  suggestionPos: null,
  isLoading: false,
};

export const START_SUGGESTION_LOADING = 'startSuggestionLoading';
export const SET_SUGGESTION = 'setSuggestion';
export const CLEAR_SUGGESTION = 'clearSuggestion';
export const FINISH_SUGGESTION_LOADING = 'finishSuggestionLoading';

export function inlineSuggestionPlugin(options: { requestSuggestion: (state: EditorState) => void }): Plugin<InlineSuggestionState> {
  return new Plugin<InlineSuggestionState>({
    key: inlineSuggestionPluginKey,
    state: {
      init(): InlineSuggestionState {
        return initialState;
      },
      apply(tr: Transaction, pluginState: InlineSuggestionState, _oldState: EditorState, newState: EditorState): InlineSuggestionState {
        const metaStart = tr.getMeta(START_SUGGESTION_LOADING);
        const metaSet = tr.getMeta(SET_SUGGESTION);
        const metaClear = tr.getMeta(CLEAR_SUGGESTION);
        const metaFinish = tr.getMeta(FINISH_SUGGESTION_LOADING);

        if (metaStart) {
          const pos = newState.selection.head;
          return { suggestionText: null, isLoading: true, suggestionPos: pos };
        }

        if (metaSet) {
          const { text } = metaSet as { text: string };
          if (pluginState.isLoading && pluginState.suggestionPos === newState.selection.head) {
            return { ...pluginState, suggestionText: text };
          }
          return pluginState;
        }

        if (metaFinish) {
          if (pluginState.isLoading && pluginState.suggestionPos !== null) {
            return { ...pluginState, isLoading: false };
          }
          return initialState;
        }

        if (metaClear) {
          return initialState;
        }

        if (pluginState.suggestionPos !== null && (pluginState.isLoading || pluginState.suggestionText)) {
          if (tr.docChanged || !newState.selection.empty || newState.selection.head !== pluginState.suggestionPos) {
            return initialState;
          }
        }

        return pluginState;
      },
    },
    props: {
      decorations(state: EditorState): DecorationSet | null {
        const pluginState = inlineSuggestionPluginKey.getState(state);
        if (!pluginState || pluginState.suggestionPos === null) {
          return null;
        }

        const { isLoading, suggestionText, suggestionPos } = pluginState;

        if (isLoading && !suggestionText) {
          const decoration = Decoration.widget(
            suggestionPos,
            () => {
              const el = document.createElement('span');
              el.className = 'inline-suggestion-loader';
              return el;
            },
            { side: 1 }
          );
          return DecorationSet.create(state.doc, [decoration]);
        }

        if (suggestionText) {
          const decoration = Decoration.widget(
            suggestionPos,
            () => {
              const wrapper = document.createElement('span');
              wrapper.className = 'inline-suggestion-wrapper';

              const suggestionSpan = document.createElement('span');
              suggestionSpan.className = 'suggestion-decoration-inline';
              const raw = suggestionText!;
              const trimmed = raw.trimStart();
              const first = trimmed.charAt(0);
              const isAlphaNum = /^[A-Za-z0-9]/.test(first);
              const prevChar = suggestionPos > 0
                ? state.doc.textBetween(suggestionPos - 1, suggestionPos)
                : '';
              const needsSpace = isAlphaNum && prevChar && !/\s/.test(prevChar);
              const displayText = needsSpace ? ' ' + trimmed : trimmed;
              suggestionSpan.setAttribute('data-suggestion', displayText);
              wrapper.appendChild(suggestionSpan);

              const kbd = document.createElement('kbd');
              kbd.className = 'inline-tab-icon';
              kbd.style.marginLeft = '0.25em';
              kbd.textContent = 'Tab';
              wrapper.appendChild(kbd);

              return wrapper;
            },
            { side: 1 }
          );
          return DecorationSet.create(state.doc, [decoration]);
        }

        return null;
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const pluginState = inlineSuggestionPluginKey.getState(view.state);
        if (!pluginState) return false;

        if (event.key === 'Tab' && !event.shiftKey) {
          if (pluginState.suggestionText && pluginState.suggestionPos !== null) {
            event.preventDefault();
            const raw = pluginState.suggestionText!;
            const trimmed = raw.trimStart();
            const first = trimmed.charAt(0);
            const isAlphaNum = /^[A-Za-z0-9]/.test(first);
            const prev = pluginState.suggestionPos! > 0
              ? view.state.doc.textBetween(pluginState.suggestionPos! - 1, pluginState.suggestionPos!)
              : '';
            const needsSpace = isAlphaNum && prev && !/\s/.test(prev);
            const text = needsSpace ? ' ' + trimmed : trimmed;
            let tr = view.state.tr.insertText(text, pluginState.suggestionPos!);
            tr = tr.setMeta(CLEAR_SUGGESTION, true);
            tr = tr.scrollIntoView();
            view.dispatch(tr);
            return true;
          }
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(START_SUGGESTION_LOADING, true));
          options.requestSuggestion(view.state);
          return true;
        }

        if (event.key === 'Escape' && (pluginState.suggestionText || pluginState.isLoading)) {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(CLEAR_SUGGESTION, true));
          return true;
        }

        return false;
      },
    },
  });
} 