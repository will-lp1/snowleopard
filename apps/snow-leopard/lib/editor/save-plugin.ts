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
  let editorViewInstance: EditorView | null = null; // Store the view instance

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
        
        // Prevent debouncing if already saving
        if (pluginState.status === 'saving' && inflightRequest) {
            console.log('[SavePlugin] Doc changed while saving, keeping saving status.');
            newStatus = 'saving'; // Maintain saving status but mark as dirty
        } else {
             // If not saving, clear any previous errors on new changes
             pluginState = { ...pluginState, errorMessage: null };
        }

        debounceTimeout = setTimeout(() => {
          if (!editorViewInstance) {
              console.warn('[SavePlugin] Debounce fired, but editor view is not available.');
              return;
          }
          // Use the stored view instance
          const view = editorViewInstance;
          const currentState = savePluginKey.getState(view.state);
          
          // Don't trigger if no longer dirty (e.g., undone, or save completed)
          if (!currentState || !currentState.isDirty) {
             console.log('[SavePlugin] Debounce fired, but state is no longer dirty. Skipping save.');
             // If status was debouncing but no longer dirty, reset to idle
             if (currentState && currentState.status === 'debouncing') {
                 setSaveStatus(view, { status: 'idle' });
             }
            return;
          }

          // Check for in-flight requests again (safety)
          if (inflightRequest) {
            console.warn('[SavePlugin] Debounce fired, but another save is already in progress.');
            return; 
          }

          console.log('[SavePlugin] Debounce finished, triggering save.');
          
          // Dispatch meta transaction to update status to 'saving'
          setSaveStatus(view, { status: 'saving', isDirty: false }); // Mark as not dirty *before* saving
          
          const contentToSave = buildContentFromDocument(view.state.doc);

          inflightRequest = saveFunction(contentToSave)
            .then(result => {
              inflightRequest = null; // Clear inflight status
              console.log('[SavePlugin] Save successful.');
              // Update state via meta transaction
              setSaveStatus(view, { 
                  status: 'saved', // Or 'idle'? Let's use 'saved' briefly
                  lastSaved: result?.updatedAt ? new Date(result.updatedAt) : new Date(),
                  errorMessage: null,
                  isDirty: false // Ensure dirty flag is cleared
              });
              // Optional: Transition back to 'idle' after a short delay?
              // setTimeout(() => {
              //    const finalStateCheck = savePluginKey.getState(view.state);
              //    if (finalStateCheck?.status === 'saved') {
              //        setSaveStatus(view, { status: 'idle' });
              //    }
              // }, 1000); // Show 'saved' for 1 sec
            })
            .catch(error => {
               inflightRequest = null; // Clear inflight status
              console.error('[SavePlugin] Save failed:', error);
              // Update state via meta transaction
              setSaveStatus(view, { 
                  status: 'error', 
                  errorMessage: error instanceof Error ? error.message : 'Unknown save error',
                  isDirty: true // Mark as dirty again on error, allowing retry on next change/debounce
              });
            });

        }, debounceMs);

        return {
          ...pluginState,
          status: newStatus,
          isDirty: true, // Mark as dirty because doc changed
        };
      },
    },
    view(editorView) {
       editorViewInstance = editorView; // Store the view instance when the plugin view is created
       // Cleanup timeout on view destroy
       return {
         destroy() {
           editorViewInstance = null; // Clear the stored view instance
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