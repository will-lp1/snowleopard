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
  createDocument?: boolean; // Flag for creation request
  initialContent?: string; // Content for creation
  triggerSave?: boolean; // Flag to force a save check
}

interface SavePluginOptions {
  // Function to call when a save is needed
  saveFunction: (content: string) => Promise<{ updatedAt: string | Date } | null>; 
  // Debounce delay in milliseconds
  debounceMs?: number;
  // Initial last saved timestamp
  initialLastSaved?: Date | null;
  // Current Document ID (can be 'init')
  documentId: string; 
}

export function savePlugin({
  saveFunction,
  debounceMs = 1500, // Default debounce time
  initialLastSaved = null,
  documentId, // Added documentId
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
          // Initialize creation flags
          createDocument: false,
          initialContent: '',
        };
      },
      apply(tr, pluginState, oldState, newState): SaveState {
        // Handle state updates triggered by meta transactions from this plugin
        const meta = tr.getMeta(savePluginKey);
        let shouldTriggerSave = false;
        if (meta) {
          // Explicitly check if meta is triggering a save
          if (meta.triggerSave === true) {
            shouldTriggerSave = true;
            // Reset the trigger flag in the state update
            meta.triggerSave = false; 
          }
          // If meta includes createDocument being reset, handle it
          if (meta.createDocument === false) {
            return { ...pluginState, ...meta, initialContent: '' }; // Clear content when flag is reset
          }
          // Apply other meta changes
          pluginState = { ...pluginState, ...meta };
        }

        // If the document didn't change AND we are not explicitly triggering a save, keep the state as is
        if (!tr.docChanged && !shouldTriggerSave) {
          return pluginState;
        }

        // If we are triggering a save, but the document is identical, 
        // we might skip if not dirty? Or just proceed to save? Let's proceed.
        // If we ARE explicitly triggering save, log it
        if (shouldTriggerSave) {
          console.log('[SavePlugin] Explicit save triggered via meta.');
        }

        // --- Check for initial creation trigger ---
        // Only trigger if documentId is 'init', doc changed, and previous doc was empty
        const wasEmpty = oldState.doc.content.size <= 2; // Empty doc usually has size 2 (doc, paragraph)
        if (documentId === 'init' && tr.docChanged && wasEmpty && newState.doc.textContent.trim().length > 0) {
          console.log('[SavePlugin] Initial input detected for "init" document. Triggering creation.');
          // Return state indicating creation request
          return {
            ...pluginState,
            status: 'idle', // Keep idle, creation handled externally
            isDirty: false, // Not dirty in the traditional save sense
            createDocument: true,
            initialContent: newState.doc.textContent,
            errorMessage: null,
          };
        }
        
        // --- Proceed with normal debounced save logic (or triggered save) ---
        // console.log('[SavePlugin] Doc changed or save triggered, debouncing...');
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        
        let newStatus: SaveStatus = 'debouncing';
        
        // Prevent debouncing if already saving
        if (pluginState.status === 'saving' && inflightRequest) {
            console.log('[SavePlugin] Doc changed/triggered while saving, keeping saving status.');
            newStatus = 'saving'; // Maintain saving status but mark as dirty
        } else {
             // If not saving, clear any previous errors on new changes/triggers
             pluginState = { ...pluginState, errorMessage: null };
        }

        // Mark as dirty only if the document actually changed
        const docActuallyChanged = tr.docChanged;

        debounceTimeout = setTimeout(() => {
          if (!editorViewInstance) {
              console.warn('[SavePlugin] Debounce fired, but editor view is not available.');
              return;
          }
          // Use the stored view instance
          const view = editorViewInstance;
          const currentState = savePluginKey.getState(view.state);
          
          // If state is missing or status is not 'debouncing', something is wrong, bail out.
          if (!currentState || currentState.status !== 'debouncing') {
             console.log(`[SavePlugin] Debounce fired, but state is invalid or status is not debouncing (${currentState?.status}). Skipping save.`);
             // If status was saved/error/idle, it shouldn't be debouncing anyway
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
          isDirty: pluginState.isDirty || docActuallyChanged, // Become dirty if doc changed, otherwise keep existing dirty status
        };
      },
    },
    view(editorView) {
       editorViewInstance = editorView; // Store the view instance when the plugin view is created
       console.log(`[SavePlugin] View created for documentId: ${documentId}`); // Log documentId on view creation
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
  // If resetting the create flag, ensure content is also cleared
  const update = statusUpdate.createDocument === false 
                 ? { ...statusUpdate, initialContent: '' } 
                 : statusUpdate;
  // console.log('[SavePlugin] Dispatching meta update:', update);
  view.dispatch(view.state.tr.setMeta(savePluginKey, update));
} 