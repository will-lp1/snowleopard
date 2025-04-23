import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

// --- Plugin Key --- 
export const inlineSuggestionPluginKey = new PluginKey<InlineSuggestionState>('inlineSuggestion');

// --- Plugin State --- 
interface InlineSuggestionState {
  suggestionText: string | null;
  suggestionPos: number | null; // Position *after* the character that triggered the suggestion
  isLoading: boolean;
}

const initialState: InlineSuggestionState = {
  suggestionText: null,
  suggestionPos: null,
  isLoading: false,
};

// --- Plugin Actions --- 
// Define meta keys to communicate with the plugin
export const START_SUGGESTION_LOADING = 'startSuggestionLoading';
export const SET_SUGGESTION = 'setSuggestion';
export const CLEAR_SUGGESTION = 'clearSuggestion';

// --- Plugin Definition --- 
export function inlineSuggestionPlugin(options: {
    requestSuggestion: (state: EditorState) => void; // Callback to trigger API request
}): Plugin<InlineSuggestionState> {
    return new Plugin<InlineSuggestionState>({
        key: inlineSuggestionPluginKey,

        state: {
            init(): InlineSuggestionState { 
                return initialState; 
            },
            apply(tr: Transaction, pluginState: InlineSuggestionState, oldState: EditorState, newState: EditorState): InlineSuggestionState {
                // Check for meta actions first
                const metaStartLoading = tr.getMeta(START_SUGGESTION_LOADING);
                const metaSetSuggestion = tr.getMeta(SET_SUGGESTION);
                const metaClearSuggestion = tr.getMeta(CLEAR_SUGGESTION);

                if (metaStartLoading) {
                    // Use selection head at the time loading starts
                    const pos = newState.selection.head;
                    console.log('[Plugin] Meta: Start Loading at pos:', pos);
                    return { ...initialState, isLoading: true, suggestionPos: pos };
                }

                if (metaSetSuggestion) {
                    const { text } = metaSetSuggestion as { text: string };
                     console.log('[Plugin] Meta: Set Suggestion:', text, 'at pos:', pluginState.suggestionPos);
                    // Only set text if still loading and position matches
                    if (pluginState.isLoading && pluginState.suggestionPos !== null) {
                        return { ...pluginState, suggestionText: text || null, isLoading: false }; // Clear loading flag
                    }
                    // If not loading or pos mismatch, ignore stale suggestion
                    return pluginState; 
                }
                
                if (metaClearSuggestion) {
                     console.log('[Plugin] Meta: Clear Suggestion');
                    return initialState; // Reset state
                }

                // --- Auto-clear logic based on editor changes --- 
                let nextState = pluginState;

                // Clear suggestion if the document changed OR selection moved away/became non-empty
                if (pluginState.suggestionText && pluginState.suggestionPos !== null) {
                    if (tr.docChanged || 
                        !newState.selection.empty || 
                        newState.selection.head !== pluginState.suggestionPos // Cursor moved from suggestion point
                    ) {
                        console.log('[Plugin] Auto-clearing suggestion due to edit/selection change.');
                        nextState = initialState; 
                    }
                }
                
                // If loading was aborted by user action, reset loading state
                if(nextState.isLoading && (tr.docChanged || !newState.selection.empty)) {
                    console.log('[Plugin] Clearing loading state due to edit/selection change.');
                    nextState = {...nextState, isLoading: false, suggestionPos: null };
                }

                return nextState;
            },
        },

        props: {
            // Add decorations for the inline suggestion text
            decorations(state: EditorState): DecorationSet | null {
                const pluginState = inlineSuggestionPluginKey.getState(state);
                if (!pluginState?.suggestionText || pluginState.suggestionPos === null) {
                    return null;
                }
                
                // Create an inline decoration right at the suggestion position
                // Use a widget decoration with a pseudo-element for the text
                const decoration = Decoration.widget(pluginState.suggestionPos, () => {
                    const span = document.createElement('span');
                    span.className = 'suggestion-decoration-inline'; // CSS class for styling
                    span.setAttribute('data-suggestion', pluginState.suggestionText || ''); // Pass text via data attribute
                    return span;
                }, { side: 1 }); // Place it right after the position

                return DecorationSet.create(state.doc, [decoration]);
            },

            // Handle Tab and Escape keys
            handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
                const pluginState = inlineSuggestionPluginKey.getState(view.state);
                if (!pluginState) return false;

                // --- Tab Key --- 
                if (event.key === 'Tab' && !event.shiftKey) {
                    // 1. Accept existing suggestion
                    if (pluginState.suggestionText && pluginState.suggestionPos !== null) {
                        event.preventDefault();
                        const { suggestionText, suggestionPos } = pluginState;
                        // Create transaction to insert text and clear plugin state
                        let tr = view.state.tr.insertText(suggestionText, suggestionPos);
                        tr = tr.setMeta(CLEAR_SUGGESTION, true); // Clear plugin state
                        tr = tr.scrollIntoView();
                        view.dispatch(tr);
                        console.log('[Plugin] Tab: Accepted suggestion');
                        // Note: Saving is handled by the main dispatchTransaction logic in the component now
                        return true; // Handled
                    }
                    // 2. Request new suggestion (if not loading)
                    else if (!pluginState.isLoading) {
                        event.preventDefault();
                        // Dispatch meta action to signal start loading
                        view.dispatch(view.state.tr.setMeta(START_SUGGESTION_LOADING, true));
                        // Call the provided function to trigger API request
                        options.requestSuggestion(view.state);
                        console.log('[Plugin] Tab: Requested suggestion');
                        return true; // Handled
                    }
                }

                // --- Escape Key --- 
                if (event.key === 'Escape') {
                    if (pluginState.suggestionText || pluginState.isLoading) {
                        event.preventDefault();
                        // Dispatch meta action to clear plugin state
                        view.dispatch(view.state.tr.setMeta(CLEAR_SUGGESTION, true));
                        console.log('[Plugin] Escape: Cleared suggestion/loading');
                        // TODO: Abort API request if loading? Requires passing abort controller or callback
                        return true; // Handled
                    }
                }
                
                // TODO: Handle Right Arrow? Check if cursor is exactly at suggestionPos

                return false; // Let other handlers run
            },
        },
    });
} 