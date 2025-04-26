import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node } from 'prosemirror-model';
import { buildContentFromDocument } from './functions'; // Assuming functions.tsx exports this

export const savePluginKey = new PluginKey<SaveState>('save');

export type SaveStatus = 'idle' | 'debouncing' | 'saving' | 'error' | 'saved';

export interface SaveState {
  status: SaveStatus;
  lastSaved: Date | null;
  errorMessage: string | null;
  isDirty: boolean; // Explicitly track if changes are waiting for debounce/save
}

interface SavePluginOptions {
  // Function to call when a save is needed
  saveFunction: (content: string) => Promise<{ updatedAt: string | Date } | null>; 
  // Debounce delay in milliseconds
  debounceMs?: number;
  // Initial last saved timestamp
  initialLastSaved?: Date | null;
}

export function savePlugin({
  saveFunction,
  debounceMs = 1500, // Default debounce time
  initialLastSaved = null,
}: SavePluginOptions): Plugin<SaveState> {
  let debounceTimeout: NodeJS.Timeout | null = null;
  let inflightRequest: Promise<any> | null = null; // Prevent concurrent saves

  return new Plugin<SaveState>({
    key: savePluginKey,
    state: {
      init(_, state): SaveState {
        return {
          status: 'idle',
          lastSaved: initialLastSaved,
          errorMessage: null,
          isDirty: false,
        };
      },
      apply(tr, pluginState, oldState, newState): SaveState {
        // Handle state updates triggered by meta transactions from this plugin
        const meta = tr.getMeta(savePluginKey);
        if (meta) {
          // console.log('[SavePlugin] Applying meta:', meta);
          return { ...pluginState, ...meta };
        }

        // If the document didn't change, keep the state as is
        if (!tr.docChanged) {
          return pluginState;
        }

        // Document changed - mark as dirty and start debouncing
        // console.log('[SavePlugin] Doc changed, debouncing...');
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        
        let newStatus: SaveStatus = 'debouncing';
        
        // Prevent debouncing if already saving (shouldn't happen often with debounce)
        if (pluginState.status === 'saving') {
            newStatus = 'saving'; // Maintain saving status
        }

        debounceTimeout = setTimeout(() => {
          // Don't trigger if no longer mounted or state changed drastically
          // We rely on the view being up-to-date here
          const currentState = savePluginKey.getState(newState);
          if (!currentState || currentState.status !== 'debouncing' || !currentState.isDirty) {
             console.log('[SavePlugin] Debounce fired, but state changed or not dirty. Skipping save.');
             // Reset status if it was debouncing but no longer dirty (e.g., undone)
             if (currentState && currentState.status === 'debouncing' && !currentState.isDirty) {
                 // Need access to the view to dispatch a meta transaction here...
                 // This logic might be better handled elsewhere or need view access.
             }
            return;
          }

          // Check for in-flight requests
          if (inflightRequest) {
            console.warn('[SavePlugin] Save triggered, but another save is already in progress.');
            return; // Or queue? For now, just skip.
          }

          console.log('[SavePlugin] Debounce finished, triggering save.');
          
          // Dispatch meta transaction to update status to 'saving'
          // This requires access to the view, which we don't have directly here.
          // We'll handle this in dispatchTransaction in the Editor component for now.
          
          const contentToSave = buildContentFromDocument(newState.doc);

          inflightRequest = saveFunction(contentToSave)
            .then(result => {
              inflightRequest = null; // Clear inflight status
               console.log('[SavePlugin] Save successful.');
              // Need view.dispatch to update plugin state via meta
              // We'll pass necessary info back to dispatchTransaction
              return { status: 'saved', lastSaved: result?.updatedAt ? new Date(result.updatedAt) : new Date() };
            })
            .catch(error => {
               inflightRequest = null; // Clear inflight status
              console.error('[SavePlugin] Save failed:', error);
              // Need view.dispatch to update plugin state via meta
              return { status: 'error', errorMessage: error instanceof Error ? error.message : 'Unknown save error' };
            });

        }, debounceMs);

        return {
          ...pluginState,
          status: newStatus,
          isDirty: true, // Mark as dirty because doc changed
          errorMessage: null, // Clear previous errors on new changes
        };
      },
    },
    // We need access to the view to dispatch meta transactions from the debounced save
    // and to coordinate the status updates. We'll enhance dispatchTransaction in Editor.
    view(editorView) {
       // Cleanup timeout on view destroy
       return {
         destroy() {
           if (debounceTimeout) {
             clearTimeout(debounceTimeout);
           }
         }
       };
    }
  });
}

// Helper function to dispatch state updates for the plugin
export function setSaveStatus(view: EditorView, statusUpdate: Partial<SaveState>) {
  // console.log('[SavePlugin] Dispatching meta update:', statusUpdate);
  view.dispatch(view.state.tr.setMeta(savePluginKey, statusUpdate));
} 