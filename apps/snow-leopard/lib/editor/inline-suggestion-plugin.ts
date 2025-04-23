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
export const FINISH_SUGGESTION_LOADING = 'finishSuggestionLoading';

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
                const metaFinishLoading = tr.getMeta(FINISH_SUGGESTION_LOADING);

                if (metaStartLoading) {
                    // Use selection head at the time loading starts
                    const pos = newState.selection.head;
                    console.log('[Plugin] Meta: Start Loading at pos:', pos);
                    // Ensure any previous suggestion is cleared before starting
                    return { suggestionText: null, isLoading: true, suggestionPos: pos };
                }

                if (metaSetSuggestion) {
                    const { text } = metaSetSuggestion as { text: string };
                    // Update text if we are currently loading and the position still matches.
                    if (pluginState.isLoading && pluginState.suggestionPos === newState.selection.head) {
                         console.log('[Plugin] Meta: Updating Suggestion Text:', text);
                        // Keep isLoading true, just update the text
                        return { ...pluginState, suggestionText: text || null }; 
                    }
                    // Ignore if not loading or cursor moved away
                    console.log('[Plugin] Meta: Ignored SET_SUGGESTION (not loading or cursor moved)');
                    return pluginState; 
                }

                if (metaFinishLoading) {
                    console.log('[Plugin] Meta: Finish Loading');
                    // If we were loading and have some text, keep it but mark loading as false.
                    if (pluginState.isLoading && pluginState.suggestionPos !== null) {
                        return { ...pluginState, isLoading: false };
                    }
                    // Otherwise (e.g., cleared before finish), reset fully
                    return initialState;
                }
                
                if (metaClearSuggestion) {
                     console.log('[Plugin] Meta: Clear Suggestion');
                    return initialState; // Reset state
                }

                // --- Auto-clear logic based on editor changes --- 
                let nextState = pluginState;

                // Clear suggestion OR loading if the document changed 
                // OR selection became non-empty 
                // OR cursor moved away from suggestion insertion point
                if (pluginState.suggestionPos !== null && (pluginState.isLoading || pluginState.suggestionText)) {
                    if (tr.docChanged || 
                        !newState.selection.empty || 
                        newState.selection.head !== pluginState.suggestionPos 
                    ) {
                        console.log('[Plugin] Auto-clearing suggestion/loading due to edit/selection change.');
                        nextState = initialState; 
                    }
                }
                
                // // Simplified auto-clear (previous version)
                // if(nextState.isLoading && (tr.docChanged || !newState.selection.empty)) {
                //     console.log('[Plugin] Clearing loading state due to edit/selection change.');
                //     nextState = {...nextState, isLoading: false, suggestionPos: null };
                // }

                return nextState;
            },
        },

        props: {
            // Add decorations for the inline suggestion text
            decorations(state: EditorState): DecorationSet | null {
                const pluginState = inlineSuggestionPluginKey.getState(state);
                // Show decoration as long as text exists, even if loading
                // The pseudo-element content will update as text streams in
                if (!pluginState?.suggestionText || pluginState.suggestionPos === null) { 
                    return null;
                }
                
                // Create an inline widget decoration right at the suggestion position
                const decoration = Decoration.widget(pluginState.suggestionPos, () => {
                    const span = document.createElement('span');
                    span.className = 'suggestion-decoration-inline'; // CSS class for styling
                    // Ensure data-suggestion is always updated with the latest text
                    span.setAttribute('data-suggestion', pluginState.suggestionText || ''); 
                    return span;
                }, { side: 1 }); 

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