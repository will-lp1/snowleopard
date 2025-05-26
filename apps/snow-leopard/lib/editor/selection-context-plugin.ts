import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export interface SelectionContextState {
  isActive: boolean;
  isLoading: boolean;
  from: number | null;
  to: number | null;
}

export const selectionContextPluginKey = new PluginKey<SelectionContextState>('selectionContext');

const initialState: SelectionContextState = {
  isActive: false,
  isLoading: false,
  from: null,
  to: null,
};

// Transaction metadata types
export const ACTIVATE_SUGGESTION_CONTEXT = 'activateSuggestionContext';
export const DEACTIVATE_SUGGESTION_CONTEXT = 'deactivateSuggestionContext';
export const SET_SUGGESTION_LOADING_STATE = 'setSuggestionLoadingState';

export function selectionContextPlugin(): Plugin<SelectionContextState> {
  return new Plugin<SelectionContextState>({
    key: selectionContextPluginKey,
    state: {
      init(): SelectionContextState {
        return initialState;
      },
      apply(tr: Transaction, pluginState: SelectionContextState, _oldState: EditorState, newState: EditorState): SelectionContextState {
        const activateMeta = tr.getMeta(ACTIVATE_SUGGESTION_CONTEXT);
        if (activateMeta) {
          const { from, to } = activateMeta as { from: number; to: number };
          // Ensure selection hasn't changed drastically, otherwise, it might be an outdated activation
          if (newState.selection.from >= from && newState.selection.to <= to) {
            return { ...initialState, isActive: true, from, to };
          }
          // If selection changed too much, ignore activation or reset
          return initialState; 
        }

        const deactivateMeta = tr.getMeta(DEACTIVATE_SUGGESTION_CONTEXT);
        if (deactivateMeta) {
          return initialState;
        }

        const loadingMeta = tr.getMeta(SET_SUGGESTION_LOADING_STATE);
        if (loadingMeta !== undefined && pluginState.isActive) {
          return { ...pluginState, isLoading: !!loadingMeta };
        }

        // If the document changed or selection moved away from the active context, deactivate
        if (pluginState.isActive && pluginState.from !== null && pluginState.to !== null) {
          if (tr.docChanged) {
            // Basic check: if mapping positions fails or changes context, deactivate
            try {
              const newFrom = tr.mapping.map(pluginState.from);
              const newTo = tr.mapping.map(pluginState.to);
              if (newFrom === newTo) return initialState; // Collapsed, deactivate
              // Further checks could be added if needed
            } catch (e) {
              return initialState; // Mapping failed
            }
          }
          // If user selection moves outside the active suggestion context area
          if (!newState.selection.empty && 
              (newState.selection.from < pluginState.from || newState.selection.to > pluginState.to) &&
              (newState.selection.to < pluginState.from || newState.selection.from > pluginState.to)) {
             // This condition is a bit complex: it means the new selection is *not* within the old context.
             // A simpler approach might be to deactivate if selection.empty is false and not equal to the context range.
             // For now, let's deactivate if selection is outside.
             // return initialState; // Decided to keep it active even if selection moves, overlay handles context.
          }
        }
        
        // If the plugin was active but the selection that triggered it is no longer valid
        // (e.g. text deleted, or content changed significantly)
        // This is partly handled by tr.docChanged and position mapping.
        // A more robust solution might involve checking if from/to are still valid positions in newState.doc

        return pluginState;
      },
    },
    props: {
      decorations(state: EditorState): DecorationSet | null {
        const pluginState = selectionContextPluginKey.getState(state);
        if (!pluginState?.isActive || pluginState.from === null || pluginState.to === null) {
          return null;
        }

        const decorationClass = pluginState.isLoading
          ? 'suggestion-context-loading'
          : 'suggestion-context-highlight';

        // Ensure 'from' and 'to' are valid in the current document
        const maxPos = state.doc.content.size;
        const from = Math.min(pluginState.from, maxPos);
        const to = Math.min(pluginState.to, maxPos);
        
        if (from >= to) return null; // Invalid range

        const decoration = Decoration.inline(
          from,
          to,
          { class: decorationClass },
          { inclusiveStart: false, inclusiveEnd: false } 
        );
        return DecorationSet.create(state.doc, [decoration]);
      },
    },
  });
} 